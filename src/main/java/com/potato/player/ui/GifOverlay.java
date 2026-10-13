package com.potato.player.ui;

import com.potato.player.core.AnimatedGif;
import com.potato.player.core.BpmAnalyzer;
import com.potato.player.core.StretchWave;
import com.potato.player.core.VideoFrames;
import com.potato.player.core.Config;
import javafx.animation.AnimationTimer;
import javafx.application.Platform;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.control.CheckMenuItem;
import javafx.scene.control.ContextMenu;
import javafx.scene.control.Menu;
import javafx.scene.control.MenuItem;
import javafx.scene.control.RadioMenuItem;
import javafx.scene.control.SeparatorMenuItem;
import javafx.scene.control.ToggleGroup;
import javafx.scene.input.MouseButton;
import javafx.scene.image.ImageView;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.io.File;
import java.util.Map;
import java.util.Objects;

/**
 * 动图悬浮窗：无边框、全透明、永远置顶，播放导入的动图并跟着歌卡点。
 *
 * <ul>
 *   <li><b>卡点</b>：把动图一圈的时长整体缩放到最接近的<b>半拍整数倍</b>
 *       （倍率见设置页提示），相位直接由<b>播放位置</b>推算
 *       （{@code 相位 = 播放毫秒 mod 一圈}），所以换曲/拖动进度条都会立刻重新对上，
 *       也不会随播放时间累积漂移；当前歌曲没有 BPM 就按原速放。</li>
 *   <li><b>相位平滑</b>：位置每 50ms 采一次样、用墙钟外推到当前帧，再以每帧 8% 的
 *       比例向目标相位收敛；偏差超过 400ms（换曲、拖动、暂停恢复）直接对齐，避免跳帧。</li>
 *   <li><b>暂停</b>：和桌面歌词一样停住当前帧；停止/无歌曲时按原速空转。</li>
 *   <li>交互：拖动移动 / 滚轮缩放 / 右键菜单（锁定、缩放、重置位置、关闭）。</li>
 *   <li>路径、开关、位置、宽度、锁定状态全部持久化到 config.json。</li>
 * </ul>
 */
public class GifOverlay {

    /** 窗口标题（macOS 原生鼠标穿透按标题定位 NSWindow，勿随意修改）。 */
    private static final String WINDOW_TITLE = "PotatoGifOverlay";

    private static final double MIN_W = 64;
    private static final double MAX_W = 1200;
    private static final double DEFAULT_W = 240;
    /** 伸缩动画周期（秒）：一个完整"缩下去再涨上来"的正弦循环。 */
    private static final double PERIOD_DEFAULT = 1.0;
    private static final double PERIOD_MIN = 0.2;
    private static final double PERIOD_MAX = 6.0;
    /**
     * 竖直振幅 Ay 的范围与默认值（0.22 = 高度在 l±22% 之间摆动）。
     *
     * <p>Ay 是独立设置项，将来若加横向幅度 Ax 两者互不影响。</p>
     */
    private static final double AMP_Y_MIN = 0.0;
    private static final double AMP_Y_MAX = 1.0;
    private static final double AMP_Y_DEFAULT = 0.22;
    /**
     * 横向收放 Ax 的范围与默认值（0.15 = 最宽时比原图宽 15%、最窄时窄 15%）。
     *
     * <p>与 Ay 共用同一个相位、但<b>反相</b>：拉到最高时收窄、压到最矮时加宽，
     * 也就是"伸长变细、压扁变粗"的体积感。Ax = Ay 时横竖乘起来恰好抵消（面积恒定）。</p>
     */
    private static final double AMP_X_MIN = 0.0;
    private static final double AMP_X_MAX = 1.0;
    private static final double AMP_X_DEFAULT = 0.15;

    // ── 悬浮窗上的播放手势（设置里可整体关掉，见 gif_gestures）──
    //
    //   双击          = 下一首
    //   按住左右晃动  = 上一首
    //   鼠标停在图上时：空格 播放/暂停、↑ 音量+并放大、↓ 音量−并缩小、← 上一首、→ 下一首
    //   其余播放控制都在右键菜单里

    /** 方向键每次调多少音量（百分点）。 */
    private static final int VOLUME_STEP = 5;
    /** 方向键每次把动图缩/放多少（0.08 = 8%）。 */
    private static final double ZOOM_STEP = 0.08;

    /**
     * 晃动幅度下限（点）：<b>峰-峰</b>值，也就是相邻两次换向之间的位移。
     * ±3pt 以下（峰-峰 6pt）当手抖，不算晃。
     */
    static final double SHAKE_MIN_SWING_PT = 6;
    /**
     * 晃动幅度上限（点，同样是<b>峰-峰</b>值）：超过就当成在拖走悬浮窗。
     * ±28pt（峰-峰 56pt）以内都算"小幅"。
     */
    static final double SHAKE_MAX_SWING_PT = 56;
    /**
     * 晃动：两次换向的最大间隔（毫秒），超过算慢悠悠地晃，不算"快速"。
     * 实测手晃一圈大约 250~400ms 换一次向，所以放到 450（原来 320 太紧，容易判不出来）。
     */
    static final long SHAKE_MAX_INTERVAL_MS = 450;
    /** 晃动：至少换向几次（3 次 = 左右来回两趟）。 */
    static final int SHAKE_MIN_REVERSALS = 3;
    /** 晃动：相对按下点的水平漂移上限（点），超过就当拖拽。 */
    static final double SHAKE_MAX_DRIFT_PT = 70;
    /**
     * 晃动：相对按下点的<b>竖直</b>漂移上限（点）。比水平那条紧得多 ——
     * 一边把悬浮窗往下拖、一边横向抖，不该被当成"晃一晃切上一首"。
     */
    static final double SHAKE_MAX_VERTICAL_PT = 32;

    /**
     * 「按住左右小幅快速晃动」的识别器。
     *
     * <p>纯逻辑、不碰界面，所以可以直接喂一串轨迹做单测（见探针 {@code ShakeProbe}）。判定条件：</p>
     * <ul>
     *   <li>相对按下点的水平漂移 ≤ {@link #SHAKE_MAX_DRIFT_PT}、竖直漂移 ≤
     *       {@link #SHAKE_MAX_VERTICAL_PT}：超了就是在搬动悬浮窗；</li>
     *   <li>相邻两次换向之间的位移（峰-峰幅度）落在
     *       {@link #SHAKE_MIN_SWING_PT}~{@link #SHAKE_MAX_SWING_PT} 之间；</li>
     *   <li>两次换向间隔 ≤ {@link #SHAKE_MAX_INTERVAL_MS}；</li>
     *   <li>累计换向 ≥ {@link #SHAKE_MIN_REVERSALS} 次；</li>
     *   <li>一次按住最多触发一次（松手后重新计数），避免一下子跳好几首。</li>
     * </ul>
     */
    static final class ShakeDetector {
        private double originX;
        private double originY;
        private double lastX;
        /** 本段方向上的累计位移；换向时清零，所以它的绝对值就是这一次摆动的峰-峰幅度。 */
        private double swing;
        private int dir;
        private long lastTurnMs;
        private int reversals;
        private boolean fired;

        /** 按下时调用（重新计数）。 */
        void start(double x, double y) {
            originX = x;
            originY = y;
            lastX = x;
            swing = 0;
            dir = 0;
            lastTurnMs = 0;
            reversals = 0;
            fired = false;
        }

        /** 每次拖拽采样调一次；返回 true = 这次采样凑齐了"上一首"。 */
        boolean sample(double x, double y, long nowMs) {
            if (fired) {
                return false;
            }
            swing += x - lastX;
            lastX = x;
            if (Math.abs(x - originX) > SHAKE_MAX_DRIFT_PT
                    || Math.abs(y - originY) > SHAKE_MAX_VERTICAL_PT) {
                // 已经拖出去很远了：这是在搬悬浮窗，不是在晃
                reset(nowMs);
                return false;
            }
            int dirNow = swing > 0 ? 1 : (swing < 0 ? -1 : 0);
            if (dir == 0) {
                if (Math.abs(swing) >= SHAKE_MIN_SWING_PT) {
                    dir = dirNow;
                    lastTurnMs = nowMs;
                }
                return false;
            }
            if (dirNow != 0 && dirNow != dir && Math.abs(swing) >= SHAKE_MIN_SWING_PT) {
                boolean quick = nowMs - lastTurnMs <= SHAKE_MAX_INTERVAL_MS;
                boolean small = Math.abs(swing) <= SHAKE_MAX_SWING_PT;
                reversals = quick && small ? reversals + 1 : 1;
                lastTurnMs = nowMs;
                dir = dirNow;
                swing = 0;
                if (reversals >= SHAKE_MIN_REVERSALS) {
                    fired = true;
                    return true;
                }
            }
            return false;
        }

