package com.potatomusic.superapp;

import com.fasterxml.jackson.core.type.TypeReference;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Optional read-only bridge to the original Potato Player library.
 *
 * <p>The original player stores ratings, genres and artwork paths in
 * {@code source/ratings.json}, and a faster title/duration cache in
 * {@code source/metadata_cache.csv}. Those files live next to the music
 * directory. Reading them makes the migration instant and preserves the
 * listener's covers and scores without ever writing to the old library.</p>
 */
public final class LegacyData {
    public static final class Entry {
        public String title;
        public String artist;
        public String cover;
        public String genre;
        public String block;
        public String note;
        public double rating;
        public int playCount;
        public int duration;
    }

    private final Map<String, Entry> entries = new HashMap<>();
    private final Path coverRoot;

    private LegacyData(Path coverRoot) {
        this.coverRoot = coverRoot;
    }

    public static LegacyData load(Path musicRoot) {
        Path source = musicRoot.toAbsolutePath().normalize().getParent();
        if (source == null) {
            return new LegacyData(null);
        }
        LegacyData data = new LegacyData(source.resolve("covers"));
        data.readRatings(source.resolve("ratings.json"));
        data.readMetadataCache(source.resolve("metadata_cache.csv"));
        return data;
    }

    public static LegacyData empty() {
        return new LegacyData(null);
    }

    public boolean isPresent() {
        return !entries.isEmpty();
    }

    public Entry find(String absolutePath) {
        return entries.get(normalize(absolutePath));
    }

    public Path coverRoot() {
        return coverRoot;
    }

    public Path sourceRoot() {
        return coverRoot == null ? null : coverRoot.getParent();
    }

    private void readRatings(Path file) {
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            Map<String, Map<String, Object>> ratings = Json.read(
                    Files.readString(file),
                    new TypeReference<Map<String, Map<String, Object>>>() {
                    });
            for (Map.Entry<String, Map<String, Object>> e : ratings.entrySet()) {
                Entry entry = entries.computeIfAbsent(normalize(e.getKey()), k -> new Entry());
                Map<String, Object> value = e.getValue();
                entry.title = string(value.get("title"), entry.title);
                entry.artist = string(value.get("artist"), entry.artist);
                entry.cover = string(value.get("cover"), entry.cover);
                entry.genre = string(value.get("genre"), entry.genre);
                entry.block = string(value.get("block"), entry.block);
                entry.note = string(value.get("note"), entry.note);
                entry.rating = number(value.get("score"), entry.rating);
                entry.playCount = integer(value.get("play_count"), entry.playCount);
            }
        } catch (Exception e) {
            System.err.println("[legacy] unable to read ratings.json: " + e.getMessage());
        }
    }

    private void readMetadataCache(Path file) {
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            if (lines.isEmpty()) {
                return;
            }
            Map<String, Integer> header = new HashMap<>();
            List<String> headerCells = parseCsvLine(lines.get(0));
            for (int i = 0; i < headerCells.size(); i++) {
                header.put(headerCells.get(i).trim().toLowerCase(Locale.ROOT), i);
            }
            Integer pathIndex = header.get("filepath");
            Integer titleIndex = header.get("title");
            Integer artistIndex = header.get("artist");
            Integer durationIndex = header.get("duration");
            if (pathIndex == null) {
                return;
            }
            for (int lineNo = 1; lineNo < lines.size(); lineNo++) {
                List<String> cells = parseCsvLine(lines.get(lineNo));
                if (cells.size() <= pathIndex) {
                    continue;
                }
                String path = cells.get(pathIndex).trim();
                if (path.isBlank()) {
                    continue;
                }
                Entry entry = entries.computeIfAbsent(normalize(path), k -> new Entry());
                if (titleIndex != null && cells.size() > titleIndex) {
                    String title = cells.get(titleIndex).trim();
                    if (!title.isEmpty()) {
                        entry.title = title;
                    }
                }
                if (artistIndex != null && cells.size() > artistIndex) {
                    String artist = cells.get(artistIndex).trim();
                    if (!artist.isEmpty()) {
                        entry.artist = artist;
                    }
                }
                if (durationIndex != null && cells.size() > durationIndex) {
                    String duration = cells.get(durationIndex).trim();
                    if (!duration.isEmpty()) {
                        try {
                            entry.duration = (int) Math.round(Double.parseDouble(duration));
                        } catch (NumberFormatException ignored) {
                            // Some old caches only contain titles and artists.
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[legacy] unable to read metadata_cache.csv: " + e.getMessage());
        }
    }

    /** RFC 4180-style parsing is enough for the cache written by the original app. */
    private static List<String> parseCsvLine(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(ch);
            }
        }
        cells.add(cell.toString());
        return cells;
    }

    private static String normalize(String path) {
        try {
            return Path.of(path).toAbsolutePath().normalize().toString();
        } catch (Exception e) {
            return path;
        }
    }

    private static String string(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? fallback : s;
    }

    private static double number(Object value, double fallback) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return value == null ? fallback : Double.parseDouble(String.valueOf(value));
        } catch (Exception e) {
            return fallback;
        }
    }

    private static int integer(Object value, int fallback) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return value == null ? fallback : Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return fallback;
        }
    }

    private static String emptyToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s;
    }

    public static boolean isAudioFile(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".mp3")
                || name.endsWith(".flac")
                || name.endsWith(".m4a")
                || name.endsWith(".aac")
                || name.endsWith(".ogg")
                || name.endsWith(".opus")
                || name.endsWith(".wav")
                || name.endsWith(".aiff")
                || name.endsWith(".aif");
    }
}
