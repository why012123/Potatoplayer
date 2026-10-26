package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bilibili MV search.
 *
 * <p>Bilibili's public video search is used only to find candidates. The
 * renderer opens the chosen video in the system browser, so no Bilibili cookie
 * or account is required and no video is downloaded into the music library.</p>
 */
public final class BilibiliService {
    private static final String UA =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    private static final String SEARCH_ENDPOINT =
            "https://api.bilibili.com/x/web-interface/search/type";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final Map<String, CacheEntry> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
            return size() > 40;
        }
    };

    public Map<String, Object> search(String keyword, int limit) {
        String query = keyword == null ? "" : keyword.trim().replaceAll("\\s+", " ");
        int count = Math.max(1, Math.min(20, limit));
        if (query.isBlank()) return empty(query, count);
        synchronized (cache) {
            CacheEntry hit = cache.get(query + "\u0000" + count);
            if (hit != null && hit.expiresAt > System.currentTimeMillis()) return hit.value;
        }
        try {
            URI uri = URI.create(SEARCH_ENDPOINT
                    + "?search_type=video&keyword=" + encode(query)
                    + "&page=1&order=totalrank");
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(18))
                    .header("User-Agent", UA)
                    .header("Referer", "https://www.bilibili.com/")
                    .header("Accept", "application/json, text/plain, */*")
                    .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.7")
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                throw new IllegalStateException("Bilibili returned HTTP " + response.statusCode() + ".");
            }
            JsonNode root = Json.MAPPER.readTree(response.body());
            int code = root.path("code").asInt(-1);
            if (code != 0) {
                String message = root.path("message").asText("Bilibili search failed.");
                if (code == -352 || code == -412) {
                    message = "Bilibili is rate-limiting this network. Try again in a moment.";
                }
                throw new IllegalStateException(message);
            }
            Map<String, Object> result = parse(root, query, count);
            synchronized (cache) {
                cache.put(query + "\u0000" + count, new CacheEntry(result, System.currentTimeMillis() + 3 * 60_000L));
            }
            return result;
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Could not reach Bilibili: " + e.getMessage(), e);
        }
    }

    static Map<String, Object> parse(JsonNode root, String query, int limit) {
        JsonNode data = root.path("data");
        JsonNode items = data.path("result");
        List<Map<String, Object>> results = new ArrayList<>();
        if (items != null && items.isArray()) {
            for (JsonNode item : items) {
                if (results.size() >= limit) break;
                if (!"video".equals(item.path("type").asText("video"))) continue;
                String bvid = item.path("bvid").asText("");
                String arcurl = item.path("arcurl").asText("");
                String url = !bvid.isBlank()
                        ? "https://www.bilibili.com/video/" + bvid
                        : arcurl.replaceFirst("^http://", "https://");
                if (url.isBlank()) continue;
                String duration = item.path("duration").asText("");
                Map<String, Object> video = new LinkedHashMap<>();
                video.put("bvid", bvid);
                video.put("aid", item.path("aid").asLong(0));
                video.put("title", clean(item.path("title").asText("")));
                video.put("author", clean(item.path("author").asText("")));
                video.put("authorId", item.path("mid").asLong(0));
                video.put("coverUrl", cover(item.path("pic").asText("")));
                video.put("duration", duration);
                video.put("durationSeconds", durationSeconds(duration));
                video.put("playCount", item.path("play").asLong(0));
                video.put("danmakuCount", item.path("danmaku").asLong(0));
                video.put("publishedAt", item.path("pubdate").asLong(0) * 1000L);
                video.put("description", truncate(clean(item.path("description").asText("")), 180));
                video.put("typeName", clean(item.path("typename").asText("")));
                video.put("url", url);
                results.add(video);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", query);
        out.put("total", data.path("numResults").asLong(results.size()));
        out.put("results", results);
        out.put("searchUrl", "https://search.bilibili.com/all?keyword=" + encode(query));
        return out;
    }

    private static Map<String, Object> empty(String query, int limit) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", query);
        out.put("total", 0);
        out.put("results", List.of());
        out.put("searchUrl", "https://search.bilibili.com/all?keyword=" + encode(query));
        return out;
    }

    private static String cover(String value) {
        if (value == null || value.isBlank()) return "";
        return value.startsWith("//") ? "https:" + value : value;
    }

    private static int durationSeconds(String value) {
        if (value == null || value.isBlank()) return 0;
        int total = 0;
        for (String part : value.split(":")) {
            try {
                total = total * 60 + Integer.parseInt(part.trim());
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return total;
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }

    private static String clean(String value) {
        if (value == null) return "";
        String text = value.replaceAll("(?s)<[^>]*>", "");
        text = text.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&#x27;", "'")
                .replace("&nbsp;", " ")
                .replace("&mdash;", "—");
        return text.replaceAll("\\s+", " ").trim();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private record CacheEntry(Map<String, Object> value, long expiresAt) {
    }
}