        private void reset(long nowMs) {
            swing = 0;
            dir = 0;
            reversals = 0;
            lastTurnMs = nowMs;
        }
    }

    /** 拍点微调上限（毫秒）。 */
    private static final double TRIM_MAX_MS = 400;
    /**
     * 拍点微调默认值（毫秒）：正 = 动画提前。
     *
     * <p>探针模拟实测：libvlc 报的播放时间系统性滞后约 <b>113 ms</b>（255ms 台阶采样 + 墙钟外推后的均值），
     * 所以默认提前 110 ms 抵消掉，拍点残差从 +113ms 降到 ~8ms（就是 60fps 的取整）。</p>
     */
    private static final double TRIM_DEFAULT_MS = 110;
    /** 位置采样间隔（毫秒）：采样之间用墙钟外推。 */
    private static final double SAMPLE_INTERVAL_MS = 50;
    /** 相位偏差超过此值直接对齐，不再平滑收敛。 */
    private static final double SNAP_MS = 400;
    /**
     * 每帧向目标相位收敛的比例（一阶低通）。
     *
     * <p>实测 libvlc 的播放时间是 <b>255 ms 一个台阶</b>（每 255 ms 跳 +255 ms，速率 0.9988×），
     * 用墙钟外推后仍有 0~255 ms 的锯齿。0.02/帧 → 时间常数约 0.8 秒，
     * 能把 4 Hz 的锯齿压到十几毫秒量级，代价是相位稳定落在锯齿均值附近
     * （即整体可能偏早/偏晚百米毫秒级，可调 {@code gif_phase_ms} 补偿）；
     * 收敛再快就会跟着锯齿抖，动画反而看得出一顿一顿。</p>
     */
    private static final double SLEW_PER_FRAME = 0.02;

    private final MainWindow main;
    private final ImageView view = new ImageView();
    private final StackPane root = new StackPane(view);

    private Stage stage;
    private AnimatedGif gif;
    private String gifPath = "";
    /** 视频动图是后台解码：这个 token 用来作废「解到一半又导入了别的」的结果。 */
    private volatile long videoLoadToken;
    private boolean locked;
    /** true = 只用整拍（每圈都落在正拍上）；false = 半拍粒度（速度变化更小）。 */
    private boolean integerBeats;
    /** 正弦伸缩：开关、竖直振幅 Ay、周期 T（秒）与缩放变换（锚点在内容底边）。 */
    private boolean stretchOn;
    private double ampY;
    private double ampX;
    private double stretchPeriod;
    /**
     * 跟拍卡点：有 BPM 时把伸缩的一轮锁到拍点上（周期取"最接近你设的 T 的整数拍"，
     * 用 {@link AnimatedGif#plan} 同一套规则），拍点可以落在伸长峰或压缩谷上，
     * 还能按"一拍的比例"微调（补偿 libvlc 播放时间那 ±110ms 的系统性偏差）。
     */
    private boolean beatLock;
    private boolean beatOnPeak;
    private double beatTrim;
    /** 上一帧使用的周期（毫秒）：周期一变就把相位重基到新周期，避免高度跳变。 */
    private double lastPeriodMs = -1;
    private final javafx.scene.transform.Scale stretchScale =
            new javafx.scene.transform.Scale(1, 1, 0, 0);
    /**
     * 伸缩动画自己的时钟（毫秒），<b>只在播放中</b>按真实帧间隔累加（只增不减）。
     *
     * <p>不取 VLC 的播放位置：libvlc 的 getTime() 是 255 ms 一个台阶，直接拿来算高度
     * 会得到阶梯而不是正弦。暂停 / 停止时这个钟停住，图就冻在当前姿态。</p>
     */
    private double stretchMs;
    private double width;
    private boolean dragging;
    private double dragDx;
    private double dragDy;
    /** 按下时悬浮窗的位置：晃出"上一首"之后要回到这里（晃动不该把窗口挪走）。 */
    private double pressStageX;
    private double pressStageY;
    /** 拖拽过程中的晃动识别器（双击/晃动判定的状态都在它里面）。 */
    private final ShakeDetector shake = new ShakeDetector();
    /**
     * 特殊手势总开关（双击 / 晃动 / 方向键），config 键 {@code gif_gestures}，默认开。
     * 关掉之后悬浮窗只认拖动、滚轮和右键菜单。
     */
    private boolean gesturesOn;
    /** 鼠标是不是正停在小动图上（方向键据此决定要不要接管）。 */
    private boolean mouseOver;
    /** 最近一次右键的位置（菜单里的放大/缩小以它为焦点）。 */
    private double menuX;
    private double menuY;

    private AnimationTimer timer;
    /** 省电：动画按 30fps 画（脉冲照旧 60 次/秒，但隔一帧才真的改画面）。 */
    private boolean lowFps;
    /** 上一次真的画出去的帧的时间戳（毫秒）。 */
    private double lastDrawMs;
    /** 缩放后时间轴上的位置（毫秒）；<0 表示还没对齐过（下一帧直接锚定）。 */
    private double phaseMs = -1;
    private long lastNanos;
    private int lastFrame = -1;

    // ── 播放位置采样 / 卡点方案缓存 ──
    private double samplePosMs = -1;
    private double sampleAtMs;
    private String sampleSong;
    /** 上一帧是否在播放 / 上一帧的曲目：变化时相位直接重锚，不做慢收敛。 */
    private boolean lastPlaying;
    private String lastTickSong;
    private double lastPlanAt = -1;
    private String planSong;
    private double planBpm = -1;
    /** 当前歌曲的精确拍长（毫秒；≤0 = 没拟合过，退回 60000/bpm）。 */
    private double planBeatMs;
    /** 当前歌曲第一拍的位置（毫秒；<0 = 未知，按 0 起算）。 */
    private double beatOffsetMs = -1;
    private AnimatedGif.BeatPlan plan = new AnimatedGif.BeatPlan(0, 0, 1);
    /** 本会话已经排过队测网格的歌（测不出来也不再反复起 VLC 进程）。 */
    private final java.util.Set<String> gridAsked =
            java.util.Collections.synchronizedSet(new java.util.HashSet<>());
    /** 正在后台测网格的那首歌（同一时刻只跑一个）。 */
    private volatile String gridPending;

    public GifOverlay(MainWindow main) {
        this.main = main;
        Map<String, Object> cfg = main.lib().config();
        this.width = clampWidth(Config.getDouble(cfg, "gif_width", DEFAULT_W));
        this.locked = Config.getBool(cfg, "gif_locked", false);
        this.integerBeats = Config.getBool(cfg, "gif_int_beats", true);
        this.stretchOn = cfg.containsKey("gif_stretch")
                ? Config.getBool(cfg, "gif_stretch", true)
                : Config.getBool(cfg, "gif_spring", true);
        this.ampY = clampAmpY(cfg.containsKey("gif_amp_y")
                ? Config.getDouble(cfg, "gif_amp_y", AMP_Y_DEFAULT)
                : Config.getDouble(cfg, "gif_stretch_amp",
                        Config.getDouble(cfg, "gif_spring_amp", AMP_Y_DEFAULT)));
        this.stretchPeriod = clampPeriod(Config.getDouble(cfg, "gif_stretch_period",
                PERIOD_DEFAULT));
        this.ampX = clampAmpX(Config.getDouble(cfg, "gif_amp_x", AMP_X_DEFAULT));
        this.beatLock = Config.getBool(cfg, "gif_beat_lock", true);
        this.beatOnPeak = Config.getBool(cfg, "gif_beat_on_peak", true);
        this.beatTrim = clampTrim(Config.getDouble(cfg, "gif_beat_trim", TRIM_DEFAULT_MS));
        this.lowFps = Config.getBool(cfg, "anim_low_fps", true);
        this.gesturesOn = Config.getBool(cfg, "gif_gestures", true);
        this.gifPath = Config.getString(cfg, "gif_path", "");
        if (!gifPath.isBlank()) {
            File restored = new File(gifPath);
            if (VideoFrames.isVideo(restored)) {
                // 视频要抓帧（一两秒），放后台：启动不能被它挡住
                loadVideoAsync(restored);
            } else {
                AnimatedGif loaded = AnimatedGif.load(restored);
                if (loaded != null) {
                    gif = loaded;
                } else {
                    gifPath = "";
                }
            }
        }
        // 图还没读进来时算不出宽高比，所以放到最后再按屏幕压一次宽度
        this.width = Math.max(MIN_W, Math.min(this.width, maxUsableWidth()));
    }

