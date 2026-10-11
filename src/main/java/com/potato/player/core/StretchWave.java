package com.potato.player.core;

/**
 * 伸缩动画的波形：<b>一条纯净的正弦，仅此而已</b>。
 *
 * <p>设图高为 {@code l}（有内容部分的高度）、图宽为 {@code w}，周期为 {@code T} 秒，
 * 纵向振幅为 {@code Ay}、横向收放为 {@code Ax}：</p>
 *
 * <pre>
 * s(t) = −sin(2π · t / T)            // 同一个相位，+1 = 拉到最高
 * 高: scaleY = 1 + Ay · s(t)
 * 宽: scaleX = 1 − Ax · s(t)         // 伸长时收窄、压缩时加宽
 *
 *  1+Ay ┤        ╭──╮              ╭──╮            拉到最高（并收窄）
 *       │      ╱      ╲          ╱      ╲
 *  1    ┼────╯          ╰──────╯          ╰────
 *       │  ╱                ╲  ╱                ╲
 *  1−Ay ┤╯                    ╰                   ╰   压到最矮（并加宽）
 *       0        T/2         T       3T/2       2T   （t）
 * </pre>
 *
 * <p>也就是说：从原尺寸开始，先压矮变宽、再拉高变窄、回到原尺寸，之后每 {@code T} 秒原样重复。
 * 纯正弦意味着处处连续、处处可导，没有任何跳变，没有衰减、没有触发、没有叠加效果。</p>
 */
public final class StretchWave {

    private StretchWave() {
    }

    /**
     * 相位波形值：纵向与横向共用这一个数。
     *
     * @param tMs       动画已经走过的时间（毫秒），只增不减
     * @param periodSec 一个完整循环的时长 T（秒）
     * @return {@code −sin(2πt/T)} ∈ [−1, 1]；{@code +1} = 拉到最高（伸长），
     *         {@code −1} = 压到最矮（压缩）；相位 0（起点与每个周期交界）恰好是 0
     */
    public static double wave(double tMs, double periodSec) {
        if (periodSec <= 0 || tMs <= 0) {
            return 0;
        }
        double periodMs = periodSec * 1000.0;
        double phase = (tMs % periodMs) / periodMs;   // 0 ~ 1，只用于避免参数无限增大
        return -Math.sin(2 * Math.PI * phase);
    }

    /**
     * 纵向系数：{@code 1 + Ay·s}。
     *
     * @return 1 → 1−Ay（压矮）→ 1 → 1+Ay（拉高）→ 1
     */
    public static double scaleY(double tMs, double periodSec, double ampY) {
        return 1 + ampY * wave(tMs, periodSec);
    }

    /**
     * 横向系数：{@code 1 − Ax·s}，与纵向<b>反相</b> —— 伸长时收窄、压缩时加宽。
     *
     * @return 1 → 1+Ax（压矮时最宽）→ 1 → 1−Ax（拉高时最窄）→ 1
     */
    public static double scaleX(double tMs, double periodSec, double ampX) {
        return 1 - ampX * wave(tMs, periodSec);
    }
}
