package com.potato.player.ui;

import com.potato.player.core.Theme;

import javafx.scene.layout.Border;
import javafx.scene.layout.BorderStroke;
import javafx.scene.layout.BorderStrokeStyle;
import javafx.scene.layout.BorderWidths;
import javafx.scene.layout.CornerRadii;
import javafx.scene.paint.Color;
import javafx.scene.paint.CycleMethod;
import javafx.scene.paint.LinearGradient;
import javafx.scene.paint.Stop;

import java.util.Map;

/**
 * 将主题配色转换为现代 JavaFX CSS（玻璃拟态 + 渐变 + 阴影）。
 */
public final class ThemeCss {

    private ThemeCss() {
    }

    public static String build(Map<String, String> t) {
        return build(t, 0.80);
    }

    /**
     * 生成主题 CSS。
     *
     * @param uiOpacity 控件（面板 / 卡片 / 按钮）不透明度，0.2 ~ 1.0，1.0 为完全不透明
     */
    public static String build(Map<String, String> t, double uiOpacity) {
        double alpha = Math.max(0.2, Math.min(1.0, uiOpacity));
        String bg = t.get("BG_COLOR");
        String panel = t.get("PANEL_BG");
        String card = t.get("CARD_BG");
        String cardHover = t.getOrDefault("CARD_HOVER", card);
        String trough = t.get("TROUGH");
        String hover = t.get("HOVER");
        String accent = t.get("ACCENT");
        String accent2 = t.getOrDefault("ACCENT_2", accent);
        String accentHover = t.get("ACCENT_HOVER");
        String accentPressed = t.get("ACCENT_PRESSED");
        String muted = t.get("MUTED");
        String danger = t.get("DANGER");
        String dangerHover = t.get("DANGER_HOVER");
        String buttonBg = t.get("BUTTON_BG");
        String entryBg = t.get("ENTRY_BG");
        String text = t.get("TEXT");
        String textMuted = t.get("TEXT_MUTED");
        String font = Theme.FONT_FAMILY;
        String fallback = Theme.FALLBACK_FONT_FAMILY;

        boolean light = isLight(bg);
        String border = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
        String shadow = light ? "rgba(15,23,42,0.12)" : "rgba(0,0,0,0.45)";
        double panelAlpha = alpha;
        double cardAlpha = Math.min(1.0, alpha + 0.08);
        double cardHoverAlpha = Math.min(1.0, alpha + 0.14);
        double btnAlpha = Math.min(1.0, alpha + 0.05);
        String hoverFill = rgba(accent, light ? 0.14 : 0.16);

        String css = """
                .root {
                    -fx-background-color:
                        radial-gradient(center 50% -12%, radius 78%, @@ACCENT_A@@, transparent 62%),
                        radial-gradient(center 112% 112%, radius 78%, @@ACCENT2_A@@, transparent 62%),
                        @@BG@@;
                    -fx-font-family: "@@FONT@@", "@@FALLBACK@@";
                    -fx-font-size: 13px;
                }
                .label { -fx-text-fill: @@TEXT@@; }
                .muted { -fx-text-fill: @@MUTED@@; }
                .small { -fx-font-size: 11px; -fx-text-fill: @@MUTED@@; }
                .title { -fx-font-size: 15px; -fx-font-weight: bold; -fx-text-fill: @@TEXT@@; }

                .panel {
                    -fx-background-color: @@PANEL_A@@;
                    -fx-background-radius: 16;
                    -fx-border-color: @@BORDER@@;
                    -fx-border-radius: 16;
                    -fx-border-width: 1;
                    -fx-padding: 14;
                    -fx-effect: dropshadow(gaussian, @@SHADOW@@, 30, 0, 0, 8);
                }
                .accent-header {
                    -fx-background-color: linear-gradient(to right, @@ACCENT@@, @@ACCENT2@@);
                    -fx-background-radius: 12;
                    -fx-padding: 10 14 10 14;
                    -fx-effect: dropshadow(gaussian, @@ACCENT_A2@@, 18, 0, 0, 5);
                }
                .accent-header .label { -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 14px; }

                .button {
                    -fx-background-color: @@BTN@@;
                    -fx-text-fill: @@TEXT@@;
                    -fx-background-radius: 10;
                    -fx-padding: 6 12 6 12;
                    -fx-cursor: hand;
                }
                .button:hover { -fx-background-color: @@HOVER_FILL@@; }
                .button:pressed { -fx-background-color: @@PRESSED@@; -fx-translate-y: 1; }
                .button.primary {
                    -fx-background-color: linear-gradient(to right, @@ACCENT@@, @@ACCENT2@@);
                    -fx-text-fill: white;
                    -fx-font-weight: bold;
                    -fx-effect: dropshadow(gaussian, @@ACCENT_A2@@, 14, 0, 0, 3);
                }
                .button.primary:hover { -fx-effect: dropshadow(gaussian, @@ACCENT_A3@@, 20, 0, 0, 5); }
                .button.danger {
                    -fx-background-color: linear-gradient(to right, @@DANGER@@, @@DANGER_HOVER@@);
                    -fx-text-fill: white;
                }
                .button.icon-btn {
                    -fx-font-size: 16px;
                    -fx-padding: 6 13 6 13;
                    -fx-background-radius: 22;
                    -fx-background-color: @@BTN@@;
                }
                .button.play-btn {
                    -fx-font-size: 22px;
                    -fx-padding: 9 20 9 20;
                    -fx-background-radius: 30;
                    -fx-background-color: linear-gradient(to right, @@ACCENT@@, @@ACCENT2@@);
                    -fx-text-fill: white;
                    -fx-effect: dropshadow(gaussian, @@ACCENT_A2@@, 18, 0, 0, 5);
                }
                .button.play-btn:hover { -fx-effect: dropshadow(gaussian, @@ACCENT_A3@@, 26, 0, 0, 7); }

                .combo-box {
                    -fx-background-color: @@ENTRY@@;
                    -fx-background-radius: 10;
                }
                .combo-box .list-cell { -fx-text-fill: @@TEXT@@; -fx-background-color: transparent; }
                .combo-box .list-view { -fx-background-color: @@CARD@@; -fx-background-radius: 10; }
                .combo-box .list-cell:hover { -fx-background-color: @@HOVER_FILL@@; }
                .combo-box .arrow { -fx-background-color: @@MUTED@@; }

                .text-field, .text-area {
                    -fx-background-color: @@ENTRY@@;
                    -fx-text-fill: @@TEXT@@;
                    -fx-background-radius: 10;
                    -fx-prompt-text-fill: @@MUTED@@;
                }
                .text-field:focused, .text-area:focused {
                    -fx-border-color: @@ACCENT@@;
                    -fx-border-radius: 10;
                    -fx-border-width: 1.5;
                }

                .list-view {
                    -fx-background-color: transparent;
                    -fx-background-radius: 10;
                    -fx-border-color: transparent;
                    -fx-padding: 2;
                }
                .list-view .list-cell {
                    -fx-background-color: transparent;
                    -fx-text-fill: @@TEXT@@;
                    -fx-padding: 7 10 7 10;
                    -fx-background-radius: 8;
                }
                .list-view .list-cell:filled:hover { -fx-background-color: @@HOVER_FILL@@; }
                .list-view .list-cell:filled:selected {
                    -fx-background-color: linear-gradient(to right, @@ACCENT@@, @@ACCENT2@@);
                    -fx-text-fill: white;
                }

                .slider { -fx-padding: 6 0 6 0; }
                .slider .track {
                    -fx-background-color: @@TROUGH@@;
                    -fx-background-radius: 4;
                    -fx-pref-height: 5;
                }
                .slider .thumb {
                    -fx-background-color: white;
                    -fx-background-radius: 9;
                    -fx-pref-width: 18;
                    -fx-pref-height: 18;
                    -fx-effect: dropshadow(gaussian, @@ACCENT_A3@@, 12, 0, 0, 2);
                }

                .scroll-pane, .scroll-pane > .viewport { -fx-background-color: transparent; }
                .scroll-bar { -fx-background-color: transparent; }
                .scroll-bar .track { -fx-background-color: transparent; }
                .scroll-bar .thumb { -fx-background-color: @@SCROLL@@; -fx-background-radius: 6; }
                .scroll-bar .increment-button, .scroll-bar .decrement-button { -fx-background-color: transparent; }
                .scroll-bar .increment-arrow, .scroll-bar .decrement-arrow { -fx-background-color: transparent; }

                .spinner { -fx-background-color: @@ENTRY@@; -fx-background-radius: 10; }
                .check-box { -fx-text-fill: @@TEXT@@; }
                .check-box .box { -fx-background-color: @@ENTRY@@; -fx-background-radius: 5; }
                .check-box:selected .box { -fx-background-color: @@ACCENT@@; }

                .menu-item {
                    -fx-background-color: @@BTN@@;
                    -fx-text-fill: @@TEXT@@;
                    -fx-background-radius: 10;
                    -fx-padding: 11 14 11 14;
                    -fx-alignment: CENTER_LEFT;
                    -fx-cursor: hand;
                    -fx-font-size: 13px;
                }
                .menu-item:hover { -fx-background-color: @@HOVER_FILL@@; }

                .toggle-button {
                    -fx-background-color: @@BTN@@;
                    -fx-text-fill: @@MUTED@@;
                    -fx-background-radius: 10;
                    -fx-padding: 5 12 5 12;
                    -fx-cursor: hand;
                }
                .toggle-button:hover { -fx-background-color: @@HOVER_FILL@@; }
                .toggle-button:selected {
                    -fx-background-color: linear-gradient(to right, @@ACCENT@@, @@ACCENT2@@);
                    -fx-text-fill: white;
                    -fx-font-weight: bold;
                }

                .tab-pane { -fx-tab-min-height: 25; -fx-tab-max-height: 25; }
                .tab-pane > .tab-header-area { -fx-padding: 3 0 5 0; }
                .tab-pane > .tab-header-area > .tab-header-background { -fx-background-color: transparent; }
                .tab-pane > .tab-header-area > .headers-region > .tab {
                    -fx-background-color: @@BTN@@;
                    -fx-background-radius: 9;
                    -fx-padding: 4 8 4 8;
                    -fx-cursor: hand;
                }
                .tab-pane > .tab-header-area > .headers-region > .tab:hover {
                    -fx-background-color: @@HOVER_FILL@@;
                }
                .tab-pane > .tab-header-area > .headers-region > .tab .tab-label {
                    -fx-text-fill: @@MUTED@@;
                    -fx-font-size: 12px;
                }
                .tab-pane > .tab-header-area > .headers-region > .tab:selected {
                    -fx-background-color: linear-gradient(to right, @@ACCENT@@, @@ACCENT2@@);
                }
                .tab-pane > .tab-header-area > .headers-region > .tab:selected .tab-label {
                    -fx-text-fill: white;
                    -fx-font-weight: bold;
                }
                .tab-pane > .tab-header-area > .headers-region > .tab:selected .focus-indicator {
                    -fx-border-color: transparent;
                }
                .tab-pane > .tab-header-area > .headers-region > .tab .tab-close-button {
                    -fx-background-color: transparent;
                    -fx-pref-width: 0;
                    -fx-pref-height: 0;
                    -fx-padding: 0;
                }
                .tab-pane > .tab-content-area { -fx-background-color: transparent; }

                .card {
                    -fx-background-color: @@CARD_A@@;
                    -fx-background-radius: 12;
                    -fx-border-color: @@BORDER@@;
                    -fx-border-radius: 12;
                    -fx-border-width: 1;
                    -fx-effect: dropshadow(gaussian, @@SHADOW@@, 14, 0, 0, 4);
                }
                .card:hover { -fx-background-color: @@CARD_HOVER_A@@; }
                .card-title { -fx-font-weight: bold; -fx-text-fill: @@TEXT@@; }
                """;

        return css
                .replace("@@BG@@", bg)
                .replace("@@FONT@@", font)
                .replace("@@FALLBACK@@", fallback)
                .replace("@@ACCENT@@", accent)
                .replace("@@ACCENT2@@", accent2)
                .replace("@@ACCENT_A@@", rgba(accent, 0.26))
                .replace("@@ACCENT2_A@@", rgba(accent2, 0.20))
                .replace("@@ACCENT_A2@@", rgba(accent, 0.45))
                .replace("@@ACCENT_A3@@", rgba(accent, 0.65))
                .replace("@@TEXT@@", text)
                .replace("@@MUTED@@", muted)
                .replace("@@PANEL_A@@", rgba(panel, panelAlpha))
                .replace("@@BORDER@@", border)
                .replace("@@SHADOW@@", shadow)
                .replace("@@BTN@@", rgba(buttonBg, btnAlpha))
                .replace("@@ENTRY@@", rgba(entryBg, btnAlpha))
                .replace("@@CARD@@", card)
                .replace("@@CARD_A@@", rgba(card, cardAlpha))
                .replace("@@CARD_HOVER_A@@", rgba(cardHover, cardHoverAlpha))
                .replace("@@TROUGH@@", trough)
                .replace("@@HOVER_FILL@@", hoverFill)
                .replace("@@PRESSED@@", accentPressed)
                .replace("@@DANGER@@", danger)
                .replace("@@DANGER_HOVER@@", dangerHover)
                .replace("@@SCROLL@@", rgba(muted, 0.35));
    }