    /**
     * 当前屏幕下可用的最大图宽：让整个窗口（含 Ay / Ax 留出的余量）都能放进屏幕里。
     *
     * <p>不设这个上限的话，把宽度滚到 1200 会让窗口高到 2200+ pt（屏幕才 956），
     * 窗口一超出屏幕，图（底边对齐在窗口底部）就被推到屏幕外，悬浮窗等于消失。</p>
     */
    private double maxUsableWidth() {
        try {
            Rectangle2D vb = Screen.getPrimary().getVisualBounds();
            double aspect = (gif != null && gif.width() > 0)
                    ? (double) gif.height() / gif.width() : 1;
            double byW = (vb.getWidth() - 80) / (1 + ampX);
            double byH = (vb.getHeight() - 80) / (aspect * (1 + ampY));
            return Math.max(MIN_W, Math.min(MAX_W, Math.min(byW, byH)));
        } catch (Throwable t) {
            return MAX_W;   // 屏幕信息还拿不到（理论上不会）：退回原上限
        }
    }

    // ── 状态 ──

    /** 把悬浮窗提到最前（起雾时：小动图得压在雾层上面才看得见）。 */
    public void toFront() {
        if (stage != null && stage.isShowing()) {
            stage.toFront();
        }
    }

    /** 当前图宽（点）：起雾时按它算擦除半径。 */
    public double currentWidth() {
        return width;
    }

    /**
     * 小动图「可见内容」的中心在屏幕上的坐标（点）：起雾时以它为擦除圆心。
     *
     * <p>窗口里纵向留了 Ay 的余量、图又是底边对齐，所以不能直接用窗口中心；
     * 按内容包围盒（{@code contentTop/contentBottom}）算才落在图上。</p>
     */
    public double[] centerOnScreen() {
        if (stage == null) {
            return new double[]{0, 0};
        }
        double cx = stage.getX() + stage.getWidth() / 2;
        double cy = stage.getY() + stage.getHeight() / 2;
        if (gif != null) {
            double h = displayHeight();
            double top = stage.getY() + stage.getHeight() - h;
            cy = top + h * (gif.contentTop() + gif.contentBottom()) / 2;
        }
        return new double[]{cx, cy};
    }

    /** 移动时通知雾层「这儿被擦了」（没起雾时是空操作）。 */
    private void wipeFog() {
        FogOverlay fog = main.fogOverlayIfAny();
        if (fog != null && fog.isOn()) {
            fog.wipeAtSticker();
        }
    }

    public boolean isShowing() {
        return stage != null && stage.isShowing();
    }

    public boolean hasGif() {
        return gif != null;
    }

    public boolean isLocked() {
        return locked;
    }

    public boolean isIntegerBeats() {
        return integerBeats;
    }

    /** 纵向正弦伸缩是否开启。 */
    public boolean isStretchOn() {
        return stretchOn;
    }

    /** 竖直振幅 Ay（独立设置项，0.0~1.0）：高度在 l·(1±Ay) 之间摆动。 */
    public double ampY() {
        return ampY;
    }

    /** 一个完整正弦循环的时长 T（秒）。 */
    public double stretchPeriod() {
        return stretchPeriod;
    }

    public void setStretchPeriod(double value) {
        stretchPeriod = clampPeriod(value);
        main.lib().config().put("gif_stretch_period", stretchPeriod);
        main.lib().saveConfig();
    }

    /** 开关正弦伸缩；关掉时立刻回到原尺寸。 */
    public void setStretchOn(boolean value) {
        stretchOn = value;
        main.lib().config().put("gif_stretch", value);
        main.lib().saveConfig();
        if (!value) {
            stretchScale.setX(1);
            stretchScale.setY(1);
        } else {
            stretchMs = 0;
        }
        applyWidth();
        refreshTimer();
    }

    /** 设置竖直振幅 Ay：只改纵向摆动的幅度，与周期 T、横向 Ax 互不影响。 */
    public void setAmpY(double value) {
        ampY = clampAmpY(value);
        main.lib().config().put("gif_amp_y", ampY);
        main.lib().saveConfig();
        applyWidth();
    }

    /** 横向收放 Ax（0.0~1.0）：伸长时收窄、压缩时加宽的比例幅度。 */
    public double ampX() {
        return ampX;
    }

    /** 设置横向收放 Ax；只影响横向胖瘦，与 Ay、T 互不影响。 */
    public void setAmpX(double value) {
        ampX = clampAmpX(value);
        main.lib().config().put("gif_amp_x", ampX);
        main.lib().saveConfig();
        applyWidth();
    }

    /** 特殊手势（双击 / 晃动 / 方向键）是否开启。 */
    public boolean isGesturesOn() {
        return gesturesOn;
    }

    public void setGesturesOn(boolean value) {
        gesturesOn = value;
        main.lib().config().put("gif_gestures", value);
        main.lib().saveConfig();
    }

    /** 鼠标是不是正停在悬浮窗上（主窗口据此决定方向键要不要交给动图）。 */
    public boolean isMouseOverSticker() {
        return mouseOver;
    }

    /**
     * 处理一个"遥控键"：<b>空格 = 播放/暂停，↑ 音量 +5% 且动图放大一档，
     * ↓ 音量 −5% 且动图缩小一档，← 上一首，→ 下一首</b>。
     *
     * <p>两条入口都会调它：鼠标停在动图上时由主窗口的按键过滤器转过来（键盘焦点一般
     * 在主窗口），以及动图自己拿到焦点时（比如刚点过它）。返回 true = 这个键被吃掉了。</p>
     */
    public boolean handleGestureKey(javafx.scene.input.KeyCode code) {
        if (!gesturesOn) {
            return false;
        }
        switch (code) {
            case SPACE -> main.pauseOrResume();
            case UP -> {
                main.setVolume(Math.min(100, main.currentVolume + VOLUME_STEP));
                zoomFromCenter(ZOOM_STEP);
            }
            case DOWN -> {
                main.setVolume(Math.max(0, main.currentVolume - VOLUME_STEP));
                zoomFromCenter(-ZOOM_STEP);
            }
            case LEFT -> main.prevSong();
            case RIGHT -> main.nextSong();
            default -> {
                return false;
            }
        }
        return true;
    }

    /** 以动图中心为焦点缩放（方向键用；滚轮和菜单那两处是跟着指针走的）。 */
    private void zoomFromCenter(double factor) {
        if (stage == null || !isShowing()) {
            return;
        }
        zoomAt(stage.getX() + stage.getWidth() / 2, stage.getY() + stage.getHeight() / 2, factor);
    }

    /** 跟拍卡点是否开启（有 BPM 时把伸缩一轮锁到拍点）。 */
    public boolean isBeatLock() {
        return beatLock;
    }

    public void setBeatLock(boolean value) {
        beatLock = value;
        main.lib().config().put("gif_beat_lock", value);
        main.lib().saveConfig();
    }

    /** 拍点落在伸长峰（true）还是压缩谷（false）。 */
    public boolean isBeatOnPeak() {
        return beatOnPeak;
    }

    public void setBeatOnPeak(boolean value) {
        beatOnPeak = value;
        main.lib().config().put("gif_beat_on_peak", value);
        main.lib().saveConfig();
    }

    /** 拍点微调（毫秒，−400~400）：正 = 动画整体提前，用来补播放时钟的系统性偏差。 */
    public double beatTrim() {
        return beatTrim;
    }

    public void setBeatTrim(double value) {
        beatTrim = clampTrim(value);
        main.lib().config().put("gif_beat_trim", beatTrim);
        main.lib().saveConfig();
    }

    /** 切换卡点粒度；循环长度会变，所以相位重新锚定。 */
    public void setIntegerBeats(boolean value) {
        integerBeats = value;
        main.lib().config().put("gif_int_beats", value);
        main.lib().saveConfig();
        lastPlanAt = -1;
        planSong = null;
        planBpm = -1;
        phaseMs = -1;
    }

    public double width() {
        return width;
    }

    public String gifPath() {
        return gifPath;
    }

    public String gifName() {
        return gifPath.isBlank() ? "" : new File(gifPath).getName();
    }

    public void toggle() {
        if (isShowing()) {
            hide();
        } else {
            show();
        }
    }

