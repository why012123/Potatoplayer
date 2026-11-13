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
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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
    private final Path aliasesFile;
    private final String apiBase;
    private final Path apiDir;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final DownloadQueue downloader = new DownloadQueue();
    private final AtomicInteger jobSequence = new AtomicInteger(1000);
    private volatile String cookie;
    private volatile Process serviceProcess;
    private volatile Map<String, Object> cachedStatus;
    private volatile long cachedAt;
    private final java.util.Map<String, QualityProbe> qualityProbes = new java.util.concurrent.ConcurrentHashMap<>();

    public NeteaseService(Backend host) {
        this.host = host;
        this.dataDir = host.dataDir();
        this.cookieFile = dataDir.resolve("netease_cookie.txt");
        this.aliasesFile = dataDir.resolve("netease_aliases.json");
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

    public synchronized Map<String, Object> startService() {
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

    /** Full api-enhanced search for the assistant, without the UI summary projection. */
    public Map<String, Object> searchRich(String keyword, int limit, int offset) {
        requireService();
        if (keyword == null || keyword.isBlank()) throw new IllegalArgumentException("Search keywords are required.");
        int count = Math.max(1, Math.min(30, limit));
        int start = Math.max(0, offset);
        JsonNode response = get("/cloudsearch?keywords=" + encode(keyword.trim()) + "&type=1&limit=" + count + "&offset=" + start, 20);
        requireApiResult(response, "搜索");
        JsonNode result = response.path("result");
        List<Map<String, Object>> songs = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (JsonNode row : result.path("songs")) ids.add(row.path("id").asText());
        Map<String, JsonNode> details = new LinkedHashMap<>();
        Map<String, JsonNode> privileges = new LinkedHashMap<>();
        String warning = "";
        if (!ids.isEmpty()) {
            try {
                JsonNode detail = get("/song/detail?ids=" + encode(String.join(",", ids)), 20);
                requireApiResult(detail, "歌曲详情");
                for (JsonNode row : detail.path("songs")) details.put(row.path("id").asText(), row);
                for (JsonNode row : detail.path("privileges")) privileges.put(row.path("id").asText(), row);
            } catch (Exception e) { warning = "Song detail unavailable: " + e.getMessage(); }
        }
        for (JsonNode row : result.path("songs")) {
            String id = row.path("id").asText();
            Map<String, Object> song = richSong(details.getOrDefault(id, row));
            song.put("searchData", row);
            if (privileges.containsKey(id)) song.put("privilege", privileges.get(id));
            songs.add(song);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("engine", "api-enhanced /cloudsearch + /song/detail");
        out.put("songs", songs); out.put("total", result.path("songCount").asInt(songs.size()));
        out.put("offset", start); out.put("more", start + songs.size() < result.path("songCount").asInt());
        if (!warning.isBlank()) out.put("warning", warning);
        return out;
    }

    public Map<String, Object> songDetails(String id) {
        requireService();
        if (id == null || !id.matches("\\d{1,20}")) throw new IllegalArgumentException("Invalid NetEase song ID.");
        JsonNode detail = get("/song/detail?ids=" + encode(id), 20);
        requireApiResult(detail, "歌曲详情");
        if (detail.path("songs").isEmpty()) throw new IllegalArgumentException("Song not found.");
        JsonNode row = detail.path("songs").get(0);
        Map<String, Object> out = richSong(row);
        out.put("privileges", detail.path("privileges"));
        String albumId = row.path("al").path("id").asText(row.path("album").path("id").asText(""));
        if (!albumId.isBlank() && !albumId.equals("0")) {
            try {
                JsonNode album = get("/album?id=" + encode(albumId), 18).path("album");
                out.put("albumDetails", album);
                if (((Number) out.get("publishTime")).longValue() <= 0) setRelease(out, album.path("publishTime").asLong(0));
            } catch (Exception e) { out.put("albumWarning", e.getMessage()); }
        }
        return out;
    }

    private Map<String, Object> richSong(JsonNode row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.path("id").asText()); out.put("name", row.path("name").asText());
        out.put("artists", artistsOf(row)); out.put("album", albumOf(row)); out.put("coverUrl", coverOf(row));
        long duration = row.path("dt").asLong(row.path("duration").asLong());
        out.put("durationMs", duration); out.put("durationSeconds", duration / 1000.0);
        out.put("aliases", row.has("alia") ? row.path("alia") : row.path("alias"));
        out.put("translatedNames", row.path("tns"));
        long published = row.path("publishTime").asLong(row.path("al").path("publishTime").asLong(row.path("album").path("publishTime").asLong()));
        setRelease(out, published);
        JsonNode bpm = row.get("bpm");
        out.put("bpm", bpm != null && bpm.isNumber() && bpm.asDouble() > 0 ? bpm : null);
        out.put("bpmStatus", bpm != null && bpm.isNumber() && bpm.asDouble() > 0 ? "API supplied" : "API did not supply BPM; do not infer it from duration or genre");
        out.put("raw", row); // Retain credits, artists/albums, versions and every returned detail field.
        return out;
    }

    private void requireApiResult(JsonNode data, String operation) {
        if (data == null) throw new IllegalStateException("api-enhanced " + operation + "未返回数据，请检查服务或网络。");
        int code = data.path("code").asInt(200);
        if (code != 200) throw new IllegalStateException("api-enhanced " + operation + "失败（" + code + "）：" + data.path("msg").asText(data.path("message").asText("请检查网易云登录状态")));
    }

    private void setRelease(Map<String, Object> out, long published) {
        out.put("publishTime", published);
        int year = published > 0 ? Instant.ofEpochMilli(published).atZone(ZoneId.of("Asia/Shanghai")).getYear() : 0;
        out.put("year", year); out.put("decade", year > 0 ? (year / 10 * 10) + "s" : "unknown");
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

    /**
     * Cache NetEase aliases and translated names for every bound local track.
     * These are search-only strings; the library and audio files stay untouched.
     */
    public Map<String, Object> syncAliases() {
        requireService();
        List<String> ids = new ArrayList<>();
        for (Track track : host.tracks()) {
            String id = track.neteaseId == null ? "" : track.neteaseId.trim();
            if (!id.isBlank() && !ids.contains(id)) ids.add(id);
        }
        Map<String, List<String>> aliases = aliases();
        int fetched = 0;
        for (int start = 0; start < ids.size(); start += 50) {
            int end = Math.min(ids.size(), start + 50);
            JsonNode detail = get("/song/detail?ids=" + String.join(",", ids.subList(start, end)), 25);
            JsonNode songs = detail == null ? null : detail.path("songs");
            if (songs == null || !songs.isArray()) continue;
            for (JsonNode song : songs) {
                String id = song.path("id").asText("");
                List<String> values = aliasValues(song);
                if (!id.isBlank() && !values.isEmpty()) {
                    aliases.put(id, values);
                    fetched++;
                }
            }
        }
        writeAliases(aliases);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("syncedAt", System.currentTimeMillis());
        result.put("count", aliases.size());
        result.put("tracks", ids.size());
        result.put("fetched", fetched);
        result.put("aliases", aliases);
        return result;
    }

    public Map<String, List<String>> aliases() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        if (aliasesFile == null || !Files.isRegularFile(aliasesFile)) return result;
        try {
            JsonNode root = Json.MAPPER.readTree(Files.readString(aliasesFile, StandardCharsets.UTF_8));
            JsonNode map = root.has("aliases") ? root.path("aliases") : root;
            if (!map.isObject()) return result;
            var fields = map.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                List<String> values = new ArrayList<>();
                JsonNode list = entry.getValue();
                if (list.isArray()) {
                    for (JsonNode value : list) {
                        String text = value.asText("").trim();
                        if (!text.isBlank() && !values.contains(text)) values.add(text);
                    }
                }
                if (!values.isEmpty()) result.put(entry.getKey(), values);
            }
        } catch (Exception ignored) {
            // A damaged alias cache must never stop the player from starting.
        }
        return result;
    }

    private List<String> aliasValues(JsonNode song) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        addAliasArray(values, song.path("alia"));
        addAliasArray(values, song.path("tns"));
        addAliasArray(values, song.path("transNames"));
        addAliasText(values, song.path("alias"));
        addAliasText(values, song.path("mainTitle"));
        addAliasText(values, song.path("additionalTitle"));
        List<String> result = new ArrayList<>();
        for (String value : values) {
            String text = value.trim();
            if (text.isBlank() || text.length() > 160 || result.contains(text)) continue;
            result.add(text);
            if (result.size() >= 12) break;
        }
        return result;
    }

    private static void addAliasArray(LinkedHashSet<String> values, JsonNode node) {
        if (node == null) return;
        if (node.isArray()) {
            for (JsonNode item : node) addAliasText(values, item);
        } else {
            addAliasText(values, node);
        }
    }

    private static void addAliasText(LinkedHashSet<String> values, JsonNode node) {
        if (node == null || !node.isValueNode()) return;
        String text = node.asText("").trim();
        if (!text.isBlank()) values.add(text);
    }

    private void writeAliases(Map<String, List<String>> aliases) {
        try {
            Files.createDirectories(aliasesFile.getParent());
            Map<String, Object> root = new LinkedHashMap<>();
            root.put("syncedAt", System.currentTimeMillis());
            root.put("aliases", aliases);
            Path temp = aliasesFile.resolveSibling(aliasesFile.getFileName() + ".tmp");
            Files.writeString(temp, Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(root), StandardCharsets.UTF_8);
            try {
                Files.move(temp, aliasesFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (Exception atomic) {
                Files.move(temp, aliasesFile, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception e) {
            System.err.println("[netease] unable to save aliases: " + e.getMessage());
        }
    }

    public List<Map<String, Object>> playlists() {
        requireService();
        JsonNode account = get("/user/account", 10);
        long uid = account == null ? 0 : account.path("profile").path("userId").asLong(0);
        if (uid == 0) {
            throw new IllegalStateException("Sign in to load your playlists.");
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (int offset = 0; ; offset += 100) {
            JsonNode data = checked(get("/user/playlist?uid=" + uid + "&limit=100&offset=" + offset, 16));
            JsonNode list = data.path("playlist");
            if (list.isArray()) {
                for (JsonNode item : list) {
                    Map<String, Object> playlist = new LinkedHashMap<>();
                    playlist.put("id", item.path("id").asText());
                    playlist.put("name", item.path("name").asText(""));
                    playlist.put("coverUrl", item.path("coverImgUrl").asText(""));
                    playlist.put("trackCount", item.path("trackCount").asInt(0));
                    playlist.put("creator", item.path("creator").path("nickname").asText(""));
                    playlist.put("owned", item.path("creator").path("userId").asLong() == uid);
                    result.add(playlist);
                }
            }
            if (!data.path("more").asBoolean(false) || list.isEmpty()) break;
        }
        return result;
    }

    /** Fresh account checks prevent syncing a binding into a different signed-in account. */
    String syncAccount() {
        JsonNode data = checked(get("/user/account", 12));
        String id = data.path("profile").path("userId").asText("");
        if (!id.matches("[1-9][0-9]*")) throw new IllegalStateException("请先在发现页面登录网易云音乐。");
        return id;
    }

    PlaylistSync.Cloud syncPlaylist(String id) {
        JsonNode playlist = checked(get("/playlist/detail?id=" + encode(id), 20)).path("playlist");
        JsonNode ids = playlist.path("trackIds");
        if (!ids.isArray() || playlist.path("trackCount").asInt(-1) != ids.size())
            throw new IllegalStateException("云端歌单未完整返回，已停止同步以避免误删。");
        List<String> tracks = new ArrayList<>();
        for (JsonNode track : ids) {
            String song = track.path("id").asText("");
            if (!song.matches("[1-9][0-9]*")) throw new IllegalStateException("云端歌曲 ID 无效。");
            tracks.add(song);
        }
        return new PlaylistSync.Cloud(playlist.path("name").asText(""),
                playlist.path("creator").path("userId").asText(""), tracks);
    }

    void syncWrite(String account, String id, List<String> before, List<String> after, boolean order) {
        String session = cookie;
        JsonNode profile = checked(get("/user/account", session, 12)).path("profile");
        if (!account.equals(profile.path("userId").asText("")))
            throw new IllegalStateException("网易云账号已变化，已停止写入。");
        List<String> add = after.stream().filter(song -> !before.contains(song)).toList();
        List<String> remove = before.stream().filter(song -> !after.contains(song)).toList();
        // Add first: a permission/VIP failure cannot empty a previously populated playlist.
        for (String op : List.of("add", "del")) {
            List<String> ids = op.equals("add") ? add : remove;
            for (int offset = 0; offset < ids.size(); offset += 100)
                syncPost(session, "/playlist/tracks", Map.of("op", op, "pid", id,
                        "tracks", String.join(",", ids.subList(offset, Math.min(offset + 100, ids.size())))));
        }
        if (order && after.size() > 1 && !before.equals(after))
            syncPost(session, "/song/order/update", Map.of("pid", id, "ids", Json.stringify(after)));
    }

    private void syncPost(String session, String path, Map<String, String> params) {
        try {
            Map<String, String> body = new LinkedHashMap<>(params);
            body.put("cookie", session == null ? "" : session);
            String form = body.entrySet().stream().map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
                    .collect(java.util.stream.Collectors.joining("&"));
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiBase + path + "?timestamp=" + System.currentTimeMillis()))
                    .timeout(Duration.ofSeconds(25)).header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            checked(Json.MAPPER.readTree(response.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("同步已中断。", e);
        } catch (IOException e) { throw new IllegalStateException("网易云写入失败，请检查 API 服务后重试。", e); }
    }

    private static JsonNode checked(JsonNode data) {
        if (data == null) throw new IllegalStateException("无法连接网易云 API，请在发现页面启动服务后重试。");
        if (data.path("code").asInt(-1) != 200)
            throw new IllegalStateException("网易云请求失败（" + data.path("code").asText("未知") + "）："
                    + data.path("message").asText(data.path("msg").asText("请检查登录状态和歌单权限。")));
        return data;
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
        requireApiResult(data, "评论读取");
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

    public Map<String, Object> download(String neteaseId, String quality, String block, String genre, String title) {
        if (neteaseId == null || neteaseId.isBlank()) {
            throw new IllegalArgumentException("Missing song id.");
        }
        String jobId = "netease-" + jobSequence.incrementAndGet();
        downloader.submit(jobId,
                () -> emit("download.progress", progress(jobId, neteaseId, title.isBlank() ? neteaseId : title, 0, -1, "queued")),
                () -> downloadJob(
                jobId,
                neteaseId,
                quality == null ? "high" : quality,
                block == null ? "" : block.trim(),
                genre == null ? "" : genre.trim()),
                () -> emit("download.cancelled", Map.of("jobId", jobId, "neteaseId", neteaseId, "source", "netease")));
        return Map.of("jobId", jobId, "neteaseId", neteaseId);
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

    private void downloadJob(String jobId, String neteaseId, String quality, String targetBlock, String targetGenre) {
        Path part = null;
        Path lyrics = null;
        try {
            downloader.check();
            requireService();
            downloader.check();
            String requestedQuality = AudioQuality.normalize(quality);
            boolean clearBlock = DownloadTargets.clears(targetBlock);
            boolean setBlock = DownloadTargets.specifies(targetBlock);
            boolean clearGenre = DownloadTargets.clears(targetGenre);
            boolean setGenre = DownloadTargets.specifies(targetGenre);
            NeteaseBindings.Binding existing = host.neteaseBindings().findByNeteaseId(neteaseId);
            Track local = host.findTrackByOnlineId(neteaseId, null);
            Path existingPath = localPath(local, existing);
            String existingQuality = AudioQuality.existingLabel(existing == null ? null : existing.quality,
                    existingPath == null ? null : existingPath.toString());
            // A higher tier replaces the audio file; anything else keeps the copy and only refreshes its info.
            boolean replace = existingPath != null && AudioQuality.rank(requestedQuality) > AudioQuality.rank(existingQuality);
            if (existingPath != null && !replace) {
                downloader.commit();
                Map<String, Object> done = local != null
                        ? existingDownload(jobId, neteaseId, existing, local, targetBlock, targetGenre)
                        : existingBindingDownload(jobId, neteaseId, existing, targetBlock, targetGenre);
                done.put("quality", existingQuality);
                done.put("requestedQuality", requestedQuality);
                done.put("replaced", false);
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
            int year = releaseYear(song);
            String coverUrl = coverOf(song);
            emit("download.progress", progress(jobId, neteaseId, title, 0, -1, "resolving"));
            AudioSource audio = audioUrl(neteaseId, requestedQuality);
            if (!audio.present()) {
                throw new IllegalStateException("No playable URL. The song may be region-locked or require a higher account tier.");
            }
            String servedQuality = audio.level().isBlank() ? requestedQuality : audio.level();
            if (audio.preview()) {
                throw new IllegalStateException("This tier is only a preview clip for this account. Sign in with an account that can download it.");
            }
            Path root = host.libraryRootPath();
            if (root == null || !Files.isDirectory(root)) {
                throw new IllegalStateException("Choose a music folder before downloading.");
            }
            String extension = extension(audio.type(), audio.url());
            String baseName = sanitize(artist + " - " + title);
            // Same container: replace the bytes under the old path so the track keeps its
            // id, rating, note, play count, favorites and playlist membership.
            boolean inPlace = existingPath != null && extension.equals(extensionOf(existingPath));
            Path target = inPlace ? existingPath : uniquePath(root, baseName, extension);
            part = target.resolveSibling(target.getFileName() + ".part");
            emit("download.progress", progress(jobId, neteaseId, title, 0, -1, "downloading"));
            downloadFile(audio.url(), part, jobId, neteaseId, title);
            if (Files.size(part) < 32_768) {
                Files.deleteIfExists(part);
                throw new IllegalStateException("The server returned an incomplete file. Sign in and try again.");
            }

            servedQuality = AudioQuality.existingLabel(servedQuality, part.toString());
            if (existingPath != null && AudioQuality.rank(servedQuality)
                    <= AudioQuality.rank(existingQuality)) {
                // The provider has no better master for this song (or the account cannot reach it):
                // keep the existing file so the library never goes backwards in quality.
                Files.deleteIfExists(part);
                downloader.commit();
                Map<String, Object> done = local != null
                        ? existingDownload(jobId, neteaseId, existing, local, targetBlock, targetGenre)
                        : existingBindingDownload(jobId, neteaseId, existing, targetBlock, targetGenre);
                done.put("quality", existingQuality);
                done.put("requestedQuality", requestedQuality);
                done.put("replaced", false);
                done.put("upgradeUnavailable", true);
                emit("download.done", done);
                return;
            }

            String coverPath = cacheCover(neteaseId, coverUrl);
            downloader.check();
            lyrics = part.resolveSibling(part.getFileName() + "-" + jobId + ".tmp");
            saveLyrics(lyrics, neteaseId);
            downloader.commit();
            Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
            DownloadQueue.publishLyrics(lyrics, target);
            lyrics = null;
            if (existingPath != null && !existingPath.equals(target)) {
                // Upgrading across containers (mp3 → FLAC) moves the song to a new file;
                // drop the old copy only after the new one is safely in place.
                try {
                    Files.deleteIfExists(existingPath);
                } catch (IOException e) {
                    System.err.println("[netease] could not delete replaced file " + existingPath + ": " + e.getMessage());
                }
            }

            NeteaseBindings.Binding binding = existing == null ? new NeteaseBindings.Binding() : existing;
            String previousBindingPath = existing == null ? null : existing.path;
            String previousBlock = existing == null || existing.block == null ? "" : existing.block;
            String previousGenre = existing == null || existing.genre == null ? "" : existing.genre;
            binding.neteaseId = neteaseId;
            binding.path = target.toString();
            binding.title = title;
            binding.artist = artist;
            binding.album = album;
            binding.year = year;
            binding.coverPath = coverPath;
            binding.quality = servedQuality;
            binding.block = clearBlock ? "" : setBlock ? targetBlock : previousBlock;
            binding.genre = clearGenre ? "" : setGenre ? targetGenre : previousGenre;
            binding.downloadedAt = System.currentTimeMillis();
            host.neteaseBindings().put(binding);
            clearQualityCache(neteaseId);
            if (previousBindingPath != null && !previousBindingPath.equals(target.toString())) {
                // The sidecar is keyed by path: drop the entry for the container that was replaced.
                host.neteaseBindings().remove(previousBindingPath);
            }
            if (existingPath != null && !existingPath.equals(target) && local != null) {
                // Keep favorites and playlists pointing at the same song after the path change.
                host.relocateDownloadedTrack(local.id, target.toString());
            }

            Map<String, Object> done = new LinkedHashMap<>();
            done.put("jobId", jobId);
            done.put("neteaseId", neteaseId);
            done.put("title", title);
            done.put("artist", artist);
            done.put("album", album);
            done.put("year", year);
            done.put("path", target.toString());
            done.put("coverPath", coverPath == null ? "" : coverPath);
            done.put("source", "netease");
            done.put("duplicate", false);
            done.put("replaced", existingPath != null);
            done.put("quality", servedQuality);
            done.put("requestedQuality", requestedQuality);
            if (existingPath != null) {
                done.put("previousQuality", existingQuality);
            }
            Track resultingTrack = host.findTrackByOnlineId(neteaseId, null);
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
                    "jobId", jobId,
                    "neteaseId", neteaseId,
                    "source", "netease",
                    "message", e.getMessage() == null ? "Download failed." : e.getMessage()));
        }
    }

    /**
     * The library already holds this song at the requested tier or better. A fresh
     * block/genre selection updates the existing local track (and its binding) instead
     * of downloading again.
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

    /** Same as {@link #existingDownload} when the song is known only through its download binding. */
    private Map<String, Object> existingBindingDownload(
            String jobId,
            String neteaseId,
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
        done.put("neteaseId", neteaseId);
        done.put("title", existing == null || existing.title == null ? "" : existing.title);
        done.put("artist", existing == null || existing.artist == null ? "" : existing.artist);
        done.put("path", existing == null || existing.path == null ? "" : existing.path);
        done.put("source", "netease");
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

    /** One resolved download source: playable URL, container, the level actually served and whether it is only a preview. */
    private record AudioSource(String url, String type, String level, boolean trial) {
        boolean present() {
            return url != null && !url.isBlank();
        }

        boolean preview() {
            return trial;
        }
    }

    /**
     * Resolve a playable URL for the requested tier. The provider keeps the level
     * parameter (standard/exhigh/lossless/hires/jyeffect/sky/jymaster) and may serve a
     * lower one when the song has no Hi-Res master or the account cannot reach it;
     * that served level is recorded on the binding so later downloads compare fairly.
     */
    private AudioSource audioUrl(String id, String quality) {
        String normalized = AudioQuality.normalize(quality);
        String level = switch (normalized) {
            case AudioQuality.STANDARD -> "standard";
            case AudioQuality.LOSSLESS -> "lossless";
            case AudioQuality.HIRES -> "hires";
            case AudioQuality.MASTER -> "jymaster";
            default -> "exhigh";
        };
        int br = switch (AudioQuality.rank(normalized)) {
            case 0 -> 128_000;
            case 2, 3, 4 -> 999_000;
            default -> 320_000;
        };
        AudioSource source = audioSourceFrom(get("/song/url/v1?id=" + encode(id) + "&level=" + level, 20), normalized);
        if (source.present()) return source;
        source = audioSourceFrom(get("/song/download/url/v1?id=" + encode(id) + "&level=" + level, 20), normalized);
        if (source.present()) return source;
        source = audioSourceFrom(get("/song/download/url?id=" + encode(id) + "&br=" + br, 20), normalized);
        if (source.present()) return source;
        return audioSourceFrom(get("/song/url?id=" + encode(id) + "&br=" + br, 20), normalized);
    }

    private static AudioSource audioSourceFrom(JsonNode data, String requestedLevel) {
        if (data == null) return new AudioSource(null, "", "", false);
        JsonNode item = data.path("data");
        if (item.isArray()) item = item.path(0);
        String url = item.path("url").asText("");
        if (url.isBlank()) return new AudioSource(null, "", "", false);
        String type = item.path("type").asText("");
        String level = item.path("level").asText("");
        if (level.isBlank()) level = guessLevel(type, item.path("br").asLong(0), requestedLevel);
        JsonNode trial = item.path("freeTrialInfo");
        return new AudioSource(url, type, AudioQuality.normalize(level), trial.isObject() || trial.isArray());
    }

    private static String guessLevel(String type, long br, String requestedLevel) {
        if (type != null && type.toLowerCase(java.util.Locale.ROOT).contains("flac")) return AudioQuality.LOSSLESS;
        if (br > 0) return br >= 300_000 ? AudioQuality.HIGH : AudioQuality.STANDARD;
        return requestedLevel;
    }

    /**
     * Probe the tiers above {@code fromQuality} that this song can actually reach.
     * The provider may serve a lower level for a tier (no master for this song), so
     * availability is only reported when the served level matches the requested tier
     * and the URL is not a preview clip. Results are cached for ten minutes.
     */
    public List<Map<String, Object>> availableUpgrades(String id, String fromQuality) {
        requireService();
        int from = AudioQuality.rank(fromQuality);
        List<Map<String, Object>> out = new ArrayList<>();
        for (String tier : List.of(AudioQuality.LOSSLESS, AudioQuality.HIRES, AudioQuality.MASTER)) {
            if (AudioQuality.rank(tier) <= from) continue;
            Map<String, Object> probe = probeTier(id, tier);
            if (probe != null) out.add(probe);
        }
        return out;
    }

    private Map<String, Object> probeTier(String id, String tier) {
        String key = id + "|" + tier;
        long now = System.currentTimeMillis();
        QualityProbe cached = qualityProbes.get(key);
        if (cached != null && now - cached.at() < 10 * 60_000L) return cached.value();
        Map<String, Object> value = null;
        String level = switch (tier) {
            case AudioQuality.LOSSLESS -> "lossless";
            case AudioQuality.HIRES -> "hires";
            default -> "jymaster";
        };
        try {
            JsonNode data = get("/song/url/v1?id=" + encode(id) + "&level=" + level, 20);
            if (data != null) {
                JsonNode item = data.path("data");
                if (item.isArray()) item = item.path(0);
                String url = item.path("url").asText("");
                String served = item.path("level").asText("");
                JsonNode trial = item.path("freeTrialInfo");
                boolean preview = trial.isObject() || trial.isArray();
                if (!url.isBlank() && !served.isBlank() && !preview
                        && AudioQuality.rank(served) >= AudioQuality.rank(tier)) {
                    value = new LinkedHashMap<>();
                    value.put("quality", tier);
                    value.put("servedLevel", AudioQuality.normalize(served));
                    value.put("type", item.path("type").asText(""));
                    value.put("br", item.path("br").asLong(0));
                    value.put("size", item.path("size").asLong(0));
                }
            }
        } catch (Exception ignored) {
        }
        qualityProbes.put(key, new QualityProbe(now, value));
        return value;
    }

    /** Drop cached probes for a song after a download changed the copy on disk. */
    public void clearQualityCache(String id) {
        if (id == null || id.isBlank()) return;
        qualityProbes.keySet().removeIf(key -> key.startsWith(id + "|"));
    }

    private record QualityProbe(long at, Map<String, Object> value) {
    }

    private void downloadFile(String url, Path part, String jobId, String neteaseId, String title) throws Exception {
        downloader.check();
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(10))
                .header("User-Agent", UA)
                .header("Referer", "https://music.163.com/")
                .GET()
                .build();
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
                    emit("download.progress", progress(jobId, neteaseId, title, done, total, "downloading"));
                }
            }
        }
        downloader.check();
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

    /**
     * NetEase reports the release date as an epoch-millisecond timestamp on the
     * song (newer responses) or on the album. Use the Shanghai calendar because
     * that is the date the service publishes, not the machine's local zone.
     */
    static int releaseYear(JsonNode song) {
        if (song == null) return 0;
        int explicit = song.path("year").asInt(0);
        if (explicit >= 1000 && explicit <= 9999) return explicit;
        long published = song.path("publishTime").asLong(0);
        if (published <= 0) published = song.path("al").path("publishTime").asLong(0);
        if (published <= 0) published = song.path("album").path("publishTime").asLong(0);
        if (published <= 0) return 0;
        int year = Instant.ofEpochMilli(published).atZone(ZoneId.of("Asia/Shanghai")).getYear();
        return year >= 1000 && year <= 9999 ? year : 0;
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
        downloader.check();
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
        downloader.emit(() -> host.emit(event, data));
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