    /**
     * 歌曲库行的「标识带」：8pt 宽的左边框，用<b>绝对坐标</b>线性渐变切成两段各 4pt
     * —— 左 = 块标识色，右 = 流派标识色（流派为空则右半透明）。
     *
     * <p>为什么不用 CSS 写：{@code -fx-border-color: … linear-gradient(to right, A 0px, A 4px, …)}
     * 里的 {@code px} 停点会被 CSS 当成百分比（实测整条带子全变成第一个颜色），
     * 而用 50% 又会切在单元格中线上（CSS 渐变的坐标空间是整个节点）。</p>
     *
     * <p>为什么必须用<b>边框</b>而不是背景：行的悬停/选中底色是 CSS 给
     * {@code .list-cell:filled:hover / :selected} 的背景层，内联背景会把它整块盖掉；
     * 边框画在背景层之上，两不误。</p>
     *
     * <p>带子占掉的 4pt 由调用方把内边距从 10 减到 6 抵回来（见 SongLibraryPanel），
     * 所以歌名左边缘不变。</p>
     */
    public static Border idStrip(String blockColor, String genreColor) {
        return idStrip(blockColor, genreColor, 8);
    }

    /** 指定整条宽度（两段各一半）。 */
    public static Border idStrip(String blockColor, String genreColor, double width) {
        Color left = parse(blockColor, Color.TRANSPARENT);
        Color right = parse(genreColor, Color.TRANSPARENT);
        LinearGradient grad = new LinearGradient(0, 0, width, 0, false, CycleMethod.NO_CYCLE,
                new Stop(0, left), new Stop(0.5, left), new Stop(0.5, right), new Stop(1, right));
        return new Border(new BorderStroke(grad, BorderStrokeStyle.SOLID, CornerRadii.EMPTY,
                new BorderWidths(0, 0, 0, width)));
    }