    /** 显示悬浮窗；没有动图时返回 false（调用方负责提示）。 */
    public boolean show() {
        if (gif == null) {
            return false;
        }
        ensureStage();
        boolean firstShow = !stage.isShowing();
        if (firstShow) {
            boolean restore = Config.getDouble(main.lib().config(), "gif_x", -1) >= 0
                    && positionVisible();
            if (restore) {
                stage.setX(currentX());
                stage.setY(currentY());
            }
            stage.show();
            if (!restore) {
                resetPosition();
            }
        }
        applyWidth();
        applyLock(firstShow);
        refreshTimer();
        main.lib().config().put("gif_on", true);
        main.lib().saveConfig();
        return true;
    }

    public void hide() {
        stopTimer();
        mouseOver = false;
        if (stage != null) {
            stage.hide();
        }
        main.lib().config().put("gif_on", false);
        main.lib().saveConfig();
    }

    /** 关闭窗口时释放原生状态。 */
    public void dispose() {
        stopTimer();
        if (stage != null) {
            MacWindowClickThrough.setIgnoreMouseEvents(stage, false);
            stage.hide();
        }
    }

    // ── 导入 ──

    /**
     * 导入动图并显示；失败返回 false。
     *
     * <p>图片（GIF/PNG/JPG）当场解完；视频（WebM / MP4…）要借 VLC 逐帧抓，
     * 一个几秒的片子就要一两秒，所以<b>放后台线程解</b>，解完自动换上 ——
     * 否则界面会在这段时间里卡住不动。返回 true 只表示「受理了」，
     * 真正的成败由后台线程写进任务中心。</p>
     */
    public boolean load(File file) {
        if (file == null || !file.isFile()) {
            return false;
        }
        if (VideoFrames.isVideo(file)) {
            loadVideoAsync(file);
            return true;
        }
        AnimatedGif loaded = AnimatedGif.load(file);
        if (loaded == null) {
            return false;
        }
        applyLoaded(loaded, file);
        return true;
    }

    /** 把解好的动图装上去（状态重置 + 落盘 + 重新布局）。 */
    private void applyLoaded(AnimatedGif loaded, File file) {
        gif = loaded;
        gifPath = file.getAbsolutePath();
        lastFrame = -1;
        phaseMs = -1;
        lastNanos = 0;
        // 卡点方案与位置采样都必须作废：否则换图后会继续用上一张图的循环长度
        lastPlanAt = -1;
        planSong = null;
        planBpm = -1;
        plan = new AnimatedGif.BeatPlan(0, 0, 1);
        sampleSong = null;
        samplePosMs = -1;
        // 立刻换成新图第 0 帧：applyWidth() 里的 sizeToScene() 要按新图比例算窗口大小
        view.setImage(loaded.frame(0));
        Map<String, Object> cfg = main.lib().config();
        cfg.put("gif_path", gifPath);
        // 新图尺寸可能完全不同，按宽度重新布局
        applyWidth();
        refreshTimer();
        // 设置页那一行「N 帧 · 一圈 X 秒」也跟着刷新（异步解码完才有值）
        if (main != null && main.functionPanels != null) {
            main.functionPanels.syncGif();
        }
    }

    /**
     * 后台解码视频动图。
     *
     * <p>用任务中心显示进度（「任务」面板里能看到），解完在 JavaFX 线程上换图。
     * 解码期间又导入了别的动图时，这一次的结果会被丢掉（用 token 判断）。</p>
     */
    private void loadVideoAsync(File file) {
        final long token = ++videoLoadToken;
        JobCenter.Job job = main == null || main.jobCenter() == null
                ? null
                : main.jobCenter().start("解码视频动图：" + file.getName());
        if (job != null) {
            job.detail.set("用 VLC 抓帧中…（几秒的片子约 1~2 秒）");
        }
        Thread worker = new Thread(() -> {
            AnimatedGif loaded = AnimatedGif.load(file);
            javafx.application.Platform.runLater(() -> {
                if (token != videoLoadToken) {
                    if (job != null) {
                        job.state.set(JobCenter.State.CANCELLED);
                        job.detail.set("已被新的导入取代");
                    }
                    return;
                }
                if (loaded == null) {
                    if (job != null) {
                        job.state.set(JobCenter.State.FAILED);
                        job.detail.set("读不了这个视频（VLC 解不开，或文件损坏）");
                    }
                    return;
                }
                applyLoaded(loaded, file);
                if (job != null) {
                    job.state.set(JobCenter.State.DONE);
                    job.detail.set(loaded.frameCount() + " 帧 · " + loaded.width() + "×" + loaded.height()
                            + " · " + Math.round(loaded.naturalMs()) + " ms");
                }
            });
        }, "gif-video-decode");
        worker.setDaemon(true);
        worker.setPriority(Thread.MIN_PRIORITY + 1);
        worker.start();
    }

    /** 移除当前动图（并隐藏窗口）。 */
    public void clear() {
        hide();
        gif = null;
        gifPath = "";
        view.setImage(null);
        lastPlanAt = -1;
        planSong = null;
        planBpm = -1;
        plan = new AnimatedGif.BeatPlan(0, 0, 1);
        sampleSong = null;
        samplePosMs = -1;
        main.lib().config().put("gif_path", "");
        main.lib().saveConfig();
    }

    // ── 卡点信息 ──

    /** 当前歌曲的 BPM（没有则 0）。 */
    public double currentBpm() {
        String path = main.currentSongPath();
        return path == null ? 0 : main.bpmStore().bpmOf(path);
    }

    /** 设置页显示的一行说明。 */
    public String infoLine() {
        if (gif == null) {
            return "未导入动图";
        }
        String head = String.format("%s · %d 帧 · 一圈 %.2f 秒", gifName(), gif.frameCount(),
                gif.naturalMs() / 1000.0);
        String anim = stretchOn
                ? String.format(" · 伸缩 Ay ±%.0f%%（伸长收窄 Ax ±%.0f%%）/ T = %.2f 秒",
                        ampY * 100, ampX * 100, stretchPeriod)
                : " · 正弦伸缩已关";
        double bpmNow = currentBpm();
        if (stretchOn && beatLock) {
            if (bpmNow <= 0) {
                anim += " · 卡点：当前歌曲没有 BPM → 按 T 自由跑";
            } else {
                String song = main.currentSongPath();
                double beatNow = song == null ? 0 : main.bpmStore().beatMsOf(song);
                double offNow = song == null ? -1 : main.bpmStore().offsetOf(song);
                double bpmUse = beatNow > 0 ? 60000.0 / beatNow : bpmNow;
                AnimatedGif.BeatPlan bp = AnimatedGif.plan(stretchPeriod * 1000, bpmUse, integerBeats);
                anim += String.format(" · 卡点：每 %s 拍一轮 = %.3f 秒（速度 ×%.2f，拍点=%s%s）",
                        integerBeats ? String.valueOf((int) bp.beats()) : String.valueOf(bp.beats()),
                        bp.loopMs() / 1000.0, bp.speed(), beatOnPeak ? "伸长" : "压缩",
                        beatTrim == 0 ? "" : String.format("，微调 %+.0f ms", beatTrim));
                anim += offNow >= 0
                        ? String.format(" · 第一拍 +%.0f ms（拍长 %.2f ms）", offNow, beatNow)
                        : " · 第一拍未知（按 0:00.000 起算，后台正在测）";
            }
        }
        if (!gif.animated()) {
            return head + anim;
        }
        double bpm = currentBpm();
        if (bpm <= 0) {
            return head + anim + " · 当前歌曲没有 BPM → 循环按原速";
        }
        AnimatedGif.BeatPlan p = AnimatedGif.plan(gif.naturalMs(), bpm, integerBeats);
        return String.format("%s%n当前歌曲 %.1f BPM → %s %.1f 拍 = %.3f 秒（速度 ×%.2f）%s",
                head, bpm, integerBeats ? "整拍" : "半拍",
                p.beats(), p.loopMs() / 1000.0, p.speed(), anim);
    }

    // ── 尺寸 / 位置 ──

    public void setWidth(double w) {
        width = clampWidth(w);
        main.lib().config().put("gif_width", width);
        main.lib().saveConfig();
        applyWidth();
    }

    public void changeWidth(double delta) {
        setWidth(width + delta);
    }

