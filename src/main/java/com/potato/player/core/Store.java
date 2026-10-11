package com.potato.player.core;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 持久化状态管理（对应 backend.py 的 ratings/blocks/genres/lyrics/bindings/metadata_cache 读写）。
 */
public final class Store {

    // ── ratings ──
    public static Map<String, Map<String, Object>> loadRatings() {
        Map<String, Map<String, Object>> m = JsonStore.load(Paths.RATINGS_FILE,
                new TypeReference<LinkedHashMap<String, Map<String, Object>>>() {});
        return m == null ? new LinkedHashMap<>() : m;
    }

    public static void saveRatings(Map<String, Map<String, Object>> ratings) {
        JsonStore.save(Paths.RATINGS_FILE, ratings);
    }

    // ── lyrics ──
    public static Map<String, Object> loadLyrics() {
        Map<String, Object> m = JsonStore.load(Paths.LYRICS_FILE,
                new TypeReference<LinkedHashMap<String, Object>>() {});
        return m == null ? new LinkedHashMap<>() : m;
    }

    public static void saveLyrics(Map<String, Object> lyrics) {
        JsonStore.save(Paths.LYRICS_FILE, lyrics);
    }

    /**
     * 读「名字 + 标识色」列表 —— <b>blocks.json 与 genres.json 共用这一段</b>
     * （两边的数据结构本来就该一模一样）。
     *
     * <p>逐项按 JsonNode 读，而不是直接映射成 {@code List<Map>}：老数据是纯字符串数组
     * （{@code ["Air","Ultimate"]}），Jackson 把字符串往 Map 里映射会直接抛异常，
     * 于是整个列表被读成空、紧接着又写回一个空文件 —— 等于把用户的数据删了。
     * 这里"字符串 → 只有名字的项"，顺带补齐缺的颜色，读完写回统一格式
     * （与 Python 版 {@code backend.py} 的归一化一致）。</p>
     *
     * @param defaultColor 缺 color 时补的颜色（块/流派各有一个默认值）
     */
    private static List<Map<String, Object>> loadNamedColors(String path, String defaultColor) {
        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode root = JsonStore.loadNode(path, null);
        if (root == null || !root.isArray()) {
            return out;
        }
        for (JsonNode n : root) {
            Map<String, Object> item = new LinkedHashMap<>();
            if (n.isObject()) {
                // 保留对象里的其它字段（只认 name/color 会悄悄丢数据）
                item.putAll(JsonStore.MAPPER.convertValue(n,
                        new TypeReference<LinkedHashMap<String, Object>>() {}));
            } else if (n.isTextual() || n.isNumber()) {
                item.put("name", n.asText());
            }
            Object name = item.get("name");
            if (name == null || String.valueOf(name).isBlank()) {
                continue;
            }
            Object color = item.get("color");
            if (color == null || String.valueOf(color).isBlank()) {
                item.put("color", defaultColor);
            }
            out.add(item);
        }
        return out;
    }

    // ── blocks ──
    public static List<Map<String, Object>> loadBlocks() {
        List<Map<String, Object>> blocks =
                loadNamedColors(Paths.BLOCKS_FILE, Theme.DEFAULT_BLOCK_COLOR);
        saveBlocks(blocks);
        return blocks;
    }

    public static void saveBlocks(List<Map<String, Object>> blocks) {
        JsonStore.save(Paths.BLOCKS_FILE, blocks);
    }

    // ── genres ──（与 blocks 完全同构：颜色就存在同一个文件里）
    public static List<Map<String, Object>> loadGenres() {
        List<Map<String, Object>> genres =
                loadNamedColors(Paths.GENRES_FILE, Theme.DEFAULT_GENRE_COLOR);
        applyLegacyGenreColors(genres);
        saveGenres(genres);
        return genres;
    }

    /**
     * 一次性迁移：2.1.6 / 2.1.7 把流派色单独存在 {@code genre_colors.json}
     * （{@code {"Air":"#cccccc", …}}，用户在界面上挑的那些颜色）。现在颜色跟块一样
     * 存在 {@code genres.json} 同一项里，所以把旧颜色搬到对应流派上、然后删掉旧文件。
     * 搬完文件就没了，这段之后永远走空分支；已有非默认颜色的项不覆盖。
     */
    private static void applyLegacyGenreColors(List<Map<String, Object>> genres) {
        File legacy = new File(Paths.LEGACY_GENRE_COLORS_FILE);
        if (!legacy.isFile()) {
            return;
        }
        JsonNode root = JsonStore.loadNode(Paths.LEGACY_GENRE_COLORS_FILE, null);
        if (root != null && root.isObject()) {
            for (Map<String, Object> g : genres) {
                String name = String.valueOf(g.get("name"));
                JsonNode color = root.get(name);
                boolean untouched = Theme.DEFAULT_GENRE_COLOR.equals(g.get("color"));
                if (color != null && color.isTextual() && !color.asText().isBlank() && untouched) {
                    g.put("color", color.asText());
                }
            }
        }
        try {
            Files.deleteIfExists(legacy.toPath());
        } catch (IOException ignored) {
            // 删不掉也不影响使用（颜色已经搬进 genres.json 了）
        }
    }

