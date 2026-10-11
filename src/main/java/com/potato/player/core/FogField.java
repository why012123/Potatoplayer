package com.potato.player.core;

/**
 * 「屏幕起雾」的密度场（<b>纯逻辑，不依赖 JavaFX</b>）。
 *
 * <p>为了省电与柔和，雾不是按屏幕像素存的，而是按 {@code cell} 点一格的粗网格存
 * （1470×956 的屏幕、6 点一格 ≈ 245×160 = 3.9 万格），渲染时交给
 * {@code ImageView.setSmooth(true)} 双线性放大到全屏 —— 于是边缘天然是软的，
 * 每帧要写的像素也只有几万个。</p>
 *
 * <p>纹理用三倍频 value noise：
 * <ul>
 *   <li>{@code uneven} 决定「哪里先雾」—— 云絮状，不是均匀糊一层；</li>
 *   <li>{@code cap} 决定「哪里雾得厚」—— 雾满之后仍有明暗层次，不会变成一块白板。</li>
 * </ul>
 *
 * <p>擦除（小动图划过）就是在这张密度场里减一个带衰减的圆盘：擦一次留薄雾，
 * 来回擦才干净；被擦掉的地方随后会按同样的起雾速度重新雾上。</p>
 *
 * <p>坐标一律用<b>屏幕点</b>（与 JavaFX 的窗口坐标一致），由 {@link #col(double)} /
 * {@link #row(double)} 换算到格子。</p>
 */
public final class FogField {

    private final int cols;
    private final int rows;
    /** 每格宽度（点）。 */
    private final double cell;
    /** 网格原点（屏幕坐标，点）。 */
    private final double originX;
    private final double originY;

    private final float[] density;
    private final float[] uneven;
    private final float[] cap;
    /** 边缘加权：真实玻璃是边上先起雾、中间最后糊上 */
    private final float[] edge;
    /** 每格固定的颗粒感（±14%）：不加这层，雾面就是一张纯渐变，像糊了层毛玻璃而不像雾 */
    private final float[] grain;
    private final long seed;