    /**
     * <b>以指针为焦点缩放</b>：缩放前后，指针底下那一个图像点待在原地（和地图缩放一个意思）。
     *
     * <p>原来滚轮只是改宽度，窗口从左上角往外长，指针很快就不在图上，看着就是"放大着放大着没影了"。
     * 这里先把指针位置换算成「图像内容里的相对坐标」，改完宽度后再把窗口挪到让同一个相对坐标
     * 回到指针底下。缩放过程中<b>不做</b> {@code keepFullyOnScreen} —— 否则指针靠屏幕边时
     * 窗口会被拉回来，焦点照样被顶飞。</p>
     *
     * @param screenX 焦点屏幕坐标（滚轮就是指针位置）
     * @param screenY 同上
     * @param factor  缩放比例（+0.1 = 放大 10%，−0.1 = 缩小 10%）
     */
    public void zoomAt(double screenX, double screenY, double factor) {
        if (stage == null || !isShowing() || gif == null || factor == 0) {
            return;
        }
        double w0 = width;
        double fx = fractionX(screenX - stage.getX(), w0);
        double fy = fractionY(screenY - stage.getY(), w0);
        setWidth(w0 * (1 + factor));           // 内部按屏幕可用上限封顶
        if (Math.abs(width - w0) < 0.01) {
            return;                            // 已到上限/下限：什么都不动，免得窗口乱跑
        }
        stage.setX(screenX - contentX(fx, width));
        stage.setY(screenY - contentY(fy, width));
        savePosition(stage.getX(), stage.getY());
    }

    // ── 指针焦点缩放的几何换算（全部在窗口坐标里算）──

    private double contentFracX() {
        return gif == null ? 1 : Math.max(1e-6, gif.contentRight() - gif.contentLeft());
    }

    private double contentFracY() {
        return gif == null ? 1 : Math.max(1e-6, gif.contentBottom() - gif.contentTop());
    }

    /** 内容相对坐标 fx（0 = 内容左沿，1 = 内容右沿）在窗口里的像素 x。fx 允许超出 0~1。 */
    private double contentX(double fx, double w) {
        double cl = gif == null ? 0 : gif.contentLeft();
        return windowWidth(w) / 2 + stretchScale.getX() * w * (cl + fx * contentFracX() - 0.5);
    }

    /** 内容相对坐标 fy（0 = 内容上沿，1 = 内容下沿）在窗口里的像素 y。 */
    private double contentY(double fy, double w) {
        double ct = gif == null ? 0 : gif.contentTop();
        double cb = gif == null ? 1 : gif.contentBottom();
        double h = w * aspect();
        double winH = layoutHeight(w);
        // 内容下沿恒在 winH - h·(1-cb)；再按 sy 从下沿往上量
        return winH - h * (1 - cb)
                + stretchScale.getY() * h * (ct + fy * contentFracY() - cb);
    }

    /** 窗口坐标 wx 对应的内容相对 x（反向换算，供 zoomAt 取焦点）。 */
    private double fractionX(double wx, double w) {
        double cl = gif == null ? 0 : gif.contentLeft();
        double span = stretchScale.getX() * w * contentFracX();
        if (span == 0) {
            return 0.5;
        }
        return (wx - contentX(0, w)) / span;
    }

    /** 窗口坐标 wy 对应的内容相对 y。 */
    private double fractionY(double wy, double w) {
        double span = stretchScale.getY() * w * aspect() * contentFracY();
        if (span == 0) {
            return 0.5;
        }
        return (wy - contentY(0, w)) / span;
    }

    private void applyWidth() {
        // 窗口按设置锁死尺寸：伸缩靠 scaleX/scaleY 改图的胖瘦高矮，如果让窗口跟着
        // ImageView 的布局尺寸走（sizeToScene），涨出去的部分会被窗口裁掉。
        // 所以窗口高度留出 +Ay 的余量、宽度留出 +Ax 的余量；图片本身仍然只画 width 宽，
        // 在窗口里「横向居中、纵向底端对齐」。
        double cap = maxUsableWidth();
        if (width > cap) {
            width = Math.max(MIN_W, cap);
            main.lib().config().put("gif_width", width);
            main.lib().saveConfig();
        }
        double w = windowWidth();
        double h = layoutHeight();
        root.setMinSize(w, h);
        root.setPrefSize(w, h);
        root.setMaxSize(w, h);
        view.setFitWidth(width);
        updateStretchPivot();
        if (stage != null && stage.isShowing()) {
            stage.sizeToScene();
            keepFullyOnScreen();
        }
    }

    /**
     * 窗口宽度：压到最矮时图会被横向放大到 {@code 图宽×(1+Ax)}，窗口至少要这么宽
     * （再补 2 pt 防最左/最右那一列被切）。横向缩放以图心为轴对称，所以左右各让出一半即可。
     *
     * <p>Ax = 0 时等于原来的宽度，窗口尺寸一点都不变。</p>
     */
    private double windowWidth() {
        return windowWidth(width);
    }

    /** 指定图宽 w 时的窗口宽度（指针焦点缩放要对新旧两个宽度各算一次）。 */
    private double windowWidth(double w) {
        double extra = ampX * w;
        return w + extra + (extra > 0 ? 2 : 0);
    }

    /** 悬浮窗当前（未显示时按宽高比预估）的高度：非正方形动图不能拿宽度当高度。 */
    private double windowHeight() {
        return isShowing() ? stage.getHeight() : layoutHeight();
    }

    /** 按设置算出的窗口高度：开伸缩时纵向留出 +幅度的余量（宽度不受纵向伸缩影响）。 */
    private double layoutHeight() {
        return layoutHeight(width);
    }

    /** 指定图宽 w 时的窗口高度。 */
    private double layoutHeight(double w) {
        return w * aspect() * (stretchOn ? 1 + ampY : 1);
    }

    /** 图片的高宽比（高/宽）。 */
    private double aspect() {
        return (gif != null && gif.width() > 0) ? (double) gif.height() / gif.width() : 1;
    }

    /** 重置到主屏右下角。 */
    public void resetPosition() {
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double w = isShowing() ? stage.getWidth() : windowWidth();
        double h = windowHeight();
        double x = vb.getMaxX() - w - 40;
        double y = vb.getMaxY() - h - 40;
        if (stage != null) {
            stage.setX(x);
            stage.setY(y);
        }
        savePosition(x, y);
        keepOnScreen();
    }

    /** 存下来的位置至少在屏幕上能看到一块（否则当没存过，直接重置位置）。 */
    private boolean positionVisible() {
        try {
            Rectangle2D vb = Screen.getPrimary().getVisualBounds();
            double x = currentX();
            double y = currentY();
            double w = windowWidth();
            double h = windowHeight();
            double overlapX = Math.min(x + w, vb.getMaxX()) - Math.max(x, vb.getMinX());
            double overlapY = Math.min(y + h, vb.getMaxY()) - Math.max(y, vb.getMinY());
            return overlapX > 40 && overlapY > 40;
        } catch (Throwable t) {
            return false;
        }
    }

    private double currentX() {
        double saved = Config.getDouble(main.lib().config(), "gif_x", -1);
        if (saved >= 0) {
            return saved;
        }
        return Screen.getPrimary().getVisualBounds().getMaxX() - windowWidth() - 40;
    }

    private double currentY() {
        double saved = Config.getDouble(main.lib().config(), "gif_y", -1);
        if (saved >= 0) {
            return saved;
        }
        return Screen.getPrimary().getVisualBounds().getMaxY() - windowHeight() - 40;
    }

    private void savePosition(double x, double y) {
        main.lib().config().put("gif_x", x);
        main.lib().config().put("gif_y", y);
        main.lib().saveConfig();
    }

    /** 整窗on-screen：设置改变（尤其 Ax 变大）后把窗口整个收回屏内。 */
    private void keepFullyOnScreen() {
        if (!isShowing()) {
            return;
        }
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        // 放得下就整个收进来；万一窗口比屏幕还大，至少要保证「顶部一条 + 左侧一段」可见，
        // 否则位置会被写到屏幕外，用户再也抓不到这个窗口。
        double x = Math.max(vb.getMinX() - stage.getWidth() + 40,
                Math.min(stage.getX(), vb.getMaxX() - 40));
        double y = Math.max(vb.getMinY(), Math.min(stage.getY(), vb.getMaxY() - 60));
        if (x != stage.getX() || y != stage.getY()) {
            stage.setX(x);
            stage.setY(y);
            savePosition(x, y);
        }
    }

    /** 保证窗口至少有一部分留在屏幕内（拖拽松手时用，允许故意停到屏幕边上）。 */
    private void keepOnScreen() {
        if (!isShowing()) {
            return;
        }
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double margin = 40;
        double x = Math.max(vb.getMinX() - stage.getWidth() + margin,
                Math.min(stage.getX(), vb.getMaxX() - margin));
        double y = Math.max(vb.getMinY(), Math.min(stage.getY(), vb.getMaxY() - margin));
        if (x != stage.getX() || y != stage.getY()) {
            stage.setX(x);
            stage.setY(y);
        }
    }

    // ── 鼠标穿透 ──

