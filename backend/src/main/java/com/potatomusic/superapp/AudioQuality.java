package com.potatomusic.superapp;

import java.util.Locale;
import java.nio.file.Path;
import org.jaudiotagger.audio.AudioFileIO;

/**
 * Ordering of the download quality labels used by the online services.
 *
 * <p>The UI asks for one of five tiers: {@code standard}, {@code high},
 * {@code lossless}, {@code hires} and {@code jymaster}. The services return
 * the level the provider actually served, which can be lower than requested
 * (no Hi-Res master for a song, or the account is not signed in), so both
 * sides should speak this shared vocabulary. Anything unknown or missing is
 * ordered by the file's container as a last resort.</p>
 */
public final class AudioQuality {
    public static final String STANDARD = "standard";
    public static final String HIGH = "high";
    public static final String LOSSLESS = "lossless";
    public static final String HIRES = "hires";
    public static final String MASTER = "jymaster";

    private AudioQuality() {
    }

    /** Normalise a label from the UI, an old binding or a provider response. */
    public static String normalize(String quality) {
        if (quality == null || quality.isBlank()) return HIGH;
        return switch (quality.trim().toLowerCase(Locale.ROOT)) {
            case STANDARD, "128", "128k", "standard-quality" -> STANDARD;
            case HIGH, "320", "320k", "exhigh", "higher" -> HIGH;
            case LOSSLESS, "flac", "sq", "cd" -> LOSSLESS;
            case HIRES, "hi-res", "hi_res", "hr" -> HIRES;
            case MASTER, "master", "svip" -> MASTER;
            default -> HIGH;
        };
    }

    /** 0 = standard, 1 = high, 2 = lossless, 3 = Hi-Res, 4 = master. */
    public static int rank(String quality) {
        return switch (normalize(quality)) {
            case STANDARD -> 0;
            case LOSSLESS -> 2;
            case HIRES -> 3;
            case MASTER -> 4;
            default -> 1;
        };
    }

    /** Inspect the audio header, including staged downloads whose suffix is .part. */
    static int measuredRank(String path) {
        if (path == null || path.isBlank()) return -1;
        try {
            String name = path.toLowerCase(Locale.ROOT);
            if (name.endsWith(".part")) name = name.substring(0, name.length() - 5);
            String extension = name.substring(name.lastIndexOf('.') + 1);
            var header = AudioFileIO.readAs(Path.of(path).toFile(), extension).getAudioHeader();
            if (header.isLossless()) {
                if (header.getSampleRateAsNumber() <= 0 || header.getBitsPerSample() <= 0) return -1;
                return header.getSampleRateAsNumber() > 48_000 || header.getBitsPerSample() > 16 ? 3 : 2;
            }
            long bitrate = header.getBitRateAsNumber();
            return bitrate > 0 ? (bitrate <= 160 ? 0 : 1) : -1;
        } catch (Exception ignored) {
            return -1;
        }
    }

    public static int rankOfFile(String path) {
        int measured = measuredRank(path);
        if (measured >= 0) return measured;
        if (path == null || path.isBlank()) return -1;
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".flac") || lower.endsWith(".wav") || lower.endsWith(".aiff") || lower.endsWith(".aif")) return 2;
        return 1;
    }

    /** Physical audio takes precedence over legacy requested-tier labels. */
    public static int rankOf(String quality, String path) {
        int measured = measuredRank(path);
        if (measured >= 0) {
            // Master is a provider tier, never inferred from sample rate alone.
            return measured == 3 && MASTER.equals(normalize(quality)) ? 4 : measured;
        }
        if (!known(quality)) return rankOfFile(path);
        return rank(quality);
    }

    static boolean known(String quality) {
        if (quality == null || quality.isBlank()) return false;
        return switch (quality.trim().toLowerCase(Locale.ROOT)) {
            case STANDARD, "128", "128k", "standard-quality", HIGH, "320", "320k", "exhigh", "higher",
                    LOSSLESS, "flac", "sq", "cd", HIRES, "hi-res", "hi_res", "hr", MASTER, "master", "svip" -> true;
            default -> false;
        };
    }

    public static String existingLabel(String quality, String path) {
        return switch (rankOf(quality, path)) {
            case 0 -> STANDARD;
            case 2 -> LOSSLESS;
            case 3 -> HIRES;
            case 4 -> MASTER;
            default -> HIGH;
        };
    }

    /** True when downloading at {@code requested} would beat the copy already on disk. */
    public static boolean improves(String requested, String existingQuality, String existingPath) {
        if (existingPath == null || existingPath.isBlank()) return false;
        return rank(requested) > rankOf(existingQuality, existingPath);
    }

    /** Direction of an explicit quality change relative to the copy on disk. */
    public static final String UPGRADE = "upgrade";
    public static final String DOWNGRADE = "downgrade";
    public static final String SAME = "same";
    public static final String NEW = "new";

    /**
     * Compare a requested tier with the file already in the library.
     *
     * <p>The download feature historically only replaced a file when the new tier
     * was strictly better; {@link #DOWNGRADE} is returned for explicit,
     * user-confirmed replacements so the caller can allow them without ever
     * letting an automatic download go backwards.</p>
     */
    public static String direction(String requested, String existingQuality, String existingPath) {
        if (existingPath == null || existingPath.isBlank()) return NEW;
        int wanted = rank(requested);
        int existing = rankOf(existingQuality, existingPath);
        if (wanted > existing) return UPGRADE;
        if (wanted < existing) return DOWNGRADE;
        return SAME;
    }

    /** True when the requested tier is strictly lower than the copy on disk. */
    public static boolean wouldDowngrade(String requested, String existingQuality, String existingPath) {
        return DOWNGRADE.equals(direction(requested, existingQuality, existingPath));
    }

    /**
     * Whether a tier the provider actually served is a valid replacement in the
     * requested direction. Upgrades must be strictly better than the existing copy,
     * explicit downgrades strictly worse; the same tier is never a replacement.
     */
    public static boolean replacementAccepted(String direction, String servedQuality, String existingQuality) {
        int served = rank(servedQuality);
        int existing = rank(existingQuality);
        if (UPGRADE.equals(direction)) return served > existing;
        if (DOWNGRADE.equals(direction)) return served < existing;
        return false;
    }

    /** Lossless or better (FLAC/WAV/AIFF rather than a lossy container). */
    public static boolean isLosslessOrBetter(String quality) {
        return rank(quality) >= 2;
    }
}
