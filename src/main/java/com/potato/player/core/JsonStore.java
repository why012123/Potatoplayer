package com.potato.player.core;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * JSON 读写工具（Jackson 封装）。
 */
public final class JsonStore {

    public static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    private JsonStore() {
    }

    /** 读取 JSON 文件为 Map，失败/不存在返回 default。 */
    public static Map<String, Object> loadMap(String path, Map<String, Object> def) {
        File f = new File(path);
        if (!f.exists()) {
            return def;
        }
        try {
            Map<String, Object> m = MAPPER.readValue(f, new TypeReference<LinkedHashMap<String, Object>>() {});
            return m == null ? def : m;
        } catch (IOException e) {
            return def;
        }
    }

    /** 读取 JSON 文件为 JsonNode，失败/不存在返回 default。 */
    public static JsonNode loadNode(String path, JsonNode def) {
        File f = new File(path);
        if (!f.exists()) {
            return def;
        }
        try {
            return MAPPER.readTree(f);
        } catch (IOException e) {
            return def;
        }
    }

    /** 读取 JSON 文件为任意类型，失败/不存在返回 null。 */
    public static <T> T load(String path, TypeReference<T> type) {
        File f = new File(path);
        if (!f.exists()) {
            return null;
        }
        try {
            return MAPPER.readValue(f, type);
        } catch (IOException e) {
            return null;
        }
    }

    /** 保存对象为 JSON 文件（缩进、UTF-8、ensure_ascii=false）。 */
    public static void save(String path, Object data) {
        try {
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(new File(path), data);
        } catch (IOException ignored) {
        }
    }

    /** 便捷读取：字符串键的值映射。 */
    public static Map<String, String> loadStringMap(String path) {
        Map<String, String> result = new LinkedHashMap<>();
        JsonNode node = loadNode(path, null);
        if (node != null && node.isObject()) {
            node.fields().forEachRemaining(e -> result.put(e.getKey(), e.getValue().asText()));
        }
        return result;
    }
}
