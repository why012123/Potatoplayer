package com.potatomusic.superapp;

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Stream;

/**
 * Scans a music folder and produces the compact index consumed by the UI.
 *
 * <p>When the folder is an existing Potato Player library, the legacy JSON/CSV
 * cache is used as a fast path. New folders are read with Jaudiotagger and
 * artwork is copied into the app's own cover cache.</p>
 */
public final class LibraryScanner {
    public record Progress(int done, int total, String phase) {
    }

    public record Result(List<Track> tracks, boolean legacy) {
    }

    private final Path coversDir;
    private final NeteaseBindings neteaseBindings;
    private final Map<Path, Path> folderCoverCache = new HashMap<>();

    public LibraryScanner(Path coversDir) {
        this(coversDir, null);
    }

    public LibraryScanner(Path coversDir, NeteaseBindings neteaseBindings) {
        this.coversDir = coversDir;
        this.neteaseBindings = neteaseBindings;
        Logger.getLogger("org.jaudiotagger").setLevel(Level.OFF);
    }

    public Result scan(Path root, java.util.function.Consumer<Progress> progress) throws IOException {
        Path musicRoot = normalizeLibraryRoot(root);
        List<Path> files;
        try (Stream<Path> stream = Files.walk(musicRoot)) {
            files = stream
                    .filter(Files::isRegularFile)
                    .filter(p -> !p.getFileName().toString().startsWith("."))
                    .filter(LegacyData::isAudioFile)
                    .sorted(Comparator.comparing(p -> p.toString().toLowerCase(Locale.ROOT)))
                    .toList();
        }

        LegacyData legacy = LegacyData.load(musicRoot);
        List<Track> tracks = new ArrayList<>(files.size());
        progress.accept(new Progress(0, files.size(), "reading"));
        int done = 0;
        for (Path file : files) {
            Track track = readTrack(file, legacy, musicRoot);
            if (track != null) {
                tracks.add(track);
            }
            done++;
            if (done == files.size() || done % 8 == 0) {
                progress.accept(new Progress(done, files.size(), "reading"));
            }
        }
        tracks.sort(Comparator
                .comparing((Track t) -> safe(t.title).toLowerCase(Locale.ROOT))
                .thenComparing(t -> safe(t.artist).toLowerCase(Locale.ROOT)));
        return new Result(tracks, legacy.isPresent());
    }

    private Track readTrack(Path file, LegacyData legacy, Path musicRoot) {
        Path absolute = file.toAbsolutePath().normalize();
        String path = absolute.toString();
        Track track = new Track();
        track.id = stableId(path);
        track.path = path;
        try {
            track.fileSize = Files.size(absolute);
            track.addedAt = Files.getLastModifiedTime(absolute).toMillis();
        } catch (IOException ignored) {
        }

        LegacyData.Entry legacyEntry = legacy.find(path);
        String[] nameParts = splitFileName(absolute.getFileName().toString());
        track.title = nameParts[1];
        track.artist = nameParts[0];
        track.album = "";

        if (legacyEntry != null) {
            if (notBlank(legacyEntry.title)) {
                track.title = legacyEntry.title;
            }
            if (notBlank(legacyEntry.artist)) {
                track.artist = legacyEntry.artist;
            }
            if (notBlank(legacyEntry.genre)) {
                track.genre = legacyEntry.genre;
            }
            if (notBlank(legacyEntry.block)) {
                track.block = legacyEntry.block;
            }
            if (notBlank(legacyEntry.note)) {
                track.note = legacyEntry.note;
            }
            track.rating = legacyEntry.rating;
            track.playCount = Math.max(0, legacyEntry.playCount);
            track.duration = Math.max(0, legacyEntry.duration);
            if (notBlank(legacyEntry.cover)) {
                Path cover = Path.of(legacyEntry.cover);
                if (Files.isRegularFile(cover)) {
                    track.coverPath = cover.toAbsolutePath().normalize().toString();
                }
            }
        }

        if (track.duration <= 0 || !notBlank(track.title) || !notBlank(track.artist)) {
            Metadata metadata = readMetadata(absolute, track.id);
            if (metadata != null) {
                if (notBlank(metadata.title)) {
                    track.title = metadata.title;
                }
                if (notBlank(metadata.artist)) {
                    track.artist = metadata.artist;
                }
                if (notBlank(metadata.album)) {
                    track.album = metadata.album;
                }
                if (notBlank(metadata.genre) && !notBlank(track.genre)) {
                    track.genre = metadata.genre;
                }
                if (metadata.year > 0) {
                    track.year = metadata.year;
                }
                if (metadata.trackNo > 0) {
                    track.trackNo = metadata.trackNo;
                }
                if (track.duration <= 0) {
                    track.duration = metadata.duration;
                }
                if (track.coverPath == null && notBlank(metadata.coverPath)) {
                    track.coverPath = metadata.coverPath;
                }
            }
        }

        if (neteaseBindings != null) {
            NeteaseBindings.Binding binding = neteaseBindings.find(path);
            if (binding != null) {
                if (notBlank(binding.title)) track.title = binding.title;
                if (notBlank(binding.artist)) track.artist = binding.artist;
                if (notBlank(binding.album)) track.album = binding.album;
                if (notBlank(binding.coverPath) && Files.isRegularFile(Path.of(binding.coverPath))) {
                    track.coverPath = binding.coverPath;
                }
                // Explicit download targets (and later edits) live on the binding,
                // so they win over whatever the audio tags happen to contain.
                if (notBlank(binding.block)) track.block = binding.block.trim();
                if (notBlank(binding.genre)) track.genre = binding.genre.trim();
                String bindingId = binding.neteaseId == null ? "" : binding.neteaseId;
                if (bindingId.startsWith("qq:")) {
                    track.neteaseId = "";
                    track.qqId = bindingId.substring(3);
                } else {
                    track.neteaseId = bindingId;
                    track.qqId = "";
                }
            }
        }
        if (track.coverPath == null) {
            Path folderCover = folderCover(absolute.getParent());
            if (folderCover != null) {
                track.coverPath = folderCover.toString();
            }
        }
        if (!notBlank(track.title)) {
            track.title = absolute.getFileName().toString();
        }
        if (!notBlank(track.artist)) {
            track.artist = "Unknown Artist";
        }
        if (track.album == null) {
            track.album = "";
        }
        if (track.genre == null) {
            track.genre = "";
        }
        if (track.block == null) {
            track.block = "";
        }
        if (track.note == null) {
            track.note = "";
        }
        return track;
    }