    public void setLocked(boolean value) {
        locked = value;
        if (locked) {
            mouseOver = false;   // 锁上就收不到鼠标进出事件了，别留着过期的"悬停中"
        }
        main.lib().config().put("gif_locked", locked);
        main.lib().saveConfig();
        applyLock(true);
    }

    /**
     * 应用伸缩：<b>只改纵向高度，横向完全不动</b>。
     *
     * <p>两个方向都由 {@link StretchWave#wave} 那一条正弦决定，除此之外没有任何处理：
     * 纵向 ×(1+Ay·s)、横向 ×(1−Ax·s)，s 是同一个相位值。</p>
     *
     * <p>纵向缩放锚点钉在<b>有内容的最底端</b>（透明留白不算底），所以不论图里有多少
     * 透明边距，最底下那排可见像素都待在原地，只有上方在涨落；横向以图心为轴，左右对称。</p>
     *
     * @param wave 相位波形值（+1 = 拉到最高并收窄，−1 = 压到最矮并加宽，0 = 原尺寸）
     */
    private void applyStretch(double wave) {
        if (!stretchOn) {
            return;
        }
        // wave ∈ [−1, 1]：+1 = 拉到最高 → 纵向 ×(1+Ay)、横向 ×(1−Ax)（伸长收窄）
        //                    −1 = 压到最矮 → 纵向 ×(1−Ay)、横向 ×(1+Ax)（压缩加宽）
        stretchScale.setX(1 - ampX * wave);
        stretchScale.setY(1 + ampY * wave);
    }

    /** 图按设置宽度显示时的高度（不含窗口预留的拉伸余量）。 */
    private double displayHeight() {
        return width * aspect();
    }

    /** 把缩放锚点更新到「内容最底端」对应的显示坐标。 */
    private void updateStretchPivot() {
        double bottom = gif == null ? 1 : gif.contentBottom();
        // 横向以图心为轴左右对称收放；纵向以「有内容的最底端」为轴，底端钉住不动
        stretchScale.setPivotX(width / 2);
        stretchScale.setPivotY(bottom * displayHeight());
    }

    private static double clampPeriod(double v) {
        if (Double.isNaN(v)) {
            return PERIOD_DEFAULT;
        }
        return Math.max(PERIOD_MIN, Math.min(PERIOD_MAX, v));
    }

    private static double clampTrim(double v) {
        if (Double.isNaN(v)) {
            return 0;
        }
        return Math.max(-TRIM_MAX_MS, Math.min(TRIM_MAX_MS, v));
    }

    private static double clampAmpX(double v) {
        if (Double.isNaN(v)) {
            return AMP_X_DEFAULT;
        }
        return Math.max(AMP_X_MIN, Math.min(AMP_X_MAX, v));
    }

    private static double clampAmpY(double v) {
        if (Double.isNaN(v)) {
            return AMP_Y_DEFAULT;
        }
        return Math.max(AMP_Y_MIN, Math.min(AMP_Y_MAX, v));
    }

    private void applyLock(boolean deferNative) {
        root.setMouseTransparent(locked);
        if (stage == null) {
            return;
        }
        if (deferNative) {
            Platform.runLater(() -> MacWindowClickThrough.setIgnoreMouseEvents(stage, locked));
        } else {
            MacWindowClickThrough.setIgnoreMouseEvents(stage, locked);
        }
    }

    // ── 窗口构建 ──

    private void ensureStage() {
        if (stage != null) {
            return;
        }
        view.setPreserveRatio(true);
        // 纵向以「内容最底端」为锚点、横向以图心为锚点，两个方向都由正弦驱动（伸长收窄/压缩加宽）
        view.getTransforms().setAll(stretchScale);
        // 图在窗口里底边对齐：拉伸余量全部留在上方
        root.setAlignment(javafx.geometry.Pos.BOTTOM_CENTER);
        view.setSmooth(true);
        view.setFitWidth(width);
        if (gif != null) {
            view.setImage(gif.frame(0));
        }
        root.setStyle("-fx-background-color: transparent;");
        root.getChildren().setAll(view);

        stage = new Stage();
        stage.initStyle(StageStyle.TRANSPARENT);
        stage.setTitle(WINDOW_TITLE);
        stage.setAlwaysOnTop(true);
        stage.setResizable(false);
        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        stage.setScene(scene);
        stage.sizeToScene();

        root.setOnMousePressed(e -> {
            if (locked) {
                return;
            }
            wipeFog();
            dragDx = e.getScreenX() - stage.getX();
            dragDy = e.getScreenY() - stage.getY();
            pressStageX = stage.getX();
            pressStageY = stage.getY();
            dragging = true;
            shake.start(e.getScreenX(), e.getScreenY());
        });
        root.setOnMouseDragged(e -> {
            if (locked || !dragging) {
                return;
            }
            stage.setX(e.getScreenX() - dragDx);
            stage.setY(e.getScreenY() - dragDy);
            if (gesturesOn
                    && shake.sample(e.getScreenX(), e.getScreenY(), System.currentTimeMillis())) {
                // 晃出"上一首"了：先回到按下时的位置（晃动不该顺手把悬浮窗挪走），再切歌
                stage.setX(pressStageX);
                stage.setY(pressStageY);
                main.prevSong();
            }
        });
        root.setOnMouseReleased(e -> {
            if (!dragging) {
                return;
            }
            dragging = false;
            savePosition(stage.getX(), stage.getY());
            keepOnScreen();
        });

        // 滚轮缩放
        root.setOnScroll(e -> {
            if (e.getDeltaY() == 0) {
                return;
            }
            zoomAt(e.getScreenX(), e.getScreenY(), e.getDeltaY() > 0 ? 0.1 : -0.1);
        });

        // 双击 = 下一首（单击/拖动不受影响）
        root.setOnMouseClicked(e -> {
            if (locked || !gesturesOn || e.getButton() != MouseButton.PRIMARY) {
                return;
            }
            if (e.getClickCount() == 2) {
                main.nextSong();
                e.consume();
            }
        });

        // 鼠标停在图上 = 方向键归它用（主窗口那侧也会把按键转过来，见 MainWindow）
        root.setOnMouseEntered(e -> mouseOver = true);
        root.setOnMouseExited(e -> mouseOver = false);

        // 动图自己拿到键盘焦点时（刚点过它）：直接在自己的场景上处理遥控键
        scene.setOnKeyPressed(e -> {
            if (handleGestureKey(e.getCode())) {
                e.consume();
            }
        });

        root.setOnContextMenuRequested(e -> {
            menuX = e.getScreenX();
            menuY = e.getScreenY();
            buildMenu().show(root, menuX, menuY);
        });

        // 兜底：任何路径把窗口藏了（不只 hide()），都要停掉 60fps 计时器。
        // 注意这里**不能**顺手写 gif_on=false —— 退出程序时 JavaFX 也会触发 onHidden，
        // 那样每次重启动图都会自己关掉（开关状态的持久化只放在 hide() 里）。
        stage.setOnHidden(e -> stopTimer());

        // 起雾时：小动图走到哪，哪儿的雾就被擦开（拖拽、滚轮缩放、重置位置都会经过这里）
        stage.xProperty().addListener((o, a, b) -> wipeFog());
        stage.yProperty().addListener((o, a, b) -> wipeFog());
    }

