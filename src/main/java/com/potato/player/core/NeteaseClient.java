package com.potato.player.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedOutputStream;
import java.io.File;
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

/**
 * 网易云 API 封装（基于本地 api-enhanced 服务，对应 backend.py 的 NeteaseClient）。
 */
public class NeteaseClient {

    public record SongInfoNet(String name, String artists, String album, String coverUrl, String id) {
    }

    public record LoginResult(boolean ok, String message) {
    }

    public record QrKeyResult(boolean ok, String message, String unikey) {
    }

    public record DownloadResult(boolean ok, String message, SongInfoNet info) {
    }

    public record CommentsResult(List<JsonNode> comments, int total) {
    }

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private String cookie;
    private boolean loggedIn;
    private String uid = "";
    private Process proc;

    public NeteaseClient() {
        File cookieFile = new File(Paths.COOKIE_PATH);
        if (cookieFile.exists()) {
            try {
                String c = Files.readString(cookieFile.toPath()).trim();
                if (!c.isEmpty()) {
                    this.cookie = c;
                    this.loggedIn = true;
                }
            } catch (IOException ignored) {
            }
        }
    }

    public boolean isLoggedIn() {
        return loggedIn;
    }

    public void setLoggedIn(boolean v) {
        this.loggedIn = v;
    }

    public String getUid() {
        return uid;
    }

    public void setUid(String u) {
        this.uid = u;
    }

    /** Cookie 登录：校验并保存。 */
    public LoginResult loginCookie(String cookieVal) {
        String val = cookieVal.trim();
        if (val.contains("=") && !val.contains("MUSIC_U=")) {
            val = "MUSIC_U=" + val;
        } else if (!val.contains("=")) {
            val = "MUSIC_U=" + val;
        }
        JsonNode d = post("/user/account", val, Map.of());
        if (d != null && code(d) != null && code(d) == 200 && (d.has("account") || d.has("profile"))) {
            loggedIn = true;
            saveCookie(val);
            return new LoginResult(true, "Cookie 登录成功");
        }
        return new LoginResult(false, "Cookie 无效");
    }

    // ── 基础 HTTP ──
    private String ts() {
        return String.valueOf(System.currentTimeMillis());
    }

    private JsonNode get(String path, String cookie) {
        String sep = path.contains("?") ? "&" : "?";
        String url = Paths.API_BASE + path + sep + "timestamp=" + ts();
        String ck = cookie != null ? cookie : this.cookie;
        if (ck != null && !ck.isEmpty()) {
            url += "&cookie=" + urlEncode(ck);
        }
        return request(url, null, 15);
    }

    private JsonNode post(String path, String cookie, Map<String, Object> kw) {
        String sep = path.contains("?") ? "&" : "?";
        String url = Paths.API_BASE + path + sep + "timestamp=" + ts();
        Map<String, Object> jsonData = new LinkedHashMap<>(kw == null ? Map.of() : kw);
        String ck = cookie != null ? cookie : this.cookie;
        if (ck != null && !ck.isEmpty()) {
            jsonData.put("cookie", ck);
        }
        return request(url, JsonStore.MAPPER.valueToTree(jsonData), 15);
    }

