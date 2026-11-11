package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Global EQ, named presets and per-song presets.
 *
 * <p>The old Java player kept this state in {@code PotatoLibrary/source/eq.json}.
 * That file (or the newer app-data file) is loaded and migrated here. Per-song
 * records are keyed by a path relative to the library base and also remember the
 * NetEase/QQ id, so a moved music folder can still recover the preset.</p>
 */
public final class EqStore {
    public static final int FORMAT_VERSION = 2;

    public static final class SongEq {
        public String nid = "";
        public EqPreset preset = new EqPreset();

        public SongEq copy() {
            SongEq copy = new SongEq();
            copy.nid = nid;
            copy.preset = preset.copy();
            return copy;
        }
    }

    public boolean on;
    public EqPreset global = new EqPreset();
    public Map<String, EqPreset> presets = new LinkedHashMap<>();
    public Map<String, SongEq> songs = new LinkedHashMap<>();
    /** True once the old Java file has been imported, so deletions stay deleted. */
    public boolean legacyMerged;
    private transient Path libraryRoot;

    public static EqStore load(Path file, Path legacyFile, Path libraryRoot) {
        EqStore store = new EqStore();
        store.libraryRoot = libraryRoot;
        if (file != null && Files.isRegularFile(file)) {
            try {
                store.parse(Json.MAPPER.readTree(Files.readString(file)));
            } catch (Exception e) {
                System.err.println("[eq] unable to read " + file + ": " + e.getMessage());
            }
        }
        if (!store.legacyMerged && legacyFile != null && Files.isRegularFile(legacyFile)) {
            try {
                EqStore legacy = new EqStore();
                legacy.libraryRoot = libraryRoot;
                legacy.parse(Json.MAPPER.readTree(Files.readString(legacyFile)));
                store.mergeLegacy(legacy);
                store.legacyMerged = true;
            } catch (Exception e) {
                System.err.println("[eq] unable to import " + legacyFile + ": " + e.getMessage());
            }
        }
        return store;
    }

    public void setLibraryRoot(Path root) {
        this.libraryRoot = root;
    }

    public List<String> presetNames() {
        return List.copyOf(presets.keySet());
    }

    public EqPreset preset(String name) {
        EqPreset preset = name == null ? null : presets.get(name);
        return preset == null ? null : preset.copy();
    }

    public void putPreset(String name, EqPreset preset) {
        if (name == null || name.isBlank() || preset == null) return;
        String clean = name.trim();
        presets.put(clean, preset.copy());
    }

    public void removePreset(String name) {
        if (name != null) presets.remove(name);
    }

    public SongEq songEntry(String absolutePath, String nid) {
        String rel = relPath(absolutePath);
        SongEq direct = songs.get(rel);
        if (direct != null) return direct;
        if (nid != null && !nid.isBlank()) {
            for (SongEq entry : songs.values()) {
                if (nid.equals(entry.nid)) return entry;
            }
        }
        return null;
    }

    public EqPreset forSong(String absolutePath, String nid) {
        SongEq entry = songEntry(absolutePath, nid);
        return entry == null ? null : entry.preset.copy();
    }

    /** The saved preset that should be active for a path, falling back to global. */
    public EqPreset effectiveFor(String absolutePath, String nid) {
        EqPreset song = forSong(absolutePath, nid);
        return song == null ? global.copy() : song;
    }

    public void saveSong(String absolutePath, String nid, EqPreset preset) {
        if (absolutePath == null || preset == null) return;
        String rel = relPath(absolutePath);
        SongEq entry = songs.computeIfAbsent(rel, ignored -> new SongEq());
        entry.preset = preset.copy();
        if (nid != null && !nid.isBlank()) {
            entry.nid = nid;
            songs.values().removeIf(other -> other != entry && nid.equals(other.nid));
        }
    }

    public int songCount() {
        return songs.size();
    }

    public Path libraryRoot() {
        return libraryRoot;
    }

    public void save(Path file) throws IOException {
        Files.createDirectories(file.getParent());
        ObjectNode root = Json.MAPPER.createObjectNode();
        root.put("version", FORMAT_VERSION);
        root.put("legacyMerged", legacyMerged);
        root.put("on", on);
        root.set("global", presetNode(global));
        ObjectNode presetNode = root.putObject("presets");
        for (Map.Entry<String, EqPreset> entry : presets.entrySet()) presetNode.set(entry.getKey(), presetNode(entry.getValue()));
        ObjectNode songNode = root.putObject("songs");
        for (Map.Entry<String, SongEq> entry : songs.entrySet()) {
            ObjectNode item = songNode.putObject(entry.getKey());
            item.put("nid", entry.getValue().nid == null ? "" : entry.getValue().nid);
            item.put("preamp", entry.getValue().preset.preamp);
            ArrayNode bands = item.putArray("bands");
            for (float band : entry.getValue().preset.bands) bands.add(band);
        }
        Json.writeAtomic(file, root);
    }

