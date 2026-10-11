package com.potato.player.core;

import java.io.File;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

/**
 * BPM（速度）分析器。
 *
 * <p>Java 21 没有内置的 mp3/flac 解码器，所以这里借 VLC 的 <b>transcode</b> 通道解码：
 * 与 {@code --aout=afile}（实时速度，一首歌要跑一首歌的时间）不同，
 * {@code --sout=#transcode{...}} 是<b>全速解码</b>（实测 4:45 的歌约 0.8 秒），
 * 并且可以用 {@code dst=-} 把裸 PCM 直接管道给本进程，不留临时文件。</p>
 *
 * <p>算法：短时谱通量（spectral flux）→ 自适应阈值去均值 → 自相关 →
 * 对数高斯节奏先验（中心 120 BPM）+ 梳状打分纠正倍速错误 → 抛物线插值细化。
 * 不追求专业级的精度，但对节奏规整的流行/摇滚/电子通常能到 ±1~2 BPM；
 * 结果附带置信度，低置信度交给用户手动改。</p>
 */
public final class BpmAnalyzer {

    /** 解码目标采样率（单声道）。 */
    private static final int RATE = 22050;
    /** 只分析前 N 秒（统计上足够，且能限制内存）。 */
    private static final int CAP_SECONDS = 180;
    private static final int FFT_SIZE = 1024;
    private static final int HOP = 256;
    /** 每帧的“帧率”。 */
    private static final double FPS = (double) RATE / HOP;
    private static final double MIN_BPM = 60.0;
    private static final double MAX_BPM = 200.0;
    /**
     * 节奏先验：以 {@code PRIOR_CENTER} 为中心、{@code PRIOR_SIGMA} 为宽度的对数高斯，
     * 用来压制"倍速"歧义（同一段音频在 B 与 2B 上自相关都很强）。
     *
     * <p>中心值是实测标定的：用 11 段<b>已知 BPM</b>的合成音频（70/75/85/90/100/120/128/160/174/190
     * + 一段无节拍）扫过参数得出的结论——</p>
     * <ul>
     *   <li>中心 120：174→87、190→95（快歌被系统性折半，8/10 对）</li>
     *   <li>中心 <b>135~150：10/10 全对</b>（±0.5 BPM 内）</li>
     *   <li>中心 165：70→140（慢歌被加倍）</li>
     * </ul>
     * <p>宽度只影响"无节拍"素材的置信度（越大越低），对正确性没影响。
     * 取 140 是为了在快慢两端都留余量。</p>
     */
    private static final double PRIOR_CENTER = 140.0;
    private static final double PRIOR_SIGMA = 1.2;
    /**
     * 相位搜索的候选步长：一拍切成「帧数 × 4」份（≈2.9 ms 分辨率）。
     * 再细没有意义 —— 十几毫秒的偏差已经听不出来，只会更慢。
     */
    private static final int PHASE_STEPS_PER_FRAME = 4;
    /**
     * 拟合拍点网格时，第一遍（粗相位 + 周期）只用的秒数。
     *
     * <p>为什么要分两遍：起音曲线上的"拍"位置要靠「预测位置附近的局部质心」去找，
     * 而预测位置来自 BPM —— BPM 只有 ±0.1 上下（自相关 + 抛物线插值的分辨率极限），
     * 这点误差几百拍之后就漂到几帧开外，找质心的窗口就找错了拍。
     * 所以先用开头 30 秒（漂移还小）拟合出一个精确周期，再用这个精确周期去覆盖整首歌。</p>
     */
    private static final int GRID_COARSE_SECONDS = 30;
    /**
     * 网格拟合用的<b>最长时间</b>（秒）：解码上限、以及全分析里参与拟合的帧数都用它。
     *
     * <p>为什么两条路径要用同一个长度：同一首歌的鼓组/配器在不同段落不一样（前奏只有吉他、
     * 副歌才进鼓），onset 质心的固定偏置也就随段落变化几毫秒，拟合出的相位会跟着窗口走
     * （实测同一首歌"前 60 秒"与"前 180 秒"能差 27 ms）。统一成 60 秒，是为了让
     * 「批量扫描得到的网格」和「播放时后台补的网格」永远一致，而且都锚在歌的开头 ——
     * 那是人一开始听、最容易觉得"没卡上"的地方。</p>
     */
    private static final int GRID_CAP_SECONDS = 60;
    /** 网格拟合固定用这么多帧（= {@link #GRID_CAP_SECONDS} 秒）：两条路径必须完全对齐，
     *  否则同一首歌会因为"多两帧少两帧"在正拍/反拍之间翻面。 */
    private static final int GRID_FRAMES = (int) Math.round(GRID_CAP_SECONDS * FPS);
    /** 逐拍找局部质心的窗口（帧，±）：要能容下粗相位的误差，又不能碰到隔壁拍。 */
    private static final double CENTROID_WIN_FRAMES = 4.0;
    /** 精修后的周期与初值相差超过这个比例就判为拟合失败（说明拍被认错了）。 */
    private static final double PERIOD_TOLERANCE = 0.08;
    /**
     * 「正拍 vs 反拍」梳状得分的相对差距达到多少就算完全确定（置信度 1）。
     * 取 0.10：实测节奏清晰的歌差距常在 0.3 以上，而 hi-hat 与 kick 打平的歌在 0.02 以下。
     */
    private static final double PHASE_MARGIN_FULL = 0.10;
    /**
     * 起音曲线的「局部质心」相对真实拍点的固定偏置（毫秒），算相位时要减掉。
     *
     * <p>质心比真实拍点<b>早</b>约 26 ms：帧间谱通量在「瞬态进入 Hann 窗、走到窗中心附近」时最大，
     * 而窗中心比窗起点晚 {@code FFT_SIZE/2 = 512} 个采样（512/22050 s ≈ 23.2 ms），于是整条
     * 起音曲线天然比真实起音早半个窗长；衰减尾巴又把它往后再拉一点，净剩 −25.7 ms。</p>
     *
     * <p>数值由合成 click track 探针标定（<b>六个 BPM × 八个拍相位</b>共 48 组，标定前残差
     * 恒为 −34.7 ms、标准差 0.05 ms，标定后为 0）。因为是最小二乘的截距，它不影响拍长（斜率）。</p>
     */
    private static final double ONSET_BIAS_MS = -25.7;

