package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
    public static final String VERSION = "1.0.0";

    private final Object lock = new Object();
    private final DataStore store;
    private final Settings settings;
    private final LibraryState state;
    private final Map<String, Track> trackIndex = new HashMap<>();
    private final NeteaseBindings neteaseBindings;
    private final LibraryScanner scanner;
    private final LyricsService lyrics;
    private final PlaybackController playback;
    private final NeteaseService netease;
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
        this.neteaseBindings = new NeteaseBindings(store.dataDir());
        this.scanner = new LibraryScanner(store.coversDir(), neteaseBindings);
        this.lyrics = new LyricsService(Path.of(settings.libraryRoot), store.dataDir());
        synchronized (lock) {
            rebuildIndex();
            ensureTaxonomyLocked();
            scanNeeded = state.tracks.isEmpty()
                    || !settings.libraryRoot.equals(state.libraryRoot)
                    || state.schemaVersion < 2;
        }
        this.playback = new PlaybackController(this);
        this.playback.warmUpAsync();
        this.netease = new NeteaseService(this);
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
                        } else if (old.rating > 0) {
                            fresh.rating = old.rating;
                        }
                        fresh.playCount = Math.max(fresh.playCount, old.playCount);
                    }
                    state.tracks = scanned;
                    state.libraryRoot = root.toString();
                    state.scannedAt = System.currentTimeMillis();
                    rebuildIndex();
                    ensureTaxonomyLocked();
                    state.schemaVersion = 2;
                    pruneFavorites();
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
            settings.libraryRoot = root.toAbsolutePath().normalize().toString();
            state.libraryRoot = settings.libraryRoot;
            state.tracks = new ArrayList<>();
            state.blocks = new ArrayList<>();
            state.genres = new ArrayList<>();
            state.schemaVersion = 0;
            trackIndex.clear();
            scanNeeded = true;
        }
        saveNow();
        emitter.accept("library.root", Map.of("root", settings.libraryRoot));
        startScan();
        return Map.of("root", settings.libraryRoot, "scanNeeded", true);
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
        scheduleSave();
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
        scheduleSave();
        emitPlaylists();
        return Map.of("playlist", playlist);
    }

    public Map<String, Object> deletePlaylist(String playlistId) {
        synchronized (lock) {
            state.playlists.removeIf(p -> p.id.equals(playlistId));
        }
        scheduleSave();
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
        scheduleSave();
        emitPlaylists();
        return Map.of("playlist", playlist);
    }

    public Map<String, Object> removeTrackFromPlaylist(String playlistId, String trackId) {
        Playlist playlist = findPlaylist(playlistId);
        if (playlist == null) {
            throw new IllegalArgumentException("Unknown playlist.");
        }
        synchronized (lock) {
            playlist.trackIds.remove(trackId);
        }
        scheduleSave();
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

    public Map<String, Object> updateTrack(String trackId, String block, String genre, double rating) {
        Track track = findTrack(trackId);
        if (track == null) {
            throw new IllegalArgumentException("Unknown track.");
        }
        synchronized (lock) {
            track.block = block == null ? "" : block.trim();
            track.genre = genre == null ? "" : genre.trim();
            track.rating = Math.max(0, Math.min(10, rating));
            ensureTagForValueLocked(state.blocks, track.block);
            ensureTagForValueLocked(state.genres, track.genre);
        }
        saveNow();
        emitter.accept("track.updated", track);
        return Map.of("track", track, "blocks", copies(state.blocks), "genres", copies(state.genres));
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
        List<Tag> legacyBlocks = migrating ? Taxonomy.read(sourceFile("blocks.json")) : List.of();
        List<Tag> legacyGenres = migrating ? Taxonomy.read(sourceFile("genres.json")) : List.of();
        state.blocks = Taxonomy.merge(state.blocks, legacyBlocks, collectValues("block"));
        state.genres = Taxonomy.merge(state.genres, legacyGenres, collectValues("genre"));
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
        Path parent = Path.of(settings.libraryRoot).getParent();
        return parent == null ? null : parent.resolve(name);
    }

    private static String blockOf(Track track) {
        return track.block == null ? "" : track.block.trim();
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
        }
        scheduleSave();
        emitter.accept("track.played", Map.of("trackId", track.id, "playCount", count));
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
            case "library.scan" -> startScan();
            case "library.setRoot" -> setLibraryRoot(text(p, "path", ""));
            case "library.toggleFavorite" -> toggleFavorite(text(p, "trackId", ""));
            case "taxonomy.create" -> createTag(text(p, "kind", "block"), text(p, "name", ""), text(p, "color", ""));
            case "taxonomy.rename" -> renameTag(text(p, "kind", "block"), text(p, "oldName", ""), text(p, "name", ""));
            case "taxonomy.delete" -> deleteTag(text(p, "kind", "block"), text(p, "name", ""));
            case "taxonomy.color" -> setTagColor(text(p, "kind", "block"), text(p, "name", ""), text(p, "color", ""));
            case "library.updateTrack" -> updateTrack(
                    text(p, "trackId", ""),
                    text(p, "block", ""),
                    text(p, "genre", ""),
                    number(p, "rating", 0));
            case "library.bulkUpdate" -> bulkUpdate(
                    stringList(p.path("trackIds")),
                    text(p, "field", "block"),
                    text(p, "value", ""));
            case "playlist.create" -> createPlaylist(text(p, "name", ""));
            case "playlist.rename" -> renamePlaylist(text(p, "playlistId", ""), text(p, "name", ""));
            case "playlist.delete" -> deletePlaylist(text(p, "playlistId", ""));
            case "playlist.addTrack" -> addTrackToPlaylist(text(p, "playlistId", ""), text(p, "trackId", ""));
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
            case "playback.mute" -> playback.setMuted(bool(p, "muted", false));
            case "playback.repeat" -> playback.setRepeat(text(p, "mode", "off"));
            case "playback.shuffle" -> playback.setShuffle(bool(p, "enabled", false));
            case "playback.enqueue" -> playback.enqueue(text(p, "trackId", ""), bool(p, "next", false));
            case "playback.setQueue" -> playback.setQueue(stringList(p.path("queue")));
            case "playback.state" -> playback.state();
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
