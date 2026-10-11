package com.potato.player.core;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 均衡器持久化（{@code PotatoLibrary/source/eq.json}）。
 *
 * <pre>
 * {
 *   "on": false,
 *   "global":  { "preamp": 0.0, "bands": [ 10 个数 ] },
 *   "presets": { "预设名": { "preamp": …, "bands": [ … ] } },
 *   "songs":   { "source/music/xxx.flac": { "nid": "435278010", "preamp": …, "bands": [ … ] } }
 * }
 * </pre>
 *
 * <p>歌曲匹配采用「相对路径 + 云 ID」双校验：优先按相对路径命中，
 * 没有则按网易云 ID 命中，都没有则视为跟随全局预设。保存时两者都写入。</p>
 */
public class EqStore {

    /** 单曲预设记录：网易云 ID + 参数。 */
    public static class SongEq {
        public String nid = "";
        public EqPreset preset = new EqPreset();
    }

    private boolean on;
    private EqPreset global = new EqPreset();
    /** 用户命名预设。 */
    private final Map<String, EqPreset> presets = new LinkedHashMap<>();
    /** 单曲预设：相对路径 → 记录。 */
    private final Map<String, SongEq> songs = new LinkedHashMap<>();

    /** 当前数据格式版本；1 → 2 的差异是「前级 0 还是 12 才算中性」。 */
    public static final int FORMAT_VERSION = 2;

    public static EqStore load() {
        EqStore s = new EqStore();
        JsonNode root = JsonStore.loadNode(Paths.EQ_FILE, null);
        if (root == null || !root.isObject()) {
            return s;
        }
        // v1 把前级 0 当"不改变音量"，但 VLC 里前级 0 其实是 −12 dB（见 EqPreset 注释），
        // 因此旧数据整体补上中性偏移，避免升级后突然变小声。
        boolean migrate = root.path("version").asInt(1) < FORMAT_VERSION;
        s.on = root.path("on").asBoolean(false);
        s.global = presetOf(root.get("global"));
        if (migrate) {
            migratePreamp(s.global);
        }
        JsonNode ps = root.get("presets");
        if (ps != null && ps.isObject()) {
            ps.fields().forEachRemaining(e -> {
                EqPreset p = presetOf(e.getValue());
                if (migrate) {
                    migratePreamp(p);
                }
                s.presets.put(e.getKey(), p);
            });
        }
        JsonNode ss = root.get("songs");
        if (ss != null && ss.isObject()) {
            ss.fields().forEachRemaining(e -> {
                SongEq q = new SongEq();
                q.nid = e.getValue().path("nid").asText("");
                q.preset = presetOf(e.getValue());
                if (migrate) {
                    migratePreamp(q.preset);
                }
                s.songs.put(e.getKey(), q);
            });
        }
        return s;
    }

    private static void migratePreamp(EqPreset p) {
        p.setPreamp(p.preamp() + EqPreset.NEUTRAL_PREAMP);
    }

    /**
     * 读取 JSON 中的预设。
     *
     * <p>缺失 {@code preamp} 键时用<b>中性前级</b>（12 dB）而不是 0——
     * 0 在 VLC 里等于整体 −12 dB。</p>
     */
    private static EqPreset presetOf(JsonNode n) {
        EqPreset p = new EqPreset();
        if (n == null || !n.isObject()) {
            return p;
        }
        JsonNode bands = n.get("bands");
        if (bands != null && bands.isArray()) {
            for (int i = 0; i < EqPreset.BANDS && i < bands.size(); i++) {
                p.setBand(i, (float) bands.get(i).asDouble(0));
            }
        }
        if (n.has("preamp")) {
            p.setPreamp((float) n.path("preamp").asDouble(EqPreset.NEUTRAL_PREAMP));
        }
        return p;
    }

    public void save() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", FORMAT_VERSION);
        root.put("on", on);
        root.put("global", global.toMap());
        Map<String, Object> ps = new LinkedHashMap<>();
        presets.forEach((k, v) -> ps.put(k, v.toMap()));
        root.put("presets", ps);
        Map<String, Object> ss = new LinkedHashMap<>();
        songs.forEach((k, v) -> {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("nid", v.nid == null ? "" : v.nid);
            e.put("preamp", (double) v.preset.preamp());
            e.put("bands", v.preset.toMap().get("bands"));
            ss.put(k, e);
        });
        root.put("songs", ss);
        JsonStore.save(Paths.EQ_FILE, root);
    }

    // ── 全局开关 / 全局预设 ──

    public boolean on() {
        return on;
    }

    public void setOn(boolean on) {
        this.on = on;
    }

    public EqPreset global() {
        return global;
    }

    public void setGlobal(EqPreset p) {
        if (p != null) {
            global = p.copy();
        }
    }

    // ── 命名预设 ──

    public List<String> presetNames() {
        return List.copyOf(presets.keySet());
    }

    public EqPreset preset(String name) {
        EqPreset p = presets.get(name);
        return p == null ? null : p.copy();
    }

    public void putPreset(String name, EqPreset p) {
        if (name != null && !name.isBlank() && p != null) {
            presets.put(name.trim(), p.copy());
        }
    }

    public void removePreset(String name) {
        presets.remove(name);
    }

    // ── 单曲预设 ──

    /** 命中单曲预设记录（先相对路径、后云 ID）；没有返回 null。 */
    public SongEq songEntry(String absPath, String nid) {
        SongEq q = songs.get(relPath(absPath));
        if (q != null) {
            return q;
        }
        if (nid != null && !nid.isBlank()) {
            for (SongEq e : songs.values()) {
                if (nid.equals(e.nid)) {
                    return e;
                }
            }
        }
        return null;
    }

    /** 该曲目的独立预设；返回 null 表示跟随全局。 */
    public EqPreset forSong(String absPath, String nid) {
        SongEq q = songEntry(absPath, nid);
        return q == null ? null : q.preset.copy();
    }

    /** 保存单曲预设：相对路径为键，同时写入云 ID。 */
    public void saveSong(String absPath, String nid, EqPreset preset) {
        if (absPath == null || preset == null) {
            return;
        }
        String rel = relPath(absPath);
        SongEq q = songs.computeIfAbsent(rel, k -> new SongEq());
        q.preset = preset.copy();
        if (nid != null && !nid.isBlank()) {
            q.nid = nid;
            // 同一首歌换过路径时，去掉残留的旧路径记录，避免双份
            songs.values().removeIf(other -> other != q && nid.equals(other.nid));
        }
    }

    public void removeSong(String absPath) {
        songs.remove(relPath(absPath));
    }

    /** 已保存单曲预设的数量（用于界面提示）。 */
    public int songCount() {
        return songs.size();
    }

    /** 绝对路径 → 相对 PotatoLibrary 的路径，统一用正斜杠。 */
    public static String relPath(String absPath) {
        if (absPath == null || absPath.isBlank()) {
            return "";
        }
        String base = new File(Paths.BASE_DIR).getAbsolutePath();
        String abs = new File(absPath).getAbsolutePath();
        if (abs.equals(base)) {
            return "";
        }
        if (abs.startsWith(base + File.separator)) {
            abs = abs.substring(base.length() + 1);
        }
        return abs.replace(File.separatorChar, '/');
    }
}