    /**
     * 分析结果。
     *
     * @param bpm         速度
     * @param confidence  速度置信度
     * @param seconds     实际分析的秒数
     * @param truncated   是否被 {@link #CAP_SECONDS} 截断
     * @param beatMs      <b>精确拍长</b>（毫秒）：由 onset 局部质心最小二乘拟合得出，
     *                    比 {@code 60000/bpm} 准得多（bpm 只有 0.1 的分辨率，几百拍后就漂了）；
     *                    {@code <= 0} = 没拟合出来，调用方退回 {@code 60000/bpm}
     * @param offsetMs    <b>第一拍位置</b>（毫秒，0 ≤ offsetMs &lt; 一拍）；{@code < 0} = 没测出来
     * @param phaseConfidence 网格置信度（0~1）：拟合残差相对半拍的比例
     */
    public record Result(double bpm, double confidence, int seconds, boolean truncated,
                         double beatMs, double offsetMs, double phaseConfidence) {
        public boolean usable() {
            return bpm > 0;
        }
    }

    /**
     * 拍点网格：<b>第一拍落在哪儿</b> + <b>一拍多长</b>。只有周期没有相位等于没卡点，
     * 只有相位没有精确周期则会随歌越走越偏，两者要一起用。
     *
     * @param beatMs     精确拍长（毫秒，&gt; 0）
     * @param offsetMs   第一拍位置（毫秒，0 ≤ offsetMs &lt; beatMs）
     * @param confidence 置信度（0~1）
     * @param phiFrames  内部用：第一拍在起音曲线上的位置（帧），供迭代精修时锚定
     */
    public record Grid(double beatMs, double offsetMs, double confidence, double phiFrames) {
        public static final Grid NONE = new Grid(-1, -1, 0, -1);

        public boolean ok() {
            return beatMs > 0 && offsetMs >= 0;
        }
    }

    private static volatile Process running;
    private static volatile boolean cancelled;
    private static String vlcPath;

    private BpmAnalyzer() {
    }