    /**
     * 右键菜单：<b>播放控制 + 悬浮窗自身设置</b>。
     *
     * <p>播放这一块就是"双击 / 晃动之外剩下的那些"：播放暂停、上一首、下一首、停止、
     * 音量、播放模式、桌面歌词、沉浸模式。每次右键都重新建一份，所以菜单里的
     * 「⏸ 暂停 / ▶ 播放」和各个勾选状态永远跟着当前状态走。</p>
     */
    private ContextMenu buildMenu() {
        ContextMenu menu = new ContextMenu();

        // ── 播放控制 ──
        boolean playing = isPlaying();
        boolean hasSong = main.currentSongPath() != null || !main.playlist.isEmpty();
        MenuItem playPause = new MenuItem(playing ? "⏸ 暂停" : "▶ 播放");
        playPause.setDisable(!hasSong);
        playPause.setOnAction(a -> main.pauseOrResume());
        MenuItem prev = new MenuItem("⏮ 上一首");
        prev.setDisable(!hasSong);
        prev.setOnAction(a -> main.prevSong());
        MenuItem next = new MenuItem("⏭ 下一首");
        next.setDisable(!hasSong);
        next.setOnAction(a -> main.nextSong());
        MenuItem stop = new MenuItem("⏹ 停止");
        stop.setDisable(main.stopped);
        stop.setOnAction(a -> main.stop());
        menu.getItems().addAll(playPause, prev, next, stop);

        // 音量：菜单标题上带当前值，两档加减 + 静音/恢复
        Menu volume = new Menu("🔊 音量 " + main.currentVolume + "%");
        MenuItem louder = new MenuItem("➕ 大声 10%");
        louder.setOnAction(a -> main.setVolume(Math.min(100, main.currentVolume + 10)));
        MenuItem quieter = new MenuItem("➖ 小声 10%");
        quieter.setOnAction(a -> main.setVolume(Math.max(0, main.currentVolume - 10)));
        MenuItem mute = new MenuItem(main.currentVolume == 0 ? "🔈 恢复音量" : "🔇 静音");
        mute.setOnAction(a -> main.setVolume(main.currentVolume == 0 ? 70 : 0));
        volume.getItems().addAll(louder, quieter, new SeparatorMenuItem(), mute);

        // 播放模式（单选，跟着当前模式打勾）
        Menu mode = new Menu("🔁 播放模式");
        ToggleGroup group = new ToggleGroup();
        String[][] modes = {{"list_loop", "循环播放"}, {"list_sequential", "列表播放"},
                {"single_loop", "单曲循环"}, {"random", "随机播放"}};
        for (String[] m : modes) {
            RadioMenuItem item = new RadioMenuItem(m[1]);
            item.setToggleGroup(group);
            item.setSelected(m[0].equals(main.playMode));
            item.setOnAction(a -> {
                main.setPlayMode(m[0]);
                main.playbackPanel.updateModeDisplay();
            });
            mode.getItems().add(item);
        }

        CheckMenuItem desktopLyrics = new CheckMenuItem("💬 桌面歌词");
        desktopLyrics.setSelected(main.desktopLyricsShowing());
        desktopLyrics.setOnAction(a -> main.setDesktopLyrics(desktopLyrics.isSelected()));
        MenuItem immersive = new MenuItem(main.immersive ? "🎬 退出沉浸模式" : "🎬 沉浸模式");
        immersive.setOnAction(a -> main.toggleImmersive());

        menu.getItems().addAll(new SeparatorMenuItem(), volume, mode, desktopLyrics, immersive);

        // ── 悬浮窗自身 ──
        MenuItem lockItem = new MenuItem(locked ? "🔓 解锁（可拖动）" : "🔒 锁定（鼠标穿透）");
        lockItem.setOnAction(a -> setLocked(!locked));
        MenuItem bigger = new MenuItem("🔍 放大");
        bigger.setOnAction(a -> zoomAt(menuX, menuY, 0.15));
        MenuItem smaller = new MenuItem("🔎 缩小");
        smaller.setOnAction(a -> zoomAt(menuX, menuY, -0.15));
        MenuItem reset = new MenuItem("↩ 重置位置（右下角）");
        reset.setOnAction(a -> resetPosition());
        MenuItem close = new MenuItem("✖ 关闭动图");
        close.setOnAction(a -> {
            hide();
            main.syncGifUi();
        });
        menu.getItems().addAll(new SeparatorMenuItem(), lockItem,
                bigger, smaller, reset, new SeparatorMenuItem(), close);

        // 手势提示（不可点，只为让人知道还有这两个手势）
        MenuItem tips = new MenuItem(gesturesOn
                ? "手势：双击 = 下一首　·　按住左右晃动 = 上一首　·　空格 = 播放/暂停　·　方向键 = 音量/缩放/切歌"
                : "特殊手势已关闭（设置 → 动图卡点 里可开）");
        tips.setDisable(true);
        menu.getItems().addAll(new SeparatorMenuItem(), tips);
        return menu;
    }

    // ── 播放 ──

    /** 省电模式下两次真的重画之间至少隔多久（毫秒）；0 = 不限流（跟着屏幕刷新率画）。 */
    private double minDrawIntervalMs() {
        return lowFps ? 1000.0 / 30.0 : 0;
    }

    /**
     * 这一帧该不该真的画。
     *
     * <p>阈值取 {@code minInterval * 0.75}：60Hz 脉搏（16.7 ms）会被挡掉，
     * 30Hz 脉搏（33.3 ms）以及卡顿过的长间隔都能通过 —— 这样即使脉冲被限到别的
     * 频率上也不会一帧都画不出来。</p>
     *
     * <p>包内可见 + 静态：方便用探针直接验算，不用起整个界面。</p>
     */
    static boolean shouldDraw(double nowMs, double lastDrawMs, double minIntervalMs) {
        return minIntervalMs <= 0 || lastDrawMs <= 0
                || nowMs - lastDrawMs >= minIntervalMs * 0.75;
    }

    /** 省电开关（立即生效，不用重启）：改完下一次 tick 就用新节奏。 */
    public void setLowFps(boolean value) {
        lowFps = value;
        main.lib().config().put("anim_low_fps", value);
        main.lib().saveConfig();
        lastDrawMs = 0;
    }

    /** 当前是不是省电的 30fps 模式。 */
    public boolean lowFps() {
        return lowFps;
    }

    /**
     * 这一帧到底有没有东西需要动。
     *
     * <p>省电的关键就在这个判断上：不满足条件时把 {@link AnimationTimer} 整个停掉，
     * JavaFX 的脉冲定时器在没有接收者时也会跟着歇着，而不是每秒白醒 60 次。</p>
     *
     * <ul>
     *   <li>正在播放 且（动图会动 或 开着正弦伸缩）→ 要跑（伸缩得按屏幕刷新率才顺）；</li>
     *   <li>没在放歌（停止 / 没有当前曲目）时动图继续原速空转 → 要跑（否则看着像卡死）；</li>
     *   <li>暂停、或静态图且不伸缩 → 一帧都不用跑（姿态冻在原地，不重置也不归位）。</li>
     * </ul>
     */
    private boolean needsFrames() {
        if (gif == null) {
            return false;
        }
        if (isPlaying()) {
            return gif.animated() || stretchOn;
        }
        return gif.animated() && (main.stopped || main.currentSongPath() == null);
    }

    /** 是否处于「真的在放」状态（与 tick 里的 playing 判定同义）。 */
    private boolean isPlaying() {
        return !main.stopped && !main.paused && main.currentSongPath() != null;
    }

    /**
     * 按当前状态决定动画计时器要不要跑：播放状态、当前曲目、图片、伸缩开关
     * 任何一处变化之后都要调一次（幂等，重复调没有副作用）。
     */
    public void refreshTimer() {
        if (stage != null && stage.isShowing() && needsFrames()) {
            startTimer();
        } else {
            stopTimer();
        }
    }

    private void startTimer() {
        if (timer != null) {
            return;
        }
        lastNanos = 0;
        timer = new AnimationTimer() {
            @Override
            public void handle(long now) {
                tick(now);
            }
        };
        timer.start();
    }

    private void stopTimer() {
        if (timer != null) {
            timer.stop();
            timer = null;
        }
    }