    public FogField(double width, double height, double cell, double originX, double originY, long seed) {
        this.cell = Math.max(2.0, cell);
        this.originX = originX;
        this.originY = originY;
        this.cols = Math.max(1, (int) Math.ceil(width / this.cell));
        this.rows = Math.max(1, (int) Math.ceil(height / this.cell));
        this.seed = seed;
        int n = cols * rows;
        this.density = new float[n];
        this.uneven = new float[n];
        this.cap = new float[n];
        this.edge = new float[n];
        this.grain = new float[n];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                int i = r * cols + c;
                // 两套低频噪声：一套管"哪片先雾"，一套管"哪片雾得厚"。
                // 频率压得很低（约 45 格 ≈ 270 点一团），出来才是大团大团的雾气，
                // 而不是一层均匀的噪点；高频只留一点点做"雾面颗粒感"。
                uneven[i] = 0.30f + 0.70f * wisps(c * 0.024, r * 0.011, 0L);
                cap[i] = 0.46f + 0.54f * wisps(c * 0.013 + 37.1, r * 0.0075 + 11.7, 511L);
                grain[i] = 0.86f + 0.28f * hash(c, r, 7L);
                double nx = (c + 0.5) / cols * 2 - 1;
                double ny = (r + 0.5) / rows * 2 - 1;
                double rad = Math.min(1.0, Math.sqrt(nx * nx * 0.55 + ny * ny));
                edge[i] = (float) (0.55 + 1.00 * rad);
            }
        }
    }

    public int cols() {
        return cols;
    }

    public int rows() {
        return rows;
    }

    public double cellSize() {
        return cell;
    }

    public int col(double screenX) {
        return (int) Math.floor((screenX - originX) / cell);
    }

    public int row(double screenY) {
        return (int) Math.floor((screenY - originY) / cell);
    }

    public float densityAt(int c, int r) {
        if (c < 0 || r < 0 || c >= cols || r >= rows) {
            return 0f;
        }
        return density[r * cols + c];
    }

    /** 全屏平均密度（0~1），调试与探针用。 */
    public double meanDensity() {
        double sum = 0;
        for (float d : density) {
            sum += d;
        }
        return sum / density.length;
    }

    public float maxDensity() {
        float m = 0;
        for (float d : density) {
            if (d > m) {
                m = d;
            }
        }
        return m;
    }

    /**
     * 时间推进：整屏慢慢起雾。
     *
     * @param dtSeconds 距上一帧的秒数
     * @param ratePerSec 每秒密度增量（1/60 ≈ 一分钟铺满）
     */
    public void step(double dtSeconds, double ratePerSec) {
        if (dtSeconds <= 0 || ratePerSec <= 0) {
            return;
        }
        float d = (float) (dtSeconds * ratePerSec);
        for (int i = 0; i < density.length; i++) {
            float v = density[i] + d * uneven[i] * edge[i];
            float c = cap[i];
            density[i] = v > c ? c : v;
        }
    }

    /** 在某处补一团雾（自然界的雾是一团团来的，不是整屏匀速变白）。 */
    public void addBlob(double screenX, double screenY, double radiusPts, float amount) {
        stamp(screenX, screenY, radiusPts, amount, true);
    }

    /**
     * 擦除：在 (screenX, screenY) 处按半径擦掉一部分密度。
     *
     * @param strength 一次擦除能削掉多少密度（1.0 = 圆心一次擦干净）
     */
    public void wipe(double screenX, double screenY, double radiusPts, double strength) {
        stamp(screenX, screenY, radiusPts, (float) -strength, false);
    }

    private void stamp(double screenX, double screenY, double radiusPts, float amount, boolean grow) {
        double radiusCells = radiusPts / cell;
        if (radiusCells <= 0) {
            return;
        }
        int c0 = col(screenX - radiusPts);
        int c1 = col(screenX + radiusPts);
        int r0 = row(screenY - radiusPts);
        int r1 = row(screenY + radiusPts);
        double cx = (screenX - originX) / cell - 0.5;
        double cy = (screenY - originY) / cell - 0.5;
        double r2 = radiusCells * radiusCells;
        for (int r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
            double dy = r - cy;
            for (int c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
                double dx = c - cx;
                double dist2 = dx * dx + dy * dy;
                if (dist2 > r2) {
                    continue;
                }
                // 平滑衰减：圆心 1、边缘 0；再平方一次，边缘更软、中心更"实"
                double w = 1.0 - Math.sqrt(dist2 / r2);
                w = w * w;
                int i = r * cols + c;
                float v = density[i] + amount * (float) w;
                if (grow) {
                    float cp = cap[i];
                    density[i] = v > cp ? cp : v;
                } else {
                    density[i] = v < 0 ? 0 : v;
                }
            }
        }
    }

    /** 整屏直接铺满到各自的 cap（调试键「立即起雾」）。 */
    public void fillToCap() {
        System.arraycopy(cap, 0, density, 0, density.length);
    }

    /** 一键清雾。 */
    public void clear() {
        java.util.Arrays.fill(density, 0f);
    }

    /**
     * 导出成 <b>预乘 ARGB</b>（{@code PixelFormat.getIntArgbPreInstance()} 要的格式），
     * 颜色是偏冷的白，浓度即透明度。
     *
     * @param maxAlpha 255 = 最浓处的不透明度上限
     * @param out      长度至少 {@code cols*rows} 的复用数组
     */
    public void toArgbPre(int maxAlpha, int[] out) {
        for (int i = 0; i < density.length; i++) {
            // grain 会在 ±14% 范围内抖动，所以这里必须再夹一次上限：
            // 「最浓时的不透明度」是用户设的那个数，不能被颗粒感顶破
            int a = (int) (contrast(density[i]) * grain[i] * maxAlpha);
            if (a <= 0) {
                out[i] = 0;
                continue;
            }
            if (a > maxAlpha) {
                a = maxAlpha;
            }
            if (a > 255) {
                a = 255;
            }
            // 冷白：冬天玻璃上的雾带一点点蓝
            int r = (246 * a + 127) / 255;
            int g = (249 * a + 127) / 255;
            int b = (255 * a + 127) / 255;
            out[i] = (a << 24) | (r << 16) | (g << 8) | b;
        }
    }

    /**
     * 对比度曲线：稀薄的密度直接当作"没有雾"，浓的留住。
     *
     * <p>不压这一下的话，雾会均匀地糊满整屏（像一层灰纱）；压过之后是
     * <b>一片片</b>的 —— 有的地方厚得看不见，有的地方还是透亮的，才像冬天玻璃。</p>
     */
    private static float contrast(float d) {
        final float lo = 0.18f;
        final float hi = 0.92f;
        if (d <= lo) {
            return 0f;
        }
        float t = (d - lo) / (hi - lo);
        if (t > 1f) {
            t = 1f;
        }
        return t * t * (3 - 2 * t);
    }

    // ── 值噪声 ──

    /**
     * 云絮状噪声：<b>横向压扁、纵向拉长</b>（y 的系数只有 x 的一半左右），
     * 这样雾团的形状是竖着的一条条，像玻璃上凝出来的水痕；
     * 高频那层同样做各向异性，避免出现方方正正的噪点。
     */
    private float wisps(double x, double y, long salt) {
        return valueNoise(x, y, salt) * 0.62f
                + valueNoise(x * 2.37 + 11.3, y * 2.37 + 7.1, salt + 31) * 0.20f
                + valueNoise(x * 4.10 + 5.5, y * 1.35 + 21.7, salt + 67) * 0.18f;
    }

    private float valueNoise(double x, double y, long salt) {
        int x0 = (int) Math.floor(x);
        int y0 = (int) Math.floor(y);
        double fx = x - x0;
        double fy = y - y0;
        double sx = fx * fx * (3 - 2 * fx);
        double sy = fy * fy * (3 - 2 * fy);
        float v00 = hash(x0, y0, salt);
        float v10 = hash(x0 + 1, y0, salt);
        float v01 = hash(x0, y0 + 1, salt);
        float v11 = hash(x0 + 1, y0 + 1, salt);
        float a = (float) (v00 + (v10 - v00) * sx);
        float b = (float) (v01 + (v11 - v01) * sx);
        return a + (b - a) * (float) sy;
    }

    private float hash(int x, int y, long salt) {
        long h = seed + salt;
        h ^= x * 0x9E3779B97F4A7C15L;
        h ^= y * 0xC2B2AE3D27D4EB4FL;
        h ^= (h >>> 29);
        h *= 0xBF58476D1CE4E5B9L;
        h ^= (h >>> 32);
        return (h >>> 40) / (float) (1L << 24);
    }
}
