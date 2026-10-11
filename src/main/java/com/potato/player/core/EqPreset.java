package com.potato.player.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 均衡器参数：10 段增益 + 前级（对应 VLC 的 libvlc_equalizer_t）。
 *
 * <p>VLC 每段取值范围为 -20 ~ +20 dB，超出会被 libvlc 拒绝，
 * 因此这里统一做钳制。</p>
 */
public class EqPreset {

    /** VLC 均衡器的频段数（libvlc_audio_equalizer_get_band_count）。 */
    public static final int BANDS = 10;
    /** 每段增益 / 前级的取值范围（dB）。 */
    public static final float MIN_DB = -20f;
    public static final float MAX_DB = 20f;
    /**
     * <b>中性前级值 = 12 dB</b>（精确值 {@code 20*log10(4) ≈ 12.041}，与 VLC
     * 自带的 Flat 预设一致）。
     *
     * <p>VLC 均衡器滤波器（{@code modules/audio_filter/equalizer.c}）的输出是：</p>
     * <pre>
     *   #define EQZ_IN_FACTOR 0.25f
     *   amp = EQZ_IN_FACTOR * (10^(db/20) - 1)     // 每段系数
     *   out = f_gamp * (EQZ_IN_FACTOR * x + Σ amp_i * iir_i(x))
     * </pre>
     * <p>干信号被乘了 {@code 0.25}（−12.04 dB），必须由前级补回来：
     * {@code f_gamp = 10^(preamp/20) = 4} 才是 unity。所以 <b>前级 0 dB 会让整体
     * 小声 12 dB</b>（实测 RMS 比值正好 0.2500），而 12 dB 时实测 0.9953（−0.04 dB，
     * 听不出来）。这也解释了为什么 VLC 模块选项 {@code equalizer-preamp} 的默认值是
     * 12.0。</p>
     */
    public static final float NEUTRAL_PREAMP = 12.0f;
    /**
     * 默认频点。实测本机 VLC 3.0.23 返回 ISO 倍频程
     * （equalizer-vlcfreqs 默认为 true），运行时以 VLC 返回值为准。
     */
    public static final float[] DEFAULT_FREQS = {
            31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f
    };

    private final float[] bands = new float[BANDS];
    /** 前级；默认中性值，不是 0。 */
    private float preamp = NEUTRAL_PREAMP;

    public EqPreset() {
    }

    public EqPreset(float[] src, float preamp) {
        set(src, preamp);
    }

    public final void set(float[] src, float preamp) {
        for (int i = 0; i < BANDS; i++) {
            bands[i] = clamp(src != null && i < src.length ? src[i] : 0f);
        }
        this.preamp = clamp(preamp);
    }

    public void setBand(int i, float db) {
        if (i >= 0 && i < BANDS) {
            bands[i] = clamp(db);
        }
    }

    public float band(int i) {
        return (i >= 0 && i < BANDS) ? bands[i] : 0f;
    }

    public float[] bands() {
        return bands.clone();
    }

    public float preamp() {
        return preamp;
    }

    public void setPreamp(float db) {
        preamp = clamp(db);
    }

    /** 全部归零（拉平）——前级回到中性值，而不是 0。 */
    public void flat() {
        for (int i = 0; i < BANDS; i++) {
            bands[i] = 0f;
        }
        preamp = NEUTRAL_PREAMP;
    }

    /** 前级是否处于中性（不改音量）。 */
    public boolean neutralPreamp() {
        return Math.abs(preamp - NEUTRAL_PREAMP) < 0.05f;
    }

    public EqPreset copy() {
        return new EqPreset(bands, preamp);
    }

    /** 参数是否一致（用于「未保存改动」判断）。 */
    public boolean sameAs(EqPreset o) {
        if (o == null || Math.abs(o.preamp - preamp) > 0.001f) {
            return false;
        }
        for (int i = 0; i < BANDS; i++) {
            if (Math.abs(o.bands[i] - bands[i]) > 0.001f) {
                return false;
            }
        }
        return true;
    }

    public static float clamp(float db) {
        if (Float.isNaN(db)) {
            return 0f;
        }
        return Math.max(MIN_DB, Math.min(MAX_DB, db));
    }

    /**
     * 频点标签：31 / 63 / 125 / 250 / 500 / 1k / 2k / 4k / 8k / 16k
     * （ISO 倍频程标称值；实际中心频率是 31.25 / 62.5 …）。
     */
    public static String freqLabel(float hz) {
        if (hz >= 1000f) {
            float k = hz / 1000f;
            long rounded = Math.round(k);
            return (Math.abs(k - rounded) < 0.05f ? String.valueOf(rounded) : String.valueOf(k)) + "k";
        }
        return String.valueOf(Math.round(hz));
    }

    /** 序列化为 JSON 结构。 */
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        List<Double> list = new ArrayList<>(BANDS);
        for (float b : bands) {
            list.add((double) b);
        }
        m.put("preamp", (double) preamp);
        m.put("bands", list);
        return m;
    }
}
