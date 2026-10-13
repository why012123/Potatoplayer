package com.potato.player.core;

import javafx.scene.image.Image;
import javafx.scene.image.PixelFormat;
import javafx.scene.image.WritableImage;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.image.IndexColorModel;
import java.io.File;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * 动图（GIF）读取与「卡点」缩放计划。
 *
 * <p>只做两件事：把每一帧解出来、把每帧的显示时长算出来；然后给出一个
 * 「把整段循环缩放成最接近的整数拍」的时长方案。播放端按方案把时间轴拉长/压短、
 * 逐帧取图，因此不重编码像素、不写文件，画质零损失。</p>
 *
 * <ul>
 *   <li>帧延时来自 GIF 的 Graphic Control Extension（单位 1/100 秒）</li>
 *   <li>延时 ≤10ms 的帧按浏览器惯例当 100ms 处理（否则会被浏览器整体拉长，
 *       播放器与浏览器表现会不一致）</li>
 *   <li>缩放粒度两种可选（{@link #plan(double, double, boolean)}）：
 *       <b>整拍</b>＝每圈都落在正拍上（真正的卡点，但小动图速度变化大）；
 *       <b>半拍</b>＝速度变化小，代价是每两圈才有一圈落在正拍上</li>
 * </ul>
 *
 * <p><b>为什么要自己合成帧</b>：JDK 的 GIF 解码器（{@code GIFImageReader}）只解出每帧的
 * 「变化块」，不做画布合成 —— 实测第 2 帧起与 ffmpeg 的解码结果平均色差高达 116/255。
 * 所以这里按 GIF 规范在逻辑画布上重放：先按上一帧的 disposal（不处理 / 还原背景 /
 * 还原上一帧）处理画布，再按 imageLeft/Top 贴图、跳过透明索引像素。这样得到的成品帧
 * 才和浏览器里看到的一致。</p>
 *
 * <p><b>「还原背景」按浏览器惯例清成透明</b>，而不是填 GIF 头里的背景色索引：GIF 规范字面意思是
 * 填背景色，ffmpeg 与 PIL 也是这么做的，但实测同一张图（背景色索引指向红色）用「填背景色」
 * 会留下上一帧的红色残影，而浏览器是清成透明的 —— 本程序是透明悬浮窗，清成透明才是对的。</p>
 */
public final class AnimatedGif {

    /** 低于此值的帧延时按 {@link #DEFAULT_DELAY_MS} 处理（浏览器惯例）。 */
    private static final int MIN_DELAY_MS = 10;
    private static final int DEFAULT_DELAY_MS = 100;

    /** 逻辑画布上限：元数据里超过这个尺寸就判定为不可信，拒绝加载。 */
    private static final int MAX_CANVAS = 4096;
    /** 总像素预算（帧数 × 画布像素）：超了整体降采样，否则大动图能把堆吃光。 */
    private static final long PIXEL_BUDGET = 32L * 1000 * 1000;

    /** GIF 的 disposal method。 */
    private static final int DISPOSAL_NONE = 0;
    private static final int DISPOSAL_RESTORE_BG = 2;
    private static final int DISPOSAL_RESTORE_PREV = 3;

    private final List<Image> frames;
    private final int[] delaysMs;
    private final double naturalMs;
    private final int imageWidth;
    private final int imageHeight;
    /**
     * 有效内容（不透明像素）包围盒，取<b>所有帧的并集</b>，
     * 各值都是相对图片宽高的比例。用于「底边不动」的缩放锚点 ——
     * 图里透明留白不算内容，锚点要钉在最底下那排有内容的像素上。
     */
    private final double contentTop;
    private final double contentBottom;
    private final double contentLeft;
    private final double contentRight;

    private AnimatedGif(List<Image> frames, int[] delaysMs, int w, int h, int[] bbox) {
        this.frames = frames;
        this.delaysMs = delaysMs;
        this.imageWidth = w;
        this.imageHeight = h;
        boolean found = bbox[1] >= 0 && bbox[3] >= 0 && h > 0;
        this.contentTop = found ? bbox[0] / (double) h : 0;
        this.contentBottom = found ? (bbox[1] + 1) / (double) h : 1;
        this.contentLeft = found ? bbox[2] / (double) w : 0;
        this.contentRight = found ? (bbox[3] + 1) / (double) w : 1;
        long sum = 0;
        for (int d : delaysMs) {
            sum += d;
        }
        this.naturalMs = sum;
    }

    // ── 加载 ──

    /** 读取图片；失败返回 null。单帧图（PNG/JPG/静态 GIF）同样可用，只是不会动。 */
    public static AnimatedGif load(File file) {
        if (file == null || !file.isFile()) {
            return null;
        }
        // 视频（WebM / MP4…）走 VLC 抓帧：Java 自带库解不了，但本程序本来就带 libvlc
        if (VideoFrames.isVideo(file)) {
            VideoFrames.Result result = VideoFrames.decode(file);
            return result == null ? null : fromVideo(result);
        }
        try (ImageInputStream in = ImageIO.createImageInputStream(file)) {
            if (in == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, false, false);
                int n = reader.getNumImages(true);
                if (n <= 0) {
                    return null;
                }
                // 第一遍只读元数据（不解码像素）：延时 / 位置 / disposal
                List<FrameMeta> metas = new ArrayList<>(n);
                for (int i = 0; i < n; i++) {
                    metas.add(readMeta(reader, i));
                }
                // 元数据里可能没有帧尺寸（PNG/JPG）：用第 0 帧的真实尺寸兜底
                BufferedImage first = reader.read(0);
                if (first == null || first.getWidth() <= 0 || first.getHeight() <= 0) {
                    return null;
                }
                for (FrameMeta m : metas) {
                    if (m.w <= 0) {
                        m.w = first.getWidth();
                    }
                    if (m.h <= 0) {
                        m.h = first.getHeight();
                    }
                }
                int needW = 0;
                int needH = 0;
                for (FrameMeta m : metas) {
                    needW = Math.max(needW, m.left + m.w);
                    needH = Math.max(needH, m.top + m.h);
                }
                if (needW <= 0 || needH <= 0 || needW > MAX_CANVAS || needH > MAX_CANVAS) {
                    return null;
                }
                // 画布以帧范围为准；逻辑画布尺寸只在「比帧略大且不算离谱」时参考，
                // 伪造的 20000×20000 这类元数据直接忽略（否则 new BufferedImage 就 OOM）
                int[] screen = screenSize(reader);
                int canvasW = needW;
                int canvasH = needH;
                if (screen[0] > needW && screen[0] <= MAX_CANVAS && screen[0] <= needW * 4L) {
                    canvasW = screen[0];
                }
                if (screen[1] > needH && screen[1] <= MAX_CANVAS && screen[1] <= needH * 4L) {
                    canvasH = screen[1];
                }
                // 像素预算：200 帧 800×800 会占 500MB+，超预算就整体降采样
                int scale = 1;
                while ((long) metas.size() * canvasW * canvasH
                        > PIXEL_BUDGET * (long) scale * scale) {
                    scale++;
                }
                List<Image> frames = new ArrayList<>(metas.size());
                int[] delays = new int[metas.size()];
                // {内容最上行, 最下行, 最左列, 最右列}，逐帧取并集
                int[] bbox = {Integer.MAX_VALUE, -1, Integer.MAX_VALUE, -1};
                BufferedImage canvas = new BufferedImage(canvasW, canvasH,
                        BufferedImage.TYPE_INT_ARGB);
                BufferedImage beforePrev = null;
                FrameMeta prev = null;
                for (int i = 0; i < metas.size(); i++) {
                    FrameMeta m = metas.get(i);
                    if (prev != null) {
                        if (prev.disposal == DISPOSAL_RESTORE_BG) {
                            clearRect(canvas, prev.left, prev.top, prev.w, prev.h);
                        } else if (prev.disposal == DISPOSAL_RESTORE_PREV && beforePrev != null) {
                            canvas = copyOf(beforePrev);
                        }
                    }
                    BufferedImage snapshot = copyOf(canvas);
                    // 逐帧解码，不把全部原始帧留在内存里
                    BufferedImage raw = (i == 0) ? first : reader.read(i);
                    if (raw != null) {
                        blit(canvas, raw, m.left, m.top, m.transparentIndex);
                    }
                    frames.add(toFxImage(canvas, scale, bbox));
                    delays[i] = m.delayMs;
                    beforePrev = snapshot;
                    prev = m;
                }
                return new AnimatedGif(frames, delays,
                        Math.max(1, canvasW / scale), Math.max(1, canvasH / scale), bbox);
            } finally {
                reader.dispose();
            }
        } catch (Throwable t) {
            // 连 OutOfMemoryError 也要吞掉：这个方法会在启动恢复动图时被调用，
            // 一旦异常穿出去就是「每次启动都崩」，只能手改 config.json 才能救
            return null;
        }
    }

    /** 视频解码结果 → 同一个 AnimatedGif（帧、延时、包围盒都已经算好）。 */
    private static AnimatedGif fromVideo(VideoFrames.Result result) {
        if (result == null || result.frames().isEmpty()) {
            return null;
        }
        return new AnimatedGif(result.frames(), result.delaysMs(), result.width(), result.height(), result.bbox());
    }

    /** 一帧的元数据（延时 / 位置 / disposal / 透明索引）。 */
    private static final class FrameMeta {        int delayMs = DEFAULT_DELAY_MS;
        int left;
        int top;
        /** 帧的像素宽高：restoreToBackground 的清理范围要用它（0 = 未知，用第 0 帧兜底）。 */
        int w;
        int h;
        int disposal = DISPOSAL_NONE;
        /** 透明色索引；-1 表示本帧无透明色。 */
        int transparentIndex = -1;
    }

    private static FrameMeta readMeta(ImageReader reader, int index) {
        FrameMeta m = new FrameMeta();
        try {
            IIOMetadata meta = reader.getImageMetadata(index);
            if (meta == null) {
                return m;
            }
            IIOMetadataNode root =
                    (IIOMetadataNode) meta.getAsTree("javax_imageio_gif_image_1.0");
            IIOMetadataNode gce = child(root, "GraphicControlExtension");
            if (gce != null) {
                String v = gce.getAttribute("delayTime");
                if (v != null && !v.isBlank()) {
                    m.delayMs = Integer.parseInt(v.trim()) * 10;
                }
                if ("TRUE".equalsIgnoreCase(gce.getAttribute("transparentColorFlag"))) {
                    m.transparentIndex = intAttr(gce, "transparentColorIndex", -1);
                }
                m.disposal = disposalOf(gce.getAttribute("disposalMethod"));
            }
            IIOMetadataNode desc = child(root, "ImageDescriptor");
            if (desc != null) {
                m.left = intAttr(desc, "imageLeftPosition", 0);
                m.top = intAttr(desc, "imageTopPosition", 0);
                m.w = intAttr(desc, "imageWidth", 0);
                m.h = intAttr(desc, "imageHeight", 0);
            }
        } catch (Exception ignored) {
            // 元数据格式意外：保留默认值（不透明、位置 0、默认延时）
        }
        if (m.delayMs <= MIN_DELAY_MS) {
            m.delayMs = DEFAULT_DELAY_MS;
        }
        return m;
    }

    private static int disposalOf(String v) {
        if (v == null) {
            return DISPOSAL_NONE;
        }
        return switch (v.trim().toLowerCase()) {
            case "restoretobackgroundcolor", "restore to background color", "2" -> DISPOSAL_RESTORE_BG;
            case "restoretoprevious", "restore to previous", "3" -> DISPOSAL_RESTORE_PREV;
            default -> DISPOSAL_NONE;
        };
    }

    /** GIF 逻辑画布尺寸（非 GIF 返回 {0,0}）。 */
    private static int[] screenSize(ImageReader reader) {
        try {
            IIOMetadata meta = reader.getStreamMetadata();
            if (meta != null) {
                IIOMetadataNode root =
                        (IIOMetadataNode) meta.getAsTree("javax_imageio_gif_stream_1.0");
                IIOMetadataNode lsd = child(root, "LogicalScreenDescriptor");
                if (lsd != null) {
                    return new int[]{intAttr(lsd, "logicalScreenWidth", 0),
                            intAttr(lsd, "logicalScreenHeight", 0)};
                }
            }
        } catch (Exception ignored) {
            // 忽略：用帧尺寸兜底
        }
        return new int[]{0, 0};
    }

    private static IIOMetadataNode child(IIOMetadataNode root, String name) {
        if (root == null) {
            return null;
        }
        for (int i = 0; i < root.getLength(); i++) {
            if (name.equals(root.item(i).getNodeName())) {
                return (IIOMetadataNode) root.item(i);
            }
        }
        return null;
    }

    private static int intAttr(IIOMetadataNode node, String name, int fallback) {
        try {
            String v = node.getAttribute(name);
            return (v == null || v.isBlank()) ? fallback : Integer.parseInt(v.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    /** 把源帧贴到画布上：跳过透明索引与全透明像素。 */
    private static void blit(BufferedImage dst, BufferedImage src,
                             int dx, int dy, int transparentIndex) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] px = argbPixels(src);
        if (transparentIndex >= 0 && src.getColorModel() instanceof IndexColorModel) {
            try {
                int[] idx = new int[w * h];
                src.getRaster().getSamples(0, 0, w, h, 0, idx);
                for (int i = 0; i < idx.length; i++) {
                    if (idx[i] == transparentIndex) {
                        px[i] = 0;
                    }
                }
            } catch (Exception ignored) {
                // 取不到索引：下面按 alpha 判断
            }
        }
        int dw = dst.getWidth();
        int dh = dst.getHeight();
        int[] out = dst.getRGB(0, 0, dw, dh, null, 0, dw);
        for (int y = 0; y < h; y++) {
            int ty = dy + y;
            if (ty < 0 || ty >= dh) {
                continue;
            }
            for (int x = 0; x < w; x++) {
                int tx = dx + x;
                if (tx < 0 || tx >= dw) {
                    continue;
                }
                int s = px[y * w + x];
                if ((s >>> 24) == 0) {
                    continue;
                }
                out[ty * dw + tx] = (s >>> 24) == 255 ? s : over(s, out[ty * dw + tx]);
            }
        }
        dst.setRGB(0, 0, dw, dh, out, 0, dw);
    }

    /** 半透明像素的 SrcOver 混合（GIF 通常只有 0/255，这里兜住 8bit alpha 的特例）。 */
    private static int over(int src, int dst) {
        int sa = src >>> 24;
        int da = dst >>> 24;
        int oa = sa + da * (255 - sa) / 255;
        if (oa == 0) {
            return 0;
        }
        int r = (((src >> 16) & 255) * sa + ((dst >> 16) & 255) * da * (255 - sa) / 255) / oa;
        int g = (((src >> 8) & 255) * sa + ((dst >> 8) & 255) * da * (255 - sa) / 255) / oa;
        int b = ((src & 255) * sa + (dst & 255) * da * (255 - sa) / 255) / oa;
        return (oa << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    }

    private static int clamp(int v) {
        return v < 0 ? 0 : Math.min(v, 255);
    }

    private static void clearRect(BufferedImage img, int x, int y, int w, int h) {
        int dw = img.getWidth();
        int dh = img.getHeight();
        int x1 = Math.max(0, x);
        int y1 = Math.max(0, y);
        int x2 = Math.min(dw, x + w);
        int y2 = Math.min(dh, y + h);
        if (x2 <= x1 || y2 <= y1) {
            return;
        }
        int[] out = img.getRGB(0, 0, dw, dh, null, 0, dw);
        for (int ry = y1; ry < y2; ry++) {
            java.util.Arrays.fill(out, ry * dw + x1, ry * dw + x2, 0);
        }
        img.setRGB(0, 0, dw, dh, out, 0, dw);
    }

    private static BufferedImage copyOf(BufferedImage src) {
        BufferedImage copy = new BufferedImage(src.getWidth(), src.getHeight(),
                BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = copy.createGraphics();
        g.drawImage(src, 0, 0, null);
        g.dispose();
        return copy;
    }

    /** 统一取成 INT_ARGB 像素数组（透明索引会变成 alpha=0）。 */
    private static int[] argbPixels(BufferedImage src) {
        int w = src.getWidth();
        int h = src.getHeight();
        return src.getRGB(0, 0, w, h, null, 0, w);
    }

    /**
     * BufferedImage → JavaFX Image（不引 javafx-swing，自己搬一次像素）。
     *
     * @param scale 降采样倍数（1 = 原尺寸）；超预算的大动图靠它把常驻内存压下来
     */
    private static Image toFxImage(BufferedImage src, int scale, int[] bbox) {
        int w = Math.max(1, src.getWidth() / scale);
        int h = Math.max(1, src.getHeight() / scale);
        BufferedImage out = src;
        if (scale > 1) {
            out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                    java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(src, 0, 0, w, h, null);
            g.dispose();
        }
        int[] px = out.getRGB(0, 0, w, h, null, 0, w);
        updateContentBox(bbox, px, w, h);
        WritableImage img = new WritableImage(w, h);
        img.getPixelWriter().setPixels(0, 0, w, h,
                PixelFormat.getIntArgbInstance(), px, 0, w);
        return img;
    }

    /** 统计不透明像素的包围盒（alpha &gt; 8 才算内容），逐帧取并集。 */
    static void updateContentBox(int[] bbox, int[] px, int w, int h) {
        for (int y = 0; y < h; y++) {
            int row = y * w;
            int left = -1;
            int right = -1;
            for (int x = 0; x < w; x++) {
                if ((px[row + x] >>> 24) > 8) {
                    if (left < 0) {
                        left = x;
                    }
                    right = x;
                }
            }
            if (left < 0) {
                continue;
            }
            if (y < bbox[0]) {
                bbox[0] = y;
            }
            if (y > bbox[1]) {
                bbox[1] = y;
            }
            if (left < bbox[2]) {
                bbox[2] = left;
            }
            if (right > bbox[3]) {
                bbox[3] = right;
            }
        }
    }

    // ── 基本属性 ──

    public int frameCount() {
        return frames.size();
    }

    /** 是否真的是动图（多帧）。 */
    public boolean animated() {
        return frames.size() > 1;
    }

    /** 原始一圈的时长（毫秒）。 */
    public double naturalMs() {
        return naturalMs;
    }

    public Image frame(int index) {
        if (frames.isEmpty()) {
            return null;
        }
        return frames.get(Math.max(0, Math.min(frames.size() - 1, index)));
    }

    public int width() {
        return imageWidth;
    }

    public int height() {
        return imageHeight;
    }

    /** 有效内容最上沿的位置（占图高的比例，0~1）。 */
    public double contentTop() {
        return contentTop;
    }

    /**
     * 有效内容最下沿的位置（占图高的比例，0~1）。
     * <p>缩放锚点用它：透明留白不算"底"，最底下那排有内容的像素才是不动的那个底。</p>
     */
    public double contentBottom() {
        return contentBottom;
    }

    /** 有效内容最左沿的位置（占图宽的比例，0~1）。 */
    public double contentLeft() {
        return contentLeft;
    }

    /** 有效内容最右沿的位置（占图宽的比例，0~1）。 */
    public double contentRight() {
        return contentRight;
    }

    /**
     * 取时间轴上的第几帧。
     *
     * @param phaseMs 在缩放后时间轴上的位置（毫秒）
     * @param loopMs  缩放后一圈的时长；≤0 视为静态图
     */
    public int frameIndexAt(double phaseMs, double loopMs) {
        int n = frames.size();
        if (n <= 1 || naturalMs <= 0 || loopMs <= 0) {
            return 0;
        }
        double p = phaseMs % loopMs;
        if (p < 0) {
            p += loopMs;
        }
        double factor = loopMs / naturalMs;
        double acc = 0;
        for (int i = 0; i < n; i++) {
            double d = delaysMs[i] * factor;
            if (p < acc + d) {
                return i;
            }
            acc += d;
        }
        return n - 1;
    }

    // ── 卡点方案 ──

    /**
     * 卡点方案。
     *
     * @param loopMs 缩放后一圈的时长（毫秒）
     * @param beats  一圈合多少拍（0 表示无 BPM，按原速）
     * @param speed  速度倍率：&gt;1 变快、&lt;1 变慢、=1 原速
     */
    public record BeatPlan(double loopMs, double beats, double speed) {
        /** 是否处于卡点状态。 */
        public boolean beatLocked() {
            return beats > 0 && loopMs > 0;
        }
    }

    /**
     * 生成卡点方案：把一圈时长缩放到最接近的整数倍拍长。
     *
     * @param integerBeats true = 只用整拍（每圈都落在正拍上，真正的卡点，
     *                     但短动图速度变化大）；false = 半拍粒度
     *                     （速度变化小一半，代价是每两圈才有一圈落在正拍上）
     *
     * <p>{@code bpm <= 0} 时返回原速方案（loopMs = 原始时长）。</p>
     */
    public static BeatPlan plan(double naturalMs, double bpm, boolean integerBeats) {
        if (naturalMs <= 0) {
            return new BeatPlan(0, 0, 1);
        }
        if (bpm <= 0) {
            return new BeatPlan(naturalMs, 0, 1);
        }
        double beatMs = 60000.0 / bpm;
        double ratio = naturalMs / beatMs;
        double beats = integerBeats
                ? Math.max(1.0, Math.round(ratio))
                : Math.max(0.5, Math.round(ratio * 2) / 2.0);
        double loopMs = beats * beatMs;
        return new BeatPlan(loopMs, beats, naturalMs / loopMs);
    }
}
