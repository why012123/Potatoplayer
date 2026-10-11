package com.potato.player.ui;

import com.potato.player.core.Config;
import com.potato.player.core.SongInfo;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.control.ContextMenu;
import javafx.scene.control.Label;
import javafx.scene.control.MenuItem;
import javafx.scene.control.SeparatorMenuItem;
import javafx.scene.effect.DropShadow;
import javafx.scene.effect.Effect;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.text.TextAlignment;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.util.List;
import java.util.Map;

/**
 * 桌面歌词：无边框、全透明、永远置顶的悬浮歌词窗口。
 *
 * <ul>
 *   <li>内容：本句歌词（大字）+ 翻译（小字），无歌词时显示「♪ 歌手 - 歌名」</li>
 *   <li>交互：拖拽移动 / 滚轮调字号 / 右键菜单（锁定、字号、样式、重置位置、关闭）</li>
 *   <li>锁定：开启后窗口忽略鼠标事件（macOS 走原生 {@code setIgnoresMouseEvents:}），
 *       点击直接穿透到桌面；解锁入口在设置页「🖥 桌面歌词」与播放区按钮</li>
 *   <li>样式：{@code text} 描边文字（无底，最通透）/ {@code bar} 半透明圆角底条</li>
 *   <li>位置、字号、样式、开关、锁定状态全部持久化到 config.json</li>
 * </ul>
 */
public class DesktopLyrics {

    /** 窗口标题（macOS 原生穿透按标题定位 NSWindow，勿随意修改）。 */
    private static final String WINDOW_TITLE = "PotatoDesktopLyrics";

    private static final double FONT_MIN = 14;
    private static final double FONT_MAX = 64;
    private static final double DEFAULT_FONT = 30;

    private final MainWindow main;
    private final Label lineLabel = new Label();
    private final Label transLabel = new Label();
    private final VBox box = new VBox(2);
    private final StackPane root = new StackPane(box);

    private Stage stage;
    private boolean locked;
    private boolean dragging;
    private double dragDx;
    private double dragDy;
    private double fontSize;
    /** "text" = 描边文字；"bar" = 半透明底条。 */
    private String styleMode;

    public DesktopLyrics(MainWindow main) {
        this.main = main;
        Map<String, Object> cfg = main.lib().config();
        this.fontSize = clampFont(Config.getDouble(cfg, "desktop_lyrics_font", DEFAULT_FONT));
        this.locked = Config.getBool(cfg, "desktop_lyrics_locked", false);
        this.styleMode = Config.getString(cfg, "desktop_lyrics_style", "text");
    }

    // ── 开关 ──

    public boolean isShowing() {
        return stage != null && stage.isShowing();
    }

    public boolean isLocked() {
        return locked;
    }

    public String styleMode() {
        return styleMode;
    }

    public double fontSize() {
        return fontSize;
    }

    public void toggle() {
        if (isShowing()) {
            hide();
        } else {
            show();
        }
    }

    /** 显示桌面歌词（并持久化开关状态）。 */
    public void show() {
        ensureStage();
        boolean firstShow = !stage.isShowing();
        if (firstShow) {
            boolean restore = Config.getDouble(main.lib().config(), "desktop_lyrics_x", -1) >= 0;
            if (restore) {
                stage.setX(currentX());
                stage.setY(currentY());
            }
            stage.show();
            if (!restore) {
                // 首次显示：底部居中
                resetPosition();
            }
        }
        applyStyle();
        applyText(buildLine(), buildTranslation());
        applyLock(firstShow);
        main.lib().config().put("desktop_lyrics_on", true);
        main.lib().saveConfig();
    }

    /** 隐藏桌面歌词（并持久化开关状态）。 */
    public void hide() {
        if (stage != null) {
            stage.hide();
        }
        main.lib().config().put("desktop_lyrics_on", false);
        main.lib().saveConfig();
    }

