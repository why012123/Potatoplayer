package com.potatomusic.superapp;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Resolves sidecar LRC files and merges optional translations by timestamp. */
public final class LyricsService {
    public static final class Line {
        public double time;
        public String text;
        public String translation;

        public Line() {
        }

        public Line(double time, String text, String translation) {
            this.time = time;
            this.text = text;
            this.translation = translation;
        }
    }

    public static final class Payload {
        public boolean found;
        public boolean translated;
        public String source;
        public List<Line> lines = new ArrayList<>();

        public static Payload missing() {
            Payload payload = new Payload();
            payload.found = false;
            return payload;
        }
    }

    private static final Pattern TIME_TAG = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
    private volatile Path libraryRoot;
    private final Path dataDir;
    private final Map<String, Payload> cache = new ConcurrentHashMap<>();

    public LyricsService(Path libraryRoot, Path dataDir) {
        this.libraryRoot = libraryRoot;
        this.dataDir = dataDir;
    }

    public void setLibraryRoot(Path root) {
        this.libraryRoot = root;
        this.cache.clear();
    }

    public Payload load(Track track) {
        if (track == null || track.path == null) {
            return Payload.missing();
        }
        String key = track.path + "::" + fileStamp(track.path);
        return cache.computeIfAbsent(key, ignored -> find(track));
    }

    private Payload find(Track track) {
        Path audio = Path.of(track.path);
        String base = audio.getFileName().toString();
        int dot = base.lastIndexOf('.');
        if (dot > 0) {
            base = base.substring(0, dot);
        }

        for (Path folder : searchFolders(audio)) {
            Path main = firstExisting(folder.resolve(base + ".lrc"), folder.resolve(base + ".LRC"));
            if (main == null) {
                continue;
            }
            Path translation = firstExisting(
                    folder.resolve(base + ".trans.lrc"),
                    folder.resolve(base + ".zh.lrc"),
                    folder.resolve(base + ".zh-CN.lrc"),
                    folder.resolve(base + ".translation.lrc"));
            try {
                Payload payload = parse(main, translation);
                payload.source = main.toString();
                return payload;
            } catch (IOException e) {
                System.err.println("[lyrics] " + e.getMessage());
            }
        }
        return Payload.missing();
    }

    private List<Path> searchFolders(Path audio) {
        List<Path> folders = new ArrayList<>();
        if (audio.getParent() != null) {
            folders.add(audio.getParent());
        }
        if (audio.getParent() != null && audio.getParent().getParent() != null) {
            // Legacy/current layout: <library>/source/music/<song> + <library>/source/lyrics/
            folders.add(audio.getParent().getParent().resolve("lyrics"));
        }
        if (libraryRoot != null) {
            folders.add(libraryRoot.resolveSibling("lyrics"));
            folders.add(libraryRoot.resolve("lyrics"));
        }
        if (dataDir != null) {
            folders.add(dataDir.resolve("lyrics"));
        }
        return folders.stream().distinct().filter(Files::isDirectory).toList();
    }

    public static Payload parse(Path main, Path translation) throws IOException {
        Map<Double, String> original = parseLines(main);
        if (original.isEmpty()) {
            return Payload.missing();
        }
        Map<Double, String> translated = translation == null ? Map.of() : parseLines(translation);
        Payload payload = new Payload();
        payload.found = true;
        payload.translated = !translated.isEmpty();
        for (Map.Entry<Double, String> entry : original.entrySet()) {
            payload.lines.add(new Line(entry.getKey(), entry.getValue(), translated.getOrDefault(entry.getKey(), "")));
        }
        return payload;
    }

    public static Map<Double, String> parseLines(Path file) throws IOException {
        TreeMap<Double, String> result = new TreeMap<>();
        if (file == null || !Files.isRegularFile(file)) {
            return result;
        }
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        for (String raw : lines) {
            String line = raw.strip();
            if (line.isEmpty()) {
                continue;
            }
            Matcher matcher = TIME_TAG.matcher(line);
            List<Double> stamps = new ArrayList<>();
            int end = 0;
            while (matcher.find()) {
                int minutes = Integer.parseInt(matcher.group(1));
                int seconds = Integer.parseInt(matcher.group(2));
                String fraction = matcher.group(3);
                double sub = 0;
                if (fraction != null) {
                    sub = Integer.parseInt(fraction) / Math.pow(10, fraction.length());
                }
                stamps.add(minutes * 60.0 + seconds + sub);
                end = matcher.end();
            }
            if (stamps.isEmpty()) {
                continue;
            }
            String text = line.substring(end).trim();
            if (text.isEmpty()) {
                continue;
            }
            for (double stamp : stamps) {
                result.merge(stamp, text, (a, b) -> a.equals(b) ? a : a + " / " + b);
            }
        }
        return result;
    }

    private static Path firstExisting(Path... candidates) {
        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private static long fileStamp(String path) {
        try {
            return Files.getLastModifiedTime(Path.of(path)).toMillis();
        } catch (Exception e) {
            return 0;
        }
    }
}
