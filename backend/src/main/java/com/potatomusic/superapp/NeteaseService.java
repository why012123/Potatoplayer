package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * NetEase Cloud Music bridge.
 *
 * <p>It talks to a local api-enhanced instance. The service is optional: the
 * rest of the player works with it stopped. The legacy Potato Player cookie is
 * imported once so existing users do not have to sign in again.</p>
 */
public final class NeteaseService {
    private static final String UA =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    private final Backend host;
    private final Path dataDir;
    private final Path cookieFile;
    private final String apiBase;
    private final Path apiDir;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ExecutorService downloader = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "netease-downloader");
        t.setDaemon(true);
        return t;
    });
    private final AtomicInteger jobSequence = new AtomicInteger(1000);
    private volatile String cookie;
    private volatile Process serviceProcess;
    private volatile Map<String, Object> cachedStatus;
    private volatile long cachedAt;

    public NeteaseService(Backend host) {
        this.host = host;
        this.dataDir = host.dataDir();
        this.cookieFile = dataDir.resolve("netease_cookie.txt");
        this.apiBase = resolveApiBase();
        this.apiDir = resolveApiDir();
        importLegacyCookie();
        this.cookie = readCookie();
    }

    public Map<String, Object> status() {
        long now = System.currentTimeMillis();
        Map<String, Object> cached = cachedStatus;
        if (cached != null && now - cachedAt < 8_000) {
            return cached;
        }
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("apiBase", apiBase);
        status.put("apiDir", apiDir == null ? null : apiDir.toString());
        status.put("canStart", apiDir != null && Files.isRegularFile(apiDir.resolve("app.js")));
        boolean service = serverCheck();
        status.put("service", service);
        if (!service) {
            status.put("loggedIn", false);
            status.put("message", "The local NetEase API service is not running.");
            cachedStatus = status;
            cachedAt = now;
            return status;
        }
        if (cookie == null || cookie.isBlank()) {
            status.put("loggedIn", false);
            status.put("message", "Sign in with the NetEase app or a cookie.");
            cachedStatus = status;
            cachedAt = now;
            return status;
        }
        JsonNode account = get("/user/account", 10);
        int code = account == null ? -1 : code(account);
        if (code == 200 && account.has("profile")) {
            JsonNode profile = account.get("profile");
            status.put("loggedIn", true);
            status.put("nickname", profile.path("nickname").asText(""));
            status.put("avatarUrl", profile.path("avatarUrl").asText(""));
            status.put("userId", profile.path("userId").asLong(0));
            status.put("vipType", profile.path("vipType").asInt(0));
            status.put("message", "Connected");
        } else {
            status.put("loggedIn", false);
            status.put("message", code == 301 ? "The saved session expired." : "Not signed in.");
        }
        cachedStatus = status;
        cachedAt = now;
        return status;
    }

    public Map<String, Object> startService() {
        if (serverCheck()) {
            cachedAt = 0;
            return status();
        }
        if (apiDir == null || !Files.isRegularFile(apiDir.resolve("app.js"))) {
            throw new IllegalStateException(
                    "api-enhanced was not found. Place it at ~/.potatoplayer-super/api/api-enhanced-4.35.0 or set -Dpotatomusic.apiDir.");
        }
        String node = findNode();
        if (node == null) {
            throw new IllegalStateException("Node.js was not found. Install Node 18+ and try again.");
        }
        try {
            ProcessBuilder pb = new ProcessBuilder(node, "app.js");
            pb.directory(apiDir.toFile());
            pb.redirectErrorStream(true);
            int port = URI.create(apiBase).getPort();
            if (port > 0) {
                pb.environment().put("PORT", String.valueOf(port));
            }
            Process process = pb.start();
            serviceProcess = process;
            Thread reader = new Thread(() -> {
                try (var in = process.getInputStream()) {
                    byte[] buffer = new byte[4096];
                    int n;
                    while ((n = in.read(buffer)) >= 0) {
                        if (systemProperty("potatomusic.debug") != null) {
                            System.err.write(buffer, 0, n);
                        }
                    }
                } catch (IOException ignored) {
                }
            }, "netease-service-log");
            reader.setDaemon(true);
            reader.start();
            for (int i = 0; i < 80; i++) {
                if (serverCheck()) {
                    cachedAt = 0;
                    return status();
                }
                if (!process.isAlive()) {
                    break;
                }
                Thread.sleep(250);
            }
            throw new IllegalStateException("The NetEase API service did not start. Check that port "
                    + URI.create(apiBase).getPort() + " is free.");
        } catch (Exception e) {
            throw new IllegalStateException("Could not start api-enhanced: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> qrKey() {
        requireService();
        JsonNode data = get("/login/qr/key", 12);
        if (data == null || code(data) != 200) {
            throw new IllegalStateException(message(data, "Could not create a login QR code."));
        }
        String key = data.path("data").path("unikey").asText("");
        if (key.isBlank()) {
            throw new IllegalStateException("The API returned an empty QR key.");
        }
        JsonNode image = get("/login/qr/create?key=" + encode(key) + "&qrimg=true", 12);
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
        JsonNode data = get("/login/qr/check?key=" + encode(key) + "&noCookie=true", 12);
        int code = data == null ? -1 : code(data);
        result.put("code", code);
        if (code == 803) {
            String returned = data.path("cookie").asText("");
            if (!returned.isBlank()) saveCookie(returned);
            result.put("loggedIn", true);
            result.put("message", "Signed in.");
            cachedAt = 0;
        } else if (code == 802) {
            result.put("loggedIn", false);
            result.put("message", "Scanned. Confirm on your phone.");
        } else if (code == 800) {
            result.put("loggedIn", false);
            result.put("message", "QR code expired.");
        } else {
            result.put("loggedIn", false);
            result.put("message", "Waiting for scan…");
        }
        return result;
    }

    public Map<String, Object> loginCookie(String value) {
        requireService();
        String candidate = value == null ? "" : value.trim();
        if (candidate.isEmpty()) {
            throw new IllegalArgumentException("Paste the MUSIC_U cookie value.");
        }
        if (!candidate.contains("=")) candidate = "MUSIC_U=" + candidate;
        JsonNode data = get("/user/account", candidate, 12);
        if (data == null || code(data) != 200 || !data.has("profile")) {
            throw new IllegalArgumentException("That cookie is not valid or has expired.");
        }
        saveCookie(candidate);
        cachedAt = 0;
        return status();
    }

    public Map<String, Object> logout() {
        cookie = null;
        try {
            Files.deleteIfExists(cookieFile);
        } catch (IOException ignored) {
        }
        cachedAt = 0;
        return status();
    }

    public List<Map<String, Object>> search(String keyword, int limit) {
        requireService();
        if (keyword == null || keyword.isBlank()) return List.of();
        JsonNode data = get("/search?keywords=" + encode(keyword.trim()) + "&type=1&limit=" + Math.max(1, Math.min(50, limit)), 18);
        List<Map<String, Object>> songs = parseSongArray(data == null ? null : data.path("result").path("songs"));
        enrichSearchCovers(songs);
        return songs;
    }

    /**
     * /search omits album art for most rows, while /song/detail still carries
     * al.picUrl. Fetch the missing covers in one batch so the online list shows
     * artwork instead of falling back to a gradient.
     */
    private void enrichSearchCovers(List<Map<String, Object>> songs) {
        List<String> ids = new ArrayList<>();
        for (Map<String, Object> song : songs) {
            String cover = song.get("coverUrl") == null ? "" : String.valueOf(song.get("coverUrl"));
            String id = song.get("id") == null ? "" : String.valueOf(song.get("id"));
            if (!cover.isBlank() || id.isBlank() || ids.contains(id)) continue;
            ids.add(id);
        }
        if (ids.isEmpty()) return;
        try {
            JsonNode detail = get("/song/detail?ids=" + String.join(",", ids), 18);
            JsonNode rows = detail == null ? null : detail.path("songs");
            if (rows == null || !rows.isArray()) return;
            Map<String, String> covers = new LinkedHashMap<>();
            for (JsonNode row : rows) {
                String id = row.path("id").asText("");
                String cover = coverOf(row);
                if (!id.isBlank() && !cover.isBlank()) covers.put(id, cover);
            }
            if (covers.isEmpty()) return;
            for (Map<String, Object> song : songs) {
                String id = song.get("id") == null ? "" : String.valueOf(song.get("id"));
                String cover = song.get("coverUrl") == null ? "" : String.valueOf(song.get("coverUrl"));
                if (cover.isBlank() && covers.containsKey(id)) song.put("coverUrl", covers.get(id));
            }
        } catch (Exception ignored) {
            // Search itself succeeded; a missing cover must not fail the list.
        }
    }

    public List<Map<String, Object>> playlists() {
        requireService();
        JsonNode account = get("/user/account", 10);
        long uid = account == null ? 0 : account.path("profile").path("userId").asLong(0);
        if (uid == 0) {
            throw new IllegalStateException("Sign in to load your playlists.");
        }
        JsonNode data = get("/user/playlist?uid=" + uid + "&limit=100", 16);
        List<Map<String, Object>> result = new ArrayList<>();
        JsonNode list = data == null ? null : data.path("playlist");
        if (list != null && list.isArray()) {
            for (JsonNode item : list) {
                Map<String, Object> playlist = new LinkedHashMap<>();
                playlist.put("id", item.path("id").asText());
                playlist.put("name", item.path("name").asText(""));
                playlist.put("coverUrl", item.path("coverImgUrl").asText(""));
                playlist.put("trackCount", item.path("trackCount").asInt(0));
                playlist.put("creator", item.path("creator").path("nickname").asText(""));
                result.add(playlist);
            }
        }
        return result;
    }

    public Map<String, Object> playlistDetail(String playlistId) {
        requireService();
        JsonNode data = get("/playlist/detail?id=" + encode(playlistId), 18);
        JsonNode playlist = data == null ? null : data.path("playlist");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", playlistId);
        result.put("name", playlist == null ? "" : playlist.path("name").asText(""));
        result.put("coverUrl", playlist == null ? "" : playlist.path("coverImgUrl").asText(""));
        result.put("tracks", playlist == null ? List.of() : parseSongArray(playlist.path("tracks")));
        return result;
    }

    public List<Map<String, Object>> daily() {
        requireService();
        JsonNode data = get("/recommend/songs", 18);
        JsonNode list = data == null ? null : data.path("data").path("dailySongs");
        return parseSongArray(list);
    }

    public Map<String, Object> lyrics(String id) {
        requireService();
        JsonNode data = get("/lyric?id=" + encode(id), 15);
        Map<String, Object> result = new LinkedHashMap<>();
        if (data == null) {
            result.put("lrc", "");
            result.put("translation", "");
            return result;
        }
        result.put("lrc", data.path("lrc").path("lyric").asText(""));
        result.put("translation", data.path("tlyric").path("lyric").asText(""));
        return result;
    }

    public Map<String, Object> comments(String neteaseId, int limit, int offset) {
        requireService();
        if (neteaseId == null || neteaseId.isBlank()) {
            throw new IllegalArgumentException("Missing song id.");
        }
        int safeLimit = Math.max(1, Math.min(50, limit));
        int safeOffset = Math.max(0, offset);
        JsonNode data = get("/comment/music?id=" + encode(neteaseId)
                + "&limit=" + safeLimit + "&offset=" + safeOffset, 18);
        Map<String, Object> result = new LinkedHashMap<>();
        if (data == null) {
            result.put("total", 0);
            result.put("more", false);
            result.put("hot", List.of());
            result.put("comments", List.of());
            return result;
        }
        int total = data.path("total").asInt(0);
        List<Map<String, Object>> comments = parseComments(data.path("comments"));
        result.put("total", total);
        result.put("more", data.path("more").asBoolean(safeOffset + comments.size() < total));
        result.put("hot", parseComments(data.path("hotComments")));
        result.put("comments", comments);
        return result;
    }

    private List<Map<String, Object>> parseComments(JsonNode array) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (array == null || !array.isArray()) return result;
        for (JsonNode node : array) {
            if (node == null || node.isMissingNode()) continue;
            JsonNode user = node.path("user");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", node.path("commentId").asText(""));
            item.put("user", user.path("nickname").asText(""));
            item.put("avatarUrl", user.path("avatarUrl").asText(""));
            item.put("content", node.path("content").asText(""));
            item.put("time", node.path("time").asLong(0));
            item.put("liked", node.path("likedCount").asInt(0));
            item.put("location", node.path("ipLocation").asText(""));
            JsonNode replied = node.path("beReplied");
            if (replied.isArray() && replied.size() > 0) {
                JsonNode first = replied.path(0);
                String name = first.path("user").path("nickname").asText("");
                String content = first.path("content").asText("");
                if (!content.isBlank()) {
                    item.put("replyTo", (name.isBlank() ? "" : name + "：") + content);
                }
            }
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> download(String neteaseId, String quality, String block, String genre) {
        requireService();
        if (neteaseId == null || neteaseId.isBlank()) {
            throw new IllegalArgumentException("Missing song id.");
        }
        String jobId = "netease-" + jobSequence.incrementAndGet();
        downloader.submit(() -> downloadJob(
                jobId,
                neteaseId,
                quality == null ? "high" : quality,
                block == null ? "" : block.trim(),
                genre == null ? "" : genre.trim()));
        return Map.of("jobId", jobId, "neteaseId", neteaseId);
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

    private void downloadJob(String jobId, String neteaseId, String quality, String targetBlock, String targetGenre) {
        Path part = null;
        try {
            NeteaseBindings.Binding existing = host.neteaseBindings().findByNeteaseId(neteaseId);
            Track local = host.findTrackByOnlineId(neteaseId, null);
            if (local != null && Files.isRegularFile(Path.of(local.path))) {
                Map<String, Object> done = existingDownload(
                        jobId, neteaseId, existing, local, targetBlock, targetGenre);
                emit("download.done", done);
                return;
            }
            if (existing != null && Files.isRegularFile(Path.of(existing.path))) {
                if (!targetBlock.isBlank()) existing.block = targetBlock;
                if (!targetGenre.isBlank()) existing.genre = targetGenre;
                host.neteaseBindings().put(existing);
                host.rescanAfterDownload();
                Map<String, Object> done = new LinkedHashMap<>();
                done.put("jobId", jobId);
                done.put("neteaseId", neteaseId);
                done.put("title", existing.title == null ? "" : existing.title);
                done.put("artist", existing.artist == null ? "" : existing.artist);
                done.put("path", existing.path);
                done.put("source", "netease");
                done.put("duplicate", true);
                done.put("updated", !targetBlock.isBlank() || !targetGenre.isBlank());
                emit("download.done", done);
                return;
            }

            JsonNode detail = get("/song/detail?ids=" + encode(neteaseId), 16);
            JsonNode song = detail == null ? null : detail.path("songs").path(0);
            if (song == null || song.isMissingNode()) {
                throw new IllegalStateException("This song is no longer available.");
            }
            String title = song.path("name").asText("Unknown title");
            String artist = artistsOf(song);
            String album = albumOf(song);
            String coverUrl = coverOf(song);
            emit("download.progress", progress(jobId, neteaseId, title, 0, -1, "resolving"));
            String[] audio = audioUrl(neteaseId, quality);
            if (audio[0] == null || audio[0].isBlank()) {
                throw new IllegalStateException("No playable URL. The song may be region-locked or require a higher account tier.");
            }
            Path root = host.libraryRootPath();
            if (root == null || !Files.isDirectory(root)) {
                throw new IllegalStateException("Choose a music folder before downloading.");
            }
            String extension = extension(audio[1], audio[0]);
            String baseName = sanitize(artist + " - " + title);
            Path target = uniquePath(root, baseName, extension);
            part = target.resolveSibling(target.getFileName() + ".part");
            emit("download.progress", progress(jobId, neteaseId, title, 0, -1, "downloading"));
            downloadFile(audio[0], part, jobId, neteaseId, title);
            Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
            if (Files.size(target) < 32_768) {
                Files.deleteIfExists(target);
                throw new IllegalStateException("The server returned an incomplete file. Sign in and try again.");
            }

            String coverPath = cacheCover(neteaseId, coverUrl);
            saveLyrics(target, neteaseId);

            NeteaseBindings.Binding binding = new NeteaseBindings.Binding();
            binding.neteaseId = neteaseId;
            binding.path = target.toString();
            binding.title = title;
            binding.artist = artist;
            binding.album = album;
            binding.coverPath = coverPath;
            binding.quality = quality;
            binding.block = targetBlock;
            binding.genre = targetGenre;
            binding.downloadedAt = System.currentTimeMillis();
            host.neteaseBindings().put(binding);

            Map<String, Object> done = new LinkedHashMap<>();
            done.put("jobId", jobId);
            done.put("neteaseId", neteaseId);
            done.put("title", title);
            done.put("artist", artist);
            done.put("album", album);
            done.put("path", target.toString());
            done.put("coverPath", coverPath == null ? "" : coverPath);
            done.put("source", "netease");
            done.put("duplicate", false);
            done.put("block", targetBlock);
            done.put("genre", targetGenre);
            emit("download.done", done);
            host.rescanAfterDownload();
        } catch (Exception e) {
            if (part != null) {
                try {
                    Files.deleteIfExists(part);
                } catch (IOException ignored) {
                }
            }
            emit("download.error", Map.of(
                    "jobId", jobId,
                    "neteaseId", neteaseId,
                    "source", "netease",
                    "message", e.getMessage() == null ? "Download failed." : e.getMessage()));
        }
    }

    /**
     * A song already downloaded is never fetched again. A fresh block/genre
     * selection updates the existing local track (and its binding) instead.
     */
    private Map<String, Object> existingDownload(
            String jobId,
            String neteaseId,
            NeteaseBindings.Binding binding,
            Track track,
            String targetBlock,
            String targetGenre) {
        String currentBlock = track.block == null ? "" : track.block;
        String currentGenre = track.genre == null ? "" : track.genre;
        String block = targetBlock.isBlank() ? currentBlock : targetBlock;
        String genre = targetGenre.isBlank() ? currentGenre : targetGenre;
        boolean changed = !block.equals(currentBlock) || !genre.equals(currentGenre);
        if (binding != null) {
            if (!targetBlock.isBlank()) binding.block = targetBlock;
            if (!targetGenre.isBlank()) binding.genre = targetGenre;
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
        done.put("neteaseId", neteaseId);
        done.put("title", track.title == null ? "" : track.title);
        done.put("artist", track.artist == null ? "" : track.artist);
        done.put("path", track.path);
        done.put("source", "netease");
        done.put("duplicate", true);
        done.put("updated", changed);
        done.put("trackId", track.id);
        done.put("block", block);
        done.put("genre", genre);
        return done;
    }

    private String[] audioUrl(String id, String quality) {
        int br;
        String level;
        switch (quality) {
            case "lossless" -> {
                br = 999000;
                level = "lossless";
            }
            case "standard" -> {
                br = 128000;
                level = "standard";
            }
            default -> {
                br = 320000;
                level = "exhigh";
            }
        }
        JsonNode direct = get("/song/url/v1?id=" + encode(id) + "&level=" + level, 20);
        String url = pickUrl(direct);
        String type = pickType(direct);
        if (url != null) return new String[]{url, type};
        JsonNode fallback = get("/song/download/url?id=" + encode(id) + "&br=" + br, 20);
        url = pickUrl(fallback);
        type = pickType(fallback);
        if (url != null) return new String[]{url, type};
        JsonNode legacy = get("/song/url?id=" + encode(id) + "&br=" + br, 20);
        return new String[]{pickUrl(legacy), pickType(legacy)};
    }

    private static String pickUrl(JsonNode data) {
        if (data == null) return null;
        JsonNode item = data.path("data");
        if (item.isArray()) item = item.path(0);
        String url = item.path("url").asText("");
        return url.isBlank() ? null : url;
    }

    private static String pickType(JsonNode data) {
        if (data == null) return "";
        JsonNode item = data.path("data");
        if (item.isArray()) item = item.path(0);
        return item.path("type").asText("");
    }

    private void downloadFile(String url, Path part, String jobId, String neteaseId, String title) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(10))
                .header("User-Agent", UA)
                .header("Referer", "https://music.163.com/")
                .GET()
                .build();
        HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() >= 400) {
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
                if (n == 0) continue;
                out.write(buffer, 0, n);
                done += n;
                long now = System.currentTimeMillis();
                if (now - lastEmit > 350) {
                    lastEmit = now;
                    emit("download.progress", progress(jobId, neteaseId, title, done, total, "downloading"));
                }
            }
        }
        emit("download.progress", progress(jobId, neteaseId, title, done, total, "finishing"));
    }

    private String cacheCover(String id, String coverUrl) {
        if (coverUrl == null || coverUrl.isBlank()) return null;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(coverUrl))
                    .timeout(Duration.ofSeconds(25))
                    .header("User-Agent", UA)
                    .GET()
                    .build();
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() >= 400 || response.body().length < 100) return null;
            byte[] bytes = response.body();
            String ext = bytes.length > 3 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' ? ".png" : ".jpg";
            Path target = host.dataDir().resolve("covers").resolve("netease-" + id + ext);
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
            return target.toAbsolutePath().normalize().toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void saveLyrics(Path audio, String id) {
        try {
            JsonNode lyric = get("/lyric?id=" + encode(id), 15);
            if (lyric == null) return;
            String lrc = lyric.path("lrc").path("lyric").asText("");
            String translation = lyric.path("tlyric").path("lyric").asText("");
            if (lrc.isBlank()) return;
            String base = audio.getFileName().toString();
            int dot = base.lastIndexOf('.');
            if (dot > 0) base = base.substring(0, dot);
            Path dir = audio.getParent();
            Files.writeString(dir.resolve(base + ".lrc"), lrc, StandardCharsets.UTF_8);
            if (!translation.isBlank()) {
                Files.writeString(dir.resolve(base + ".trans.lrc"), translation, StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) {
        }
    }

    private List<Map<String, Object>> parseSongArray(JsonNode array) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (array == null || !array.isArray()) return result;
        for (JsonNode song : array) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", song.path("id").asText());
            item.put("name", song.path("name").asText(""));
            item.put("artists", artistsOf(song));
            item.put("album", albumOf(song));
            item.put("coverUrl", coverOf(song));
            long duration = song.has("dt") ? song.path("dt").asLong() : song.path("duration").asLong();
            item.put("durationMs", duration);
            item.put("fee", song.path("fee").asInt(0));
            JsonNode alias = song.has("alia") ? song.path("alia") : song.path("alias");
            item.put("alias", alias.isArray() && alias.size() > 0 ? alias.path(0).asText("") : "");
            result.add(item);
        }
        return result;
    }

    private static String artistsOf(JsonNode song) {
        List<String> names = new ArrayList<>();
        JsonNode ar = song.has("ar") ? song.path("ar") : song.path("artists");
        if (ar.isArray()) {
            for (JsonNode artist : ar) {
                String name = artist.path("name").asText("");
                if (!name.isBlank()) names.add(name);
            }
        }
        return String.join(" / ", names);
    }

    private static String albumOf(JsonNode song) {
        JsonNode album = song.has("al") ? song.path("al") : song.path("album");
        return album.path("name").asText("");
    }

    private static String coverOf(JsonNode song) {
        JsonNode album = song.has("al") ? song.path("al") : song.path("album");
        String url = album.path("picUrl").asText("");
        if (url.isBlank()) url = album.path("blurPicUrl").asText("");
        return url;
    }

    private Map<String, Object> progress(String jobId, String id, String title, long done, long total, String phase) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("jobId", jobId);
        map.put("neteaseId", id);
        map.put("title", title);
        map.put("downloaded", done);
        map.put("total", total);
        map.put("phase", phase);
        map.put("source", "netease");
        return map;
    }

    private void requireService() {
        if (!serverCheck()) {
            throw new IllegalStateException("The NetEase API service is not running. Start it from Discover.");
        }
    }

    private boolean serverCheck() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiBase + "/"))
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build();
            return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() < 500;
        } catch (Exception e) {
            return false;
        }
    }

    private JsonNode get(String path, int timeoutSeconds) {
        return get(path, cookie, timeoutSeconds);
    }

    private JsonNode get(String path, String explicitCookie, int timeoutSeconds) {
        try {
            String separator = path.contains("?") ? "&" : "?";
            String url = apiBase + path + separator + "timestamp=" + System.currentTimeMillis();
            if (explicitCookie != null && !explicitCookie.isBlank()) {
                url += "&cookie=" + encode(explicitCookie);
            }
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("User-Agent", UA)
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.body() == null || response.body().isBlank()) return null;
            return Json.MAPPER.readTree(response.body());
        } catch (Exception e) {
            return null;
        }
    }

    private void saveCookie(String value) {
        cookie = value;
        cachedAt = 0;
        try {
            Files.createDirectories(cookieFile.getParent());
            Files.writeString(cookieFile, value, StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("[netease] unable to save cookie: " + e.getMessage());
        }
    }

    private String readCookie() {
        try {
            if (Files.isRegularFile(cookieFile)) {
                String value = Files.readString(cookieFile).trim();
                return value.isBlank() ? null : value;
            }
        } catch (IOException ignored) {
        }
        return null;
    }

    private void importLegacyCookie() {
        if (Files.isRegularFile(cookieFile)) return;
        Path root = host.libraryRootPath();
        if (root == null) return;
        Path parent = root.getParent();
        if (parent == null) return;
        Path old = parent.resolve(".cookie");
        if (!Files.isRegularFile(old)) return;
        try {
            String value = Files.readString(old).trim();
            if (!value.isBlank()) {
                Files.createDirectories(cookieFile.getParent());
                Files.writeString(cookieFile, value, StandardCharsets.UTF_8);
            }
        } catch (IOException ignored) {
        }
    }

    private static String extension(String type, String url) {
        String value = (type == null ? "" : type).toLowerCase();
        if (value.contains("flac") || url.toLowerCase().contains(".flac")) return ".flac";
        if (value.contains("m4a") || url.toLowerCase().contains(".m4a")) return ".m4a";
        if (value.contains("ogg") || url.toLowerCase().contains(".ogg")) return ".ogg";
        if (value.contains("wav") || url.toLowerCase().contains(".wav")) return ".wav";
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
        return clean.isBlank() ? "netease track" : clean;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static int code(JsonNode node) {
        if (node == null) return -1;
        if (node.has("code")) return node.path("code").asInt(-1);
        JsonNode data = node.has("data") ? node.path("data") : node.path("body");
        return data.has("code") ? data.path("code").asInt(-1) : -1;
    }

    private static String message(JsonNode node, String fallback) {
        if (node == null) return fallback;
        String value = node.path("message").asText("");
        if (value.isBlank()) value = node.path("msg").asText("");
        return value.isBlank() ? fallback : value;
    }

    private void emit(String event, Object data) {
        host.emit(event, data);
    }

    private void toast(String title, String detail, String tone) {
        host.emit("toast", Map.of("title", title, "message", detail == null ? "" : detail, "kind", tone));
    }

    private String resolveApiBase() {
        String value = System.getProperty("potatomusic.apiBase");
        if (value == null || value.isBlank()) value = System.getenv("POTATOMUSIC_API_BASE");
        if (value == null || value.isBlank()) value = "http://localhost:3000";
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private Path resolveApiDir() {
        String override = System.getProperty("potatomusic.apiDir");
        if (override == null || override.isBlank()) override = System.getenv("POTATOMUSIC_API_DIR");
        if (override != null && !override.isBlank()) {
            Path path = Path.of(override).toAbsolutePath().normalize();
            return Files.isDirectory(path) ? path : null;
        }
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        List<Path> roots = new ArrayList<>();
        if (cwd.getParent() != null) roots.add(cwd.getParent().resolve("api"));
        roots.add(dataDir.resolve("api"));
        roots.add(Path.of(System.getProperty("user.home"), ".potatoplayer-super", "api"));
        roots.add(Path.of(System.getProperty("user.home"), "api"));
        for (Path root : roots) {
            Path direct = root.resolve("api-enhanced");
            if (Files.isRegularFile(direct.resolve("app.js"))) return direct;
            if (!Files.isDirectory(root)) continue;
            try (var stream = Files.list(root)) {
                List<Path> candidates = stream
                        .filter(Files::isDirectory)
                        .filter(path -> path.getFileName().toString().startsWith("api-enhanced"))
                        .filter(path -> Files.isRegularFile(path.resolve("app.js")))
                        .sorted(java.util.Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                        .toList();
                if (!candidates.isEmpty()) return candidates.get(0);
            } catch (IOException ignored) {
            }
        }
        return null;
    }

    private static String findNode() {
        String override = System.getProperty("potatomusic.node");
        if (override == null || override.isBlank()) override = System.getenv("POTATOMUSIC_NODE");
        if (override != null && !override.isBlank()) return override;
        for (String candidate : List.of(
                "/opt/homebrew/bin/node",
                "/usr/local/bin/node",
                "/usr/bin/node",
                "node")) {
            if (candidate.equals("node") || Files.isExecutable(Path.of(candidate))) {
                return candidate;
            }
        }
        return null;
    }

    private static String systemProperty(String key) {
        return System.getProperty(key);
    }
}
