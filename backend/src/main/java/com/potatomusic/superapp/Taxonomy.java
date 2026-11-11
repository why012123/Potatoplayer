package com.potatomusic.superapp;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Merge helpers for the two colour-coded taxonomies that drive the library. */
public final class Taxonomy {
    private static final String[] PALETTE = {
            "#c1845f", "#8b9e73", "#7a86b8", "#bd6e82", "#a68a62",
            "#5f9a9a", "#9b7bb5", "#c48a4b", "#6f8cae", "#a97c72",
            "#7e9b8b", "#b58a9d", "#8b8b6f", "#7791a8", "#b18a6f"
    };

    private Taxonomy() {
    }

    public static List<Tag> read(Path file) {
        List<Tag> result = new ArrayList<>();
        if (file == null || !Files.isRegularFile(file)) {
            return result;
        }
        try {
            List<Map<String, Object>> rows = Json.read(
                    Files.readString(file),
                    new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {
                    });
            for (Map<String, Object> row : rows) {
                String name = string(row.get("name"));
                if (name.isBlank()) {
                    continue;
                }
                result.add(new Tag(name, normalizeColor(string(row.get("color")), name, result.size())));
            }
        } catch (Exception e) {
            System.err.println("[taxonomy] unable to read " + file.getFileName() + ": " + e.getMessage());
        }
        return result;
    }

    /**
     * Merge names from a previous list, the legacy files, and every value used by
     * a track. Existing colours always win; missing tags get a deterministic hue.
     */
    public static List<Tag> merge(List<Tag> current, List<Tag> incoming, Iterable<String> usedNames) {
        Map<String, Tag> merged = new LinkedHashMap<>();
        addAll(merged, current);
        addAll(merged, incoming);
        Set<String> names = new LinkedHashSet<>();
        if (usedNames != null) {
            for (String name : usedNames) {
                if (name != null && !name.isBlank()) {
                    names.add(name.trim());
                }
            }
        }
        for (String name : names) {
            merged.computeIfAbsent(name, key -> new Tag(key, defaultColor(key)));
        }
        // Existing list order is meaningful for the user; append new names after it.
        return new ArrayList<>(merged.values());
    }

    public static String defaultColor(String name) {
        int hash = 0;
        for (int i = 0; i < name.length(); i++) {
            hash = (hash * 31 + name.charAt(i)) | 0;
        }
        return PALETTE[Math.abs(hash) % PALETTE.length];
    }

    public static boolean validColor(String color) {
        return color != null && color.matches("^#[0-9a-fA-F]{6}$");
    }

    public static String normalizeColor(String color, String name, int index) {
        if (validColor(color)) {
            return color.toLowerCase();
        }
        if (name != null && !name.isBlank()) {
            return defaultColor(name);
        }
        return PALETTE[Math.abs(index) % PALETTE.length];
    }

    public static Tag find(List<Tag> tags, String name) {
        if (name == null) {
            return null;
        }
        for (Tag tag : tags) {
            if (name.equals(tag.name)) {
                return tag;
            }
        }
        return null;
    }

    public static Map<String, String> colors(List<Tag> tags) {
        Map<String, String> result = new HashMap<>();
        for (Tag tag : tags) {
            result.put(tag.name, tag.color);
        }
        return result;
    }

    private static void addAll(Map<String, Tag> target, List<Tag> source) {
        if (source == null) {
            return;
        }
        for (Tag tag : source) {
            if (tag == null || tag.name == null || tag.name.isBlank()) {
                continue;
            }
            Tag existing = target.get(tag.name);
            if (existing == null) {
                target.put(tag.name, new Tag(tag.name, normalizeColor(tag.color, tag.name, target.size())));
            } else if (!validColor(existing.color) && validColor(tag.color)) {
                existing.color = tag.color;
            }
        }
    }

    private static String string(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
