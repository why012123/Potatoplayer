package com.potatomusic.superapp;

import com.fasterxml.jackson.core.type.TypeReference;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Metadata for songs downloaded from NetEase. The audio file stays a normal
 * local file; this sidecar lets the scanner attach the original cover, album
 * and identity to it without rewriting the file's tags.
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

    private final Path file;
    private final Map<String, Binding> byPath = new LinkedHashMap<>();

    public NeteaseBindings(Path dataDir) {
        this.file = dataDir.resolve("netease_bindings.json");
        load();
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
            Map<String, Binding> loaded = Json.read(
                    Files.readString(file),
                    new TypeReference<LinkedHashMap<String, Binding>>() {
                    });
            byPath.putAll(loaded);
        } catch (Exception e) {
            System.err.println("[netease] unable to read bindings: " + e.getMessage());
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