    /** 请求中断当前分析（批量扫描的“停止”按钮用）。 */
    public static void cancel() {
        cancelled = true;
        Process p = running;
        if (p != null) {
            p.destroyForcibly();
        }
    }

    /** 清除中断标记，开始新一轮扫描前调用。 */
    public static void resetCancel() {
        cancelled = false;
    }

    public static boolean isCancelled() {
        return cancelled;
    }

    /** VLC 可执行文件路径（从 vlcj 发现的 libvlc 目录推断，失败再退回常见路径）。 */
    public static synchronized String vlcBinary() {
        if (vlcPath != null) {
            return vlcPath;
        }
        try {
            String lib = new uk.co.caprica.vlcj.factory.discovery.NativeDiscovery().discoveredPath();
            if (lib != null) {
                File macos = new File(lib).getParentFile();          // .../Contents/MacOS
                File bin = macos == null ? null : new File(macos, "VLC");
                if (bin != null && bin.canExecute()) {
                    vlcPath = bin.getAbsolutePath();
                    return vlcPath;
                }
            }
        } catch (Throwable ignored) {
            // 忽略：退回下面的常见路径
        }
        for (String c : new String[]{"/Applications/VLC.app/Contents/MacOS/VLC",
                "/opt/homebrew/bin/vlc", "/usr/local/bin/vlc", "/usr/bin/vlc"}) {
            if (new File(c).canExecute()) {
                vlcPath = c;
                return vlcPath;
            }
        }
        vlcPath = "vlc";
        return vlcPath;
    }

    /** 分析一首歌的 BPM 与拍点相位；失败返回 bpm=0。 */
    public static Result analyze(String filepath) {
        try {
            byte[] pcm = decode(filepath, CAP_SECONDS);
            if (pcm == null || pcm.length < RATE) {
                return new Result(0, 0, 0, false, -1, -1, 0);
            }
            return estimate(pcm);
        } catch (Exception e) {
            return new Result(0, 0, 0, false, -1, -1, 0);
        }
    }

    /**
     * 直接分析一段 PCM（22.05kHz 单声道 s16le）—— 给探针 / 自测用，不需要 VLC。
     * 合成一段 click track 就能把「速度」和「第一拍位置」两件事一起验了。
     */
    public static Result analyzePcm(byte[] pcm) {
        if (pcm == null || pcm.length < RATE) {
            return new Result(0, 0, 0, false, -1, -1, 0);
        }
        return estimate(pcm);
    }

    /**
     * 只补<b>拍点网格</b>（第一拍位置 + 精确拍长）：BPM 已经存过就不必再猜速度，只要知道
     * 「拍落在哪儿、一拍到底多长」。比 {@link #analyze} 快（只解 {@link #GRID_CAP_SECONDS} 秒，不跑自相关）。
     *
     * <p>批量扫描在跑（{@link #busy()}）时直接放弃：VLC 子进程是同一个静态字段，
     * 抢进来会让「停止」按钮杀错进程。</p>
     *
     * @param bpmHint 已知 BPM；≤0 时返回 {@link Grid#NONE}
     */
    public static Grid measureGrid(String filepath, double bpmHint) {
        if (filepath == null || bpmHint <= 0 || busy()) {
            return Grid.NONE;
        }
        try {
            Odf o = computeOdf(decode(filepath, GRID_CAP_SECONDS, false));
            if (o == null) {
                return Grid.NONE;
            }
            Grid g = fitGrid(o.v, Math.min(o.frames, GRID_FRAMES), 60000.0 / bpmHint);
            return g == null ? Grid.NONE : g;
        } catch (Exception e) {
            return Grid.NONE;
        }
    }

    /** 是否有分析在跑（后台补相位前先问一句，别和批量扫描抢 VLC）。 */
    public static boolean busy() {
        return running != null;
    }

    /** 全速解码成 22.05kHz 单声道 s16le；最多取 {@code seconds} 秒。 */
    private static byte[] decode(String filepath, int seconds) throws Exception {
        return decode(filepath, seconds, true);
    }

