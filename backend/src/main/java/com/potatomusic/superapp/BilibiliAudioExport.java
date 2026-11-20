package com.potatomusic.superapp;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Conversions are confined to staged local audio and keep the original sample rate and channels. */
final class BilibiliAudioExport {
    enum Format {
        M4A, FLAC, MP3;

        String extension() { return name().toLowerCase(Locale.ROOT); }

        static Format parse(String value) {
            if (value == null || value.isBlank()) return M4A;
            try {
                return valueOf(value.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException error) {
                throw new IllegalArgumentException("Choose M4A, FLAC or MP3.");
            }
        }
    }

    static Path findFfmpeg() {
        String configured = System.getenv("POTATOMUSIC_FFMPEG");
        if (configured != null && !configured.isBlank() && executable(Path.of(configured))) {
            return Path.of(configured).toAbsolutePath();
        }
        String binary = System.getProperty("os.name", "").startsWith("Windows") ? "ffmpeg.exe" : "ffmpeg";
        String path = System.getenv("PATH");
        if (path != null) for (String dir : path.split(Pattern.quote(File.pathSeparator))) {
            if (dir.isBlank()) continue;
            Path candidate = Path.of(dir).resolve(binary);
            if (executable(candidate)) return candidate.toAbsolutePath();
        }
        for (String dir : List.of("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin")) {
            Path candidate = Path.of(dir).resolve(binary);
            if (executable(candidate)) return candidate;
        }
        return null;
    }

    private static boolean executable(Path path) {
        return Files.isRegularFile(path) && Files.isExecutable(path);
    }

    static void convert(Path ffmpeg, Path source, Path target, Format format, DownloadQueue queue)
            throws IOException, InterruptedException {
        if (format == Format.M4A || ffmpeg == null) throw new IllegalArgumentException("Audio converter is unavailable.");
        List<String> args = new ArrayList<>(List.of(ffmpeg.toString(), "-nostdin", "-hide_banner", "-loglevel", "error",
                "-xerror", "-y", "-threads", "1", "-i", source.toString(),
                "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1"));
        if (format == Format.FLAC) {
            args.addAll(List.of("-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24"));
        } else {
            args.addAll(List.of("-c:a", "libmp3lame", "-q:a", "0"));
        }
        args.addAll(List.of("-f", format.extension(), target.toString()));
        Path log = Files.createTempFile(target.getParent(), ".bili-convert-", ".log");
        Process process = null;
        try {
            queue.check();
            process = new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            Process active = process;
            queue.attach(active::destroyForcibly);
            if (!process.waitFor(5, TimeUnit.MINUTES)) throw new IOException("Audio conversion timed out.");
            queue.check();
            if (process.exitValue() != 0 || Files.size(target) == 0) {
                try (var input = Files.newInputStream(log)) {
                    String message = new String(input.readNBytes(1400), StandardCharsets.UTF_8)
                            .replace(source.toString(), "input").replace(target.toString(), "output").strip();
                    throw new IOException("Could not encode " + format + (message.isBlank() ? "." : ": " + message));
                }
            }
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
            Files.deleteIfExists(log);
        }
    }

    private BilibiliAudioExport() {}
}
