package com.potatomusic.superapp;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Metadata for songs downloaded from NetEase. The audio file stays a normal
 * local file; this sidecar lets the scanner attach the original cover, album
 * and identity to it without rewriting the file's tags.
 *
 * <p>Older Potatoplayer builds stored a plain {path: NetEase id} map inside the
 * library's source folder. The new sidecar is richer, so a one-time migration
 * reads that file after loading the current map. A marker prevents the legacy
 * file from resurrecting bindings the user later removes.</p>
 */
public final class NeteaseBindings {
    public static final class Binding {
        public String neteaseId;
        public String path;
        public String title;
        public String artist;
        public String album;
        public String coverPath;
        public String quality;
        public long downloadedAt;
    }

    private static final String LEGACY_MARKER = "legacy_netease_bindings.imported";

    private final Path file;
    private final Path legacyFile;
    private final Path legacyMarker;
    private final Map<String, Binding> byPath = new LinkedHashMap<>();

    public NeteaseBindings(Path dataDir) {
        this(dataDir, null);
    }

    public NeteaseBindings(Path dataDir, Path legacyFile) {
        this.file = dataDir.resolve("netease_bindings.json");
        this.legacyFile = legacyFile == null ? null : legacyFile.toAbsolutePath().normalize();
        this.legacyMarker = dataDir.resolve(LEGACY_MARKER);
        load();
        importLegacyOnce();
    }

    public synchronized List<Binding> all() {
        return new ArrayList<>(byPath.values());
    }

    public synchronized Binding find(String path) {
        return byPath.get(normalize(path));
    }

    public synchronized Binding findByNeteaseId(String id) {
        if (id == null) return null;
        for (Binding binding : byPath.values()) {
            if (id.equals(binding.neteaseId) && Files.isRegularFile(Path.of(binding.path))) {
                return binding;
            }
        }
        return null;
    }

    public synchronized void remove(String path) {
        if (path == null) return;
        if (byPath.remove(normalize(path)) != null) save();
    }

    public synchronized void put(Binding binding) {
        if (binding == null || binding.path == null) return;
        byPath.put(normalize(binding.path), binding);
        save();
    }

    private void load() {
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            JsonNode root = Json.MAPPER.readTree(Files.readString(file));
            if (root == null || !root.isObject()) return;
            Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String path = entry.getKey();
                JsonNode value = entry.getValue();
                Binding binding = null;
                if (value != null && value.isTextual()) {
                    // The format used by the archived Python player.
                    binding = new Binding();
                    binding.neteaseId = value.asText().trim();
                } else if (value != null && value.isObject()) {
                    binding = Json.MAPPER.treeToValue(value, Binding.class);
                }
                if (binding == null) continue;
                if (binding.path == null || binding.path.isBlank()) binding.path = path;
                byPath.put(normalize(path), binding);
            }
        } catch (Exception e) {
            System.err.println("[netease] unable to read bindings: " + e.getMessage());
        }
    }

    /**
     * Merge the old {local path: NetEase id} sidecar once. Existing bindings win,
     * so a manually edited or QQ binding is never overwritten by the legacy map.
     */
    private void importLegacyOnce() {
        if (legacyFile == null || !Files.isRegularFile(legacyFile)) return;
        if (Files.isRegularFile(legacyMarker)) return;
        try {
            Map<String, String> legacy = Json.read(
                    Files.readString(legacyFile),
                    new TypeReference<LinkedHashMap<String, String>>() {
                    });
            int added = 0;
            for (Map.Entry<String, String> entry : legacy.entrySet()) {
                String id = entry.getValue() == null ? "" : entry.getValue().trim();
                String path = normalize(entry.getKey());
                if (id.isEmpty() || byPath.containsKey(path)) continue;
                Binding binding = new Binding();
                binding.path = path;
                binding.neteaseId = id;
                byPath.put(path, binding);
                added++;
            }
            if (added > 0) save();
            Files.createDirectories(legacyMarker.getParent());
            Files.writeString(
                    legacyMarker,
                    "source=" + legacyFile + "\nimported=" + added + "\n",
                    StandardCharsets.UTF_8);
            if (added > 0) {
                System.err.println("[netease] migrated " + added + " legacy bindings from " + legacyFile);
            }
        } catch (Exception e) {
            System.err.println("[netease] unable to migrate legacy bindings: " + e.getMessage());
        }
    }

    private void save() {
        try {
            Files.createDirectories(file.getParent());
            Json.writeAtomic(file, byPath);
        } catch (IOException e) {
            System.err.println("[netease] unable to save bindings: " + e.getMessage());
        }
    }

    private static String normalize(String path) {
        try {
            return Path.of(path).toAbsolutePath().normalize().toString();
        } catch (Exception e) {
            return path;
        }
    }
}
