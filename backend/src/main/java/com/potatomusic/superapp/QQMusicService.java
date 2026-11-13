package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * QQ Music bridge.
 *
 * <p>The renderer never talks to QQ directly. This service talks to a local
 * qq-music-api instance (Koa/TS, MIT), keeps its session cookie and performs
 * downloads into the normal Potatoplayer library.</p>
 */
public final class QQMusicService {
    private static final String UA =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    private final Backend host;
    private final Path dataDir;
    private final String apiBase;
    private final Path apiDir;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .cookieHandler(cookies)
            .build();
    private final DownloadQueue downloader = new DownloadQueue();
    private final AtomicInteger jobSequence = new AtomicInteger(2000);
    private volatile Process serviceProcess;
    private volatile Map<String, Object> cachedStatus;
    private volatile long cachedAt;
    private final java.util.Map<String, java.util.Map<String, Object>> qualityProbes = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<String, Long> qualityProbedAt = new java.util.concurrent.ConcurrentHashMap<>();

    public QQMusicService(Backend host) {
        this.host = host;
        this.dataDir = host.dataDir();
        this.apiBase = resolveApiBase();
        this.apiDir = resolveApiDir();
    }

    public Map<String, Object> status() {
        long now = System.currentTimeMillis();
        Map<String, Object> cached = cachedStatus;
        if (cached != null && now - cachedAt < 8_000) return cached;

        Map<String, Object> status = new LinkedHashMap<>();
        status.put("source", "qq");
        status.put("apiBase", apiBase);
        status.put("apiDir", apiDir == null ? null : apiDir.toString());
        status.put("canStart", startEntry() != null);
        boolean service = serverCheck();
        status.put("service", service);
        if (!service) {
            status.put("loggedIn", false);
            status.put("message", "The local QQ Music API service is not running.");
            cache(status, now);
            return status;
        }
        JsonNode login = get("/login/status", 10);
        JsonNode profile = login == null ? null : login.path("data").path("profile");
        boolean loggedIn = profile != null && profile.isObject() && !profile.isEmpty();
        status.put("loggedIn", loggedIn);
        if (loggedIn) {
            status.put("nickname", firstText(profile, "nickname", "nick", "name", "QQ Music"));
            status.put("avatarUrl", firstText(profile, "avatarUrl", "headurl", "avatar", ""));
            status.put("userId", profile.path("uin").asLong(profile.path("id").asLong(0)));
            status.put("vipType", profile.path("vipType").asInt(0));
            status.put("message", "Connected");
        } else {
            status.put("nickname", "QQ Music");
            status.put("message", "Scan the QR code with the QQ Music app to sign in.");
        }
        cache(status, now);
        return status;
    }

