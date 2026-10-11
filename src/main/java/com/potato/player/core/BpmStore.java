package com.potato.player.core;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * BPM 持久化（{@code PotatoLibrary/source/bpm.json}）。
 *
 * <pre>
 * { "version": 1,
 *   "entries": { "source/music/xxx.flac": {
 *       "bpm": 128.3, "confidence": 0.71, "manual": false,
 *       "beat": 468.75,          // 精确拍长（毫秒，网格拟合得出；没有则缺省）
 *       "offset": 250.4,         // 第一拍位置（毫秒，0 ~ beat；没有则缺省）
 *       "phaseConf": 0.83        // 网格置信度
 *   } } }
 * </pre>
 *
 * <p>{@code beat} / {@code offset} 是「卡点网格」：只有 bpm 的话，拍点位置等于假设
 * "第一拍正好在 0:00.000"，而真实歌曲前奏长度任意 —— 于是动图只能做到速度对、踩不到拍。
 * 这两个字段由 {@link BpmAnalyzer#measureGrid} 从音频里拟合出来（见 CHANGELOG 2.1.5）。</p>
 *
 * <p>分析一首歌要起一个 VLC 进程（约 0.5~1 秒），所以结果必须缓存。
 * {@code manual=true} 表示用户在歌曲编辑里手改过，批量扫描会跳过这些条目，
 * 不覆盖人工结果。</p>
 */
public class BpmStore {

    public static final int FORMAT_VERSION = 1;

    /**
     * 低于这个置信度就在界面上提示「节奏较模糊」供人工核对。
     * 阈值按实测分布定：305 首里 &lt;0.2 有 74 首、0.2~0.35 有 82 首、
     * 0.35~0.5 有 70 首、≥0.5 有 79 首；取 0.3 大约标出 40%，
     * 再高（比如 0.5）会把 74% 的歌都标上，等于没标。
     */
    public static final double LOW_CONFIDENCE = 0.3;

    /** 一条 BPM 记录。 */
    public static class Entry {
        public double bpm;
        public double confidence;
        public boolean manual;
        /** 精确拍长（毫秒）；≤0 = 没拟合过。 */
        public double beatMs = -1;
        /** 第一拍位置（毫秒，0 ~ beatMs）；<0 = 没拟合过。 */
        public double offsetMs = -1;
        /** 网格置信度（0~1）。 */
        public double phaseConfidence;

        /** 是否已经有可用的卡点网格。 */
        public boolean hasGrid() {
            return beatMs > 0 && offsetMs >= 0;
        }

        public Entry copy() {
            Entry e = new Entry();
            e.bpm = bpm;
            e.confidence = confidence;
            e.manual = manual;
            e.beatMs = beatMs;
            e.offsetMs = offsetMs;
            e.phaseConfidence = phaseConfidence;
            return e;
        }
    }

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    public static BpmStore load() {
        BpmStore s = new BpmStore();
        JsonNode root = JsonStore.loadNode(Paths.BPM_FILE, null);
        if (root == null || !root.isObject()) {
            return s;
        }
        JsonNode es = root.get("entries");
        if (es != null && es.isObject()) {
            es.fields().forEachRemaining(e -> {
                JsonNode v = e.getValue();
                Entry en = new Entry();
                en.bpm = v.path("bpm").asDouble(0);
                en.confidence = v.path("confidence").asDouble(0);
                en.manual = v.path("manual").asBoolean(false);
                en.beatMs = v.path("beat").asDouble(-1);
                en.offsetMs = v.path("offset").asDouble(-1);
                en.phaseConfidence = v.path("phaseConf").asDouble(0);
                if (en.bpm > 0) {
                    s.entries.put(e.getKey(), en);
                }
            });
        }
        return s;
    }

    public synchronized void save() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", FORMAT_VERSION);
        Map<String, Object> es = new LinkedHashMap<>();
        entries.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(e -> {
                    Map<String, Object> v = new LinkedHashMap<>();
                    v.put("bpm", Math.round(e.getValue().bpm * 10) / 10.0);
                    v.put("confidence", Math.round(e.getValue().confidence * 1000) / 1000.0);
                    v.put("manual", e.getValue().manual);
                    if (e.getValue().hasGrid()) {
                        v.put("beat", Math.round(e.getValue().beatMs * 1000) / 1000.0);
                        v.put("offset", Math.round(e.getValue().offsetMs * 100) / 100.0);
                        v.put("phaseConf", Math.round(e.getValue().phaseConfidence * 1000) / 1000.0);
                    }
                    es.put(e.getKey(), v);
                });
        root.put("entries", es);
        JsonStore.save(Paths.BPM_FILE, root);
    }

    /** 读取一条记录（返回副本，可跨线程使用）；没有返回 null。 */
    public Entry get(String absPath) {
        Entry e = entries.get(rel(absPath));
        return e == null ? null : e.copy();
    }

    public boolean has(String absPath) {
        return entries.containsKey(rel(absPath));
    }

    public double bpmOf(String absPath) {
        Entry e = entries.get(rel(absPath));
        return e == null ? 0 : e.bpm;
    }

    /**
     * 拍长（毫秒）：优先用拟合出的精确值，没有就退回 {@code 60000/bpm}（0 = 没数据）。
     *
     * <p>为什么不直接用 {@code 60000/bpm}：bpm 只有一个有效小数（±0.05 BPM ≈ 0.04%），
     * 几百拍之后就是几十上百毫秒的偏差，动图会越走越偏。</p>
     */
    public double beatMsOf(String absPath) {
        Entry e = entries.get(rel(absPath));
        if (e == null || e.bpm <= 0) {
            return 0;
        }
        return e.beatMs > 0 ? e.beatMs : 60000.0 / e.bpm;
    }

    /** 第一拍位置（毫秒）；没有网格返回 −1。 */
    public double offsetOf(String absPath) {
        Entry e = entries.get(rel(absPath));
        return e == null ? -1 : e.offsetMs;
    }

    /**
     * 写入 BPM（<b>拍点网格作废</b>）。
     *
     * <p>网格是按旧的节拍拟合出来的，BPM 一变，网格的相位/拍长就都不成立了，
     * 所以这里只留 bpm；网格由 {@link #updateGrid} 或下一次扫描重新拟合。</p>
     */
    public void put(String absPath, double bpm, double confidence, boolean manual) {
        put(absPath, bpm, confidence, manual, -1, -1, 0);
    }

    /** 写入 BPM + 拍点网格（一次扫描同时得到两者时用）。 */
    public void put(String absPath, double bpm, double confidence, boolean manual,
                    double beatMs, double offsetMs, double phaseConfidence) {
        if (absPath == null || bpm <= 0) {
            return;
        }
        Entry e = new Entry();
        e.bpm = bpm;
        e.confidence = confidence;
        e.manual = manual;
        setGrid(e, beatMs, offsetMs, phaseConfidence);
        entries.put(rel(absPath), e);
    }

    /**
     * 只更新拍点网格，<b>不动 bpm / confidence / manual</b>。
     * 手动改过 BPM 的歌也能安全地补网格。
     */
    public void updateGrid(String absPath, double beatMs, double offsetMs, double phaseConfidence) {
        Entry e = entries.get(rel(absPath));
        if (e == null || beatMs <= 0 || offsetMs < 0) {
            return;
        }
        synchronized (this) {
            setGrid(e, beatMs, offsetMs, phaseConfidence);
        }
    }

    private static void setGrid(Entry e, double beatMs, double offsetMs, double conf) {
        if (beatMs > 0 && offsetMs >= 0) {
            e.beatMs = beatMs;
            e.offsetMs = offsetMs;
            e.phaseConfidence = conf;
        } else {
            e.beatMs = -1;
            e.offsetMs = -1;
            e.phaseConfidence = 0;
        }
    }

    public void remove(String absPath) {
        entries.remove(rel(absPath));
    }

    public int size() {
        return entries.size();
    }

    /** 已经有拍点网格的歌曲数（任务面板统计用）。 */
    public int gridCount() {
        int n = 0;
        for (Entry e : entries.values()) {
            if (e.hasGrid()) {
                n++;
            }
        }
        return n;
    }

    /** 与均衡器共用同一套相对路径规则（同一个资源库基准）。 */
    public static String rel(String absPath) {
        return EqStore.relPath(absPath);
    }
}
