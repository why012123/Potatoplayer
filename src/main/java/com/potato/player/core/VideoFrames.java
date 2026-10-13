package com.potato.player.core;

import javafx.scene.image.Image;
import javafx.scene.image.PixelFormat;
import javafx.scene.image.WritableImage;
import uk.co.caprica.vlcj.player.base.MediaPlayer;
import uk.co.caprica.vlcj.player.base.MediaPlayerEventAdapter;
import uk.co.caprica.vlcj.player.base.State;
import uk.co.caprica.vlcj.player.embedded.EmbeddedMediaPlayer;
import uk.co.caprica.vlcj.player.embedded.videosurface.CallbackVideoSurface;
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.BufferFormat;
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.BufferFormatCallback;
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.RenderCallback;
import uk.co.caprica.vlcj.factory.MediaPlayerFactory;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicReferenceArray;

/**
 * 把「视频」解码成一串帧（给动图悬浮窗用）。
 *
 * <p>动图原来只认 GIF/PNG（{@link AnimatedGif} 用 ImageIO 逐帧解）。WebM / MP4 这类
 * 视频 Java 自带库解不了，但<b>本程序本来就得装 VLC</b>（播放引擎就是 libvlc），
 * 所以这里借 vlcj 的「回调视频输出」（{@code CallbackVideoSurface} + RV32）把每一帧
 * 抓下来 —— 不依赖 ffmpeg，也不用先转码成 GIF。</p>
 *
 * <p>几个刻意的取舍：</p>
 * <ul>
 *   <li><b>输出尺寸按「帧数 × 像素预算」倒推</b>：动图悬浮窗显示宽度通常两三百像素，
 *       却可能是个 1080p 视频，全尺寸存几百帧会直接把堆吃光。先按时长估帧数，
 *       再算一个够用的输出尺寸（最长边不超过 {@link #MAX_EDGE}）。</li>
 *   <li><b>真掉帧也不怕</b>：万一实际帧数超过预算，就每隔一帧丢一帧（减半再减半），
 *       延迟按「总时长 ÷ 保留帧数」均分 —— 时长仍然准，动画不会越放越慢。</li>
 *   <li><b>倍速播放抓帧</b>：VLC 是按时钟送帧的，1 倍速下一个 10 秒的片子就要等 10 秒。
 *       这里用 {@link #CAPTURE_RATE} 倍速抓，抓帧回调本身很轻（只是拷一遍内存），
 *       实测不掉帧。</li>
 *   <li><b>alpha 兜底</b>：RV32 带 alpha 字节，带透明通道的 WebM（VP9 alpha）能直接透明；
 *       但普通视频的 alpha 字节可能是 0，直接照抄会让整个动图变全透明。所以先看前几帧：
 *       整帧 alpha 全 0 就判定「这条管线没有 alpha」，全部按不透明处理。</li>
 * </ul>
 */
public final class VideoFrames {

    /** 认得的视频后缀（VLC 能解的都行；webm 是主要目标）。 */
    private static final String[] EXTS = {".webm", ".mp4", ".m4v", ".mov", ".mkv", ".avi", ".wmv", ".flv", ".ts"};

    /** 输出图最长边的上限（悬浮窗显示宽度就几百像素，再大是浪费内存）。 */
    private static final int MAX_EDGE = 512;
    /** 总像素预算（帧数 × 输出宽高）：24M 像素 ≈ 96MB，和 GIF 那条路一个量级。 */
    private static final long PIXEL_BUDGET = 16L * 1000 * 1000;
    /** 帧数上限（再多就靠抽帧降下来）。 */
    private static final int MAX_FRAMES = 900;
    /** 抓帧倍速：VLC 按播放时钟送帧，倍速抓能省掉等片子的时间。 */
    private static final float CAPTURE_RATE = Float.parseFloat(System.getProperty("potato.videoRate", "2"));
    /** 最多抓这么长的片子（超过就只抓前一段，动图不需要整集）。 */
    private static final long MAX_CAPTURE_MS = 60_000;
    /** 拿不到真实时长时，按这个估（宁可估长一点，分辨率低些也不要爆内存）。 */
    private static final long FALLBACK_MS = 10_000;
    /** 估帧数时假设的帧率（拿不到真实帧率，30 是最常见的）。 */
    private static final double ASSUMED_FPS = 30.0;
    /**
     * 输出色度。
     *
     * <p><b>不能要 RV32</b>：RV32 的第四个字节在 VLC 里只是对齐填充，不是 alpha ——
     * 用它抓带透明通道的 WebM（VP9 alpha），透明区会变成不透明的黑块。{@code BGRA}
     * 才是「内存里按 B,G,R,A 排」的真 alpha 格式（小端读成 int 正好是 Java 的 ARGB），
     * 所以默认用它；{@code -Dpotato.videoChroma=RGBA|RV32} 可以改（排查用）。</p>
     */
    private static final String CHROMA = System.getProperty("potato.videoChroma", "BGRA");
    /** RGBA 的内存顺序是 R,G,B,A，小端读成 int 是 ABGR，要换 R/B；BGRA 不用。 */
    private static final boolean SWAP_RB = "RGBA".equalsIgnoreCase(CHROMA);