    /**
     * @param cancellable 是否响应批量扫描的「停止」。后台补网格时传 false ——
     *                    扫描被停过之后 {@code cancelled} 会一直留着 true，那不是针对这次的，
     *                    照它办会让"播放中自动补网格"永远失败
     */
    private static byte[] decode(String filepath, int seconds, boolean cancellable) throws Exception {
        if (cancellable && cancelled) {
            return null;
        }
        int cap = seconds * RATE * 2;
        ProcessBuilder pb = new ProcessBuilder(
                vlcBinary(),
                "-I", "dummy",
                "--no-video",
                "--no-snapshot-preview",
                "--sout=#transcode{acodec=s16l,channels=1,samplerate=" + RATE + "}"
                        + ":std{access=file,mux=raw,dst=-}",
                "--play-and-exit",
                filepath);
        pb.redirectErrorStream(false);
        pb.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process p = pb.start();
        running = p;
        byte[] buf = new byte[cap];
        int total = 0;
        try (InputStream in = p.getInputStream()) {
            while (total < cap) {
                int r = in.read(buf, total, Math.min(65536, cap - total));
                if (r < 0) {
                    break;
                }
                total += r;
                if (cancellable && cancelled) {
                    break;
                }
            }
        }
        // 读满上限就提前掐断解码，别让子进程继续跑
        if (p.isAlive()) {
            p.destroyForcibly();
        }
        p.waitFor(10, TimeUnit.SECONDS);
        running = null;
        if (cancellable && cancelled) {
            return null;
        }
        byte[] out = new byte[total];
        System.arraycopy(buf, 0, out, 0, total);
        return out;
    }

    /** 帧间谱通量算出的起音强度曲线（已归一化）、帧数与分析秒数。 */
    private record Odf(double[] v, int frames, int seconds) {
    }

    /** 梳状相位搜索结果：相位（帧）与置信度。 */
    private record Fit(double phi, double conf) {
    }

