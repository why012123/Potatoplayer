package com.potatomusic.superapp;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Builds the playback engine requested in settings, with availability reporting. */
public final class EngineFactory {
    public static final String VLC = "vlc";
    public static final String POTATOHQ = "potatohq";
    public static final String MPV = "mpv";

    private static volatile String lastFallbackReason;

    private EngineFactory() {
    }

    public static String normalize(String id) {
        if (id == null) return VLC;
        String value = id.trim().toLowerCase();
        return switch (value) {
            case POTATOHQ -> POTATOHQ;
            case MPV -> MPV;
            default -> VLC;
        };
    }

    public static PlaybackEngine create(String requested) {
        String id = normalize(requested);
        lastFallbackReason = null;
        if (POTATOHQ.equals(id)) {
            PlaybackEngine engine = new PotatoHqPlaybackEngine();
            if (engine.available()) return engine;
            lastFallbackReason = "potatoHQ 不可用:" + engine.error() + ";已回退 VLC";
            return new VlcPlaybackEngine();
        }
        if (MPV.equals(id)) {
            PlaybackEngine engine = new MpvPlaybackEngine();
            if (engine.available()) return engine;
            lastFallbackReason = "mpv 不可用:" + engine.error() + ";已回退 VLC";
            return new VlcPlaybackEngine();
        }
        return new VlcPlaybackEngine();
    }

    public static String lastFallbackReason() {
        return lastFallbackReason;
    }

    /** What the selected engine can actually do; the UI gates features on this. */
    public static Map<String, Object> capabilities(String requested) {
        String id = normalize(requested);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean hq = POTATOHQ.equals(id);
        boolean mpv = MPV.equals(id);
        out.put("id", id);
        out.put("eqLive", hq || mpv);
        out.put("spatial", hq);
        out.put("crossfeed", hq);
        out.put("visualizer", hq);
        out.put("dsd", hq);
        out.put("exclusive", hq);
        out.put("followSourceRate", hq);
        out.put("gapless", hq);
        return out;
    }

    /** Availability for the settings UI; cheap enough to call on bootstrap. */
    public static Map<String, Object> availability() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(VLC, Map.of("available", true, "path", "libVLC", "detail", "跟随系统 VLC"));
        String potatohq = findPotatohqBinary();
        out.put(POTATOHQ, Map.of(
                "available", potatohq != null,
                "path", potatohq == null ? "" : potatohq,
                "detail", potatohq == null ? "未找到 potatohq 可执行文件" : potatohq));
        String mpv = findMpvBinary();
        out.put(MPV, Map.of(
                "available", mpv != null,
                "path", mpv == null ? "" : mpv,
                "detail", mpv == null ? "未找到 mpv" : mpv));
        return out;
    }

    static String findPotatohqBinary() {
        String property = System.getProperty("potatohq.bin");
        if (property != null && !property.isBlank() && Files.isExecutable(Path.of(property))) return property;
        String env = System.getenv("POTATOHQ_BIN");
        if (env != null && !env.isBlank() && Files.isExecutable(Path.of(env))) return env;
        String cwd = System.getProperty("user.dir", ".");
        List<String> candidates = List.of(
                cwd + "/engines/potatoHQ/build/potatohq",
                cwd + "/../engines/potatoHQ/build/potatohq",
                cwd + "/potatoHQ/build/potatohq",
                cwd + "/../potatoHQ/build/potatohq",
                cwd + "/resources/audio-engines/potatohq",
                cwd + "/resources/potatohq/potatohq",
                "/opt/homebrew/bin/potatohq",
                "/usr/local/bin/potatohq");
        for (String candidate : candidates) {
            if (Files.isExecutable(Path.of(candidate))) return candidate;
        }
        return which("potatohq");
    }

    static String findMpvBinary() {
        String property = System.getProperty("mpv.bin");
        if (property != null && !property.isBlank() && Files.isExecutable(Path.of(property))) return property;
        String env = System.getenv("MPV_BIN");
        if (env != null && !env.isBlank() && Files.isExecutable(Path.of(env))) return env;
        for (String candidate : new String[]{"/opt/homebrew/bin/mpv", "/usr/local/bin/mpv", "/usr/bin/mpv"}) {
            if (Files.isExecutable(Path.of(candidate))) return candidate;
        }
        return which("mpv");
    }

    private static String which(String name) {
        String path = System.getenv("PATH");
        if (path == null) return null;
        for (String dir : path.split(File.pathSeparator)) {
            if (dir.isBlank()) continue;
            File candidate = new File(dir, name);
            if (candidate.canExecute()) return candidate.getAbsolutePath();
        }
        return null;
    }
}