    private Metadata readMetadata(Path file, String id) {
        try {
            AudioFile audio = AudioFileIO.read(file.toFile());
            Metadata metadata = new Metadata();
            metadata.duration = Math.max(0, audio.getAudioHeader().getTrackLength());
            Tag tag = audio.getTag();
            if (tag != null) {
                metadata.title = clean(tag.getFirst(FieldKey.TITLE));
                metadata.artist = clean(tag.getFirst(FieldKey.ARTIST));
                metadata.album = clean(tag.getFirst(FieldKey.ALBUM));
                metadata.genre = clean(tag.getFirst(FieldKey.GENRE));
                String year = clean(tag.getFirst(FieldKey.YEAR));
                if (!year.isEmpty()) {
                    try {
                        metadata.year = Integer.parseInt(year.substring(0, Math.min(4, year.length())));
                    } catch (NumberFormatException ignored) {
                    }
                }
                String trackNo = clean(tag.getFirst(FieldKey.TRACK));
                if (!trackNo.isEmpty()) {
                    try {
                        metadata.trackNo = Integer.parseInt(trackNo.split("/")[0]);
                    } catch (NumberFormatException ignored) {
                    }
                }
                Artwork artwork = tag.getFirstArtwork();
                if (artwork != null && artwork.getBinaryData() != null && artwork.getBinaryData().length > 0) {
                    metadata.coverPath = writeCover(id, artwork.getBinaryData());
                }
            }
            return metadata;
        } catch (Throwable e) {
            return null;
        }
    }

    private String writeCover(String id, byte[] bytes) {
        try {
            Files.createDirectories(coversDir);
            String extension = detectImageExtension(bytes);
            Path target = coversDir.resolve(id + extension);
            if (!Files.isRegularFile(target) || Files.size(target) != bytes.length) {
                Files.write(target, bytes);
            }
            return target.toAbsolutePath().normalize().toString();
        } catch (IOException e) {
            return null;
        }
    }

    private Path folderCover(Path folder) {
        if (folder == null) {
            return null;
        }
        return folderCoverCache.computeIfAbsent(folder, f -> {
            for (String name : List.of("cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "album.jpg")) {
                Path candidate = f.resolve(name);
                if (Files.isRegularFile(candidate)) {
                    return candidate.toAbsolutePath().normalize();
                }
            }
            return null;
        });
    }

    public static Path normalizeLibraryRoot(Path chosen) {
        if (chosen == null) {
            return null;
        }
        Path p = chosen.toAbsolutePath().normalize();
        Path nested = p.resolve("source").resolve("music");
        if (Files.isDirectory(nested)) {
            return nested;
        }
        Path music = p.resolve("music");
        if (Files.isDirectory(music) && Files.isDirectory(p.resolve("source"))) {
            return music;
        }
        // The old Java library is laid out as <library>/source/{music,covers,lyrics,
        // ratings.json,...}. If the user picks "source" or its parent, scan the
        // music child so the legacy metadata bridge can find the sibling files.
        if (Files.isDirectory(music)
                && (Files.isRegularFile(p.resolve("ratings.json"))
                || Files.isRegularFile(p.resolve("lyrics.json"))
                || Files.isRegularFile(p.resolve("metadata_cache.csv")))) {
            return music;
        }
        return p;
    }

    /** Parse the "Artist - Title" convention used by the original library. */
    public static String[] splitFileName(String fileName) {
        String name = fileName;
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            name = name.substring(0, dot);
        }
        int separator = name.indexOf(" - ");
        if (separator > 0) {
            String artist = name.substring(0, separator).trim();
            String title = name.substring(separator + 3).trim();
            if (!artist.isEmpty() && !title.isEmpty()) {
                return new String[]{artist, title};
            }
        }
        return new String[]{"Unknown Artist", name.trim()};
    }

    public static String stableId(String absolutePath) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(absolutePath.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 24);
        } catch (Exception e) {
            return Integer.toHexString(absolutePath.hashCode());
        }
    }

    private static String detectImageExtension(byte[] bytes) {
        if (bytes.length >= 4
                && (bytes[0] & 0xff) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4e
                && bytes[3] == 0x47) {
            return ".png";
        }
        if (bytes.length >= 3
                && (bytes[0] & 0xff) == 0xff
                && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff) {
            return ".jpg";
        }
        if (bytes.length >= 4
                && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == '8') {
            return ".gif";
        }
        return ".jpg";
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static final class Metadata {
        String title;
        String artist;
        String album;
        String genre;
        String coverPath;
        int duration;
        int year;
        int trackNo;
    }
}