    /**
     * PCM → 归一化的起音强度曲线：短时谱通量 → 自适应阈值去均值 → 半波整流 → 归一化。
     * 太短或整段没有起伏（静音）返回 null。
     */
    private static Odf computeOdf(byte[] pcm) {
        if (pcm == null) {
            return null;
        }
        int n = pcm.length / 2;
        int seconds = n / RATE;
        if (n < FFT_SIZE) {
            return null;
        }
        float[] x = new float[n];
        for (int i = 0; i < n; i++) {
            int lo = pcm[2 * i] & 0xFF;
            int hi = pcm[2 * i + 1];
            x[i] = (short) ((hi << 8) | lo) / 32768f;
        }

        // ── 1. 帧级谱通量 ──
        float[] win = new float[FFT_SIZE];
        for (int i = 0; i < FFT_SIZE; i++) {
            win[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
        }
        Fft fft = new Fft(FFT_SIZE);
        float[] re = new float[FFT_SIZE];
        float[] im = new float[FFT_SIZE];
        int bins = FFT_SIZE / 2;
        float[] prev = new float[bins];
        int frames = (n - FFT_SIZE) / HOP + 1;
        if (frames < 8) {
            return null;
        }
        float[] flux = new float[frames];
        for (int f = 0; f < frames; f++) {
            int off = f * HOP;
            for (int i = 0; i < FFT_SIZE; i++) {
                re[i] = x[off + i] * win[i];
                im[i] = 0f;
            }
            fft.forward(re, im);
            float sum = 0f;
            for (int b = 0; b < bins; b++) {
                float mag = (float) Math.sqrt(re[b] * re[b] + im[b] * im[b]);
                float d = mag - prev[b];
                if (d > 0) {
                    sum += d;
                }
                prev[b] = mag;
            }
            flux[f] = sum;
        }

        // ── 2. 去均值 + 半波整流（自适应阈值）──
        // 窗口取 ±150ms（起音检测的常规取值）。窗口过长会把快歌的节拍起伏一起抹平，
        // 导致节奏被"降一半"（实测 174 BPM 会被报成 87）。
        int half = Math.max(1, (int) Math.round(FPS * 0.15));
        double[] odf = new double[frames];
        for (int i = 0; i < frames; i++) {
            int lo = Math.max(0, i - half);
            int hi = Math.min(frames - 1, i + half);
            double m = 0;
            for (int k = lo; k <= hi; k++) {
                m += flux[k];
            }
            m /= (hi - lo + 1);
            odf[i] = Math.max(0, flux[i] - m);
        }
        double norm = 0;
        for (double v : odf) {
            norm += v * v;
        }
        norm = Math.sqrt(norm);
        if (norm <= 1e-9) {
            return null;
        }
        for (int i = 0; i < frames; i++) {
            odf[i] /= norm;
        }
        return new Odf(odf, frames, seconds);
    }

    /** 从 PCM 估计 BPM 与拍点相位。 */
    private static Result estimate(byte[] pcm) {
        int seconds = (pcm.length / 2) / RATE;
        Odf box = computeOdf(pcm);
        if (box == null) {
            return new Result(0, 0, seconds, false, -1, -1, 0);
        }
        double[] odf = box.v;
        int frames = box.frames;

        // ── 3. 自相关 ──
        int minLag = (int) Math.floor(60.0 * FPS / MAX_BPM);
        int maxLag = (int) Math.ceil(60.0 * FPS / MIN_BPM);
        maxLag = Math.min(maxLag, frames / 2);
        if (maxLag <= minLag + 2) {
            return new Result(0, 0, seconds, false, -1, -1, 0);
        }
        double[] ac = new double[maxLag * 3 + 2];
        for (int lag = 1; lag < ac.length; lag++) {
            double s = 0;
            int cnt = frames - lag;
            if (cnt <= 0) {
                break;
            }
            for (int i = 0; i < cnt; i++) {
                s += odf[i] * odf[i + lag];
            }
            ac[lag] = s / cnt;
        }

        // ── 4. 梳状打分 + 节奏先验 ──
        double best = -1;
        int bestLag = -1;
        double[] score = new double[maxLag + 1];
        for (int lag = minLag; lag <= maxLag; lag++) {
            double bpm = 60.0 * FPS / lag;
            double s = ac[lag];
            if (2 * lag < ac.length) {
                s += 0.5 * ac[2 * lag];
            }
            if (3 * lag < ac.length) {
                s += 0.33 * ac[3 * lag];
            }
            double prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / PRIOR_CENTER) / Math.log(2) / PRIOR_SIGMA, 2));
            score[lag] = s * prior;
            if (score[lag] > best) {
                best = score[lag];
                bestLag = lag;
            }
        }
        if (bestLag < 0 || best <= 0) {
            return new Result(0, 0, seconds, false, -1, -1, 0);
        }

        // ── 5. 抛物线插值细化（自相关在峰值附近近似二次）──
        double refined = bestLag;
        if (bestLag > 1 && bestLag + 1 < ac.length) {
            double y1 = ac[bestLag - 1];
            double y2 = ac[bestLag];
            double y3 = ac[bestLag + 1];
            double denom = y1 - 2 * y2 + y3;
            if (Math.abs(denom) > 1e-12) {
                double delta = 0.5 * (y1 - y3) / denom;
                if (delta > -1 && delta < 1) {
                    refined = bestLag + delta;
                }
            }
        }
        double bpm = 60.0 * FPS / refined;
        bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));

        // ── 6. 置信度：与「最近的竞争节奏」差多少 ──
        // 用峰值相对均值会因为峰值太尖而普遍饱和到 1.0（对真实音乐毫无分辨力），
        // 所以改成：在候选里找最接近、但既不等于本答案、也不成倍速关系的那个节奏，
        // 两者的相对差距就是置信度。节拍清晰的歌差距大，没鼓点的歌差距小。
        double bestCompete = 0;
        for (int lag = minLag; lag <= maxLag; lag++) {
            double ratio = (60.0 * FPS / lag) / bpm;
            boolean related = Math.abs(ratio - 1) < 0.12
                    || Math.abs(ratio - 2) < 0.20
                    || Math.abs(ratio - 0.5) < 0.06;
            if (!related) {
                bestCompete = Math.max(bestCompete, score[lag]);
            }
        }
        double conf = best > 1e-12 ? (best - bestCompete) / best : 0;
        conf = Math.max(0, Math.min(1, conf));

        // ── 7. 拍点网格：第一拍落在哪儿（相位）+ 一拍到底多长（周期）──
        // 自相关只给出「一拍大约多长」，给不出「第一拍在哪儿」。没有相位就等于假设
        // "第一拍正好在 0:00.000"，而真实歌曲的前奏长度是任意的 —— 于是动画只能保证速度对、
        // 永远踩不到拍上。网格拟合顺便把周期也修准了（自相关的 ±0.1 BPM 会让整首歌慢慢漂）。
        Grid grid = fitGrid(odf, Math.min(frames, GRID_FRAMES), 60000.0 / bpm);
        if (grid != null && grid.ok()) {
            bpm = 60000.0 / grid.beatMs();          // 用拟合出的精确周期覆盖自相关粗值
        }
        return new Result(bpm, conf, seconds, seconds >= CAP_SECONDS - 1,
                grid == null ? -1 : grid.beatMs(),
                grid == null ? -1 : grid.offsetMs(),
                grid == null ? 0 : grid.confidence());
    }

    /**
     * 拍点相位搜索：把起音曲线和「等间隔脉冲梳」对齐，找最贴合的相位。
     *
     * <p>在 {@code [0, 周期)} 上以 1/{@link #PHASE_STEPS_PER_FRAME} 帧为步长扫一遍：每个候选相位
     * 把落在同相位上的所有起音值累加（再取 ±1 帧的三角窗权重，容忍一点抖动），总分最高的
     * 那个就是第一拍的位置。复杂度只有 {@code 步数 × 拍数 ≈ 4 × 帧数}，一首三分钟的歌几毫秒。</p>
     *
     * @return 相位（帧，{@code 0 ≤ phi < periodFrames}）与置信度；样本太少 / 没有起伏返回 null
     */
    private static Fit phaseFit(double[] odf, int frames, double periodFrames) {
        if (periodFrames < 2 || frames < periodFrames * 2) {
            return null;
        }
        int steps = (int) Math.max(8, Math.round(periodFrames * PHASE_STEPS_PER_FRAME));
        double bestScore = -1;
        double bestPhi = 0;
        double sum = 0;
        for (int s = 0; s < steps; s++) {
            double phi = s * periodFrames / steps;
            double sc = combScore(odf, frames, phi, periodFrames);
            sum += sc;
            if (sc > bestScore) {
                bestScore = sc;
                bestPhi = phi;
            }
        }
        if (bestScore <= 1e-9) {
            return null;
        }
        double mean = sum / steps;
        double conf = Math.max(0, Math.min(1, (bestScore - mean) / bestScore));
        return new Fit(bestPhi, conf);
    }

    /** 相位 {@code phi} 在给定帧范围内的梳状总分（把落在同相位上的 onset 能量加起来）。 */
    private static double combScore(double[] odf, int frames, double phi, double periodFrames) {
        double sc = 0;
        for (double pos = phi; pos < frames - 1; pos += periodFrames) {
            sc += sample(odf, frames, pos)
                    + 0.5 * (sample(odf, frames, pos - 1) + sample(odf, frames, pos + 1));
        }
        return sc;
    }

    /**
     * 拟合拍点网格：<b>先用开头 30 秒的梳状搜索定相位</b>，再反复用「每拍局部质心 + 最小二乘」
     * 精修拍长与相位。
     *
     * <p>为什么相位必须由短窗决定：速度本身有 ±0.1 BPM 的误差，以它为准的拍点网格会随时间漂移，
     * 而梳状打分是<b>全程求和</b> —— 窗口越长，最优相位越会停在"窗口正中间对得最齐"的位置，
     * 两端偏得越多（实测 180 秒窗能偏出一两百毫秒）。开头 30 秒漂移还小，相位最可信。</p>
     *
     * <p>为什么还要迭代精修：梳状搜索的相位分辨率是一帧（11.6 ms），而真正的拍点位置要靠
     * 每拍 onset 质心的最小二乘截距来定 —— 质心抖动被几百个拍点平均掉，拍长能做到 0.01%
     * （自相关的 ±0.1 BPM 会让一首歌慢慢漂出去）。迭代是因为第一遍用的拍长还不准，
     * 预测位置会和真实拍点越差越远；用上一遍拟合出的拍长重新取质心，两三遍就收敛。</p>
     *
     * @param odf           起音曲线
     * @param frames        可用帧数
     * @param periodMsGuess 粗拍长（毫秒，通常来自 BPM）
     * @return 网格；拟合不出来返回 null
     */
    private static Grid fitGrid(double[] odf, int frames, double periodMsGuess) {
        if (periodMsGuess <= 0 || frames < 16) {
            return null;
        }
        int coarseFrames = Math.min(frames, (int) Math.round(GRID_COARSE_SECONDS * FPS));
        Fit coarse = phaseFit(odf, coarseFrames, periodMsGuess / 1000.0 * FPS);
        if (coarse == null) {
            return null;
        }
        double p0 = periodMsGuess / 1000.0 * FPS;
        // 反拍去歧义：鼓组里 snare/hi-hat 常常比 kick 响，开头 30 秒上会出现「正拍」与
        // 「反拍」（错开半拍）两个几乎一样高的峰，谁赢全看噪声。把两个候选拿到整段可用帧上
        // 再比一次 —— 漂移对两个候选的影响一样，比较仍然公平，而正拍通常 onset 能量更高。
        double phiA = coarse.phi;
        double phiB = mod(coarse.phi + 0.5 * p0, p0);
        double scoreA = combScore(odf, frames, phiA, p0);
        double scoreB = combScore(odf, frames, phiB, p0);
        double phi = scoreA >= scoreB ? phiA : phiB;
        double top = Math.max(scoreA, scoreB);
        double margin = top <= 1e-9 ? 0 : Math.abs(scoreA - scoreB) / top;
        Grid last = null;
        for (int iter = 0; iter < 3; iter++) {
            Grid g = fitFrom(odf, frames, phi, p0, periodMsGuess);
            if (g == null) {
                break;
            }
            // 置信度取「拟合精度」与「正反拍差距」的较小者：
            // 拟合得很齐但正反拍分数打平（kick 和 hi-hat 一样响）时，相位其实是在抛硬币，
            // 界面要能提示"手动微调一下"。
            double marginConf = Math.max(0, Math.min(1, margin / PHASE_MARGIN_FULL));
            last = new Grid(g.beatMs(), g.offsetMs(), Math.min(g.confidence(), marginConf), g.phiFrames());
            if (g.confidence() <= marginConf) {
                break;                              // 主导因素是拟合精度，再迭代也不会更确定
            }
            phi = g.phiFrames();
            p0 = g.beatMs() / 1000.0 * FPS;
        }
        return last;
    }

    /**
     * 一轮精修：在预测位置附近取 onset 质心，对（拍号，质心）做稳健最小二乘
     * {@code t = a + b·k} —— 截距 a 是第一拍、斜率 b 是拍长。
     *
     * @param phiGuess  第一拍的粗略位置（帧）
     * @param p0Guess   粗略拍长（帧）
     * @param refMs     初始拍长（毫秒）：最终拍长偏离它超过 {@link #PERIOD_TOLERANCE} 就判失败，
     *                  避免把"认错拍"拟合成一条看着很漂亮的直线
     */
    private static Grid fitFrom(double[] odf, int frames, double phiGuess, double p0Guess, double refMs) {
        int beats = (int) ((frames - 2 - phiGuess) / p0Guess);
        if (beats < 4) {
            return null;
        }
        double[] ks = new double[beats];
        double[] ts = new double[beats];
        int m = 0;
        for (int i = 0; i < beats; i++) {
            double c = centroid(odf, frames, phiGuess + i * p0Guess, CENTROID_WIN_FRAMES);
            if (!Double.isNaN(c)) {
                ks[m] = i;
                ts[m] = c;
                m++;
            }
        }
        if (m < 4) {
            return null;
        }
        double[] ab = regress(ks, ts, m);
        if (ab == null) {
            return null;
        }
        // 剔除离群拍点（前奏没鼓、加花、噪声误判）后重算
        int m2 = 0;
        for (int i = 0; i < m; i++) {
            if (Math.abs(ts[i] - (ab[0] + ab[1] * ks[i])) <= 0.25 * p0Guess) {
                ks[m2] = ks[i];
                ts[m2] = ts[i];
                m2++;
            }
        }
        if (m2 >= 4) {
            double[] ab2 = regress(ks, ts, m2);
            if (ab2 != null) {
                ab = ab2;
                m = m2;
            }
        }
        double periodMs = ab[1] / FPS * 1000.0;
        if (periodMs <= 0 || Math.abs(periodMs - refMs) > PERIOD_TOLERANCE * refMs) {
            return null;
        }
        double rms = 0;
        for (int i = 0; i < m; i++) {
            double r = ts[i] - (ab[0] + ab[1] * ks[i]);
            rms += r * r;
        }
        rms = Math.sqrt(rms / m);
        double conf = Math.max(0, Math.min(1, 1 - rms / (p0Guess * 0.25)));
        double offsetMs = mod(ab[0] / FPS * 1000.0 - ONSET_BIAS_MS, periodMs);
        return new Grid(periodMs, offsetMs, conf, ab[0]);
    }

    /** 以 {@code pred} 为中心、±{@code win} 帧范围内的 onset 能量质心（帧）；范围内没有能量返回 NaN。 */
    private static double centroid(double[] odf, int n, double pred, double win) {
        double mass = 0;
        double moment = 0;
        for (double q = pred - win; q <= pred + win; q += 0.25) {
            double v = sample(odf, n, q);
            mass += v;
            moment += v * q;
        }
        return mass <= 1e-12 ? Double.NaN : moment / mass;
    }

    /** 最小二乘拟合 {@code t = a + b·k}，返回 {@code {a, b}}；退化时返回 null。 */
    private static double[] regress(double[] ks, double[] ts, int m) {
        double sk = 0;
        double st = 0;
        double skk = 0;
        double skt = 0;
        for (int i = 0; i < m; i++) {
            sk += ks[i];
            st += ts[i];
            skk += ks[i] * ks[i];
            skt += ks[i] * ts[i];
        }
        double den = m * skk - sk * sk;
        if (Math.abs(den) < 1e-9) {
            return null;
        }
        double b = (m * skt - sk * st) / den;
        return new double[]{(st - b * sk) / m, b};
    }

    /** 起音曲线在（可为小数的）第几个帧位置上的值；越界补 0。 */
    private static double sample(double[] v, int n, double pos) {
        if (pos < 0 || pos > n - 1) {
            return 0;
        }
        int i = (int) pos;
        double frac = pos - i;
        if (i + 1 >= n) {
            return v[n - 1];
        }
        return v[i] * (1 - frac) + v[i + 1] * frac;
    }

    private static double mod(double v, double m) {
        double r = v % m;
        return r < 0 ? r + m : r;
    }

    /** 小型迭代 radix-2 FFT（原地复数）。 */
    private static final class Fft {
        private final int n;
        private final int[] rev;
        private final float[] cos;
        private final float[] sin;

        Fft(int n) {
            this.n = n;
            this.rev = new int[n];
            int bits = Integer.numberOfTrailingZeros(n);
            for (int i = 0; i < n; i++) {
                rev[i] = Integer.reverse(i) >>> (32 - bits);
            }
            this.cos = new float[n / 2];
            this.sin = new float[n / 2];
            for (int i = 0; i < n / 2; i++) {
                cos[i] = (float) Math.cos(2 * Math.PI * i / n);
                sin[i] = (float) Math.sin(2 * Math.PI * i / n);
            }
        }

        void forward(float[] re, float[] im) {
            for (int i = 0; i < n; i++) {
                int j = rev[i];
                if (j > i) {
                    float t = re[i];
                    re[i] = re[j];
                    re[j] = t;
                    t = im[i];
                    im[i] = im[j];
                    im[j] = t;
                }
            }
            for (int len = 2; len <= n; len <<= 1) {
                int halfLen = len >> 1;
                int step = n / len;
                for (int i = 0; i < n; i += len) {
                    int idx = 0;
                    for (int k = 0; k < halfLen; k++, idx += step) {
                        float wr = cos[idx];
                        float wi = -sin[idx];
                        int a = i + k;
                        int b = a + halfLen;
                        float xr = re[b] * wr - im[b] * wi;
                        float xi = re[b] * wi + im[b] * wr;
                        re[b] = re[a] - xr;
                        im[b] = im[a] - xi;
                        re[a] += xr;
                        im[a] += xi;
                    }
                }
            }
        }
    }
}