    private VideoFrames() {
    }

    /** 后缀判断：这个文件要不要走视频解码。 */
    public static boolean isVideo(File file) {
        if (file == null) {
            return false;
        }
        String name = file.getName().toLowerCase();
        for (String ext : EXTS) {
            if (name.endsWith(ext)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 解码结果。
     *
     * @param frames   已经缩到输出尺寸的帧（JavaFX 图像）
     * @param delaysMs 每帧延时（均分总时长）
     * @param width    输出宽
     * @param height   输出高
     * @param bbox     内容包围盒 {top, bottom, left, right}，坐标系是输出尺寸
     * @param naturalMs 原始一圈时长
     */
    public record Result(List<Image> frames, int[] delaysMs, int width, int height, int[] bbox, double naturalMs) {
    }

    /**
     * 解一个视频文件；失败返回 null（调用方按「导入失败」处理）。
     *
     * <p>这个方法会阻塞到整段抓完（几秒量级），<b>不要放在 JavaFX 线程上</b>。</p>
     */
    public static Result decode(File file) {
        if (file == null || !file.isFile()) {
            return null;
        }
        MediaPlayerFactory factory = null;
        EmbeddedMediaPlayer player = null;
        uk.co.caprica.vlcj.media.Media parsed = null;
        try {
            // --no-audio：动图只要画面；--avcodec-hw=none：强制软解，硬解不一定走回调输出
            factory = new MediaPlayerFactory("--no-audio", "--quiet", "--no-video-title-show",
                    "--avcodec-hw=none", "--no-snapshot-preview");
            player = factory.mediaPlayers().newEmbeddedMediaPlayer();

            Capture capture = new Capture();
            CallbackVideoSurface surface = factory.videoSurfaces().newVideoSurface(
                    capture.formatCallback(), capture.renderCallback(), true);
            player.videoSurface().set(surface);

            CountDownLatch done = new CountDownLatch(1);
            AtomicReference<String> failure = new AtomicReference<>();
            player.events().addMediaPlayerEventListener(new MediaPlayerEventAdapter() {
                @Override
                public void finished(MediaPlayer mediaPlayer) {
                    done.countDown();
                }

                @Override
                public void error(MediaPlayer mediaPlayer) {
                    failure.set("VLC 打不开这个视频");
                    done.countDown();
                }
            });

            // 先「阻塞解析」这个文件：只有解析完 media().info() 才有真实时长与帧率
            // （实测 prepare() 之后 status().length() 与 info().duration() 都还是 -1，
            //   要等真正开始播放才出值 —— 而输出尺寸必须在第一帧到达前定下来）。
            String path = file.getAbsolutePath();
            long plannedMs = 0;
            double plannedFps = 0;
            try {
                parsed = factory.media().newMedia(path);
                parsed.parsing().parse();
                // parse() 是异步的（返回 true 但信息要过几十毫秒才填好），轮询等它
                long waitUntil = System.currentTimeMillis() + 2_000;
                while (System.currentTimeMillis() < waitUntil) {
                    plannedMs = parsed.info().duration();
                    java.util.List<uk.co.caprica.vlcj.media.VideoTrackInfo> tracks = parsed.info().videoTracks();
                    if (plannedMs > 0 && tracks != null && !tracks.isEmpty()) {
                        uk.co.caprica.vlcj.media.VideoTrackInfo track = tracks.get(0);
                        int base = track.frameRateBase();
                        if (track.frameRate() > 0) {
                            plannedFps = base > 0 ? (double) track.frameRate() / base : track.frameRate();
                        }
                        // VP9/H.264 会把画面补齐到宏块边界（320×240 → 320×256），
                        // 解码缓冲区因此比可见画面高一条边，抓帧时按这个尺寸裁掉
                        capture.visible(track.width(), track.height());
                        break;
                    }
                    Thread.sleep(20);
                }
            } catch (Throwable ignored) {
                // 解析失败就用兜底值，不影响抓帧
            }
            capture.plan(plannedMs > 0 ? plannedMs : FALLBACK_MS, plannedFps);
            // 已经解析过的 Media 直接拿来播，省一次解析
            if (parsed != null) {
                player.media().play(parsed.newMediaRef(), ":rate=" + CAPTURE_RATE);
            } else {
                player.media().play(path, ":rate=" + CAPTURE_RATE);
            }

            // 抓满上限就主动停：长片子没必要一直等
            long deadline = System.currentTimeMillis() + MAX_CAPTURE_MS + 30_000;
            while (!done.await(200, TimeUnit.MILLISECONDS)) {
                if (capture.shouldStop() || System.currentTimeMillis() > deadline) {
                    player.controls().stop();
                    break;
                }
            }
            long reportedMs = Math.max(0, player.status().length());
            if (capture.frameCount() == 0) {
                return null;
            }
            return capture.finish(reportedMs > 0 ? reportedMs : plannedMs);
        } catch (Throwable t) {
            // 和 GIF 那条路一致：连 OutOfMemoryError 都吞掉，导入失败就让调用方提示
            return null;
        } finally {
            try {
                if (player != null) {
                    player.controls().stop();
                    player.release();
                }
            } catch (Throwable ignored) {
                // 释放失败无所谓
            }
            try {
                if (parsed != null) {
                    parsed.release();
                }
            } catch (Throwable ignored) {
                // 同上
            }
            try {
                if (factory != null) {
                    factory.release();
                }
            } catch (Throwable ignored) {
                // 同上
            }
        }
    }

    /** 抓帧过程中的可变状态（回调线程写、解码线程读）。 */
    private static final class Capture {
        private final AtomicInteger srcW = new AtomicInteger();
        private final AtomicInteger srcH = new AtomicInteger();
        private final AtomicInteger outW = new AtomicInteger();
        private final AtomicInteger outH = new AtomicInteger();
        private final AtomicInteger pitch = new AtomicInteger();
        /** 保留的帧（输出尺寸的 ARGB 像素）。 */
        private final List<int[]> kept = new ArrayList<>();
        /** 每满一倍就抽掉一半，保证内存不随时间涨。 */
        private final AtomicInteger capacity = new AtomicInteger(MAX_FRAMES);
        private final AtomicInteger seen = new AtomicInteger();
        private final AtomicLong firstNanos = new AtomicLong();
        private final AtomicLong lastNanos = new AtomicLong();
        private final AtomicInteger alphaProbe = new AtomicInteger(3);
        private final AtomicBoolean forceOpaque = new AtomicBoolean(false);
        private final AtomicBoolean stop = new AtomicBoolean(false);
        /** 预估时长与帧率（解析之后拿到，用来倒推输出尺寸）。 */
        private final AtomicLong plannedMs = new AtomicLong(FALLBACK_MS);
        /** 可见画面尺寸（解析出来的；解码缓冲区可能因宏块补齐更大）。 */
        private final AtomicInteger visibleW = new AtomicInteger();
        private final AtomicInteger visibleH = new AtomicInteger();
        /** 实际要抓的区域（缓冲区尺寸按可见尺寸裁过，定一次就不再变）。 */
        private final AtomicInteger cropW = new AtomicInteger();
        private final AtomicInteger cropH = new AtomicInteger();
        private volatile double plannedFps = 0;
        private volatile BufferedImage scratch;

        /** 解析完成后告诉抓帧器「这条片子多长、多少帧每秒」，输出尺寸按它倒推。 */
        void plan(long ms, double fps) {
            plannedMs.set(ms > 0 ? ms : FALLBACK_MS);
            plannedFps = fps > 0 ? fps : 0;
        }

        /** 可见画面尺寸（裁剪用；解析不出来就保持 0 = 不裁）。 */
        void visible(int width, int height) {
            visibleW.set(width > 0 ? width : 0);
            visibleH.set(height > 0 ? height : 0);
        }

        BufferFormatCallback formatCallback() {
            return new BufferFormatCallback() {
                @Override
                public BufferFormat getBufferFormat(int width, int height) {
                    srcW.set(width);
                    srcH.set(height);
                    // 缓冲区可能被宏块补齐（320×240 → 320×256），按解析出的可见尺寸裁
                    int vw = visibleW.get() > 0 ? Math.min(width, visibleW.get()) : width;
                    int vh = visibleH.get() > 0 ? Math.min(height, visibleH.get()) : height;
                    cropW.set(Math.max(1, vw));
                    cropH.set(Math.max(1, vh));
                    int[] size = outputSize(vw, vh, plannedMs.get(), plannedFps);
                    outW.set(size[0]);
                    outH.set(size[1]);
                    // BGRA：内存 B,G,R,A（小端读成 int = Java ARGB，且第 4 字节是真 alpha）
                    return new BufferFormat(CHROMA, width, height,
                            new int[]{width * 4}, new int[]{height});
                }

                @Override
                public void newFormatSize(int width, int height, int visibleWidth, int visibleHeight) {
                    // 不关心：固定 4 字节一像素
                }

                @Override
                public void allocatedBuffers(ByteBuffer[] buffers) {
                    if (buffers != null && buffers.length > 0 && buffers[0] != null) {
                        // 行距由 VLC 决定（可能大于 width*4），拷的时候必须按它走
                        pitch.set(buffers[0].capacity() / Math.max(1, srcH.get()));
                    }
                }
            };
        }

        RenderCallback renderCallback() {
            return new RenderCallback() {
                @Override
                public void lock(MediaPlayer mediaPlayer) {
                }

                @Override
                public void unlock(MediaPlayer mediaPlayer) {
                }

                @Override
                public void display(MediaPlayer mediaPlayer, ByteBuffer[] buffers, BufferFormat format, int count, int something) {
                    if (buffers == null || buffers.length == 0 || buffers[0] == null) {
                        return;
                    }
                    int w = srcW.get();
                    int h = srcH.get();
                    if (w <= 0 || h <= 0) {
                        return;
                    }
                    int p = pitch.get() > 0 ? pitch.get() : w * 4;
                    // 裁掉宏块补齐的那一条（尺寸在 getBufferFormat 里已经定好，这里只读）
                    int cw = cropW.get() > 0 ? Math.min(w, cropW.get()) : w;
                    int ch = cropH.get() > 0 ? Math.min(h, cropH.get()) : h;
                    int[] nativeFrame = new int[cw * ch];
                    ByteBuffer buf = buffers[0].duplicate().order(ByteOrder.LITTLE_ENDIAN);
                    try {
                        for (int y = 0; y < ch; y++) {
                            int rowStart = y * p;
                            for (int x = 0; x < cw; x++) {
                                int px = buf.getInt(rowStart + x * 4);
                                // RGBA 的内存序是 R,G,B,A，小端读出来是 ABGR，得把 R/B 换回来
                                nativeFrame[y * cw + x] = SWAP_RB ? swapRb(px) : px;
                            }
                        }
                    } catch (IndexOutOfBoundsException e) {
                        // 缓冲区比预期小：这一帧作废，别把整次导入带崩
                        return;
                    }
                    long now = System.nanoTime();
                    firstNanos.compareAndSet(0, now);
                    lastNanos.set(now);

                    // 前几帧拿来判断「这条管线到底有没有 alpha」
                    if (alphaProbe.get() > 0) {
                        boolean anyAlpha = false;
                        for (int px : nativeFrame) {
                            if ((px >>> 24) != 0) {
                                anyAlpha = true;
                                break;
                            }
                        }
                        if (anyAlpha) {
                            forceOpaque.set(false);
                        } else if (alphaProbe.get() == 1) {
                            forceOpaque.set(true);
                        }
                        alphaProbe.decrementAndGet();
                    }

                    int ow = outW.get();
                    int oh = outH.get();
                    int[] out = (ow == cw && oh == ch) ? nativeFrame : scale(nativeFrame, cw, ch, ow, oh);
                    if (forceOpaque.get()) {
                        for (int i = 0; i < out.length; i++) {
                            out[i] |= 0xFF000000;
                        }
                    }

                    synchronized (kept) {
                        int n = seen.incrementAndGet();
                        // 帧数到顶就抽掉一半（保留奇数序号），等价于「抽帧而不是截断」
                        if (kept.size() >= capacity.get()) {
                            List<int[]> halved = new ArrayList<>(kept.size() / 2 + 1);
                            for (int i = 0; i < kept.size(); i += 2) {
                                halved.add(kept.get(i));
                            }
                            kept.clear();
                            kept.addAll(halved);
                            capacity.set(Math.max(1, capacity.get() / 2));
                        }
                        kept.add(out);
                        if (n >= MAX_FRAMES * 2) {
                            stop.set(true);
                        }
                    }
                }
            };
        }

        int frameCount() {
            synchronized (kept) {
                return kept.size();
            }
        }

        boolean shouldStop() {
            return stop.get();
        }

        /** 收尾：转 JavaFX 图像 + 算包围盒 + 均分延时。 */
        Result finish(long reportedMs) {
            List<int[]> frames;
            synchronized (kept) {
                frames = new ArrayList<>(kept);
            }
            int w = outW.get();
            int h = outH.get();
            if (w <= 0 || h <= 0 || frames.isEmpty()) {
                return null;
            }
            // 时长优先用容器报的；报不出来就用抓帧的墙钟时间（乘回倍速）
            double naturalMs = reportedMs > 0 ? reportedMs : Math.max(1, (lastNanos.get() - firstNanos.get()) / 1_000_000.0 * CAPTURE_RATE);
            if (naturalMs <= 0) {
                naturalMs = frames.size() * (1000.0 / ASSUMED_FPS);
            }
            int[] delays = new int[frames.size()];
            int each = Math.max(1, (int) Math.round(naturalMs / frames.size()));
            for (int i = 0; i < delays.length; i++) {
                delays[i] = each;
            }
            int[] bbox = {Integer.MAX_VALUE, -1, Integer.MAX_VALUE, -1};
            List<Image> images = new ArrayList<>(frames.size());
            for (int[] px : frames) {
                AnimatedGif.updateContentBox(bbox, px, w, h);
                WritableImage img = new WritableImage(w, h);
                img.getPixelWriter().setPixels(0, 0, w, h, PixelFormat.getIntArgbInstance(), px, 0, w);
                images.add(img);
            }
            return new Result(images, delays, w, h, bbox, naturalMs);
        }

        /**
         * 倒推输出尺寸：先按时长 × 帧率估帧数，再让「帧数 × 输出像素」落在预算内。
         *
         * <p>用连续缩放而不是对半砍：320×256 的短片刚好超预算一点点时，对半砍会掉到
         * 160×128（糊一倍），连续缩放只会掉到 316×253。</p>
         */
        private static int[] outputSize(int width, int height, long plannedMs, double fps) {
            double rate = fps > 1 ? Math.min(120, fps) : ASSUMED_FPS;
            double seconds = Math.max(0.5, Math.min(MAX_CAPTURE_MS, plannedMs) / 1000.0);
            double estFrames = Math.max(1, Math.min(MAX_FRAMES, seconds * rate));
            double byEdge = Math.max(1.0, Math.max(width, height) / (double) MAX_EDGE);
            double byBudget = Math.sqrt(estFrames * (double) width * height / PIXEL_BUDGET);
            double scale = Math.max(byEdge, byBudget);
            int ow = (int) Math.max(1, Math.round(width / scale));
            int oh = (int) Math.max(1, Math.round(height / scale));
            return new int[]{ow, oh};
        }

        /** RGBA 内存序读出来的 ABGR → Java 的 ARGB。 */
        private static int swapRb(int px) {
            return (px & 0xFF00FF00) | ((px & 0x00FF0000) >>> 16) | ((px & 0x000000FF) << 16);
        }

        /** 双线性缩放到输出尺寸（复用一块 scratch，避免每帧都新建 BufferedImage）。 */
        private int[] scale(int[] src, int sw, int sh, int dw, int dh) {
            BufferedImage in = scratch;
            if (in == null || in.getWidth() != sw || in.getHeight() != sh) {
                in = new BufferedImage(sw, sh, BufferedImage.TYPE_INT_ARGB);
                scratch = in;
            }
            in.setRGB(0, 0, sw, sh, src, 0, sw);
            BufferedImage out = new BufferedImage(dw, dh, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(in, 0, 0, dw, dh, null);
            g.dispose();
            return out.getRGB(0, 0, dw, dh, null, 0, dw);
        }
    }
}