    /** 关闭窗口时释放原生状态，避免残留的置顶窗口。 */
    public void dispose() {
        if (stage != null) {
            MacWindowClickThrough.setIgnoreMouseEvents(stage, false);
            stage.hide();
        }
    }

    // ── 内容更新 ──

    /** 由主窗口的歌词定时器定期调用（未显示时直接返回）。 */
    public void update() {
        if (!isShowing()) {
            return;
        }
        applyText(buildLine(), buildTranslation());
    }

    private String buildLine() {
        List<SongInfo.LrcLine> lyrics = main.currentLyrics;
        int idx = SongInfo.lyricIndexAt(lyrics, main.currentPos);
        if (idx >= 0 && idx < lyrics.size()) {
            SongInfo.LrcLine cur = lyrics.get(idx);
            return cur.text() == null ? "" : cur.text();
        }
        return idleText();
    }

    private String buildTranslation() {
        List<SongInfo.LrcLine> lyrics = main.currentLyrics;
        int idx = SongInfo.lyricIndexAt(lyrics, main.currentPos);
        if (idx >= 0 && idx < lyrics.size()) {
            String t = lyrics.get(idx).translation();
            return t == null ? "" : t;
        }
        return "";
    }

    /** 无歌词可显示时的占位内容。 */
    private String idleText() {
        String path = main.currentSongPath();
        if (path == null) {
            return "♪ Potato Player";
        }
        String title = main.getCachedTitle(path);
        String artist = main.getCachedArtist(path);
        if (title == null || title.isBlank()) {
            title = new java.io.File(path).getName();
        }
        if (artist != null && !artist.isBlank() && !"未知歌手".equals(artist)) {
            return "♪ " + artist + " - " + title;
        }
        return "♪ " + title;
    }

    private void applyText(String line, String trans) {
        boolean lineChanged = !line.equals(lineLabel.getText());
        boolean transChanged = !trans.equals(transLabel.getText());
        if (!lineChanged && !transChanged) {
            return;
        }
        double centerX = isShowing() ? stage.getX() + stage.getWidth() / 2 : Double.NaN;
        lineLabel.setText(line);
        transLabel.setText(trans);
        boolean showTrans = !trans.isBlank();
        if (transLabel.isVisible() != showTrans) {
            transLabel.setVisible(showTrans);
            transLabel.setManaged(showTrans);
        }
        if (isShowing()) {
            stage.sizeToScene();
            if (!Double.isNaN(centerX)) {
                // 保持视觉中心不动，避免文字变长时窗口单向膨胀
                stage.setX(centerX - stage.getWidth() / 2);
            }
            keepOnScreen();
        }
    }

    // ── 外观 ──

    /** 按当前主题 + 样式模式刷新配色（主题切换时由 MainWindow 调用）。 */
    public void applyStyle() {
        double transSize = Math.max(11, fontSize * 0.6);
        if ("bar".equals(styleMode)) {
            root.setStyle("-fx-background-color: " + ThemeCss.rgba(main.c("CARD_BG"), 0.74) + ";"
                    + "-fx-background-radius: 16;"
                    + "-fx-border-radius: 16; -fx-border-width: 1;"
                    + "-fx-border-color: " + ThemeCss.rgba(main.c("TEXT"), 0.14) + ";");
            lineLabel.setStyle("-fx-text-fill: " + main.c("TEXT") + "; -fx-font-weight: bold;"
                    + "-fx-font-size: " + fontSize + "px;");
            transLabel.setStyle("-fx-text-fill: " + main.c("TEXT_MUTED") + ";"
                    + "-fx-font-size: " + transSize + "px;");
            lineLabel.setEffect(null);
            transLabel.setEffect(null);
        } else {
            root.setStyle("-fx-background-color: transparent;");
            lineLabel.setStyle("-fx-text-fill: white; -fx-font-weight: bold;"
                    + "-fx-font-size: " + fontSize + "px;");
            transLabel.setStyle("-fx-text-fill: rgba(255,255,255,0.9);"
                    + "-fx-font-size: " + transSize + "px;");
            // 白色描边 + 投影：任何壁纸上都能看清
            lineLabel.setEffect(outline());
            transLabel.setEffect(outline());
        }
        if (isShowing()) {
            double centerX = stage.getX() + stage.getWidth() / 2;
            stage.sizeToScene();
            stage.setX(centerX - stage.getWidth() / 2);
            keepOnScreen();
        }
    }

