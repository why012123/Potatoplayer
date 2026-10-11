package com.potato.player.core;

import com.fasterxml.jackson.core.type.TypeReference;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 配置持久化（对应 core/backend.py 的 DEFAULT_CONFIG / load_config / save_config）。
 */
public final class Config {

    // ── 歌词显示模式（三选一）──
    /** 双语：原文 + 翻译两行。 */
    public static final String LYRICS_MODE_BILINGUAL = "bilingual";
    /** 仅中文：有翻译时用翻译，没有则回退原文。 */
    public static final String LYRICS_MODE_TRANSLATION = "translation";
    /** 仅原文。 */
    public static final String LYRICS_MODE_ORIGINAL = "original";

    public static final Map<String, Object> DEFAULT_CONFIG = new LinkedHashMap<>();
    static {
        DEFAULT_CONFIG.put("note_display_mode", "expanded");
        DEFAULT_CONFIG.put("artist_hidden", false);
        DEFAULT_CONFIG.put("cover_style", "circle_rotate");
        DEFAULT_CONFIG.put("volume", 70);
        DEFAULT_CONFIG.put("play_mode", "list_loop");
        DEFAULT_CONFIG.put("sort_mode", "title");
        DEFAULT_CONFIG.put("backend", "vlc");
        DEFAULT_CONFIG.put("show_index_headers", true);
        DEFAULT_CONFIG.put("comment_display_count", 15);
        DEFAULT_CONFIG.put("current_dl_br", 999000);
        DEFAULT_CONFIG.put("lyrics_display_mode", LYRICS_MODE_BILINGUAL);
        DEFAULT_CONFIG.put("bilingual_lyrics", true);
        DEFAULT_CONFIG.put("prefer_chinese_lyrics", true);
        DEFAULT_CONFIG.put("theme", Theme.DEFAULT_THEME);
        DEFAULT_CONFIG.put("filter_sort_mode", "title");
        DEFAULT_CONFIG.put("glass_mode", false);
        DEFAULT_CONFIG.put("glass_tint", "dark");
        DEFAULT_CONFIG.put("ui_opacity", 0.80);
        // 动画刷新率减半（省电）：悬浮窗伸缩 / 封面旋转 / 界面动效都按 30fps 走
        DEFAULT_CONFIG.put("anim_low_fps", true);
        // 🌫 屏幕起雾（测试功能，默认关）：放歌时屏幕慢慢起雾，用小动图擦
        DEFAULT_CONFIG.put("fog_on", false);
        DEFAULT_CONFIG.put("fog_fill_seconds", 90.0);
        DEFAULT_CONFIG.put("fog_max_alpha", 0.55);
        DEFAULT_CONFIG.put("fog_wipe_strength", 0.55);
        DEFAULT_CONFIG.put("fog_wipe_scale", 1.0);
        DEFAULT_CONFIG.put("desktop_lyrics_on", false);
        DEFAULT_CONFIG.put("desktop_lyrics_locked", false);
        DEFAULT_CONFIG.put("desktop_lyrics_style", "text");
        DEFAULT_CONFIG.put("desktop_lyrics_font", 30.0);
        DEFAULT_CONFIG.put("desktop_lyrics_x", -1.0);
        DEFAULT_CONFIG.put("desktop_lyrics_y", -1.0);
        DEFAULT_CONFIG.put("bg_image_path", "");
        DEFAULT_CONFIG.put("bg_image_scale", 1.0);
        DEFAULT_CONFIG.put("bg_image_offset_x", 0);
        DEFAULT_CONFIG.put("bg_image_offset_y", 0);
    }

    /** 归一化歌词模式，非法值回退「双语」。 */
    public static String normalizeLyricsMode(String mode) {
        if (LYRICS_MODE_TRANSLATION.equals(mode) || LYRICS_MODE_ORIGINAL.equals(mode)) {
            return mode;
        }
        return LYRICS_MODE_BILINGUAL;
    }

    /**
     * 读取歌词显示模式；配置里没有该键时，用旧版的
     * {@code bilingual_lyrics} + {@code prefer_chinese_lyrics} 推导（向后兼容）。
     */
    public static String lyricsDisplayMode(Map<String, Object> cfg) {
        Object v = cfg.get("lyrics_display_mode");
        if (v != null) {
            return normalizeLyricsMode(String.valueOf(v));
        }
        if (getBool(cfg, "bilingual_lyrics", true)) {
            return LYRICS_MODE_BILINGUAL;
        }
        return getBool(cfg, "prefer_chinese_lyrics", true)
                ? LYRICS_MODE_TRANSLATION : LYRICS_MODE_ORIGINAL;
    }

    private Config() {
    }

    /** 加载配置（默认值 + 已保存值）。 */
    public static Map<String, Object> load() {
        Map<String, Object> data = new LinkedHashMap<>(DEFAULT_CONFIG);
        Map<String, Object> saved = JsonStore.load(Paths.CONFIG_FILE, new TypeReference<LinkedHashMap<String, Object>>() {});
        if (saved != null) {
            data.putAll(saved);
            // 旧版只有 bilingual_lyrics / prefer_chinese_lyrics，迁移成单一显示模式键
            if (!saved.containsKey("lyrics_display_mode")) {
                data.put("lyrics_display_mode", lyricsDisplayMode(data));
            }
        }
        return data;
    }

    public static void save(Map<String, Object> data) {
        JsonStore.save(Paths.CONFIG_FILE, data);
    }

    // ── 类型化读取辅助 ──
    public static String getString(Map<String, Object> cfg, String key, String def) {
        Object v = cfg.get(key);
        return v == null ? def : String.valueOf(v);
    }

    public static boolean getBool(Map<String, Object> cfg, String key, boolean def) {
        Object v = cfg.get(key);
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        return def;
    }

    public static int getInt(Map<String, Object> cfg, String key, int def) {
        Object v = cfg.get(key);
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return v == null ? def : Integer.parseInt(String.valueOf(v));
        } catch (NumberFormatException e) {
            return def;
        }
    }

    public static double getDouble(Map<String, Object> cfg, String key, double def) {
        Object v = cfg.get(key);
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return v == null ? def : Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