    private ObjectNode presetNode(EqPreset preset) {
        ObjectNode node = Json.MAPPER.createObjectNode();
        node.put("preamp", preset.preamp);
        ArrayNode bands = node.putArray("bands");
        for (float band : preset.bands) bands.add(band);
        return node;
    }

    private void parse(JsonNode root) {
        if (root == null || !root.isObject()) return;
        boolean legacyShape = root.has("global") || root.has("songs") || root.has("on");
        // The previous Super format (enabled/preamp/bands, no version) already
        // stores the absolute neutral preamp (12 dB). Only the old Java file's
        // missing version means the legacy relative 0 dB preamp.
        int version = legacyShape ? root.path("version").asInt(1) : 2;
        legacyMerged = root.path("legacyMerged").asBoolean(false);
        if (legacyShape) {
            on = root.path("on").asBoolean(false);
            global = presetOf(root.get("global"), version);
            JsonNode ps = root.get("presets");
            if (ps != null && ps.isObject()) {
                ps.fields().forEachRemaining(entry -> presets.put(entry.getKey(), presetOf(entry.getValue(), version)));
            }
            JsonNode ss = root.get("songs");
            if (ss != null && ss.isObject()) {
                ss.fields().forEachRemaining(entry -> {
                    SongEq song = new SongEq();
                    song.nid = entry.getValue().path("nid").asText("");
                    song.preset = presetOf(entry.getValue(), version);
                    songs.put(entry.getKey(), song);
                });
            }
        } else {
            // Newer Super format: enabled + flat top-level preamp/bands.
            on = root.path("enabled").asBoolean(root.path("on").asBoolean(false));
            global = presetOf(root, version);
            JsonNode ps = root.get("presets");
            if (ps != null && ps.isObject()) {
                ps.fields().forEachRemaining(entry -> {
                    if (entry.getValue().isObject()) presets.put(entry.getKey(), presetOf(entry.getValue(), version));
                });
            }
        }
    }

    private void mergeLegacy(EqStore legacy) {
        if (legacy == null) return;
        if (!on) on = legacy.on;
        if (presets.isEmpty()) presets.putAll(legacy.presets);
        else legacy.presets.forEach(presets::putIfAbsent);
        legacy.songs.forEach(songs::putIfAbsent);
        // Only replace an untouched flat/default global with the legacy global.
        boolean emptyGlobal = true;
        for (float band : global.bands) if (Math.abs(band) > 0.001f) { emptyGlobal = false; break; }
        if (emptyGlobal && Math.abs(global.preamp - EqPreset.NEUTRAL_PREAMP) < 0.01f) {
            global = legacy.global.copy();
        }
    }

    private static EqPreset presetOf(JsonNode node, int version) {
        EqPreset preset = new EqPreset();
        if (node == null || !node.isObject()) return preset;
        JsonNode bands = node.get("bands");
        if (bands != null && bands.isArray()) {
            for (int i = 0; i < EqPreset.BANDS && i < bands.size(); i++) {
                preset.bands[i] = EqPreset.clamp((float) bands.get(i).asDouble(0));
            }
        }
        if (node.has("preamp")) preset.preamp = EqPreset.clamp((float) node.path("preamp").asDouble(EqPreset.NEUTRAL_PREAMP));
        if (version < FORMAT_VERSION) preset.preamp = EqPreset.clamp(preset.preamp + EqPreset.NEUTRAL_PREAMP);
        return preset;
    }

    public String relPath(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) return "";
        try {
            Path abs = Path.of(absolutePath).toAbsolutePath().normalize();
            Path base = libraryRoot;
            if (base != null) {
                base = base.toAbsolutePath().normalize();
                Path parent = base.getParent();
                if (parent != null && parent.getParent() != null) base = parent.getParent();
                if (abs.startsWith(base)) {
                    return base.relativize(abs).toString().replace('\\', '/');
                }
            }
            return abs.toString().replace('\\', '/');
        } catch (Exception e) {
            return absolutePath.replace('\\', '/');
        }
    }
}