    private Effect outline() {
        DropShadow edge = new DropShadow();
        edge.setColor(Color.rgb(0, 0, 0, 0.95));
        edge.setRadius(3);
        edge.setSpread(1.0);
        DropShadow soft = new DropShadow();
        soft.setColor(Color.rgb(0, 0, 0, 0.7));
        soft.setRadius(10);
        soft.setOffsetY(2);
        soft.setInput(edge);
        return soft;
    }

    public void setStyleMode(String mode) {
        styleMode = "bar".equals(mode) ? "bar" : "text";
        main.lib().config().put("desktop_lyrics_style", styleMode);
        main.lib().saveConfig();
        applyStyle();
    }

    /** 调整字号（滚轮 / 右键菜单 / 设置页共用）。 */
    public void changeFontSize(double delta) {
        setFontSize(fontSize + delta);
    }

    public void setFontSize(double size) {
        double next = clampFont(size);
        if (Math.abs(next - fontSize) < 0.01) {
            return;
        }
        fontSize = next;
        main.lib().config().put("desktop_lyrics_font", fontSize);
        main.lib().saveConfig();
        applyStyle();
    }

    // ── 锁定 / 鼠标穿透 ──

    public void setLocked(boolean value) {
        locked = value;
        main.lib().config().put("desktop_lyrics_locked", locked);
        main.lib().saveConfig();
        applyLock(true);
    }

    private void applyLock(boolean deferNative) {
        root.setMouseTransparent(locked);
        if (stage == null) {
            return;
        }
        // 原生调用需等 NSWindow 真正就绪，延后一帧更稳
        if (deferNative) {
            Platform.runLater(() -> MacWindowClickThrough.setIgnoreMouseEvents(stage, locked));
        } else {
            MacWindowClickThrough.setIgnoreMouseEvents(stage, locked);
        }
    }

    // ── 位置 ──

    /** 重置到主屏底部居中。 */
    public void resetPosition() {
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double w = isShowing() ? stage.getWidth() : 400;
        double h = isShowing() ? stage.getHeight() : 80;
        double x = vb.getMinX() + (vb.getWidth() - w) / 2;
        double y = vb.getMaxY() - h - 140;
        if (stage != null) {
            stage.setX(x);
            stage.setY(y);
        }
        savePosition(x, y);
        keepOnScreen();
    }

    private double currentX() {
        double saved = Config.getDouble(main.lib().config(), "desktop_lyrics_x", -1);
        if (saved >= 0) {
            return saved;
        }
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double w = isShowing() ? stage.getWidth() : 400;
        return vb.getMinX() + (vb.getWidth() - w) / 2;
    }

    private double currentY() {
        double saved = Config.getDouble(main.lib().config(), "desktop_lyrics_y", -1);
        if (saved >= 0) {
            return saved;
        }
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double h = isShowing() ? stage.getHeight() : 80;
        return vb.getMaxY() - h - 140;
    }

    private void savePosition(double x, double y) {
        main.lib().config().put("desktop_lyrics_x", x);
        main.lib().config().put("desktop_lyrics_y", y);
        main.lib().saveConfig();
    }

    /** 保证窗口至少有一部分留在屏幕内，避免拖出屏幕后找不回来。 */
    private void keepOnScreen() {
        if (!isShowing()) {
            return;
        }
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double margin = 40;
        double x = Math.max(vb.getMinX() - stage.getWidth() + margin,
                Math.min(stage.getX(), vb.getMaxX() - margin));
        double y = Math.max(vb.getMinY(), Math.min(stage.getY(), vb.getMaxY() - margin));
        if (x != stage.getX() || y != stage.getY()) {
            stage.setX(x);
            stage.setY(y);
        }
    }