    public static void saveGenres(List<Map<String, Object>> genres) {
        JsonStore.save(Paths.GENRES_FILE, genres);
    }

    // ── netease bindings ──
    public static Map<String, String> loadNeteaseBindings() {
        Map<String, String> m = JsonStore.load(Paths.NETEASE_BINDINGS_FILE,
                new TypeReference<LinkedHashMap<String, String>>() {});
        return m == null ? new LinkedHashMap<>() : m;
    }

    public static void saveNeteaseBindings(Map<String, String> bindings) {
        JsonStore.save(Paths.NETEASE_BINDINGS_FILE, bindings);
    }

    // ── metadata cache (CSV) ──
    public static Map<String, Map<String, String>> loadMetadataCache() {
        Map<String, Map<String, String>> cache = new LinkedHashMap<>();
        File f = new File(Paths.METADATA_CACHE_FILE);
        if (!f.exists()) {
            return cache;
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            List<String> header = Csv.parseLine(reader.readLine());
            int idxPath = header.indexOf("filepath");
            int idxTitle = header.indexOf("title");
            int idxArtist = header.indexOf("artist");
            int idxDur = header.indexOf("duration");
            String line;
            while ((line = reader.readLine()) != null) {
                List<String> row = Csv.parseLine(line);
                String fp = Csv.get(row, idxPath);
                if (fp == null || fp.isEmpty()) {
                    continue;
                }
                Map<String, String> info = new LinkedHashMap<>();
                info.put("title", Csv.get(row, idxTitle));
                info.put("artist", Csv.get(row, idxArtist));
                info.put("duration", Csv.get(row, idxDur));
                cache.put(fp, info);
            }
        } catch (Exception ignored) {
        }
        return cache;
    }

    public static void saveMetadataCache(Map<String, Map<String, String>> cache) {
        try (BufferedWriter writer = new BufferedWriter(
                new OutputStreamWriter(new FileOutputStream(Paths.METADATA_CACHE_FILE), StandardCharsets.UTF_8))) {
            writer.write("filepath,title,artist,duration\n");
            for (Map.Entry<String, Map<String, String>> e : cache.entrySet()) {
                Map<String, String> info = e.getValue();
                writer.write(Csv.escape(e.getKey()) + ","
                        + Csv.escape(info.getOrDefault("title", "")) + ","
                        + Csv.escape(info.getOrDefault("artist", "")) + ","
                        + Csv.escape(info.getOrDefault("duration", "0")) + "\n");
            }
        } catch (Exception ignored) {
        }
    }

    // ── 块颜色 ──
    public static String getBlockColor(List<Map<String, Object>> blocks, String blockName) {
        for (Map<String, Object> b : blocks) {
            if (blockName.equals(String.valueOf(b.get("name")))) {
                return String.valueOf(b.getOrDefault("color", Theme.DEFAULT_BLOCK_COLOR));
            }
        }
        return Theme.DEFAULT_BLOCK_COLOR;
    }

    // ── 流派颜色 ──
    public static String getGenreColor(List<Map<String, Object>> genres, String genreName) {
        for (Map<String, Object> g : genres) {
            if (genreName.equals(String.valueOf(g.get("name")))) {
                return String.valueOf(g.getOrDefault("color", Theme.DEFAULT_GENRE_COLOR));
            }
        }
        return Theme.DEFAULT_GENRE_COLOR;
    }

    public static boolean setGenreColor(List<Map<String, Object>> genres, String genreName, String color) {
        for (Map<String, Object> g : genres) {
            if (genreName.equals(String.valueOf(g.get("name")))) {
                g.put("color", color);
                saveGenres(genres);
                return true;
            }
        }
        return false;
    }

    public static boolean setBlockColor(List<Map<String, Object>> blocks, String blockName, String color) {
        for (Map<String, Object> b : blocks) {
            if (blockName.equals(String.valueOf(b.get("name")))) {
                b.put("color", color);
                saveBlocks(blocks);
                return true;
            }
        }
        return false;
    }

    /** 极简 CSV 解析（支持双引号转义）。 */
    static final class Csv {
        static List<String> parseLine(String line) {
            List<String> fields = new ArrayList<>();
            if (line == null) {
                return fields;
            }
            StringBuilder sb = new StringBuilder();
            boolean inQuotes = false;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if (inQuotes) {
                    if (c == '"') {
                        if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                            sb.append('"');
                            i++;
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        sb.append(c);
                    }
                } else {
                    if (c == '"') {
                        inQuotes = true;
                    } else if (c == ',') {
                        fields.add(sb.toString());
                        sb.setLength(0);
                    } else {
                        sb.append(c);
                    }
                }
            }
            fields.add(sb.toString());
            return fields;
        }

        static String get(List<String> row, int idx) {
            return (idx >= 0 && idx < row.size()) ? row.get(idx) : "";
        }

        static String escape(String s) {
            if (s == null) {
                return "\"\"";
            }
            if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
                return "\"" + s.replace("\"", "\"\"") + "\"";
            }
            return s;
        }
    }
}