    /**
     * 进度条 track 的样式：<b>走过的一段 = played 色、没走过的一段 = rest 色</b>，
     * 分界点 {@code pct}（0~100）处硬切。
     *
     * <p>JavaFX 的 Slider 皮肤里"已播放"那一段本来不单独画（只有一条 track 加一个滑块），
     * 所以只能用一道硬切的线性渐变代替；半径/高度要把 CSS 里的那两条抄回来，
     * 因为内联样式会整条覆盖掉 {@code .slider .track} 规则。</p>
     */
    public static String progressTrackStyle(String played, String rest, double pct) {
        double p = Math.max(0, Math.min(100, pct));
        return "-fx-background-color: linear-gradient(to right, "
                + played + " " + p + "%, " + rest + " " + p + "%);"
                + "-fx-background-radius: 4; -fx-pref-height: 5;";
    }

    private static Color parse(String hex, Color fallback) {
        if (hex == null || hex.isBlank()) {
            return fallback;
        }
        try {
            return Color.web(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    /** 将 #RRGGBB 转为 rgba(r,g,b,a)。 */
    public static String rgba(String hex, double alpha) {
        String h = hex.startsWith("#") ? hex.substring(1) : hex;
        if (h.length() < 6) {
            h = String.format("%6s", h).replace(' ', '0');
        }
        int r = Integer.parseInt(h.substring(0, 2), 16);
        int g = Integer.parseInt(h.substring(2, 4), 16);
        int b = Integer.parseInt(h.substring(4, 6), 16);
        double a = Math.round(alpha * 1000.0) / 1000.0;
        return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }

    private static boolean isLight(String hex) {
        String h = hex.startsWith("#") ? hex.substring(1) : hex;
        double r = Integer.parseInt(h.substring(0, 2), 16) / 255.0;
        double g = Integer.parseInt(h.substring(2, 4), 16) / 255.0;
        double b = Integer.parseInt(h.substring(4, 6), 16) / 255.0;
        double lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return lum > 0.5;
    }
}
