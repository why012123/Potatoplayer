package com.potatomusic.superapp;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Persistent global equalizer: ten VLC bands plus preamp and named user presets.
 * Band values are in dB, clamped to the range accepted by libVLC.
 */
public final class EqStore {
    public static final int BANDS = 10;
    public static final float MIN_DB = -20f;
    public static final float MAX_DB = 20f;
    /** VLC's filter is 12 dB down at preamp 0; 12 dB is unity. */
    public static final float NEUTRAL_PREAMP = 12f;

    public static final class Preset {
        public String name;
        public float preamp = NEUTRAL_PREAMP;
        public float[] bands = new float[BANDS];

        public Preset copy() {
            Preset preset = new Preset();
            preset.name = name;
            preset.preamp = preamp;
            preset.bands = bands.clone();
            return preset;
        }
    }

    public boolean enabled;
    public float preamp = NEUTRAL_PREAMP;
    public float[] bands = new float[BANDS];
    public Map<String, Preset> presets = new LinkedHashMap<>();

    public static EqStore load(Path file) {
        EqStore store = new EqStore();
        if (file == null || !Files.isRegularFile(file)) {
            return store;
        }
        try {
            EqStore loaded = Json.read(Files.readString(file), EqStore.class);
            store.enabled = loaded.enabled;
            store.preamp = clamp(Float.isFinite(loaded.preamp) ? loaded.preamp : NEUTRAL_PREAMP);
            store.bands = normalizeBands(loaded.bands);
            if (loaded.presets != null) {
                for (Map.Entry<String, Preset> entry : loaded.presets.entrySet()) {
                    Preset preset = entry.getValue();
                    if (preset == null || entry.getKey() == null || entry.getKey().isBlank()) continue;
                    preset.name = entry.getKey().trim();
                    preset.bands = normalizeBands(preset.bands);
                    preset.preamp = clamp(Float.isFinite(preset.preamp) ? preset.preamp : NEUTRAL_PREAMP);
                    store.presets.put(preset.name, preset);
                }
            }
        } catch (Exception e) {
            System.err.println("[eq] unable to read eq.json: " + e.getMessage());
        }
        return store;
    }

    public void save(Path file) throws IOException {
        Files.createDirectories(file.getParent());
        Json.writeAtomic(file, this);
    }

    public void setBand(int index, float db) {
        if (index < 0 || index >= BANDS) {
            throw new IllegalArgumentException("Invalid EQ band.");
        }
        bands[index] = clamp(db);
    }

    public void setPreamp(float value) {
        preamp = clamp(value);
    }

    public void reset() {
        bands = new float[BANDS];
        preamp = NEUTRAL_PREAMP;
    }

    public void savePreset(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty()) throw new IllegalArgumentException("Preset name cannot be empty.");
        if (clean.length() > 48) clean = clean.substring(0, 48);
        Preset preset = new Preset();
        preset.name = clean;
        preset.preamp = preamp;
        preset.bands = bands.clone();
        presets.put(clean, preset);
    }

    public void deletePreset(String name) {
        if (name != null) presets.remove(name);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("enabled", enabled);
        map.put("preamp", preamp);
        map.put("bands", bands);
        map.put("presets", presets.values().stream().map(EqStore::presetMap).toList());
        return map;
    }

    private static Map<String, Object> presetMap(Preset preset) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", preset.name);
        map.put("preamp", preset.preamp);
        map.put("bands", preset.bands);
        return map;
    }

    private static float[] normalizeBands(float[] input) {
        float[] normalized = new float[BANDS];
        if (input != null) {
            for (int i = 0; i < BANDS && i < input.length; i++) {
                normalized[i] = clamp(input[i]);
            }
        }
        return normalized;
    }

    public static float clamp(float db) {
        if (Float.isNaN(db) || Float.isInfinite(db)) return 0f;
        return Math.max(MIN_DB, Math.min(MAX_DB, db));
    }
}
