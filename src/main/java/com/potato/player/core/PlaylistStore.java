package com.potato.player.core;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 歌单文件管理（对应 backend.py 的 get_playlist_files / save_current_playlist / load_playlist）。
 */
public final class PlaylistStore {

    private PlaylistStore() {
    }

    public static List<String> getPlaylistFiles() {
        List<String> result = new ArrayList<>();
        File dir = new File(Paths.PLAYLIST_DIR);
        if (!dir.exists()) {
            return result;
        }
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return result;
        }
        List<String> list = new ArrayList<>();
        for (File f : files) {
            list.add(f.getAbsolutePath());
        }
        list.sort(String::compareTo);
        return list;
    }

    public static boolean saveCurrentPlaylist(String name, List<String> playlist) {
        if (name == null || name.isBlank()) {
            return false;
        }
        File filepath = new File(Paths.PLAYLIST_DIR, name + ".json");
        try {
            JsonStore.MAPPER.writerWithDefaultPrettyPrinter().writeValue(filepath, playlist);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ── 上次会话的播放列表（启动时同步用）──

    /**
     * @param playlist 上次退出时的播放列表（文件已经没了的条目在读的时候就丢掉了）
     * @param index    当时正在听第几首；−1 = 没在听
     */
    public record Session(List<String> playlist, int index) {
        public boolean isEmpty() {
            return playlist.isEmpty();
        }
    }

    /** 把当前播放列表与曲目下标记下来。 */
    public static void saveSession(List<String> playlist, int index) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", 1);
        root.put("index", index);
        root.put("playlist", new ArrayList<>(playlist));
        JsonStore.save(Paths.SESSION_FILE, root);
    }

    /** 读上次的播放列表；没有 / 坏了就当空会话。 */
    public static Session loadSession() {
        List<String> out = new ArrayList<>();
        int index = -1;
        JsonNode root = JsonStore.loadNode(Paths.SESSION_FILE, null);
        if (root != null && root.isObject()) {
            JsonNode arr = root.get("playlist");
            if (arr != null && arr.isArray()) {
                for (JsonNode n : arr) {
                    String p = n.asText("");
                    // 文件被删/移走的条目直接丢掉，免得恢复出一串点不动的歌
                    if (!p.isBlank() && new File(p).exists()) {
                        out.add(p);
                    }
                }
            }
            index = root.path("index").asInt(-1);
        }
        return new Session(out, index);
    }

    public static List<String> loadPlaylist(String filepath) {
        try {
            List<String> data = JsonStore.load(filepath, new TypeReference<ArrayList<String>>() {});
            if (data == null) {
                return new ArrayList<>();
            }
            List<String> result = new ArrayList<>();
            for (String p : data) {
                if (new File(p).exists()) {
                    result.add(p);
                }
            }
            return result;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }
}
