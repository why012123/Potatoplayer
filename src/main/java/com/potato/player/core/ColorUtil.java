package com.potato.player.core;

/**
 * 颜色工具（对应 backend.py 的 score_to_color 等）。
 */
public final class ColorUtil {

    private ColorUtil() {
    }

    /** 0..10 评分映射到 琥珀→绿 渐变色。 */
    public static String scoreToColor(double score) {
        double t;
        try {
            t = Math.max(0.0, Math.min(10.0, score)) / 10.0;
        } catch (Exception e) {
            t = 0.0;
        }
        int r0 = 245, g0 = 158, b0 = 11;
        int r1 = 34, g1 = 197, b1 = 94;
        int r = (int) Math.round(r0 + (r1 - r0) * t);
        int g = (int) Math.round(g0 + (g1 - g0) * t);
        int b = (int) Math.round(b0 + (b1 - b0) * t);
        return String.format("#%02x%02x%02x", r, g, b);
    }
}