    // ── 窗口构建 ──

    private void ensureStage() {
        if (stage != null) {
            return;
        }
        lineLabel.setTextAlignment(TextAlignment.CENTER);
        lineLabel.setAlignment(Pos.CENTER);
        lineLabel.setMaxWidth(Double.MAX_VALUE);
        transLabel.setTextAlignment(TextAlignment.CENTER);
        transLabel.setAlignment(Pos.CENTER);
        transLabel.setMaxWidth(Double.MAX_VALUE);
        transLabel.setVisible(false);
        transLabel.setManaged(false);
        box.setAlignment(Pos.CENTER);
        box.setFillWidth(true);
        root.setAlignment(Pos.CENTER);
        root.setPadding(new Insets(10, 26, 12, 26));
        root.getChildren().setAll(box);
        box.getChildren().setAll(lineLabel, transLabel);

        stage = new Stage();
        stage.initStyle(StageStyle.TRANSPARENT);
        stage.setTitle(WINDOW_TITLE);
        stage.setAlwaysOnTop(true);
        stage.setResizable(false);
        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        stage.setScene(scene);

        // 拖拽移动
        root.setOnMousePressed(e -> {
            if (locked) {
                return;
            }
            dragDx = e.getScreenX() - stage.getX();
            dragDy = e.getScreenY() - stage.getY();
            dragging = true;
        });
        root.setOnMouseDragged(e -> {
            if (locked || !dragging) {
                return;
            }
            stage.setX(e.getScreenX() - dragDx);
            stage.setY(e.getScreenY() - dragDy);
        });
        root.setOnMouseReleased(e -> {
            if (!dragging) {
                return;
            }
            dragging = false;
            savePosition(stage.getX(), stage.getY());
            keepOnScreen();
        });

        // 滚轮调字号
        root.setOnScroll(e -> {
            if (e.getDeltaY() == 0) {
                return;
            }
            changeFontSize(e.getDeltaY() > 0 ? 1 : -1);
        });

        // 右键菜单
        root.setOnContextMenuRequested(e -> buildMenu().show(root, e.getScreenX(), e.getScreenY()));

        applyStyle();
    }

    private ContextMenu buildMenu() {
        ContextMenu menu = new ContextMenu();
        MenuItem lockItem = new MenuItem(locked ? "🔓 解锁（可拖动）" : "🔒 锁定（鼠标穿透）");
        lockItem.setOnAction(a -> setLocked(!locked));
        MenuItem bigger = new MenuItem("🔠 放大字号");
        bigger.setOnAction(a -> changeFontSize(2));
        MenuItem smaller = new MenuItem("🔡 缩小字号");
        smaller.setOnAction(a -> changeFontSize(-2));
        MenuItem styleItem = new MenuItem("bar".equals(styleMode) ? "🎨 切换为描边文字" : "🎨 切换为半透明底条");
        styleItem.setOnAction(a -> setStyleMode("bar".equals(styleMode) ? "text" : "bar"));
        MenuItem reset = new MenuItem("↩ 重置位置（底部居中）");
        reset.setOnAction(a -> resetPosition());
        MenuItem close = new MenuItem("✖ 关闭桌面歌词");
        close.setOnAction(a -> {
            hide();
            main.syncDesktopLyricsUi();
        });
        menu.getItems().addAll(lockItem, new SeparatorMenuItem(),
                bigger, smaller, styleItem, reset, new SeparatorMenuItem(), close);
        return menu;
    }

    private static double clampFont(double v) {
        if (Double.isNaN(v)) {
            return DEFAULT_FONT;
        }
        return Math.max(FONT_MIN, Math.min(FONT_MAX, v));
    }
}
