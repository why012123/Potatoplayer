package com.potatomusic.superapp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One EQ setting: a drawn {@link EqCurve} plus preamp.
 *
 * <p>12 dB is unity because of VLC's 0.25 dry factor: the stored preamp uses the
 * same scale as libVLC so existing presets keep their loudness.</p>
 *
 * <p>{@link #bands} is a derived ten-slot view kept for backwards compatibility
 * (old eq.json files, the VLC-style slider UI and factory presets). Every write
 * path should go through {@link #setCurve(EqCurve)} so the legacy view follows
 * the curve.</p>
 */
public final class EqPreset {
    public static final int BANDS = 10;
    public static final float MIN_DB = -20f;
    public static final float MAX_DB = 20f;
    public static final float NEUTRAL_PREAMP = 12f;
    public static final float[] DEFAULT_FREQS = {
            31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f
    };

    public float preamp = NEUTRAL_PREAMP;
    /** Derived ten-slot view of {@link #curve}; refreshed by {@link #setCurve}. */
    public float[] bands = new float[BANDS];
    private EqCurve curve;

    public EqPreset() {
        setCurve(EqCurve.flat());
    }

    public EqPreset(float preamp, float[] source) {
        this.preamp = clamp(preamp);
        float[] legacy = new float[BANDS];
        if (source != null) {
            for (int i = 0; i < BANDS && i < source.length; i++) legacy[i] = clamp(source[i]);
        }
        setCurve(EqCurve.fromBands(legacy, defaultFrequencies()));
    }

    public EqPreset(float preamp, EqCurve curve) {
        this.preamp = clamp(preamp);
        setCurve(curve);
    }

    public EqPreset copy() {
        return new EqPreset(preamp, curve);
    }

    public EqCurve curve() {
        return curve;
    }

    public void setCurve(EqCurve next) {
        this.curve = next == null ? EqCurve.flat() : next;
        this.bands = this.curve.legacyBands();
    }

    public void setBand(int index, float value) {
        if (index < 0 || index >= BANDS) return;
        setCurve(curve.withPoint(DEFAULT_FREQS[index], value));
    }

    public void flat() {
        preamp = NEUTRAL_PREAMP;
        setCurve(EqCurve.flat());
    }

    public boolean sameAs(EqPreset other) {
        if (other == null || Math.abs(other.preamp - preamp) > 0.001f) return false;
        float[] mine = curve.sample(EqCurve.HQ_FREQS);
        float[] theirs = other.curve.sample(EqCurve.HQ_FREQS);
        for (int i = 0; i < mine.length; i++) {
            if (Math.abs(mine[i] - theirs[i]) > 0.001f) return false;
        }
        return true;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("preamp", preamp);
        map.put("bands", bands.clone());
        map.put("points", curve.toPointList());
        return map;
    }

    public static List<Float> defaultFrequencies() {
        List<Float> out = new ArrayList<>(DEFAULT_FREQS.length);
        for (float freq : DEFAULT_FREQS) out.add(freq);
        return out;
    }

    public static float clamp(float value) {
        if (Float.isNaN(value) || Float.isInfinite(value)) return 0f;
        return Math.max(MIN_DB, Math.min(MAX_DB, value));
    }

    public static String frequencyLabel(float hz) {
        if (hz >= 1000f) {
            float k = hz / 1000f;
            long rounded = Math.round(k);
            return (Math.abs(k - rounded) < 0.05f ? String.valueOf(rounded) : String.valueOf(k)) + "k";
        }
        return String.valueOf(Math.round(hz));
    }
}
