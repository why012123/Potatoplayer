package com.potato.player.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 主题配色与字体定义（对应 core/theme.py）。
 */
public final class Theme {

    public static final String DEFAULT_THEME = "紫夜 (默认)";

    /** 主题中所有会被 UI 引用的颜色键。 */
    public static final List<String> COLOR_KEYS = List.of(
            "BG_COLOR", "PANEL_BG", "CARD_BG", "TROUGH", "HOVER",
            "ACCENT", "ACCENT_2", "ACCENT_HOVER", "ACCENT_PRESSED", "MUTED",
            "DANGER", "DANGER_HOVER", "SUCCESS", "WARNING",
            "CARD_HOVER", "CARD_ALTERNATE", "SEPARATOR", "INSERT_LINE",
            "BUTTON_BG", "ENTRY_BG", "TEXT", "TEXT_MUTED"
    );

    public static final Map<String, Map<String, String>> THEME_PRESETS = buildPresets();

    // 分组索引条统一底色（块未指定颜色时）
    public static final String DEFAULT_BLOCK_COLOR = "#1e3a8a";

    /** 流派标识色的默认值（对应 {@link #DEFAULT_BLOCK_COLOR}；旧数据没有颜色时补这个）。 */
    public static final String DEFAULT_GENRE_COLOR = "#1e3a8a";

    // ── 字体 ──
    public static final String FONT_FAMILY = "SF Pro Display";
    public static final String FONT_MONO_FAMILY = "SF Mono";
    public static final String FALLBACK_FONT_FAMILY = "PingFang SC";
    public static final double FONT_MAIN_SIZE = 12;
    public static final double FONT_TITLE_SIZE = 14;
    public static final double FONT_SMALL_SIZE = 10;
    public static final double FONT_MONO_SIZE = 10;

    private Theme() {
    }

    /** 按名称取主题（找不到时回退默认主题，返回副本）。 */
    public static Map<String, String> resolve(String name) {
        Map<String, String> theme = THEME_PRESETS.get(name);
        if (theme == null) {
            theme = THEME_PRESETS.get(DEFAULT_THEME);
        }
        return new LinkedHashMap<>(theme);
    }

    private static Map<String, Map<String, String>> buildPresets() {
        Map<String, Map<String, String>> presets = new LinkedHashMap<>();
        presets.put("紫夜 (默认)", preset(
                "#0d0d0f", "#15151a", "#1e1e26", "#2a2a34", "#2e2e3a",
                "#7c5cff", "#4f9cf9", "#9475ff", "#5a3dd8", "#8a8a99",
                "#e74c3c", "#f55a4e", "#2ecc71", "#f39c12",
                "#282834", "#1a1a22", "#25252f", "#7c5cff",
                "#1e1e26", "#111116", "#ffffff", "#8a8a99",
                "深邃暗紫 · 护眼暗色系"));
        presets.put("蓝白", preset(
                "#eef2f7", "#ffffff", "#f7f9fc", "#dde3ec", "#e8edf4",
                "#2563eb", "#06b6d4", "#3b82f6", "#1d4ed8", "#6b7280",
                "#dc2626", "#ef4444", "#16a34a", "#d97706",
                "#e8edf4", "#f0f4f9", "#d1d5db", "#2563eb",
                "#e5e9ef", "#f9fafb", "#111827", "#4b5563",
                "清新蓝白 · 明亮简洁"));
        presets.put("墨绿", preset(
                "#0a0f0d", "#111a16", "#1a241f", "#26332e", "#2a3832",
                "#10b981", "#14b8a6", "#34d399", "#059669", "#6b8b7a",
                "#ef4444", "#f87171", "#22c55e", "#f59e0b",
                "#24332c", "#15201b", "#1f2f27", "#10b981",
                "#1a241f", "#0e150f", "#ffffff", "#6b8b7a",
                "暗夜墨绿 · 自然沉稳"));
        presets.put("暖橙", preset(
                "#1a1410", "#241c16", "#2d241c", "#3d3228", "#3c3026",
                "#f97316", "#ef4444", "#fb923c", "#ea580c", "#9c8b7a",
                "#ef4444", "#f87171", "#22c55e", "#eab308",
                "#342a20", "#201a12", "#33281c", "#f97316",
                "#2d241c", "#171009", "#ffffff", "#9c8b7a",
                "暗夜暖橙 · 温暖柔和"));
        return presets;
    }

    private static Map<String, String> preset(
            String bg, String panel, String card, String trough, String hover,
            String accent, String accent2, String accentHover, String accentPressed, String muted,
            String danger, String dangerHover, String success, String warning,
            String cardHover, String cardAlt, String separator, String insertLine,
            String buttonBg, String entryBg, String text, String textMuted,
            String desc) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("BG_COLOR", bg);
        m.put("PANEL_BG", panel);
        m.put("CARD_BG", card);
        m.put("TROUGH", trough);
        m.put("HOVER", hover);
        m.put("ACCENT", accent);
        m.put("ACCENT_2", accent2);
        m.put("ACCENT_HOVER", accentHover);
        m.put("ACCENT_PRESSED", accentPressed);
        m.put("MUTED", muted);
        m.put("DANGER", danger);
        m.put("DANGER_HOVER", dangerHover);
        m.put("SUCCESS", success);
        m.put("WARNING", warning);
        m.put("CARD_HOVER", cardHover);
        m.put("CARD_ALTERNATE", cardAlt);
        m.put("SEPARATOR", separator);
        m.put("INSERT_LINE", insertLine);
        m.put("BUTTON_BG", buttonBg);
        m.put("ENTRY_BG", entryBg);
        m.put("TEXT", text);
        m.put("TEXT_MUTED", textMuted);
        m.put("desc", desc);
        return m;
    }
}