    private JsonNode request(String url, JsonNode body, int timeoutSec) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(timeoutSec))
                    .header("User-Agent",
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                    + "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    + "Chrome/120.0.0.0 Safari/537.36");
            if (body != null) {
                b.header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body.toString()));
            } else {
                b.GET();
            }
            HttpResponse<String> resp = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            if (resp.body() == null || resp.body().isBlank()) {
                return null;
            }
            return JsonStore.MAPPER.readTree(resp.body());
        } catch (Exception e) {
            return null;
        }
    }

    public static Integer code(JsonNode d) {
        if (d == null) {
            return null;
        }
        JsonNode c = d.get("code");
        if (c != null && !c.isNull()) {
            return c.asInt();
        }
        JsonNode inner = d.has("data") ? d.get("data") : d.get("body");
        if (inner != null && inner.isObject()) {
            JsonNode c2 = inner.get("code");
            if (c2 != null && !c2.isNull()) {
                return c2.asInt();
            }
        }
        return null;
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    // ── 服务管理 ──
    public boolean serverCheck() {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(Paths.API_BASE + "/"))
                    .timeout(Duration.ofSeconds(3)).GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() < 500;
        } catch (Exception e) {
            return false;
        }
    }

    public void serverStart() {
        Thread t = new Thread(() -> {
            try {
                File appJs = new File(Paths.API_DIR, "app.js");
                String node = nodeExecutable();
                if (node == null || !appJs.isFile()) {
                    // 没装 node、或没有 api-enhanced 服务：在线功能不可用，播放不受影响
                    return;
                }
                ProcessBuilder pb = new ProcessBuilder(node, "app.js");
                pb.directory(new File(Paths.API_DIR));
                pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
                pb.redirectError(ProcessBuilder.Redirect.DISCARD);
                proc = pb.start();
                for (int i = 0; i < 30; i++) {
                    Thread.sleep(1000);
                    if (serverCheck()) {
                        return;
                    }
                }
            } catch (Exception ignored) {
            }
        });
        t.setDaemon(true);
        t.start();
    }

    /**
     * 找 node：先 {@code -Dpotato.node=...}，再 PATH，最后两个常见安装位置。
     * （原来写死 {@code /usr/local/bin/node}，Apple Silicon 的 Homebrew 装在
     * {@code /opt/homebrew/bin}，写死会让在线功能静默失效。）
     */
    private static String nodeExecutable() {
        String override = System.getProperty("potato.node");
        if (override != null && !override.isBlank()) {
            File f = new File(override);
            return f.canExecute() ? f.getAbsolutePath() : null;
        }
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            for (String dir : pathEnv.split(File.pathSeparator)) {
                if (dir.isBlank()) {
                    continue;
                }
                File f = new File(dir, "node");
                if (f.canExecute()) {
                    return f.getAbsolutePath();
                }
            }
        }
        for (String guess : List.of("/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node")) {
            File f = new File(guess);
            if (f.canExecute()) {
                return f.getAbsolutePath();
            }
        }
        return null;
    }

    public void serverStop() {
        if (proc != null) {
            try {
                proc.destroy();
                proc.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                proc.destroyForcibly();
            }
            proc = null;
        }
    }

    // ── 登录 ──
    public void saveCookie(String cookieStr) {
        this.cookie = cookieStr;
        try {
            Files.writeString(new File(Paths.COOKIE_PATH).toPath(), cookieStr);
        } catch (IOException ignored) {
        }
    }

    public LoginResult loginCellphone(String phone, String password) {
        JsonNode data = get("/login/cellphone?phone=" + phone + "&password=" + urlEncode(password), null);
        if (data != null && code(data) != null && code(data) == 200) {
            loggedIn = true;
            String ck = data.hasNonNull("cookie") ? data.get("cookie").asText() : "";
            if (!ck.isEmpty()) {
                saveCookie(ck);
            }
            JsonNode profile = data.get("profile");
            String nickname = profile != null && profile.hasNonNull("nickname") ? profile.get("nickname").asText() : phone;
            return new LoginResult(true, nickname);
        }
        String msg = data != null ? firstText(data, "message", "msg", "登录失败") : "登录失败";
        return new LoginResult(false, msg);
    }

    public QrKeyResult loginQrcodeKey() {
        JsonNode data = get("/login/qr/key", null);
        if (data == null || code(data) == null || code(data) != 200) {
            return new QrKeyResult(false, "获取二维码密钥失败", null);
        }
        String unikey = data.get("data").get("unikey").asText();
        return new QrKeyResult(true, unikey, unikey);
    }

    /** 获取二维码图片（base64 PNG data URL），用于直接展示扫码。 */
    public String qrcodeImage(String unikey) {
        JsonNode data = get("/login/qr/create?key=" + unikey + "&qrimg=true", null);
        if (data == null) {
            return null;
        }
        JsonNode img = data.path("data").path("qrimg");
        if (img.isMissingNode() || img.isNull()) {
            return null;
        }
        return img.asText();
    }

    /** 返回：1=成功，0=等待扫码，-1=失败，-2=已过期。 */
    public int loginQrcodePoll(String unikey) {
        JsonNode data = get("/login/qr/check?key=" + unikey + "&noCookie=true", null);
        if (data == null) {
            return -1;
        }
        Integer c = code(data);
        if (c == null) {
            return -1;
        }
        if (c == 803) {
            loggedIn = true;
            String ck = data.hasNonNull("cookie") ? data.get("cookie").asText() : "";
            if (!ck.isEmpty()) {
                saveCookie(ck);
            }
            return 1;
        }
        if (c == 802) {
            return 0;
        }
        if (c == 801) {
            return -1;
        }
        if (c == 800) {
            return -2;
        }
        return -1;
    }

    public void logout() {
        loggedIn = false;
        cookie = null;
        try {
            Files.deleteIfExists(new File(Paths.COOKIE_PATH).toPath());
        } catch (IOException ignored) {
        }
    }

    // ── 歌曲信息 ──
    public SongInfoNet getSongInfo(String neteaseId) {
        JsonNode data = get("/song/detail?ids=" + neteaseId, null);
        if (data == null || code(data) == null || code(data) != 200 || !data.has("songs") || data.get("songs").size() == 0) {
            return null;
        }
        JsonNode song = data.get("songs").get(0);
        JsonNode ar = song.get("ar");
        List<String> artists = new ArrayList<>();
        if (ar != null && ar.isArray()) {
            for (JsonNode a : ar) {
                if (a.hasNonNull("name")) {
                    artists.add(a.get("name").asText());
                }
            }
        }
        JsonNode album = song.get("al");
        String albumName = "未知专辑";
        String albumPic = "";
        if (album != null && album.isObject()) {
            if (album.hasNonNull("name")) {
                albumName = album.get("name").asText();
            }
            if (album.hasNonNull("picUrl")) {
                albumPic = album.get("picUrl").asText();
            }
        }
        return new SongInfoNet(song.get("name").asText(), String.join("/", artists),
                albumName, albumPic, String.valueOf(song.get("id").asLong()));
    }

    public boolean fetchCover(String neteaseId, String savePath) {
        SongInfoNet info = getSongInfo(neteaseId);
        if (info == null || info.coverUrl().isEmpty()) {
            return false;
        }
        return downloadBytes(info.coverUrl(), new File(savePath).toPath(), null);
    }

    /** 返回 (原文, 翻译)，翻译可能为 null。 */
    public String[] fetchLyrics(String neteaseId) {
        JsonNode data = get("/lyric?id=" + neteaseId, null);
        if (data == null || code(data) == null || code(data) != 200) {
            return null;
        }
        String lrc = data.path("lrc").path("lyric").asText("");
        String tlyric = data.path("tlyric").path("lyric").asText("");
        if (lrc.isBlank()) {
            return null;
        }
        String orig = lrc.trim();
        String trans = (!tlyric.isBlank()) ? tlyric.trim() : null;
        return new String[]{orig, trans};
    }

    public CommentsResult fetchComments(String neteaseId, int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        JsonNode data = get("/comment/music?id=" + neteaseId + "&limit=" + pageSize + "&offset=" + offset, null);
        if (data == null || code(data) == null || code(data) != 200) {
            return new CommentsResult(new ArrayList<>(), 0);
        }
        int total = data.path("total").asInt(0);
        List<JsonNode> result = new ArrayList<>();
        JsonNode hot = data.get("hotComments");
        if (hot != null && hot.isArray()) {
            hot.forEach(result::add);
        }
        if (result.size() < pageSize) {
            java.util.Set<Long> existing = new java.util.HashSet<>();
            for (JsonNode c : result) {
                if (c.hasNonNull("commentId")) {
                    existing.add(c.get("commentId").asLong());
                }
            }
            JsonNode regular = data.get("comments");
            if (regular != null && regular.isArray()) {
                for (JsonNode c : regular) {
                    if (result.size() >= pageSize) {
                        break;
                    }
                    if (c.hasNonNull("commentId") && !existing.contains(c.get("commentId").asLong())) {
                        result.add(c);
                    }
                }
            }
        }
        while (result.size() > pageSize) {
            result.remove(result.size() - 1);
        }
        return new CommentsResult(result, total);
    }

    public String[] getSongAudioUrl(String neteaseId, int bitrate) {
        List<Integer> brList = new ArrayList<>();
        brList.add(bitrate);
        for (int br : new int[]{320000, 192000, 128000}) {
            if (br < bitrate) {
                brList.add(br);
            }
        }
        for (int br : brList) {
            if (br >= 999000) {
                JsonNode data = get("/song/download/url?id=" + neteaseId + "&br=" + br, null);
                if (data != null && code(data) != null && code(data) == 200 && data.hasNonNull("data")) {
                    String url = data.get("data").path("url").asText("");
                    if (!url.isEmpty()) {
                        return new String[]{url, String.valueOf(data.get("data").path("br").asInt(br))};
                    }
                }
            }
            JsonNode data = get("/song/url?id=" + neteaseId + "&br=" + br, null);
            if (data == null || code(data) == null || code(data) != 200 || !data.has("data")) {
                continue;
            }
            for (JsonNode item : data.get("data")) {
                if (item.hasNonNull("url")) {
                    return new String[]{item.get("url").asText(), String.valueOf(item.path("br").asInt(br))};
                }
            }
        }
        return new String[]{null, "0"};
    }

    /** 下载进度回调（total 可能为 -1 表示未知）。 */
    public interface ProgressListener {
        void onProgress(long downloaded, long total);
    }

    public DownloadResult downloadSong(String neteaseId, String saveDir, int bitrate) {
        return downloadSong(neteaseId, saveDir, bitrate, null);
    }

    public DownloadResult downloadSong(String neteaseId, String saveDir, int bitrate, ProgressListener progress) {
        SongInfoNet info = getSongInfo(neteaseId);
        if (info == null) {
            return new DownloadResult(false, "未找到该歌曲", null);
        }
        String[] audio = getSongAudioUrl(neteaseId, bitrate);
        String audioUrl = audio[0];
        int gotBr = Integer.parseInt(audio[1]);
        if (audioUrl == null || audioUrl.isEmpty()) {
            return new DownloadResult(false, "无法获取播放地址（可能为VIP或下架歌曲，请尝试登录）", info);
        }
        String ext = ".mp3";
        if (gotBr >= 999000 || audioUrl.toLowerCase().contains(".flac")) {
            ext = ".flac";
        }
        String filename = info.artists() + " - " + info.name() + ext;
        filename = filename.replaceAll("[\\\\/*?:\"<>|]", "");
        File dir = new File(saveDir);
        if (!dir.exists()) {
            // noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        Path savePath = new File(dir, filename).toPath();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(audioUrl))
                    .timeout(Duration.ofSeconds(300))
                    .header("User-Agent",
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                    + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .GET().build();
            HttpResponse<InputStream> resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            if (resp.statusCode() >= 400) {
                return new DownloadResult(false, "下载失败（HTTP " + resp.statusCode() + "）", info);
            }
            long total = resp.headers().firstValueAsLong("content-length").orElse(-1L);
            String contentType = resp.headers().firstValue("content-type").orElse("").toLowerCase();
            long downloaded = 0;
            try (InputStream in = resp.body();
                 OutputStream out = new BufferedOutputStream(Files.newOutputStream(savePath), 65536)) {
                byte[] first = in.readNBytes(8192);
                boolean looksAudio = contentType.contains("audio") || contentType.contains("octet")
                        || contentType.contains("mpeg") || contentType.isBlank();
                if (!looksAudio) {
                    if (first.length < 512) {
                        return fail(savePath,
                                "未获取到有效音频数据（VIP歌曲需要登录）。请在设置中登录网易云后重试。", info);
                    }
                    String head = new String(first, 0, Math.min(5, first.length), StandardCharsets.US_ASCII);
                    if (head.startsWith("<?xml") || head.startsWith("<!DOC") || first[0] == '{' || first[0] == '<') {
                        return fail(savePath,
                                "服务器返回了非音频数据（VIP歌曲需要登录）。请在设置中登录网易云后重试。", info);
                    }
                }
                out.write(first);
                downloaded += first.length;
                notifyProgress(progress, downloaded, total);
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (n > 0) {
                        out.write(buf, 0, n);
                        downloaded += n;
                        notifyProgress(progress, downloaded, total);
                    }
                }
            }
            long actualSize = Files.size(savePath);
            if (actualSize < 32768) {
                Files.deleteIfExists(savePath);
                return new DownloadResult(false,
                        "下载文件太小(" + actualSize + "字节)，可能是VIP限制。请登录后重试。", info);
            }
            return new DownloadResult(true, filename, info);
        } catch (Exception e) {
            return fail(savePath, e.getMessage(), info);
        }
    }

    private static void notifyProgress(ProgressListener p, long downloaded, long total) {
        if (p != null) {
            p.onProgress(downloaded, total);
        }
    }

    private static DownloadResult fail(Path savePath, String msg, SongInfoNet info) {
        try {
            Files.deleteIfExists(savePath);
        } catch (IOException ignored) {
        }
        return new DownloadResult(false, msg, info);
    }

    public List<Map<String, Object>> searchSong(String keyword, int limit) {
        JsonNode data = get("/search?keywords=" + urlEncode(keyword) + "&type=1&limit=" + limit, null);
        List<Map<String, Object>> results = new ArrayList<>();
        if (data == null || code(data) == null || code(data) != 200) {
            return results;
        }
        JsonNode songs = data.path("result").path("songs");
        if (songs != null && songs.isArray()) {
            for (JsonNode s : songs) {
                List<String> artists = new ArrayList<>();
                JsonNode ar = s.get("ar");
                if (ar != null && ar.isArray()) {
                    for (JsonNode a : ar) {
                        if (a.hasNonNull("name")) {
                            artists.add(a.get("name").asText());
                        }
                    }
                }
                JsonNode album = s.get("al");
                String albumName = (album != null && album.isObject() && album.hasNonNull("name"))
                        ? album.get("name").asText() : "";
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", String.valueOf(s.get("id").asLong()));
                item.put("name", s.get("name").asText());
                item.put("artists", String.join("/", artists));
                item.put("album", albumName);
                item.put("duration", s.path("dt").asLong(0));
                item.put("fee", s.path("fee").asInt(0));
                results.add(item);
            }
        }
        return results;
    }

    // ── 歌单 ──
    public List<JsonNode> getUserPlaylists() {
        List<JsonNode> result = new ArrayList<>();
        // /user/playlist 必须有 uid 参数，否则接口返回 400 空列表
        String u = uid;
        if (u == null || u.isEmpty()) {
            JsonNode acct = post("/user/account", null, Map.of());
            if (acct != null && code(acct) != null && code(acct) == 200) {
                JsonNode prof = acct.path("profile");
                if (prof.hasNonNull("userId")) {
                    u = String.valueOf(prof.get("userId").asLong());
                } else {
                    JsonNode a = acct.path("account");
                    if (a.hasNonNull("id")) {
                        u = String.valueOf(a.get("id").asLong());
                    }
                }
                if (u != null && !u.isEmpty()) {
                    uid = u;
                }
            }
        }
        if (u == null || u.isEmpty()) {
            return result;
        }
        JsonNode data = get("/user/playlist?uid=" + u, null);
        if (data == null || code(data) == null || code(data) != 200 || !data.has("playlist")) {
            return result;
        }
        data.get("playlist").forEach(result::add);
        return result;
    }

    public List<JsonNode> searchPlaylists(String keyword, int limit) {
        JsonNode data = get("/search?keywords=" + urlEncode(keyword) + "&type=1000&limit=" + limit, null);
        List<JsonNode> result = new ArrayList<>();
        if (data == null || code(data) == null || code(data) != 200) {
            return result;
        }
        JsonNode playlists = data.path("result").path("playlists");
        if (playlists != null && playlists.isArray()) {
            playlists.forEach(result::add);
        }
        return result;
    }

    public JsonNode getPlaylistDetail(String plid) {
        JsonNode data = get("/playlist/detail?id=" + plid, null);
        if (data == null || code(data) == null || code(data) != 200 || !data.has("playlist")) {
            return null;
        }
        return data.get("playlist");
    }

    public List<JsonNode> dailyRecommendSongs() {
        JsonNode data = get("/recommend/songs", null);
        List<JsonNode> result = new ArrayList<>();
        if (data == null || code(data) == null || code(data) != 200 || !data.has("data")) {
            return result;
        }
        JsonNode daily = data.get("data").get("dailySongs");
        if (daily != null && daily.isArray()) {
            daily.forEach(result::add);
        }
        return result;
    }

    public JsonNode accountInfo() {
        return post("/user/account", null, Map.of());
    }

    public JsonNode playlistAddTracks(String plid, String idsStr) {
        return get("/playlist/tracks?op=add&pid=" + plid + "&tracks=" + idsStr, null);
    }

    public JsonNode playlistDelTracks(String plid, String idsStr) {
        return get("/playlist/tracks?op=del&pid=" + plid + "&tracks=" + idsStr, null);
    }

    // ── 工具 ──
    private static String firstText(JsonNode d, String k1, String k2, String def) {
        if (d.hasNonNull(k1)) {
            return d.get(k1).asText();
        }
        if (d.hasNonNull(k2)) {
            return d.get(k2).asText();
        }
        return def;
    }

    /** 下载字节到文件（用于封面），返回是否成功。 */
    private boolean downloadBytes(String url, Path dest, JsonNode ignored) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15)).GET().build();
            HttpResponse<InputStream> resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            if (resp.statusCode() >= 400) {
                return false;
            }
            if (dest.getParent() != null) {
                Files.createDirectories(dest.getParent());
            }
            try (InputStream in = resp.body()) {
                Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
