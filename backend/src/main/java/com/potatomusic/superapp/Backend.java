package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** The headless application service exposed to Electron over newline JSON-RPC. */
public final class Backend implements PlaybackController.Host {
    public static final String VERSION = "s1.2.2";

    private final Object lock = new Object();
    private final DataStore store;
    private final Settings settings;
    private final EqStore eqStore;
    private final StatsStore statsStore;
    private final LibraryState state;
    private final Map<String, Track> trackIndex = new HashMap<>();
    private final NeteaseBindings neteaseBindings;
    private final LibraryScanner scanner;
    private final LyricsService lyrics;
    private final PlaybackController playback;
    private final NeteaseService netease;
    private final QQMusicService qq;
    private final BilibiliService bilibili;
    private final java.util.function.BiConsumer<String, Object> emitter;
    private final ScheduledExecutorService saver = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "state-saver");
        t.setDaemon(true);
        return t;
    });
    private final AtomicBoolean scanning = new AtomicBoolean(false);
    private volatile boolean scanNeeded;
    private volatile boolean shuttingDown;
    private volatile long saveGeneration;
    private final AtomicBoolean pendingScan = new AtomicBoolean(false);

    public Backend(java.util.function.BiConsumer<String, Object> emitter) throws IOException {
        this.emitter = emitter;
        this.store = new DataStore();
        this.store.ensure();
        this.settings = store.loadSettings();
        this.state = store.loadLibrary();
        resolveLibraryRoot();
        Path musicRoot = settings.libraryRoot == null ? null : Path.of(settings.libraryRoot);
        Path legacyEq = musicRoot == null || musicRoot.getParent() == null
                ? null : musicRoot.getParent().resolve("eq.json");
        this.eqStore = EqStore.load(store.eqFile(), legacyEq, musicRoot);
        this.statsStore = StatsStore.load(store.statsFile());
        try {
            eqStore.save(store.eqFile());
        } catch (Exception e) {
            System.err.println("[eq] unable to migrate eq.json: " + e.getMessage());
        }
        this.neteaseBindings = new NeteaseBindings(store.dataDir());
        this.scanner = new LibraryScanner(store.coversDir(), neteaseBindings);
        this.lyrics = new LyricsService(Path.of(settings.libraryRoot), store.dataDir());
        synchronized (lock) {
            rebuildIndex();
            ensureTaxonomyLocked();
            if (repairLegacyMetadataLocked()) {
                try {
                    store.backupLibrary();
                } catch (IOException e) {
                    System.err.println("[repair] backup failed: " + e.getMessage());
                }
            }
            ensureTaxonomyLocked();
            ensureTrackTaxonomyLocked();
            scanNeeded = state.tracks.isEmpty()
                    || !settings.libraryRoot.equals(state.libraryRoot)
                    || state.schemaVersion < 2;
        }
        this.playback = new PlaybackController(this);
        this.playback.warmUpAsync();
        this.netease = new NeteaseService(this);
        this.qq = new QQMusicService(this);
        this.bilibili = new BilibiliService();
        saveNow();
    }

    public Map<String, Object> bootstrap() {
        synchronized (lock) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("version", VERSION);
            out.put("libraryRoot", settings.libraryRoot);
            out.put("tracks", List.copyOf(state.tracks));
            out.put("favorites", List.copyOf(state.favorites));
            out.put("playlists", List.copyOf(state.playlists));
            out.put("blocks", copies(state.blocks));
            out.put("genres", copies(state.genres));
            out.put("settings", settings);
            out.put("engines", EngineFactory.availability());
            out.put("engineCapabilities", EngineFactory.capabilities(settings.playbackEngine));
            out.put("playback", playback.state());
            out.put("scanNeeded", scanNeeded);
            out.put("scannedAt", state.scannedAt);
            out.put("coverRoots", store.coverRoots(settings.libraryRoot == null ? null : Path.of(settings.libraryRoot)));
            out.put("dataDir", store.dataDir().toString());
            return out;
        }
    }

    public Map<String, Object> startScan() {
        if (!scanning.compareAndSet(false, true)) {
            return Map.of("started", false, "reason", "already-running");
        }
        Path root = settings.libraryRoot == null ? null : Path.of(settings.libraryRoot);
        emitter.accept("scan.started", Map.of("root", root == null ? "" : root.toString()));
        Thread thread = new Thread(() -> {
            try {
                if (root == null || !Files.isDirectory(root)) {
                    throw new IOException("The music folder does not exist: " + root);
                }
                LibraryScanner.Result result = scanner.scan(root, progress -> {
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("done", progress.done());
                    data.put("total", progress.total());
                    data.put("phase", progress.phase());
                    emitter.accept("scan.progress", data);
                });
                synchronized (lock) {
                    boolean migrating = state.schemaVersion < 2;
                    Map<String, Track> previous = new HashMap<>();
                    for (Track old : state.tracks) {
                        if (old != null && old.path != null) previous.put(old.path, old);
                    }
                    List<Track> scanned = new ArrayList<>(result.tracks());
                    for (Track fresh : scanned) {
                        Track old = previous.get(fresh.path);
                        if (old == null) continue;
                        if (!migrating || notBlank(old.block)) fresh.block = old.block;
                        if (!migrating || notBlank(old.genre)) fresh.genre = old.genre;
                        if (!migrating) {
                            fresh.rating = old.rating;
                            fresh.note = old.note;
                        } else {
                            if (old.rating > 0) fresh.rating = old.rating;
                            if (notBlank(old.note)) fresh.note = old.note;
                        }
                        fresh.playCount = Math.max(fresh.playCount, old.playCount);
                    }
                    state.tracks = scanned;
                    state.libraryRoot = root.toString();
                    state.scannedAt = System.currentTimeMillis();
                    rebuildIndex();
                    ensureTaxonomyLocked();
                    state.schemaVersion = 2;
                    // Favorites and playlist membership are user data. Keep them even
                    // while switching roots; missing IDs simply resolve once the
                    // matching library is selected again.
                    scanNeeded = false;
                }
                saveNow();
                Map<String, Object> done = new LinkedHashMap<>();
                done.put("tracks", List.copyOf(state.tracks));
                done.put("favorites", List.copyOf(state.favorites));
                done.put("playlists", List.copyOf(state.playlists));
                done.put("blocks", copies(state.blocks));
                done.put("genres", copies(state.genres));
                done.put("scanNeeded", false);
                done.put("scannedAt", state.scannedAt);
                done.put("legacyImport", result.legacy());
                done.put("coverRoots", store.coverRoots(root));
                emitter.accept("scan.done", done);
            } catch (Exception e) {
                scanNeeded = true;
                emitter.accept("scan.error", Map.of("message", e.getMessage() == null ? "Scan failed" : e.getMessage()));
            } finally {
                scanning.set(false);
                if (pendingScan.getAndSet(false)) {
                    startScan();
                }
            }
        }, "library-scan");
        thread.setDaemon(true);
        thread.start();
        return Map.of("started", true);
    }

    public Map<String, Object> setLibraryRoot(String chosen) {
        if (chosen == null || chosen.isBlank()) {
            throw new IllegalArgumentException("A folder is required.");
        }
        Path root = LibraryScanner.normalizeLibraryRoot(Path.of(chosen));
        if (!Files.isDirectory(root)) {
            throw new IllegalArgumentException("That folder does not exist.");
        }
        synchronized (lock) {
            try {
                store.backupLibrary();
            } catch (IOException e) {
                System.err.println("[library] pre-switch backup failed: " + e.getMessage());
            }
            settings.libraryRoot = root.toAbsolutePath().normalize().toString();
            state.libraryRoot = settings.libraryRoot;
            // Do not clear tracks, blocks, genres, favorites or playlists here. The
            // previous state remains valid until the target scan finishes, and
            // favorites/playlists are pruned only by an explicit user action.
            scanNeeded = true;
            lyrics.setLibraryRoot(root);
            eqStore.setLibraryRoot(root);
        }
        saveNow();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("root", settings.libraryRoot);
        result.put("scanNeeded", true);
        result.put("coverRoots", store.coverRoots(root));
        emitter.accept("library.root", result);
        startScan();
        return result;
    }

    public Map<String, Object> lyrics(String trackId) {
        Track track = findTrack(trackId);
        if (track == null) {
            return Map.of("found", false);
        }
        return Json.MAPPER.convertValue(lyrics.load(track), Map.class);
    }

    public Map<String, Object> toggleFavorite(String trackId) {
        if (findTrack(trackId) == null) {
            throw new IllegalArgumentException("Unknown track.");
        }
        boolean favorite;
        synchronized (lock) {
            if (state.favorites.contains(trackId)) {
                state.favorites.remove(trackId);
                favorite = false;
            } else {
                state.favorites.add(trackId);
                favorite = true;
            }
        }
        scheduleSave();
        emitter.accept("library.favorites", Map.of("favorites", List.copyOf(state.favorites)));
        return Map.of("favorite", favorite, "favorites", List.copyOf(state.favorites));
    }

    public Map<String, Object> createPlaylist(String name) {
        String clean = sanitizePlaylistName(name);
        Playlist playlist = new Playlist(UUID.randomUUID().toString(), clean);
        synchronized (lock) {
            state.playlists.add(playlist);
        }
        saveNow();
        emitPlaylists();
        return Map.of("playlist", playlist);
    }

    public Map<String, Object> renamePlaylist(String playlistId, String name) {
        String clean = sanitizePlaylistName(name);
        Playlist playlist = findPlaylist(playlistId);
        if (playlist == null) {
            throw new IllegalArgumentException("Unknown playlist.");
        }
        synchronized (lock) {
            playlist.name = clean;
        }
        saveNow();
        emitPlaylists();
        return Map.of("playlist", playlist);
    }

    public Map<String, Object> deletePlaylist(String playlistId) {
        synchronized (lock) {
            state.playlists.removeIf(p -> p.id.equals(playlistId));
        }
        saveNow();
        emitPlaylists();
        return Map.of("deleted", true);
    }

    public Map<String, Object> addTrackToPlaylist(String playlistId, String trackId) {
        Playlist playlist = findPlaylist(playlistId);
        if (playlist == null) {
            throw new IllegalArgumentException("Unknown playlist.");
        }
        if (findTrack(trackId) == null) {
            throw new IllegalArgumentException("Unknown track.");
        }
        synchronized (lock) {
            if (!playlist.trackIds.contains(trackId)) {
                playlist.trackIds.add(trackId);
            }
        }
        saveNow();
        emitPlaylists();
        return Map.of("playlist", playlist);
    }

    public Map<String, Object> addTracksToPlaylist(String playlistId, List<String> trackIds) {
        Playlist playlist = findPlaylist(playlistId);
        if (playlist == null) {
            throw new IllegalArgumentException("Unknown playlist.");
        }
        java.util.LinkedHashSet<String> known = new java.util.LinkedHashSet<>();
        if (trackIds != null) {
            for (String trackId : trackIds) {
                if (trackId != null && !trackId.isBlank() && findTrack(trackId) != null) known.add(trackId);
            }
        }
        synchronized (lock) {
            for (String trackId : known) {
                if (!playlist.trackIds.contains(trackId)) playlist.trackIds.add(trackId);
            }
        }
        saveNow();
        emitPlaylists();
        return Map.of("playlist", playlist, "added", known.size());
    }

    public Map<String, Object> removeTrackFromPlaylist(String playlistId, String trackId) {
        Playlist playlist = findPlaylist(playlistId);
        if (playlist == null) {
            throw new IllegalArgumentException("Unknown playlist.");
        }
        synchronized (lock) {
            playlist.trackIds.remove(trackId);
        }
        saveNow();
        emitPlaylists();
        return Map.of("playlist", playlist);
    }

    public Map<String, Object> createTag(String kind, String name, String color) {
        String clean = sanitizeTagName(name);
        synchronized (lock) {
            List<Tag> tags = tagsFor(kind);
            if (Taxonomy.find(tags, clean) != null) {
                throw new IllegalArgumentException("That " + kind + " already exists.");
            }
            tags.add(new Tag(clean, Taxonomy.normalizeColor(color, clean, tags.size())));
            ensureTrackTaxonomyLocked();
        }
        saveNow();
        emitTaxonomy();
        return Map.of("blocks", copies(state.blocks), "genres", copies(state.genres));
    }

    public Map<String, Object> renameTag(String kind, String oldName, String newName) {
        String clean = sanitizeTagName(newName);
        synchronized (lock) {
            List<Tag> tags = tagsFor(kind);
            Tag tag = Taxonomy.find(tags, oldName);
            if (tag == null) {
                throw new IllegalArgumentException("Unknown " + kind + ".");
            }
            if (!oldName.equals(clean) && Taxonomy.find(tags, clean) != null) {
                throw new IllegalArgumentException("That " + kind + " already exists.");
            }
            tag.name = clean;
            for (Track track : state.tracks) {
                if ("block".equals(kind) && oldName.equals(blockOf(track))) {
                    track.block = clean;
                }
                if ("genre".equals(kind) && oldName.equals(genreOf(track))) {
                    track.genre = clean;
                }
            }
        }
        saveNow();
        emitTaxonomy();
        emitTracks();
        return Map.of("blocks", copies(state.blocks), "genres", copies(state.genres));
    }

    public Map<String, Object> deleteTag(String kind, String name) {
        synchronized (lock) {
            List<Tag> tags = tagsFor(kind);
            tags.removeIf(tag -> tag.name.equals(name));
            for (Track track : state.tracks) {
                if ("block".equals(kind) && name.equals(blockOf(track))) {
                    track.block = "";
                }
                if ("genre".equals(kind) && name.equals(genreOf(track))) {
                    track.genre = "";
                }
            }
        }
        saveNow();
        emitTaxonomy();
        emitTracks();
        return Map.of("blocks", copies(state.blocks), "genres", copies(state.genres));
    }

    public Map<String, Object> setTagColor(String kind, String name, String color) {
        if (!Taxonomy.validColor(color)) {
            throw new IllegalArgumentException("Colour must look like #aabbcc.");
        }
        synchronized (lock) {
            Tag tag = Taxonomy.find(tagsFor(kind), name);
            if (tag == null) {
                throw new IllegalArgumentException("Unknown " + kind + ".");
            }
            tag.color = color.toLowerCase();
        }
        saveNow();
        emitTaxonomy();
        return Map.of("blocks", copies(state.blocks), "genres", copies(state.genres));
    }

    public Map<String, Object> updateTrack(String trackId, String block, String genre, double rating, String note) {
        Track track = findTrack(trackId);
        if (track == null) {
            throw new IllegalArgumentException("Unknown track.");
        }
        synchronized (lock) {
            track.block = block == null ? "" : block.trim();
            track.genre = genre == null ? "" : genre.trim();
            track.rating = Math.max(0, Math.min(10, rating));
            String cleanNote = note == null ? "" : note.trim();
            track.note = cleanNote.length() > 2000 ? cleanNote.substring(0, 2000) : cleanNote;
            ensureTagForValueLocked(state.blocks, track.block);
            ensureTagForValueLocked(state.genres, track.genre);
        }
        saveNow();
        emitter.accept("track.updated", track);
        return Map.of("track", track, "blocks", copies(state.blocks), "genres", copies(state.genres));
    }

    public Map<String, Object> deleteTrack(String trackId) {
        Track track = findTrack(trackId);
        if (track == null) {
            throw new IllegalArgumentException("Unknown track.");
        }
        boolean fileMoved = false;
        if (track.path != null && !track.path.isBlank()) {
            Path source = Path.of(track.path).toAbsolutePath().normalize();
            Path root = libraryRootPath();
            Path normalizedRoot = root == null ? null : root.toAbsolutePath().normalize();
            if (normalizedRoot != null && source.startsWith(normalizedRoot) && Files.isRegularFile(source)) {
                try {
                    Path trash = store.dataDir().resolve("trash");
                    Files.createDirectories(trash);
                    String safeName = source.getFileName().toString().replaceAll("[^A-Za-z0-9._-]", "_");
                    Path target = trash.resolve(System.currentTimeMillis() + "-" + safeName);
                    Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
                    fileMoved = true;
                } catch (IOException e) {
                    throw new IllegalArgumentException("Could not move the audio file to trash: " + e.getMessage());
                }
            }
        }
        synchronized (lock) {
            state.tracks.removeIf(item -> trackId.equals(item.id));
            state.favorites.remove(trackId);
            for (Playlist playlist : state.playlists) {
                playlist.trackIds.remove(trackId);
            }
            rebuildIndex();
        }
        playback.removeTrack(trackId);
        saveNow();
        emitter.accept("library.tracks", Map.of("tracks", List.copyOf(state.tracks)));
        emitter.accept("library.favorites", Map.of("favorites", List.copyOf(state.favorites)));
        emitPlaylists();
        return Map.of("deleted", true, "fileMoved", fileMoved);
    }

    public Map<String, Object> bulkUpdate(List<String> trackIds, String field, String value) {
        if (!"block".equals(field) && !"genre".equals(field)) {
            throw new IllegalArgumentException("Only block or genre can be assigned in bulk.");
        }
        String clean = value == null ? "" : value.trim();
        synchronized (lock) {
            if ("block".equals(field)) ensureTagForValueLocked(state.blocks, clean);
            if ("genre".equals(field)) ensureTagForValueLocked(state.genres, clean);
            for (String id : trackIds) {
                Track track = trackIndex.get(id);
                if (track == null) {
                    continue;
                }
                if ("block".equals(field)) {
                    track.block = clean;
                } else {
                    track.genre = clean;
                }
            }
        }
        saveNow();
        emitTaxonomy();
        emitTracks();
        return Map.of("tracks", List.copyOf(state.tracks), "blocks", copies(state.blocks), "genres", copies(state.genres));
    }

    private void emitTaxonomy() {
        synchronized (lock) {
            emitter.accept("taxonomy.updated", Map.of("blocks", copies(state.blocks), "genres", copies(state.genres)));
        }
    }

    private void emitTracks() {
        synchronized (lock) {
            emitter.accept("library.tracks", Map.of("tracks", List.copyOf(state.tracks)));
        }
    }

    private void ensureTaxonomyLocked() {
        boolean migrating = state.schemaVersion < 2;
        boolean restoreEmpty = state.blocks.isEmpty() || state.genres.isEmpty();
        List<Tag> legacyBlocks = migrating || state.blocks.isEmpty()
                ? Taxonomy.read(sourceFile("blocks.json")) : List.of();
        List<Tag> legacyGenres = migrating || state.genres.isEmpty()
                ? Taxonomy.read(sourceFile("genres.json")) : List.of();
        state.blocks = Taxonomy.merge(state.blocks, legacyBlocks, collectValues("block"));
        state.genres = Taxonomy.merge(state.genres, legacyGenres, collectValues("genre"));
    }

    /** Fill metadata lost by older root-switch builds from the legacy source files. */
    private boolean repairLegacyMetadataLocked() {
        if (settings.libraryRoot == null || settings.libraryRoot.isBlank()) return false;
        LegacyData legacy = LegacyData.load(Path.of(settings.libraryRoot));
        if (!legacy.isPresent()) return false;
        boolean changed = false;
        for (Track track : state.tracks) {
            if (track.path == null) continue;
            LegacyData.Entry entry = legacy.find(track.path);
            if (entry == null) continue;
            if ((track.rating <= 0) && entry.rating > 0) {
                track.rating = entry.rating;
                changed = true;
            }
            if (blank(track.note) && !blank(entry.note)) {
                track.note = entry.note;
                changed = true;
            }
            if (blank(track.block) && !blank(entry.block)) {
                track.block = entry.block;
                changed = true;
            }
            if (blank(track.genre) && !blank(entry.genre)) {
                track.genre = entry.genre;
                changed = true;
            }
            if (blank(track.title) && !blank(entry.title)) {
                track.title = entry.title;
                changed = true;
            }
            if (blank(track.artist) && !blank(entry.artist)) {
                track.artist = entry.artist;
                changed = true;
            }
            if (track.duration <= 0 && entry.duration > 0) {
                track.duration = entry.duration;
                changed = true;
            }
            if (track.playCount < entry.playCount) {
                track.playCount = entry.playCount;
                changed = true;
            }
            if (blank(track.coverPath) && !blank(entry.cover)) {
                Path cover = Path.of(entry.cover);
                if (Files.isRegularFile(cover)) {
                    track.coverPath = cover.toAbsolutePath().normalize().toString();
                    changed = true;
                }
            }
        }
        return changed;
    }

    private void ensureTrackTaxonomyLocked() {
        for (Track track : state.tracks) {
            ensureTagForValueLocked(state.blocks, blockOf(track));
            ensureTagForValueLocked(state.genres, genreOf(track));
        }
    }

    private void ensureTagForValueLocked(List<Tag> tags, String value) {
        if (value == null || value.isBlank() || Taxonomy.find(tags, value) != null) {
            return;
        }
        tags.add(new Tag(value, Taxonomy.defaultColor(value)));
    }

    private Iterable<String> collectValues(String field) {
        List<String> values = new ArrayList<>();
        for (Track track : state.tracks) {
            String value = "block".equals(field) ? blockOf(track) : genreOf(track);
            if (!value.isBlank()) values.add(value);
        }
        return values;
    }

    private List<Tag> tagsFor(String kind) {
        return "genre".equals(kind) ? state.genres : state.blocks;
    }

    private Path sourceFile(String name) {
        if (settings.libraryRoot == null) {
            return null;
        }
        Path root = Path.of(settings.libraryRoot);
        // Legacy source files live next to the music directory
        // (<library>/source/music -> <library>/source/ratings.json).
        Path parent = root.getParent();
        if (parent != null) {
            Path candidate = parent.resolve(name);
            if (Files.isRegularFile(candidate)) return candidate;
        }
        Path nested = root.resolve(name);
        return Files.isRegularFile(nested) ? nested : null;
    }

    private static String blockOf(Track track) {
        return track.block == null ? "" : track.block.trim();
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String genreOf(Track track) {
        return track.genre == null ? "" : track.genre.trim();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String sanitizeTagName(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty()) throw new IllegalArgumentException("Name cannot be empty.");
        if (clean.length() > 48) throw new IllegalArgumentException("Keep names under 48 characters.");
        return clean;
    }

    private static List<Tag> copies(List<Tag> tags) {
        return tags.stream().map(Tag::copy).toList();
    }

    public Map<String, Object> setPlaybackEngine(String requested) {
        synchronized (lock) {
            String engine = EngineFactory.normalize(requested);
            settings.playbackEngine = engine;
            try {
                store.saveSettings(settings);
            } catch (IOException e) {
                throw new IllegalStateException("无法保存播放引擎设置: " + e.getMessage(), e);
            }
            return Map.of(
                    "playbackEngine", engine,
                    "restartRequired", true,
                    "engines", EngineFactory.availability());
        }
    }

    public Map<String, Object> setOutputMode(String requested) {
        synchronized (lock) {
            String mode = switch (requested == null ? "" : requested.trim().toLowerCase()) {
                case "dop64" -> "dop64";
                case "dop128" -> "dop128";
                default -> "pcm";
            };
            settings.outputMode = mode;
            try {
                store.saveSettings(settings);
            } catch (IOException e) {
                throw new IllegalStateException("无法保存输出模式: " + e.getMessage(), e);
            }
            return Map.of("outputMode", mode, "restartRequired", true);
        }
    }

    public Map<String, Object> setSpatial(boolean enabled, double x, double y, boolean persist) {
        synchronized (lock) {
            settings.spatialEnabled = enabled;
            settings.spatialX = Math.max(-1, Math.min(1, x));
            settings.spatialY = Math.max(-1, Math.min(1, y));
            if (persist) {
                try {
                    store.saveSettings(settings);
                } catch (IOException e) {
                    throw new IllegalStateException("无法保存空间声场: " + e.getMessage(), e);
                }
            }
            // Live preview while dragging: apply without touching the disk.
            playback.applySpatial();
            return Map.of("enabled", settings.spatialEnabled,
                    "x", settings.spatialX, "y", settings.spatialY,
                    "persisted", persist);
        }
    }

    public Map<String, Object> setFollowRate(boolean enabled) {
        synchronized (lock) {
            settings.followSourceRate = enabled;
            try {
                store.saveSettings(settings);
            } catch (IOException e) {
                throw new IllegalStateException("无法保存采样率跟随: " + e.getMessage(), e);
            }
            PlaybackEngine engine = playback.engine();
            if (engine != null) engine.setFollowSourceRate(enabled);
            return Map.of("followSourceRate", enabled, "appliesOnNextPlay", true);
        }
    }

    public Map<String, Object> setCrossfeed(boolean enabled, double strength, boolean persist) {
        synchronized (lock) {
            settings.crossfeedEnabled = enabled;
            settings.crossfeedStrength = Math.max(0, Math.min(1, strength));
            if (persist) {
                try {
                    store.saveSettings(settings);
                } catch (IOException e) {
                    throw new IllegalStateException("无法保存交叉馈电: " + e.getMessage(), e);
                }
            }
            playback.applyCrossfeed();
            return Map.of("enabled", enabled, "strength", settings.crossfeedStrength, "persisted", persist);
        }
    }

    public Map<String, Object> setExclusive(boolean enabled) {
        synchronized (lock) {
            settings.exclusive = enabled;
            try {
                store.saveSettings(settings);
            } catch (IOException e) {
                throw new IllegalStateException("无法保存独占设置: " + e.getMessage(), e);
            }
            PlaybackEngine engine = playback.engine();
            if (engine != null) engine.setExclusive(enabled);
            return Map.of("exclusive", enabled, "restartRequired", false);
        }
    }

    public Map<String, Object> eqState() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", eqStore.on);
        out.put("on", eqStore.on);
        out.put("version", EqStore.FORMAT_VERSION);
        out.put("global", presetMap(eqStore.global, "Global"));
        // Flat compatibility fields used by older callers.
        out.put("preamp", eqStore.global.preamp);
        out.put("bands", eqStore.global.bands);
        out.put("presets", eqStore.presets.entrySet().stream()
                .map(entry -> presetMap(entry.getValue(), entry.getKey())).toList());
        out.put("songCount", eqStore.songCount());
        String currentId = String.valueOf(playback.state().get("trackId"));
        Track current = currentId == null || "null".equals(currentId) ? null : findTrack(currentId);
        Map<String, Object> currentTrack = null;
        Map<String, Object> songPreset = null;
        if (current != null) {
            EqPreset song = eqStore.forSong(current.path, neteaseIdFor(current.path));
            currentTrack = new LinkedHashMap<>();
            currentTrack.put("id", current.id);
            currentTrack.put("title", current.title);
            currentTrack.put("artist", current.artist);
            currentTrack.put("path", current.path);
            currentTrack.put("hasSongPreset", song != null);
            if (song != null) songPreset = presetMap(song, current.title);
        }
        out.put("currentTrack", currentTrack);
        out.put("songPreset", songPreset);

        PlaybackEngine engine = playback.engine();
        boolean available = engine != null && engine.available() && engine.eqAvailable();
        out.put("available", available);
        out.put("error", engine == null ? null : engine.error());
        out.put("neutralPreamp", EqPreset.NEUTRAL_PREAMP);
        List<Float> frequencies = engine == null ? List.of() : engine.eqFrequencies();
        if (frequencies.size() < EqPreset.BANDS) {
            frequencies = List.of(31.25f, 62.5f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f);
        }
        out.put("frequencies", frequencies);
        out.put("labels", frequencies.stream().map(EqPreset::frequencyLabel).toList());
        List<Map<String, Object>> factory = new ArrayList<>();
        if (engine != null && available) {
            for (String name : engine.eqFactoryPresetNames()) {
                PlaybackEngine.EqCurve curve = engine.eqFactoryPreset(name);
                if (curve == null) continue;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("name", name);
                item.put("preamp", curve.preamp());
                item.put("bands", curve.bands());
                factory.add(item);
            }
        }
        out.put("factoryPresets", factory);
        return out;
    }

    public Map<String, Object> eqSetEnabled(boolean enabled) {
        eqStore.on = enabled;
        saveEq();
        playback.applyEq();
        return eqState();
    }

    /** Live draft preview; never persists. */
    public Map<String, Object> eqPreview(List<Float> bands, float preamp) {
        EqPreset draft = presetFrom(bands, preamp);
        playback.applyEqPreview(draft, eqStore.on);
        return Map.of("ok", true, "preamp", draft.preamp, "bands", draft.bands);
    }

    /** Compatibility setter; edits and persists the global preset. */
    public Map<String, Object> eqSetBand(int index, float value) {
        if (index < 0 || index >= EqPreset.BANDS) throw new IllegalArgumentException("Invalid EQ band.");
        eqStore.global.bands[index] = EqPreset.clamp(value);
        saveEq();
        playback.applyEq();
        return Map.of("ok", true);
    }

    public Map<String, Object> eqSetPreamp(float value) {
        eqStore.global.preamp = EqPreset.clamp(value);
        saveEq();
        playback.applyEq();
        return Map.of("ok", true);
    }

    public Map<String, Object> eqSaveGlobal(List<Float> bands, float preamp) {
        eqStore.global = presetFrom(bands, preamp);
        saveEq();
        playback.applyEq();
        return eqState();
    }

    public Map<String, Object> eqSaveSong(List<Float> bands, float preamp) {
        String currentId = String.valueOf(playback.state().get("trackId"));
        Track current = currentId == null || "null".equals(currentId) ? null : findTrack(currentId);
        if (current == null) throw new IllegalStateException("Play a song before saving a per-song preset.");
        eqStore.saveSong(current.path, neteaseIdFor(current.path), presetFrom(bands, preamp));
        saveEq();
        playback.applyEq();
        return eqState();
    }

    public Map<String, Object> eqSaveNamed(String name, List<Float> bands, float preamp) {
        eqStore.putPreset(name, presetFrom(bands, preamp));
        saveEq();
        return eqState();
    }

    public Map<String, Object> eqDeletePreset(String name) {
        eqStore.removePreset(name);
        saveEq();
        return eqState();
    }

    public Map<String, Object> eqApplyFactoryPreset(String name) {
        PlaybackEngine engine = playback.engine();
        PlaybackEngine.EqCurve curve = engine == null ? null : engine.eqFactoryPreset(name);
        if (curve == null) throw new IllegalArgumentException("Unknown factory preset.");
        eqStore.global = presetFrom(toList(curve.bands()), curve.preamp());
        eqStore.on = true;
        saveEq();
        playback.applyEq();
        return eqState();
    }

    public Map<String, Object> eqApplyPreset(String name) {
        EqPreset preset = eqStore.preset(name);
        if (preset == null) throw new IllegalArgumentException("Unknown preset.");
        eqStore.global = preset;
        eqStore.on = true;
        saveEq();
        playback.applyEq();
        return eqState();
    }

    public Map<String, Object> eqReset() {
        eqStore.global = new EqPreset();
        saveEq();
        playback.applyEq();
        return eqState();
    }

    public Map<String, Object> eqRestore() {
        playback.applyEq();
        return eqState();
    }

    private void saveEq() {
        try {
            eqStore.save(store.eqFile());
        } catch (Exception e) {
            System.err.println("[eq] unable to save eq.json: " + e.getMessage());
        }
    }

    private static Map<String, Object> presetMap(EqPreset preset, String name) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("preamp", preset.preamp);
        map.put("bands", preset.bands.clone());
        return map;
    }

    private static EqPreset presetFrom(List<Float> bands, float preamp) {
        EqPreset preset = new EqPreset();
        preset.preamp = EqPreset.clamp(preamp);
        if (bands != null) {
            for (int i = 0; i < EqPreset.BANDS && i < bands.size(); i++) {
                preset.bands[i] = EqPreset.clamp(bands.get(i) == null ? 0f : bands.get(i));
            }
        }
        return preset;
    }

    private static List<Float> toList(float[] values) {
        List<Float> list = new ArrayList<>();
        if (values != null) for (float value : values) list.add(value);
        return list;
    }

    @Override
    public String neteaseIdFor(String path) {
        NeteaseBindings.Binding binding = neteaseBindings.find(path);
        return binding == null || binding.neteaseId == null ? "" : binding.neteaseId;
    }

    @Override
    public Track findTrack(String id) {
        if (id == null) {
            return null;
        }
        synchronized (lock) {
            return trackIndex.get(id);
        }
    }

    @Override
    public List<Track> tracks() {
        synchronized (lock) {
            return List.copyOf(state.tracks);
        }
    }

    @Override
    public EqStore eqStore() {
        return eqStore;
    }

    @Override
    public Settings settings() {
        return settings;
    }

    @Override
    public void emit(String event, Object data) {
        emitter.accept(event, data);
    }

    @Override
    public void markPlayed(Track track) {
        int count;
        synchronized (lock) {
            track.playCount++;
            count = track.playCount;
            statsStore.recordPlay(track, LocalDateTime.now());
        }
        scheduleSave();
        emitter.accept("track.played", Map.of("trackId", track.id, "playCount", count));
    }

    @Override
    public void recordListening(Track track, double seconds) {
        statsStore.recordListening(track, seconds, LocalDateTime.now());
    }

    @Override
    public void scheduleSave() {
        long generation = ++saveGeneration;
        saver.schedule(() -> {
            if (generation == saveGeneration) {
                saveNow();
            }
        }, 350, TimeUnit.MILLISECONDS);
    }

    public void shutdown() {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        netease.shutdown();
        qq.shutdown();
        playback.shutdown();
        saveNow();
        saver.shutdownNow();
    }

    public void rescanAfterDownload() {
        if (scanning.get()) {
            pendingScan.set(true);
            return;
        }
        startScan();
    }

    public Path dataDir() {
        return store.dataDir();
    }

    public Path libraryRootPath() {
        return settings.libraryRoot == null ? null : Path.of(settings.libraryRoot);
    }

    public NeteaseBindings neteaseBindings() {
        return neteaseBindings;
    }

    private void saveNow() {
        synchronized (lock) {
            try {
                store.saveSettings(settings);
                store.saveLibrary(state);
                statsStore.save();
            } catch (IOException e) {
                System.err.println("[store] save failed: " + e.getMessage());
            }
        }
    }

    private void resolveLibraryRoot() {
        String override = System.getProperty("potatomusic.library");
        if (override == null || override.isBlank()) {
            override = System.getenv("POTATOMUSIC_LIBRARY");
        }
        Path candidate = null;
        if (override != null && !override.isBlank()) {
            candidate = Path.of(override);
        } else if (settings.libraryRoot != null && !settings.libraryRoot.isBlank()) {
            candidate = Path.of(settings.libraryRoot);
        } else {
            Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
            Path legacy = cwd.getParent() == null
                    ? null
                    : cwd.getParent().resolve("PotatoLibrary").resolve("source").resolve("music");
            if (legacy != null && Files.isDirectory(legacy)) {
                candidate = legacy;
            } else {
                candidate = Path.of(System.getProperty("user.home"), "Music", "PotatoMusic");
            }
        }
        Path normalized = LibraryScanner.normalizeLibraryRoot(candidate);
        settings.libraryRoot = normalized == null ? null : normalized.toAbsolutePath().normalize().toString();
    }

    private void rebuildIndex() {
        trackIndex.clear();
        for (Track track : state.tracks) {
            if (track != null && track.id != null) {
                if (track.block == null) track.block = "";
                if (track.genre == null) track.genre = "";
                if (track.note == null) track.note = "";
                trackIndex.put(track.id, track);
            }
        }
    }

    private void pruneFavorites() {
        state.favorites.removeIf(id -> !trackIndex.containsKey(id));
        for (Playlist playlist : state.playlists) {
            playlist.trackIds.removeIf(id -> !trackIndex.containsKey(id));
        }
    }

    private Playlist findPlaylist(String id) {
        if (id == null) {
            return null;
        }
        synchronized (lock) {
            return state.playlists.stream().filter(p -> id.equals(p.id)).findFirst().orElse(null);
        }
    }

    private void emitPlaylists() {
        emitter.accept("library.playlists", Map.of("playlists", List.copyOf(state.playlists)));
    }

    private static String sanitizePlaylistName(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty()) {
            throw new IllegalArgumentException("Playlist name cannot be empty.");
        }
        return clean.length() > 60 ? clean.substring(0, 60) : clean;
    }

    // ─── RPC dispatch ──────────────────────────────────────────────────────

    public Object handle(String method, JsonNode params) {
        JsonNode p = params == null ? Json.MAPPER.createObjectNode() : params;
        return switch (method) {
            case "bootstrap" -> bootstrap();
            case "stats.get" -> statsStore.summary();
            case "library.scan" -> startScan();
            case "library.setRoot" -> setLibraryRoot(text(p, "path", ""));
            case "library.toggleFavorite" -> toggleFavorite(text(p, "trackId", ""));
            case "taxonomy.create" -> createTag(text(p, "kind", "block"), text(p, "name", ""), text(p, "color", ""));
            case "taxonomy.rename" -> renameTag(text(p, "kind", "block"), text(p, "oldName", ""), text(p, "name", ""));
            case "taxonomy.delete" -> deleteTag(text(p, "kind", "block"), text(p, "name", ""));
            case "taxonomy.color" -> setTagColor(text(p, "kind", "block"), text(p, "name", ""), text(p, "color", ""));
            case "library.deleteTrack" -> deleteTrack(text(p, "trackId", ""));
            case "library.updateTrack" -> updateTrack(
                    text(p, "trackId", ""),
                    text(p, "block", ""),
                    text(p, "genre", ""),
                    number(p, "rating", 0),
                    text(p, "note", ""));
            case "library.bulkUpdate" -> bulkUpdate(
                    stringList(p.path("trackIds")),
                    text(p, "field", "block"),
                    text(p, "value", ""));
            case "playlist.create" -> createPlaylist(text(p, "name", ""));
            case "playlist.rename" -> renamePlaylist(text(p, "playlistId", ""), text(p, "name", ""));
            case "playlist.delete" -> deletePlaylist(text(p, "playlistId", ""));
            case "playlist.addTrack" -> addTrackToPlaylist(text(p, "playlistId", ""), text(p, "trackId", ""));
            case "playlist.addTracks" -> addTracksToPlaylist(text(p, "playlistId", ""), stringList(p.path("trackIds")));
            case "playlist.removeTrack" -> removeTrackFromPlaylist(text(p, "playlistId", ""), text(p, "trackId", ""));
            case "playback.play" -> playback.play(
                    text(p, "trackId", ""),
                    stringList(p.path("queue")),
                    number(p, "startAt", 0));
            case "playback.toggle" -> playback.toggle();
            case "playback.next" -> playback.next(false);
            case "playback.previous" -> playback.previous();
            case "playback.seek" -> playback.seek(number(p, "seconds", 0));
            case "playback.volume" -> playback.setVolume(number(p, "volume", settings.volume));
            case "settings.setEngine" -> setPlaybackEngine(text(p, "engine", settings.playbackEngine));
            case "settings.setOutputMode" -> setOutputMode(text(p, "mode", settings.outputMode));
            case "settings.setSpatial" -> setSpatial(
                    bool(p, "enabled", settings.spatialEnabled),
                    number(p, "x", settings.spatialX),
                    number(p, "y", settings.spatialY),
                    bool(p, "persist", true));
            case "settings.setExclusive" -> setExclusive(bool(p, "enabled", settings.exclusive));
            case "settings.setFollowRate" -> setFollowRate(bool(p, "enabled", settings.followSourceRate));
            case "settings.setCrossfeed" -> setCrossfeed(
                    bool(p, "enabled", settings.crossfeedEnabled),
                    number(p, "strength", settings.crossfeedStrength),
                    bool(p, "persist", true));
            case "playback.mute" -> playback.setMuted(bool(p, "muted", false));
            case "playback.repeat" -> playback.setRepeat(text(p, "mode", "off"));
            case "playback.shuffle" -> playback.setShuffle(bool(p, "enabled", false));
            case "playback.enqueue" -> playback.enqueue(text(p, "trackId", ""), bool(p, "next", false));
            case "playback.enqueueMany" -> playback.enqueueMany(stringList(p.path("trackIds")), bool(p, "next", false));
            case "playback.setQueue" -> playback.setQueue(stringList(p.path("queue")));
            case "playback.state" -> playback.state();
            case "eq.state" -> eqState();
            case "eq.setEnabled" -> eqSetEnabled(bool(p, "enabled", false));
            case "eq.setBand" -> eqSetBand((int) number(p, "index", -1), (float) number(p, "value", 0));
            case "eq.setPreamp" -> eqSetPreamp((float) number(p, "value", EqPreset.NEUTRAL_PREAMP));
            case "eq.factoryPreset" -> eqApplyFactoryPreset(text(p, "name", ""));
            case "eq.applyPreset" -> eqApplyPreset(text(p, "name", ""));
            case "eq.reset" -> eqReset();
            case "eq.preview" -> eqPreview(floatList(p.path("bands")), (float) number(p, "preamp", EqPreset.NEUTRAL_PREAMP));
            case "eq.saveGlobal" -> eqSaveGlobal(floatList(p.path("bands")), (float) number(p, "preamp", EqPreset.NEUTRAL_PREAMP));
            case "eq.saveSong" -> eqSaveSong(floatList(p.path("bands")), (float) number(p, "preamp", EqPreset.NEUTRAL_PREAMP));
            case "eq.saveNamed" -> eqSaveNamed(text(p, "name", ""), floatList(p.path("bands")), (float) number(p, "preamp", EqPreset.NEUTRAL_PREAMP));
            case "eq.restore" -> eqRestore();
            case "eq.deletePreset" -> eqDeletePreset(text(p, "name", ""));
            case "lyrics.get" -> lyrics(text(p, "trackId", ""));
            case "netease.status" -> netease.status();
            case "netease.startService" -> netease.startService();
            case "netease.qrKey" -> netease.qrKey();
            case "netease.qrCheck" -> netease.qrCheck(text(p, "key", ""));
            case "netease.loginCookie" -> netease.loginCookie(text(p, "cookie", ""));
            case "netease.logout" -> netease.logout();
            case "netease.search" -> netease.search(text(p, "keywords", ""), (int) number(p, "limit", 30));
            case "netease.playlists" -> netease.playlists();
            case "netease.playlistDetail" -> netease.playlistDetail(text(p, "playlistId", ""));
            case "netease.daily" -> netease.daily();
            case "netease.lyrics" -> netease.lyrics(text(p, "id", ""));
            case "netease.download" -> netease.download(text(p, "id", ""), text(p, "quality", "high"));
            case "qq.status" -> qq.status();
            case "qq.startService" -> qq.startService();
            case "qq.qrKey" -> qq.qrKey();
            case "qq.qrCheck" -> qq.qrCheck(text(p, "key", ""));
            case "qq.logout" -> qq.logout();
            case "qq.search" -> qq.search(text(p, "keywords", ""), (int) number(p, "limit", 30));
            case "qq.playlists" -> qq.playlists();
            case "qq.playlistDetail" -> qq.playlistDetail(text(p, "playlistId", ""));
            case "qq.daily" -> qq.daily();
            case "qq.lyrics" -> qq.lyrics(text(p, "id", ""));
            case "qq.download" -> qq.download(text(p, "id", ""), text(p, "quality", "high"));
            case "bilibili.search" -> bilibili.search(text(p, "keywords", ""), (int) number(p, "limit", 20));
            case "app.shutdown" -> {
                Thread thread = new Thread(() -> {
                    try {
                        Thread.sleep(120);
                    } catch (InterruptedException ignored) {
                    }
                    shutdown();
                    System.exit(0);
                }, "shutdown");
                thread.setDaemon(true);
                thread.start();
                yield Map.of("ok", true);
            }
            default -> throw new IllegalArgumentException("Unknown method: " + method);
        };
    }

    private static String text(JsonNode node, String key, String fallback) {
        JsonNode value = node.get(key);
        return value == null || value.isNull() ? fallback : value.asText(fallback);
    }

    private static double number(JsonNode node, String key, double fallback) {
        JsonNode value = node.get(key);
        return value == null || !value.isNumber() ? fallback : value.asDouble();
    }

    private static boolean bool(JsonNode node, String key, boolean fallback) {
        JsonNode value = node.get(key);
        return value == null || !value.isBoolean() ? fallback : value.asBoolean();
    }

    private static List<Float> floatList(JsonNode array) {
        List<Float> values = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode item : array) values.add((float) item.asDouble(0));
        }
        return values;
    }

    private static List<String> stringList(JsonNode array) {
        List<String> values = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode item : array) {
                if (item.isTextual()) {
                    values.add(item.asText());
                }
            }
        }
        return values;
    }
}