    private void tick(long nowNanos) {
        if (gif == null || gif.naturalMs() <= 0) {
            return;
        }
        if (!needsFrames()) {
            // 兜底：播放状态变了却没走到 refreshTimer（比如列表放完自动停），
            // 这里自己把表停掉，下一帧就不会再被叫醒。
            stopTimer();
            return;
        }
        if (lastNanos == 0) {
            lastNanos = nowNanos;
            return;
        }
        double drawNowMs = nowNanos / 1e6;
        if (!shouldDraw(drawNowMs, lastDrawMs, minDrawIntervalMs())) {
            // 省电模式：这一帧不画。lastNanos 故意不更新，
            // 下一次的 dt 会把这段跳掉的时间一起算进去，相位依然按真实时间走。
            return;
        }
        lastDrawMs = drawNowMs;
        double dt = (nowNanos - lastNanos) / 1e6;
        lastNanos = nowNanos;
        if (dt <= 0 || dt > 500) {
            // 首帧 / 系统休眠回来后：按一帧 60fps 处理，别让相位跳一大段
            dt = 1000.0 / 60.0;
        }
        double nowMs = nowNanos / 1e6;
        if (lastPlanAt < 0 || nowMs - lastPlanAt > 250) {
            lastPlanAt = nowMs;
            updatePlan();
        }

        double loop = plan.loopMs() > 0 ? plan.loopMs() : gif.naturalMs();
        String path = planSong;
        boolean playing = !main.stopped && !main.paused && path != null;

        if (playing) {
            double target = mod(playPositionMs(nowMs, path), loop);
            double diff = wrapHalf(target - phaseMs, loop);
            // 首次对齐 / 换曲 / 拖动进度条 / 从暂停恢复：直接锚定，别慢吞吞收敛几秒
            boolean reanchor = phaseMs < 0 || !lastPlaying
                    || !Objects.equals(path, lastTickSong) || Math.abs(diff) > SNAP_MS;
            if (reanchor) {
                phaseMs = target;
            } else {
                phaseMs = mod(phaseMs + dt + diff * SLEW_PER_FRAME, loop);
            }
        } else if (main.stopped || path == null) {
            // 没在放歌：原速空转，看着不至于像卡死
            phaseMs = mod((phaseMs < 0 ? 0 : phaseMs) + dt, loop);
        }
        // 暂停：停住当前帧（与桌面歌词一致）
        lastPlaying = playing;
        lastTickSong = path;

        if (gif.animated()) {
            int idx = gif.frameIndexAt(phaseMs, loop);
            if (idx != lastFrame || view.getImage() == null) {
                lastFrame = idx;
                view.setImage(gif.frame(idx));
            }
        } else if (view.getImage() == null) {
            view.setImage(gif.frame(0));
        }

        // 伸缩：同一个相位同时定两个方向 —— 伸长时收窄、压缩时加宽。
        // 有 BPM 且开着卡点时，周期锁成"最接近 T 的整数拍"，相位锁到拍点；
        // 锁的方式是"每帧把相位往目标挪 2%"（一阶低通），所以永远不会有跳变，
        // 只是节奏会极轻微地呼吸一下把误差追回来。
        // 只有「正在播放」才推进相位：暂停 / 停止时把姿态冻在原地（不重置、不归位，
        // 所以也不会"蹦"一下），这样暂停时 Q 弹就停住了。
        if (stretchOn && playing) {
            double periodMs = stretchPeriod * 1000.0;
            double bpm = bpmEff();
            boolean locked = beatLock && bpm > 0 && playing && path != null;
            if (locked) {
                AnimatedGif.BeatPlan bp = AnimatedGif.plan(periodMs, bpm, integerBeats);
                periodMs = bp.loopMs();
                locked = periodMs > 0;
            }
            // 周期变了（换歌 / 开关卡点 / 改 T）：把相位重基到新周期上，值保持连续
            if (locked && lastPeriodMs > 0 && Math.abs(periodMs - lastPeriodMs) > 1e-6) {
                stretchMs = (mod(stretchMs, lastPeriodMs) / lastPeriodMs) * periodMs;
            }
            if (locked) {
                lastPeriodMs = periodMs;
                // 拍点相位：wave = −sin(2πφ)，φ=0.75 是伸长峰、0.25 是压缩谷；
                // beatTrim > 0 → target 往后 → 动画在真实时间轴上提前。
                // 网格相位：真实拍点在 offset + k·拍长 上，不是 0 + k·拍长 —— 少了这一项，
                // 动画就只能"速度对"，永远踩不到拍上（前奏长度是任意的）。
                double grid = beatOffsetMs > 0 ? beatOffsetMs : 0;
                double offset = (beatOnPeak ? 0.75 : 0.25) * periodMs + beatTrim;
                double target = mod(playPositionMs(nowMs, path) - grid + offset, periodMs);
                double diff = wrapHalf(target - stretchMs, periodMs);
                stretchMs = mod(stretchMs + dt + diff * SLEW_PER_FRAME, periodMs);
            } else {
                lastPeriodMs = -1;
                stretchMs += dt;
            }
            applyStretch(StretchWave.wave(stretchMs, periodMs / 1000.0));
        }
    }

    /** 当前歌曲的卡点方案（缓存在 planSong / planBpm / 网格变化时才重算）。 */
    private void updatePlan() {
        String path = main.currentSongPath();
        double bpm = path == null ? 0 : main.bpmStore().bpmOf(path);
        double beat = path == null ? 0 : main.bpmStore().beatMsOf(path);
        double off = path == null ? -1 : main.bpmStore().offsetOf(path);
        if (Objects.equals(path, planSong) && Math.abs(bpm - planBpm) < 0.001
                && Math.abs(beat - planBeatMs) < 0.01 && Math.abs(off - beatOffsetMs) < 0.01) {
            return;
        }
        planSong = path;
        planBpm = bpm;
        planBeatMs = beat;
        beatOffsetMs = off;
        plan = AnimatedGif.plan(gif.naturalMs(), bpmEff(), integerBeats);
        if (bpm > 0 && off < 0) {
            requestGrid(path, bpm);
        }
    }

    /**
     * 卡点用的速度：优先按<b>拟合出的精确拍长</b>换算，而不是 bpm 字段。
     * bpm 只有一个有效小数（±0.05 BPM），几百拍之后就是几十上百毫秒的偏差。
     */
    private double bpmEff() {
        return planBeatMs > 0 ? 60000.0 / planBeatMs : planBpm;
    }

    /**
     * 手动重测当前歌曲的拍点网格（设置页的「🎯 重测当前歌的拍点」按钮）。
     *
     * <p>自动测出来的相位万一不对（节奏模糊、反拍太响），重测一次会重新拟合并覆盖 bpm.json；
     * 还是不对就用「拍点微调」按听感挪，能挪 ±400 ms（慢歌差不多是半拍）。</p>
     *
     * @return false = 当前没有歌曲 / 这首歌没有 BPM，测不了
     */
    public boolean remeasureGrid() {
        String path = main.currentSongPath();
        double bpm = path == null ? 0 : main.bpmStore().bpmOf(path);
        if (path == null || bpm <= 0) {
            return false;
        }
        synchronized (gridAsked) {
            gridAsked.remove(path);         // 允许再测一次
            if (gridPending != null) {
                return true;                // 已经有一个在跑，等它
            }
        }
        requestGrid(path, bpm);
        return true;
    }

    /**
     * 后台补「拍点网格」（第一拍位置 + 精确拍长）。
     *
     * <p>只在缓存里没有网格时做一次：解析一首歌约 0.5~1 秒（VLC 全速解码一段），
     * 跑在最低优先级的守护线程上，测完写回 bpm.json 并让下一帧重读。
     * 同一时刻只跑一首，本会话失败过的不再重试 —— 不然每次换曲都要白起一个 VLC 进程。</p>
     */
    private void requestGrid(String path, double bpm) {
        if (path == null || bpm <= 0 || BpmAnalyzer.busy()) {
            return;                         // 批量扫描在跑：等它结束（下一帧还会问）
        }
        synchronized (gridAsked) {
            if (gridPending != null || !gridAsked.add(path)) {
                return;
            }
            gridPending = path;
        }
        Thread t = new Thread(() -> {
            BpmAnalyzer.Grid g = BpmAnalyzer.measureGrid(path, bpm);
            if (g.ok()) {
                main.bpmStore().updateGrid(path, g.beatMs(), g.offsetMs(), g.confidence());
                main.bpmStore().save();
            }
            Platform.runLater(() -> {
                gridPending = null;
                if (g.ok()) {
                    lastPlanAt = -1;        // 下一帧重读网格；相位由一阶低通平滑收敛，不会跳
                    planSong = null;
                    main.syncGifUi();       // 设置页那行说明里的「第一拍 +xxx ms」也要跟着更新
                }
            });
        }, "potato-beat-grid");
        t.setDaemon(true);
        t.setPriority(Thread.MIN_PRIORITY);
        t.start();
    }

    /**
     * 当前播放位置（毫秒）：每 {@link #SAMPLE_INTERVAL_MS} 向上层取一次，
     * 两次采样之间用墙钟外推，保证 60fps 下相位是连续的而不是每 50ms 跳一格。
     */
    private double playPositionMs(double nowMs, String path) {
        if (!Objects.equals(path, sampleSong) || nowMs - sampleAtMs > SAMPLE_INTERVAL_MS) {
            Double t = main.lib().player().getTime();
            samplePosMs = t != null ? t * 1000.0 : main.currentPos * 1000.0;
            sampleAtMs = nowMs;
            sampleSong = path;
        }
        return samplePosMs < 0 ? 0 : samplePosMs + (nowMs - sampleAtMs);
    }

    private static double mod(double v, double m) {
        double r = v % m;
        return r < 0 ? r + m : r;
    }

    /** 把差值折算到 (-m/2, m/2]，避免一圈的边界上反向纠偏。 */
    private static double wrapHalf(double d, double m) {
        double r = mod(d, m);
        return r > m / 2 ? r - m : r;
    }

    private static double clampWidth(double w) {
        if (Double.isNaN(w) || w <= 0) {
            return DEFAULT_W;
        }
        return Math.max(MIN_W, Math.min(MAX_W, w));
    }
}
