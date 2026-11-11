package com.potatomusic.superapp;

import java.util.LinkedHashMap;
import java.util.Map;

/** Ten VLC bands plus preamp. 12 dB is unity because of VLC's 0.25 dry factor. */
public final class EqPreset {
    public static final int BANDS = 10;
    public static final float MIN_DB = -20f;
    public static final float MAX_DB = 20f;
    public static final float NEUTRAL_PREAMP = 12f;
    public static final float[] DEFAULT_FREQS = {
            31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f
    };

    public float preamp = NEUTRAL_PREAMP;
    public float[] bands = new float[BANDS];

    public EqPreset() {
    }

    public EqPreset(float preamp, float[] source) {
        this.preamp = clamp(preamp);
        if (source != null) {
            for (int i = 0; i < BANDS && i < source.length; i++) bands[i] = clamp(source[i]);
        }
    }

    public EqPreset copy() {
        return new EqPreset(preamp, bands);
    }

    public void flat() {
        preamp = NEUTRAL_PREAMP;
        bands = new float[BANDS];
    }

    public boolean sameAs(EqPreset other) {
        if (other == null || Math.abs(other.preamp - preamp) > 0.001f) return false;
        for (int i = 0; i < BANDS; i++) {
            if (Math.abs(other.bands[i] - bands[i]) > 0.001f) return false;
        }
        return true;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("preamp", preamp);
        map.put("bands", bands.clone());
        return map;
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