    public synchronized Map<String, Object> startService() {
        if (serverCheck()) {
            cachedAt = 0;
            return status();
        }
        Path entry = startEntry();
        if (entry == null) {
            throw new IllegalStateException(
                    "qq-music-api was not found. Install @yakult-green-tea/qq-music-api at ~/.potatoplayer-super/api/qq-music-api or set -Dpotatomusic.qqApiDir.");
        }
        String node = findNode();
        if (node == null) throw new IllegalStateException("Node.js 20+ was not found. Install Node and try again.");
        try {
            ProcessBuilder pb = new ProcessBuilder(node, entry.toAbsolutePath().toString());
            pb.directory(apiDir.toFile());
            String serviceHome = System.getenv("POTATOMUSIC_SERVICE_HOME");
            if (serviceHome != null && !serviceHome.isBlank()) {
                Path workDir = Path.of(serviceHome, "qq");
                Files.createDirectories(workDir);
                pb.directory(workDir.toFile());
            }
            pb.redirectErrorStream(true);
            int port = URI.create(apiBase).getPort();
            if (port > 0) pb.environment().put("PORT", String.valueOf(port));
            pb.environment().put("QQ_ENABLE_UPDATE_CHECK", "false");
            Process process = pb.start();
            serviceProcess = process;
            Thread reader = new Thread(() -> {
                try (var in = process.getInputStream()) {
                    byte[] buffer = new byte[4096];
                    int n;
                    while ((n = in.read(buffer)) >= 0) {
                        if (systemProperty("potatomusic.debug") != null) System.err.write(buffer, 0, n);
                    }
                } catch (IOException ignored) {
                }
            }, "qq-service-log");
            reader.setDaemon(true);
            reader.start();
            for (int i = 0; i < 100; i++) {
                if (serverCheck()) {
                    cachedAt = 0;
                    return status();
                }
                if (!process.isAlive()) break;
                Thread.sleep(250);
            }
            throw new IllegalStateException("The QQ Music API service did not start. Check that port "
                    + URI.create(apiBase).getPort() + " is free.");
        } catch (Exception e) {
            throw new IllegalStateException("Could not start qq-music-api: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> qrKey() {
        requireService();
        JsonNode keyData = get("/login/qr/key?channel=qqmusic", 12);
        String key = keyData == null ? "" : keyData.path("data").path("unikey").asText("");
        if (key.isBlank()) throw new IllegalStateException("The QQ API returned an empty QR key.");
        JsonNode image = get("/login/qr/create?key=" + encode(key), 12);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("key", key);
        result.put("qrImage", image == null ? null : image.path("data").path("qrimg").asText(null));
        return result;
    }

    public Map<String, Object> qrCheck(String key) {
        requireService();
        Map<String, Object> result = new LinkedHashMap<>();
        if (key == null || key.isBlank()) {
            result.put("code", 801);
            result.put("message", "Waiting for a QR code.");
            return result;
        }
        JsonNode data = get("/login/qr/check?key=" + encode(key), 20);
        int code = data == null ? -1 : data.path("code").asInt(-1);
        result.put("code", code);
        if (code == 803) {
            cachedAt = 0;
            result.put("loggedIn", true);
            result.put("message", "Signed in.");
        } else if (code == 802) {
            result.put("loggedIn", false);
            result.put("message", "Scanned. Confirm on your phone.");
        } else if (code == 800) {
            result.put("loggedIn", false);
            result.put("message", "QR code expired or login failed.");
        } else {
            result.put("loggedIn", false);
            result.put("message", "Waiting for scan…");
        }
        return result;
    }

    public Map<String, Object> logout() {
        if (serverCheck()) get("/logout", 10);
        cookies.getCookieStore().removeAll();
        cachedAt = 0;
        return status();
    }

    public List<Map<String, Object>> search(String keyword, int limit) {
        requireService();
        if (keyword == null || keyword.isBlank()) return List.of();
        JsonNode data = get("/search?keyword=" + encode(keyword.trim()) + "&type=song&page=1&limit="
                + Math.max(1, Math.min(20, limit)), 20);
        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode items = data == null ? null : data.path("items");
        if (items != null && items.isArray()) {
            for (JsonNode item : items) out.add(songSummary(item));
        }
        return out;
    }

    public List<Map<String, Object>> playlists() {
        requireService();
        JsonNode data = get("/recommend/playlists?limit=50", 18);
        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode list = data == null ? null : data.path("playlists");
        if (list != null && list.isArray()) {
            for (JsonNode item : list) {
                Map<String, Object> playlist = new LinkedHashMap<>();
                playlist.put("id", item.path("tid").asText(item.path("dissid").asText("")));
                playlist.put("name", item.path("title").asText(item.path("name").asText("")));
                playlist.put("coverUrl", item.path("picurl").asText(""));
                playlist.put("trackCount", item.path("songnum").asInt(0));
                playlist.put("creator", item.path("creator").path("nick").asText("QQ Music"));
                out.add(playlist);
            }
        }
        return out;
    }

    public Map<String, Object> playlistDetail(String playlistId) {
        requireService();
        JsonNode data = get("/getSongListDetail?disstid=" + encode(playlistId), 22);
        JsonNode cd = data == null ? null : data.path("response").path("cdlist").path(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", playlistId);
        result.put("name", cd == null ? "" : cd.path("dissname").asText(""));
        result.put("coverUrl", cd == null ? "" : cd.path("logo").asText(""));
        List<Map<String, Object>> tracks = new ArrayList<>();
        JsonNode songs = cd == null ? null : cd.path("songlist");
        if (songs != null && songs.isArray()) {
            for (JsonNode song : songs) tracks.add(songSummary(song));
        }
        result.put("tracks", tracks);
        return result;
    }

    public List<Map<String, Object>> daily() {
        requireService();
        JsonNode data = get("/recommend/new-songs?limit=30", 20);
        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode songs = data == null ? null : data.path("songs");
        if (songs != null && songs.isArray()) {
            for (JsonNode song : songs) out.add(songSummary(song));
        }
        return out;
    }

    public Map<String, Object> lyrics(String mid) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("lrc", "");
        result.put("translation", "");
        if (mid == null || mid.isBlank()) return result;
        JsonNode data = get("/getLyric?songmid=" + encode(mid) + "&trans=1", 15);
        JsonNode body = data == null ? null : data.path("response");
        if (body == null || body.isMissingNode()) body = data;
        if (body != null) {
            result.put("lrc", body.path("lyric").asText(""));
            result.put("translation", body.path("trans").asText(""));
        }
        return result;
    }

    public Map<String, Object> comments(String mid, int limit, int offset) {
        requireService();
        if (mid == null || mid.isBlank()) throw new IllegalArgumentException("Missing QQ Music song MID.");
        JsonNode song = songDetail(mid);
        String id = song == null ? "" : song.path("id").asText(song.path("songid").asText(""));
        if (id.isBlank() || !id.matches("\\d+")) {
            throw new IllegalStateException("QQ Music did not return a numeric song id for this MID.");
        }
        int safeLimit = Math.max(1, Math.min(50, limit));
        int safeOffset = Math.max(0, offset);
        JsonNode hot = get("/comment/hot?id=" + encode(id) + "&offset=0&limit=" + safeLimit, 18);
        JsonNode fresh = get("/comment/new?id=" + encode(id) + "&offset=" + safeOffset + "&limit=" + safeLimit, 18);
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> comments = parseQqComments(commentsNode(fresh));
        int total = fresh == null ? 0 : fresh.path("total").asInt(0);
        boolean more = fresh != null && (fresh.path("more").asBoolean(false) || fresh.path("data").path("more").asBoolean(false));
        result.put("total", total);
        result.put("more", more);
        result.put("hot", parseQqComments(commentsNode(hot)));
        result.put("comments", comments);
        return result;
    }

    private static JsonNode commentsNode(JsonNode data) {
        if (data == null) return null;
        JsonNode direct = data.path("comments");
        if (direct.isArray()) return direct;
        JsonNode nested = data.path("data").path("comments");
        return nested.isArray() ? nested : null;
    }

    private List<Map<String, Object>> parseQqComments(JsonNode array) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (array == null || !array.isArray()) return result;
        for (JsonNode node : array) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", node.path("CmId").asText(node.path("id").asText("")));
            item.put("user", node.path("Nick").asText(node.path("nick").asText("")));
            item.put("avatarUrl", node.path("Avatar").asText(node.path("avatar").asText("")));
            item.put("content", node.path("Content").asText(node.path("content").asText("")));
            long time = node.path("PubTime").asLong(node.path("time").asLong(0));
            if (time > 0 && time < 1_000_000_000_000L) time *= 1000L;
            item.put("time", time);
            item.put("liked", node.path("PraiseNum").asInt(node.path("praiseCount").asInt(0)));
            item.put("location", node.path("Location").asText(node.path("location").asText("")));
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> download(String mid, String quality, String block, String genre, String title) {
        if (mid == null || mid.isBlank()) throw new IllegalArgumentException("Missing QQ Music song mid.");
        String jobId = "qq-" + jobSequence.incrementAndGet();
        downloader.submit(jobId,
                () -> emit("download.progress", progress(jobId, mid, title.isBlank() ? mid : title, 0, -1, "queued")),
                () -> downloadJob(
                jobId,
                mid,
                quality == null ? "high" : quality,
                block == null ? "" : block.trim(),
                genre == null ? "" : genre.trim()),
                () -> emit("download.cancelled", Map.of("jobId", jobId, "neteaseId", mid, "source", "qq")));
        return Map.of("jobId", jobId, "neteaseId", mid, "source", "qq");
    }

    public Map<String, Object> cancelDownload(String jobId) {
        return Map.of("cancelled", downloader.cancel(jobId));
    }

    public void shutdown() {
        downloader.shutdownNow();
        Process process = serviceProcess;
        if (process != null && process.isAlive()) {
            process.destroy();
            try {
                if (!process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)) process.destroyForcibly();
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void downloadJob(String jobId, String mid, String quality, String targetBlock, String targetGenre) {
        Path part = null;
        Path lyrics = null;
        try {
            downloader.check();
            requireService();
            downloader.check();
            String bindingId = "qq:" + mid;
            String requestedQuality = AudioQuality.normalize(quality);
            boolean clearBlock = DownloadTargets.clears(targetBlock);
            boolean setBlock = DownloadTargets.specifies(targetBlock);
            boolean clearGenre = DownloadTargets.clears(targetGenre);
            boolean setGenre = DownloadTargets.specifies(targetGenre);
            NeteaseBindings.Binding existing = host.neteaseBindings().findByNeteaseId(bindingId);
            Track local = host.findTrackByOnlineId(null, mid);
            Path existingPath = localPath(local, existing);
            String existingQuality = AudioQuality.existingLabel(existing == null ? null : existing.quality,
                    existingPath == null ? null : existingPath.toString());
            // A higher tier replaces the audio file; anything else keeps the copy and only refreshes its info.
            boolean replace = existingPath != null && AudioQuality.rank(requestedQuality) > AudioQuality.rank(existingQuality);
            if (existingPath != null && !replace) {
                downloader.commit();
                Map<String, Object> done = local != null
                        ? existingDownload(jobId, mid, existing, local, targetBlock, targetGenre)
                        : existingBindingDownload(jobId, mid, existing, targetBlock, targetGenre);
                done.put("quality", existingQuality);
                done.put("requestedQuality", requestedQuality);
                done.put("replaced", false);
                emit("download.done", done);
                return;
            }

            JsonNode song = songDetail(mid);
            if (song == null || song.isMissingNode()) throw new IllegalStateException("This QQ Music song is no longer available.");
            String title = firstText(song, "name", "title", "Unknown title");
            String artist = artistsOf(song);
            String album = albumOf(song);
            String coverUrl = coverOf(song);

            emit("download.progress", progress(jobId, mid, title, 0, -1, "resolving"));
            QqAudioSource audio = audioUrl(mid, requestedQuality);
            if (!audio.present()) {
                throw new IllegalStateException("No QQ Music playback URL. Sign in with a QQ Music account that can play this song.");
            }
            String servedQuality = audio.level().isBlank() ? requestedQuality : audio.level();
            Path root = host.libraryRootPath();
            if (root == null || !Files.isDirectory(root)) throw new IllegalStateException("Choose a music folder before downloading.");
            String extension = extension(audio.type(), audio.url());
            String baseName = sanitize(artist + " - " + title);
            // Same container: replace the bytes under the old path so the track keeps its
            // id, rating, note, play count, favorites and playlist membership.
            boolean inPlace = existingPath != null && extension.equals(extensionOf(existingPath));
            Path target = inPlace ? existingPath : uniquePath(root, baseName, extension);
            part = target.resolveSibling(target.getFileName() + ".part");
            emit("download.progress", progress(jobId, mid, title, 0, -1, "downloading"));
            downloadFile(audio.url(), part, jobId, mid, title);
            if (Files.size(part) < 32_768) {
                Files.deleteIfExists(part);
                throw new IllegalStateException("The server returned an incomplete QQ Music file.");
            }

            servedQuality = AudioQuality.existingLabel(servedQuality, part.toString());
            if (existingPath != null && AudioQuality.rank(servedQuality)
                    <= AudioQuality.rank(existingQuality)) {
                // QQ has no better container for this song: keep the existing file.
                Files.deleteIfExists(part);
                downloader.commit();
                Map<String, Object> done = local != null
                        ? existingDownload(jobId, mid, existing, local, targetBlock, targetGenre)
                        : existingBindingDownload(jobId, mid, existing, targetBlock, targetGenre);
                done.put("quality", existingQuality);
                done.put("requestedQuality", requestedQuality);
                done.put("replaced", false);
                done.put("upgradeUnavailable", true);
                emit("download.done", done);
                return;
            }

            String coverPath = cacheCover(mid, coverUrl);
            downloader.check();
            lyrics = part.resolveSibling(part.getFileName() + "-" + jobId + ".tmp");
            saveLyrics(lyrics, mid);
            downloader.commit();
            Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
            DownloadQueue.publishLyrics(lyrics, target);
            lyrics = null;
            if (existingPath != null && !existingPath.equals(target)) {
                try {
                    Files.deleteIfExists(existingPath);
                } catch (IOException e) {
                    System.err.println("[qq] could not delete replaced file " + existingPath + ": " + e.getMessage());
                }
            }
            NeteaseBindings.Binding binding = existing == null ? new NeteaseBindings.Binding() : existing;
            String previousBindingPath = existing == null ? null : existing.path;
            String previousBlock = existing != null && existing.block != null ? existing.block
                    : local != null && local.block != null ? local.block : "";
            String previousGenre = existing != null && existing.genre != null ? existing.genre
                    : local != null && local.genre != null ? local.genre : "";
            binding.neteaseId = bindingId;
            binding.path = target.toString();
            binding.title = title;
            binding.artist = artist;
            binding.album = album;
            binding.coverPath = coverPath;
            binding.quality = servedQuality;
            binding.block = clearBlock ? "" : setBlock ? targetBlock : previousBlock;
            binding.genre = clearGenre ? "" : setGenre ? targetGenre : previousGenre;
            binding.downloadedAt = System.currentTimeMillis();
            host.neteaseBindings().put(binding);
            clearQualityCache(mid);
            if (previousBindingPath != null && !previousBindingPath.equals(target.toString())) {
                // The sidecar is keyed by path: drop the entry for the container that was replaced.
                host.neteaseBindings().remove(previousBindingPath);
            }
            if (existingPath != null && !existingPath.equals(target) && local != null) {
                host.relocateDownloadedTrack(local.id, target.toString());
            }

            Map<String, Object> done = new LinkedHashMap<>();
            done.put("jobId", jobId);
            done.put("neteaseId", mid);
            done.put("title", title);
            done.put("artist", artist);
            done.put("album", album);
            done.put("path", target.toString());
            done.put("coverPath", coverPath == null ? "" : coverPath);
            done.put("source", "qq");
            done.put("duplicate", false);
            done.put("replaced", existingPath != null);
            done.put("quality", servedQuality);
            done.put("requestedQuality", requestedQuality);
            if (existingPath != null) {
                done.put("previousQuality", existingQuality);
            }
            Track resultingTrack = host.findTrackByOnlineId(null, mid);
            if (resultingTrack != null) done.put("trackId", resultingTrack.id);
            done.put("block", binding.block);
            done.put("genre", binding.genre);
            emit("download.done", done);
            host.rescanAfterDownload();
        } catch (Exception e) {
            DownloadQueue.cleanLyrics(lyrics);
            if (part != null) {
                try {
                    Files.deleteIfExists(part);
                } catch (IOException ignored) {
                }
            }
            emit("download.error", Map.of(
                    "jobId", jobId, "neteaseId", mid,
                    "message", e.getMessage() == null ? "QQ Music download failed." : e.getMessage()));
        }
    }

    /**
     * The library already holds this song at the requested tier or better. A fresh
     * block/genre selection updates the existing local track (and its binding) instead
     * of downloading again.
     */
    private Map<String, Object> existingDownload(
            String jobId,
            String mid,
            NeteaseBindings.Binding binding,
            Track track,
            String targetBlock,
            String targetGenre) {
        String currentBlock = track.block == null ? "" : track.block;
        String currentGenre = track.genre == null ? "" : track.genre;
        String block = DownloadTargets.clears(targetBlock) ? "" : DownloadTargets.specifies(targetBlock) ? targetBlock : currentBlock;
        String genre = DownloadTargets.clears(targetGenre) ? "" : DownloadTargets.specifies(targetGenre) ? targetGenre : currentGenre;
        boolean changed = !block.equals(currentBlock) || !genre.equals(currentGenre);
        if (binding != null) {
            if (DownloadTargets.specifies(targetBlock) || DownloadTargets.clears(targetBlock)) binding.block = block;
            if (DownloadTargets.specifies(targetGenre) || DownloadTargets.clears(targetGenre)) binding.genre = genre;
            host.neteaseBindings().put(binding);
        }
        if (changed) {
            host.updateTrack(
                    track.id,
                    block,
                    genre,
                    track.rating,
                    track.note,
                    track.neteaseId,
                    track.qqId);
        }
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("jobId", jobId);
        done.put("neteaseId", mid);
        done.put("title", track.title == null ? "" : track.title);
        done.put("artist", track.artist == null ? "" : track.artist);
        done.put("path", track.path);
        done.put("source", "qq");
        done.put("duplicate", true);
        done.put("updated", changed);
        done.put("trackId", track.id);
        done.put("block", block);
        done.put("genre", genre);
        return done;
    }

    /** Same as {@link #existingDownload} when the song is known only through its download binding. */
    private Map<String, Object> existingBindingDownload(
            String jobId,
            String mid,
            NeteaseBindings.Binding existing,
            String targetBlock,
            String targetGenre) {
        boolean updateBlock = !targetBlock.isBlank();
        boolean updateGenre = !targetGenre.isBlank();
        boolean updated = updateBlock || updateGenre;
        if (existing != null) {
            if (updateBlock) existing.block = DownloadTargets.clears(targetBlock) ? "" : targetBlock;
            if (updateGenre) existing.genre = DownloadTargets.clears(targetGenre) ? "" : targetGenre;
            host.neteaseBindings().put(existing);
        }
        host.rescanAfterDownload();
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("jobId", jobId);
        done.put("neteaseId", mid);
        done.put("title", existing == null || existing.title == null ? "" : existing.title);
        done.put("artist", existing == null || existing.artist == null ? "" : existing.artist);
        done.put("path", existing == null || existing.path == null ? "" : existing.path);
        done.put("source", "qq");
        done.put("duplicate", true);
        done.put("updated", updated);
        return done;
    }

    /** Existing file for this song: the library track wins, then the download binding. */
    private static Path localPath(Track local, NeteaseBindings.Binding binding) {
        try {
            if (local != null && local.path != null && Files.isRegularFile(Path.of(local.path))) {
                return Path.of(local.path);
            }
            if (binding != null && binding.path != null && Files.isRegularFile(Path.of(binding.path))) {
                return Path.of(binding.path);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static String extensionOf(Path path) {
        String name = path.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(dot).toLowerCase(java.util.Locale.ROOT) : "";
    }

    private JsonNode songDetail(String mid) {
        try {
            ObjectNode payload = Json.MAPPER.createObjectNode();
            ArrayNode songs = payload.putArray("songs");
            songs.addObject().put("mid", mid);
            JsonNode data = post("/song/batch", payload.toString(), 18);
            JsonNode item = data == null ? null : data.path("results").path(0).path("song");
            if (item != null && !item.isMissingNode() && item.isObject()) return item;
        } catch (Exception ignored) {
        }
        JsonNode legacy = get("/getSongInfo?songmid=" + encode(mid), 18);
        return legacy == null ? null : legacy.path("response").path("songinfo").path("data").path("track_info");
    }

    /** One resolved QQ source: playable URL, container and the level that candidate corresponds to. */
    private record QqAudioSource(String url, String type, String level) {
        boolean present() {
            return url != null && !url.isBlank();
        }
    }

    /**
     * Resolve a playable URL. QQ exposes three containers: {@code flac} for lossless,
     * {@code 320}/{@code 128} for the lossy tiers. Hi-Res and master picks ask for
     * FLAC first, which is the best this endpoint offers.
     */
    private QqAudioSource audioUrl(String mid, String quality) {
        String qqQuality = switch (AudioQuality.rank(quality)) {
            case 0 -> "128";
            case 2, 3, 4 -> "flac";
            default -> "320";
        };
        for (String candidate : new String[]{qqQuality, "320", "128", "m4a"}) {
            JsonNode data = get("/getMusicPlay/" + encode(mid) + "?quality=" + encode(candidate), 22);
            JsonNode play = data == null ? null : data.path("data").path("playUrl").path(mid);
            String url = play == null ? "" : play.path("url").asText("");
            if (url.isBlank()) continue;
            String type = candidate.equals("flac") ? "flac" : candidate.equals("m4a") ? "m4a" : "mp3";
            String level = switch (candidate) {
                case "flac" -> AudioQuality.LOSSLESS;
                case "128" -> AudioQuality.STANDARD;
                default -> AudioQuality.HIGH;
            };
            return new QqAudioSource(url, type, level);
        }
        return new QqAudioSource(null, "", "");
    }

    /**
     * Probe the tiers above {@code fromQuality} that this QQ song can reach.
     * The endpoint exposes FLAC (lossless) or the lossy tiers, so Hi-Res and
     * master selections can only ever be satisfied by FLAC here.
     */
    public List<Map<String, Object>> availableUpgrades(String mid, String fromQuality) {
        requireService();
        if (AudioQuality.rank(fromQuality) >= 2) return List.of();
        Map<String, Object> value = probeFlac(mid);
        return value == null ? List.of() : List.of(value);
    }

    private Map<String, Object> probeFlac(String mid) {
        String key = mid + "|lossless";
        long now = System.currentTimeMillis();
        Long at = qualityProbedAt.get(key);
        Map<String, Object> cached = qualityProbes.get(key);
        if (at != null && cached != null && now - at < 10 * 60_000L) return cached;
        Map<String, Object> value = null;
        try {
            JsonNode data = get("/getMusicPlay/" + encode(mid) + "?quality=flac", 22);
            JsonNode play = data == null ? null : data.path("data").path("playUrl").path(mid);
            String url = play == null ? "" : play.path("url").asText("");
            if (!url.isBlank()) {
                value = new LinkedHashMap<>();
                value.put("quality", AudioQuality.LOSSLESS);
                value.put("servedLevel", AudioQuality.LOSSLESS);
                value.put("type", "flac");
                value.put("br", 0);
                value.put("size", 0);
            }
        } catch (Exception ignored) {
        }
        qualityProbes.put(key, value);
        qualityProbedAt.put(key, now);
        return value;
    }

    /** Drop cached probes for a song after a download changed the copy on disk. */
    public void clearQualityCache(String mid) {
        if (mid == null || mid.isBlank()) return;
        String prefix = mid + "|";
        qualityProbes.keySet().removeIf(key -> key.startsWith(prefix));
        qualityProbedAt.keySet().removeIf(key -> key.startsWith(prefix));
    }

    private void downloadFile(String url, Path part, String jobId, String mid, String title) throws Exception {
        downloader.check();
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(10))
                .header("User-Agent", UA)
                .header("Referer", "https://y.qq.com/")
                .GET().build();
        HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        downloader.attach(response.body());
        if (response.statusCode() >= 400) {
            response.body().close();
            throw new IOException("Audio server returned HTTP " + response.statusCode());
        }
        long total = response.headers().firstValueAsLong("content-length").orElse(-1L);
        long done = 0;
        long lastEmit = 0;
        Files.createDirectories(part.getParent());
        try (InputStream in = response.body(); OutputStream out = Files.newOutputStream(part)) {
            byte[] buffer = new byte[65_536];
            int n;
            while ((n = in.read(buffer)) >= 0) {
                downloader.check();
                if (n == 0) continue;
                out.write(buffer, 0, n);
                done += n;
                long now = System.currentTimeMillis();
                if (now - lastEmit > 350) {
                    lastEmit = now;
                    emit("download.progress", progress(jobId, mid, title, done, total, "downloading"));
                }
            }
        }
        downloader.check();
        emit("download.progress", progress(jobId, mid, title, done, total, "finishing"));
    }

    private String cacheCover(String mid, String coverUrl) {
        if (coverUrl == null || coverUrl.isBlank()) return null;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(coverUrl))
                    .timeout(Duration.ofSeconds(25))
                    .header("User-Agent", UA)
                    .header("Referer", "https://y.qq.com/")
                    .GET().build();
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() >= 400 || response.body().length < 100) return null;
            byte[] bytes = response.body();
            String ext = bytes.length > 3 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' ? ".png" : ".jpg";
            Path target = dataDir.resolve("covers").resolve("qq-" + mid + ext);
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
            return target.toAbsolutePath().normalize().toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void saveLyrics(Path audio, String mid) {
        try {
            Map<String, Object> lyric = lyrics(mid);
            String lrc = String.valueOf(lyric.getOrDefault("lrc", ""));
            String translation = String.valueOf(lyric.getOrDefault("translation", ""));
            if (lrc.isBlank()) return;
            String base = audio.getFileName().toString();
            int dot = base.lastIndexOf('.');
            if (dot > 0) base = base.substring(0, dot);
            Files.writeString(audio.getParent().resolve(base + ".lrc"), lrc, StandardCharsets.UTF_8);
            if (!translation.isBlank()) Files.writeString(audio.getParent().resolve(base + ".trans.lrc"), translation, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
        }
    }

    private Map<String, Object> songSummary(JsonNode song) {
        Map<String, Object> item = new LinkedHashMap<>();
        String mid = song.path("mid").asText(song.path("songmid").asText(""));
        item.put("id", mid);
        item.put("name", song.path("name").asText(song.path("title").asText("")));
        item.put("artists", artistsOf(song));
        item.put("album", albumOf(song));
        item.put("coverUrl", coverOf(song));
        item.put("durationMs", song.path("interval").asLong(0) * 1000L);
        item.put("fee", 0);
        item.put("alias", song.path("subtitle").asText(""));
        return item;
    }

    private static String artistsOf(JsonNode song) {
        List<String> names = new ArrayList<>();
        JsonNode singers = song.path("singer");
        if (!singers.isArray()) singers = song.path("singers");
        if (singers.isArray()) {
            for (JsonNode singer : singers) {
                String name = singer.path("name").asText(singer.path("title").asText(""));
                if (!name.isBlank()) names.add(name);
            }
        }
        if (names.isEmpty()) names.add(song.path("author").asText("Unknown Artist"));
        return String.join(" / ", names);
    }

    private static String albumOf(JsonNode song) {
        JsonNode album = song.path("album");
        return album.path("name").asText(album.path("title").asText(""));
    }

    private static String coverOf(JsonNode song) {
        JsonNode album = song.path("album");
        String url = album.path("pic").asText(album.path("picUrl").asText(""));
        if (url.isBlank()) {
            String mid = album.path("mid").asText("");
            if (!mid.isBlank()) url = "https://y.gtimg.cn/music/photo_new/T002R300x300M000" + mid + ".jpg";
        }
        return url;
    }

    private static String firstText(JsonNode node, String... keys) {
        if (node == null) return "";
        for (String key : keys) {
            String value = node.path(key).asText("");
            if (!value.isBlank()) return value;
        }
        return "";
    }

    private Map<String, Object> progress(String jobId, String mid, String title, long done, long total, String phase) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("jobId", jobId);
        map.put("neteaseId", mid);
        map.put("title", title);
        map.put("downloaded", done);
        map.put("total", total);
        map.put("phase", phase);
        map.put("source", "qq");
        return map;
    }

    private void requireService() {
        if (!serverCheck()) throw new IllegalStateException("The QQ Music API service is not running. Start it from Discover.");
    }

    private boolean serverCheck() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiBase + "/login/status"))
                    .timeout(Duration.ofSeconds(3)).header("User-Agent", UA).GET().build();
            return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() < 500;
        } catch (Exception e) {
            return false;
        }
    }

    private JsonNode get(String path, int timeoutSeconds) {
        downloader.check();
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiBase + path))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("User-Agent", UA).GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.body() == null || response.body().isBlank()) return null;
            return Json.MAPPER.readTree(response.body());
        } catch (Exception e) {
            return null;
        }
    }

    private JsonNode post(String path, String body, int timeoutSeconds) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiBase + path))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("User-Agent", UA)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.body() == null || response.body().isBlank()) return null;
            return Json.MAPPER.readTree(response.body());
        } catch (Exception e) {
            return null;
        }
    }

    private Path startEntry() {
        if (apiDir == null) return null;
        for (String candidate : List.of("dist/src/app.js", "app.js")) {
            Path path = apiDir.resolve(candidate);
            if (Files.isRegularFile(path)) return path;
        }
        return null;
    }

    private String resolveApiBase() {
        String value = System.getProperty("potatomusic.qqApiBase");
        if (value == null || value.isBlank()) value = System.getenv("POTATOMUSIC_QQ_API_BASE");
        if (value == null || value.isBlank()) value = "http://localhost:3200";
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private Path resolveApiDir() {
        String override = System.getProperty("potatomusic.qqApiDir");
        if (override == null || override.isBlank()) override = System.getenv("POTATOMUSIC_QQ_API_DIR");
        if (override != null && !override.isBlank()) {
            Path path = Path.of(override).toAbsolutePath().normalize();
            return Files.isDirectory(path) ? path : null;
        }
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        List<Path> roots = new ArrayList<>();
        if (cwd.getParent() != null) roots.add(cwd.getParent().resolve("api"));
        roots.add(dataDir.resolve("api"));
        roots.add(Path.of(System.getProperty("user.home"), ".potatoplayer-super", "api"));
        for (Path root : roots) {
            Path direct = root.resolve("qq-music-api");
            if (startEntry(direct) != null) return direct;
            Path nested = direct.resolve("node_modules/@yakult-green-tea/qq-music-api");
            if (startEntry(nested) != null) return nested;
            if (!Files.isDirectory(root)) continue;
            try (var stream = Files.list(root)) {
                List<Path> candidates = stream
                        .filter(Files::isDirectory)
                        .filter(path -> path.getFileName().toString().startsWith("qq-music-api"))
                        .filter(path -> startEntry(path) != null)
                        .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                        .toList();
                if (!candidates.isEmpty()) return candidates.get(0);
            } catch (IOException ignored) {
            }
        }
        return null;
    }

    private Path startEntry(Path dir) {
        if (dir == null) return null;
        for (String candidate : List.of("dist/src/app.js", "app.js")) {
            Path path = dir.resolve(candidate);
            if (Files.isRegularFile(path)) return path;
        }
        return null;
    }

    private static String findNode() {
        String override = System.getProperty("potatomusic.node");
        if (override == null || override.isBlank()) override = System.getenv("POTATOMUSIC_NODE");
        if (override != null && !override.isBlank()) return override;
        for (String candidate : List.of("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node", "node")) {
            if (candidate.equals("node") || Files.isExecutable(Path.of(candidate))) return candidate;
        }
        return null;
    }

    private static String extension(String type, String url) {
        String value = (type == null ? "" : type).toLowerCase();
        if (value.contains("flac") || url.toLowerCase().contains(".flac")) return ".flac";
        if (value.contains("m4a") || url.toLowerCase().contains(".m4a")) return ".m4a";
        if (value.contains("ogg") || url.toLowerCase().contains(".ogg")) return ".ogg";
        return ".mp3";
    }

    private static Path uniquePath(Path directory, String base, String extension) {
        Path target = directory.resolve(base + extension);
        int suffix = 2;
        while (Files.exists(target)) {
            target = directory.resolve(base + " (" + suffix + ")" + extension);
            suffix++;
        }
        return target;
    }

    private static String sanitize(String value) {
        String clean = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        if (clean.length() > 150) clean = clean.substring(0, 150).trim();
        return clean.isBlank() ? "qq music track" : clean;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private void cache(Map<String, Object> status, long now) {
        cachedStatus = status;
        cachedAt = now;
    }

    private void emit(String event, Object data) {
        downloader.emit(() -> host.emit(event, data));
    }

    private static String systemProperty(String key) {
        return System.getProperty(key);
    }
}
