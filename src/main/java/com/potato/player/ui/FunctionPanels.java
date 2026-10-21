package com.potato.player.ui;

import com.fasterxml.jackson.databind.JsonNode;
import com.potato.player.core.AppInfo;
import com.potato.player.core.BpmAnalyzer;
import com.potato.player.core.BpmStore;
import com.potato.player.core.Config;
import com.potato.player.core.EqPreset;
import com.potato.player.core.EqStore;
import com.potato.player.core.MetadataReader;
import com.potato.player.core.NeteaseClient;
import com.potato.player.core.Paths;
import com.potato.player.core.PlayerEngine;
import com.potato.player.core.ColorUtil;
import com.potato.player.core.LibrarySort;
import com.potato.player.core.PlaylistStore;
import com.potato.player.core.PreferenceStats;
import com.potato.player.core.SongInfo;
import com.potato.player.core.Theme;
import javafx.animation.Interpolator;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.PauseTransition;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Orientation;
import javafx.geometry.Pos;
import javafx.geometry.Side;
import javafx.scene.Cursor;
import javafx.scene.Node;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ColorPicker;
import javafx.scene.control.ComboBox;
import javafx.scene.control.ContextMenu;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.ListCell;
import javafx.scene.control.ListView;
import javafx.scene.control.MenuItem;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.SelectionMode;
import javafx.scene.control.SeparatorMenuItem;
import javafx.scene.control.Slider;
import javafx.scene.control.Spinner;
import javafx.scene.control.SpinnerValueFactory;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.control.TextArea;
import javafx.scene.control.TextField;
import javafx.scene.control.TextInputDialog;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.TilePane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.util.Duration;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 右侧功能面板（对应 FunctionPanels，含全部子面板）。
 */
public class FunctionPanels extends VBox {

    private final MainWindow main;
    private final StackPane stack = new StackPane();
    private final StackPane contentArea = new StackPane();
    private final VBox menuBox = new VBox();
    private final List<Button> menuItems = new ArrayList<>();
    private final Map<String, Node> panels = new HashMap<>();
    private boolean menuOpen = false;
    private Label headerHint;
    private String currentPanelName = "播放列表";

    // ── 播放列表 ──
    private ListView<String> playlistList;
    // ── 已保存歌单 ──
    private ListView<String> savedPlList;
    // ── 块 ──
    private ListView<String> blocksList;
    private TextField blockEntry;
    // ── 流派 ──
    private ListView<String> genresList;
    private TextField genreEntry;
    // ── 歌曲编辑 ──
    private ImageView editCoverView;
    private Label editCoverLabel;
    private TextField editTitle, editArtist, editNote, editComment, editNeteaseId;
    private Spinner<Double> editScore;
    /** BPM（速度）：0 表示未设置；可手动改，也可点「🔍 分析」。 */
    private Spinner<Double> editBpm;
    private Label editBpmInfo;
    private ComboBox<String> editGenre, editBlock;
    private String pendingCover = "";
    /** 歌曲编辑面板当前加载的曲目（对应原版 edit_current_file）。 */
    private String editPath;
    private Label editPathLabel;
    // ── 评论 ──
    private Label commentsStatus;
    private ListView<String> commentsList;
    // ── 歌词 ──
    private Label lyricsStatus;
    private TextArea lyricsText;
    // ── 筛选 ──
    private TextField filterSearch;
    private Spinner<Double> filterMin, filterMax;

    // ── 偏好（按块/流派/歌手的平均评分排名）──
    private ComboBox<String> prefDimCombo;
    private CheckBox prefMinTwoCheck;
    private VBox prefList;
    private Label prefSummary;
    private ComboBox<String> filterBlock, filterGenre, filterSortCombo;
    // ── 网易云 ──
    private Label ncStatus, ncAccountLabel, ncBatchStatus;
    private TextField ncPhone, ncPassword, ncCookie, ncSearch, ncImportId;
    private ComboBox<String> ncBitrate, ncPlSource, ncBatchBlockCombo, ncBatchGenreCombo;
    private ListView<NcItem> ncResults, ncSongList;
    private StackPane ncContent;
    private VBox ncBatchBox;
    private Label ncPlStatus;
    private TextField ncPlSearch;
    private HBox ncPlSearchRow;
    private Button ncBackBtn, ncSelectAllBtn;
    private CheckBox ncBatchAddQueue;
    private String ncCurrentPlId = "";
    private String ncCurrentPlName = "";
    private boolean ncIsMyPlaylist = false;
    private static final String NC_NONE = "（不设置）";
    // ── 动图卡点 ──
    private Button gifToggleBtn;
    private Label gifInfo;
    // ── 桌宠（迷迭香）──
    private CheckBox petShowCheck;
    private Label petState;
    private Spinner<Double> petSizeSpinner;
    private Spinner<Double> petSpeedSpinner;
    private CheckBox petAutoCheck;
    private CheckBox petThroughCheck;
    private Spinner<Double> gifWidthSpinner;
    private CheckBox gifLockCheck;
    private CheckBox gifIntBeatCheck;
    private CheckBox gifGesturesCheck;
    private CheckBox gifBeatLockCheck;
    private ComboBox<String> gifBeatOnCombo;
    private Spinner<Double> gifBeatTrimSpinner;
    private CheckBox gifStretchCheck;
    private Spinner<Double> gifAmpYSpinner;
    private Spinner<Double> gifAmpXSpinner;
    private Spinner<Double> gifStretchPeriodSpinner;
    // ── 桌面歌词 ──
    private CheckBox dlOnCheck, dlLockCheck;
    private ComboBox<String> dlStyleCombo;
    private Spinner<Double> dlFontSpinner;
    // ── 均衡器 ──
    private static final String EQ_SONG_ITEM = "🎵 单曲预设";
    private static final String EQ_GLOBAL_ITEM = "🌐 全局预设";
    private static final String EQ_NEW_ITEM = "➕ 新建预设…";
    private static final String EQ_FACTORY_PREFIX = "🎛 ";
    private static final String EQ_USER_PREFIX = "⭐ ";
    private CheckBox eqOnCheck;
    private ComboBox<String> eqCombo;
    private Label eqSongLabel, eqDirtyLabel;
    /** 任务面板顶部的 BPM 统计（扫描 / 手改后需要刷新）。 */
    private Label taskBpmInfo;
    private final Slider[] eqSliders = new Slider[EqPreset.BANDS];
    private final Label[] eqBandValueLabels = new Label[EqPreset.BANDS];
    private Slider eqPreampSlider;
    private Label eqPreampValue;
    /** 程序化更新控件时抑制监听器，否则会把预设反手覆盖掉。 */
    private boolean eqQuiet;
    /** 当前草稿 = 正在生效的均衡器参数（面板重建时保留）。 */
    private EqPreset eqDraft;
    /** 当前编辑目标：song / global / factory / user。 */
    private String eqTargetKind = "global";
    private String eqTargetName = "";
    /** 草稿对应的曲目（绝对路径）。 */
    private String eqSongPath = "";
    /** 当前目标的已保存值，「重置」回退到这里。 */
    private EqPreset eqBaseline;

    // ── 设置 ──
    private ComboBox<String> themeCombo, noteCombo, coverStyleCombo, backendCombo, dlBrCombo;
    private ComboBox<String> lyricModeCombo;
    private CheckBox artistCheck, indexCheck;
    /** 歌词显示模式下拉框：展示名 ↔ 内部值。 */
    private static final List<String> LYRIC_MODE_ITEMS = List.of("双语（原文+翻译）", "仅中文", "仅原文");
    private static final Map<String, String> LYRIC_MODE_INTERNAL = Map.of(
            "双语（原文+翻译）", Config.LYRICS_MODE_BILINGUAL,
            "仅中文", Config.LYRICS_MODE_TRANSLATION,
            "仅原文", Config.LYRICS_MODE_ORIGINAL);

    private static final String[] PANEL_NAMES = {
            "播放列表", "歌单", "偏好", "歌曲编辑", "搜索与筛选", "网易云音乐",
            "评论", "歌词", "任务", "块", "流派", "均衡器", "设置"
    };

    private static final Map<String, String> NAV_ICONS = Map.ofEntries(
            Map.entry("播放列表", "▶️"), Map.entry("歌单", "📋"), Map.entry("歌曲编辑", "✏️"),
            Map.entry("搜索与筛选", "🔍"), Map.entry("网易云音乐", "🎵"), Map.entry("评论", "💬"),
            Map.entry("歌词", "📝"), Map.entry("任务", "⏳"), Map.entry("块", "🧩"),
            Map.entry("流派", "🎶"), Map.entry("均衡器", "🎚️"), Map.entry("设置", "⚙️"),
            Map.entry("偏好", "💖"));

    /** 网易云条目（id / name / artists / album / duration秒 / fee）。 */
    public record NcItem(String id, String name, String artists, String album, int durationSec, int fee) {
        public NcItem(String id, String name, String artists) {
            this(id, name, artists, "", 0, 0);
        }

        public String durationText() {
            if (durationSec <= 0) {
                return "??:??";
            }
            return (durationSec / 60) + ":" + String.format("%02d", durationSec % 60);
        }

        public String feeText() {
            return switch (fee) {
                case 1, 4 -> "VIP";
                case 8 -> "付费";
                default -> "免费";
            };
        }

        @Override
        public String toString() {
            return name + " - " + artists;
        }
    }

    public FunctionPanels(MainWindow main) {
        super(6);
        this.main = main;
        getStyleClass().add("panel");
        setPadding(new Insets(10));
        build();
    }

    private void build() {
        // 可点击的标题栏：来回切换「选项菜单」与「当前面板」
        HBox header = new HBox(8);
        header.getStyleClass().add("accent-header");
        header.setAlignment(Pos.CENTER_LEFT);
        header.setCursor(Cursor.HAND);
        Label title = new Label("⚙ 功能面板");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        headerHint = new Label("☰");
        headerHint.setStyle("-fx-text-fill: white; -fx-font-size: 16px;");
        header.getChildren().addAll(title, spacer, headerHint);
        header.setOnMouseClicked(e -> toggleMenu());
        getChildren().add(header);

        // 菜单容器（覆盖在当前面板之上，默认隐藏）
        menuBox.setSpacing(6);
        menuBox.setPadding(new Insets(2));
        menuBox.setStyle("-fx-background-color: transparent;");
        menuBox.setVisible(false);
        menuBox.setManaged(false);
        for (String name : PANEL_NAMES) {
            Button item = new Button(NAV_ICONS.getOrDefault(name, "•") + "  " + name);
            item.setMaxWidth(Double.MAX_VALUE);
            item.getStyleClass().add("menu-item");
            item.setOnAction(e -> selectPanel(name));
            menuItems.add(item);
            menuBox.getChildren().add(item);
        }

        contentArea.getChildren().addAll(stack, menuBox);
        VBox.setVgrow(contentArea, Priority.ALWAYS);
        getChildren().add(contentArea);

        switchTo("播放列表");
    }

    private void toggleMenu() {
        if (menuOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    /** 打开菜单：清空当前显示，条目从右侧逐条飞入。 */
    private void openMenu() {
        menuOpen = true;
        headerHint.setText("✕");
        menuBox.setVisible(true);
        menuBox.setManaged(true);
        menuBox.toFront();
        stack.setVisible(false);
        for (int i = 0; i < menuItems.size(); i++) {
            Button item = menuItems.get(i);
            item.setTranslateX(140);
            item.setTranslateY(0);
            item.setOpacity(0);
            Timeline t = new Timeline(new KeyFrame(Duration.millis(240),
                    new KeyValue(item.translateXProperty(), 0, Interpolator.EASE_OUT),
                    new KeyValue(item.opacityProperty(), 1, Interpolator.EASE_OUT)));
            t.setDelay(Duration.millis(i * 42));
            t.play();
        }
    }

    /** 关闭菜单：条目向上收起消失，返回当前面板。 */
    private void closeMenu() {
        menuOpen = false;
        headerHint.setText("☰");
        animateMenuOut(() -> {
            menuBox.setVisible(false);
            menuBox.setManaged(false);
            stack.setVisible(true);
        });
    }

    /** 选中某个选项：条目向上叠起消失，切换并显示所选面板。 */
    private void selectPanel(String name) {
        menuOpen = false;
        headerHint.setText("☰");
        switchTo(name);
        animateMenuOut(() -> {
            menuBox.setVisible(false);
            menuBox.setManaged(false);
            stack.setVisible(true);
        });
    }

    private void animateMenuOut(Runnable onDone) {
        for (int i = 0; i < menuItems.size(); i++) {
            Button item = menuItems.get(i);
            Timeline t = new Timeline(new KeyFrame(Duration.millis(200),
                    new KeyValue(item.translateXProperty(), 140, Interpolator.EASE_IN),
                    new KeyValue(item.opacityProperty(), 0, Interpolator.EASE_IN)));
            t.setDelay(Duration.millis(i * 16));
            t.play();
        }
        PauseTransition p = new PauseTransition(Duration.millis(200 + menuItems.size() * 16L + 60));
        p.setOnFinished(e -> onDone.run());
        p.play();
    }

    private void switchTo(String name) {
        if (name == null) {
            return;
        }
        currentPanelName = name;
        if (!panels.containsKey(name)) {
            panels.put(name, buildPanel(name));
        }
        stack.getChildren().setAll(panels.get(name));
        // 切到歌曲编辑时自动加载当前播放曲目（对应原版 switch_editor → load_current_song_to_editor）
        if ("歌曲编辑".equals(name)) {
            loadCurrentToEditorQuiet();
        }
        // 偏好统计每次进来重算一遍（评分、块、流派随时会变）
        if ("偏好".equals(name)) {
            refreshPreferences();
        }
    }

    /** 当前右侧面板名称（供左侧栏“批量操作”做上下文判断）。 */
    public String currentPanelName() {
        return currentPanelName;
    }

    /**
     * 左侧歌曲库选中某首歌时的联动：仅当正在「歌曲编辑」面板时把该曲目载入编辑器。
     * 其它面板下不做任何处理，避免干扰播放、批量操作等流程。
     */
    public void onLibrarySelection(String path) {
        if (path == null || !"歌曲编辑".equals(currentPanelName) || editTitle == null) {
            return;
        }
        fillEditor(path);
    }

    private Node buildPanel(String name) {
        return switch (name) {
            case "播放列表" -> buildPlaylistPanel();
            case "歌单" -> buildSavedPlaylistsPanel();
            case "偏好" -> buildPreferencesPanel();
            case "歌曲编辑" -> buildSongEditPanel();
            case "搜索与筛选" -> buildFilterPanel();
            case "网易云音乐" -> buildNeteasePanel();
            case "评论" -> buildCommentsPanel();
            case "歌词" -> buildLyricsPanel();
            case "任务" -> buildTaskPanel();
            case "块" -> buildBlocksPanel();
            case "流派" -> buildGenresPanel();
            case "均衡器" -> buildEqPanel();
            case "设置" -> buildSettingsPanel();
            default -> new Label(name);
        };
    }

    // ── 通用工具 ──
    private VBox vbox() {
        VBox v = new VBox(6);
        return v;
    }

    private Label title(String text) {
        Label l = new Label(text);
        l.getStyleClass().add("title");
        return l;
    }

    private HBox field(String label, Node widget) {
        HBox h = new HBox(8);
        h.setAlignment(Pos.CENTER_LEFT);
        Label lbl = new Label(label);
        lbl.getStyleClass().add("small");
        lbl.setMinWidth(52);
        h.getChildren().addAll(lbl, widget);
        HBox.setHgrow(widget, Priority.ALWAYS);
        return h;
    }

    private HBox editorHeader(String text, String backTarget) {
        HBox header = new HBox(8);
        header.getStyleClass().add("accent-header");
        header.setAlignment(Pos.CENTER_LEFT);
        Button back = new Button("✕");
        back.setMinWidth(28);
        back.setOnAction(e -> switchTo(backTarget));
        Label lbl = new Label(text);
        lbl.getStyleClass().add("title");
        header.getChildren().addAll(back, lbl);
        return header;
    }

    private void info(String title, String msg) {
        Alert a = new Alert(Alert.AlertType.INFORMATION, msg);
        a.setTitle(title);
        a.setHeaderText(null);
        a.showAndWait();
    }

    private void warn(String title, String msg) {
        Alert a = new Alert(Alert.AlertType.WARNING, msg);
        a.setTitle(title);
        a.setHeaderText(null);
        a.showAndWait();
    }

    private boolean confirm(String title, String msg) {
        Alert a = new Alert(Alert.AlertType.CONFIRMATION, msg, ButtonType.OK, ButtonType.CANCEL);
        a.setTitle(title);
        a.setHeaderText(null);
        return a.showAndWait().filter(r -> r == ButtonType.OK).isPresent();
    }

    private void bg(Runnable r) {
        Thread t = new Thread(r);
        t.setDaemon(true);
        t.start();
    }

    // ── 播放列表 ──
    private Node buildPlaylistPanel() {
        VBox w = vbox();
        w.getChildren().add(title("▶️ 当前播放列表"));

        playlistList = new ListView<>();
        playlistList.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);
        playlistList.setCellFactory(lv -> new SongTitleCell());
        playlistList.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && playlistList.getSelectionModel().getSelectedItem() != null) {
                main.playFile(playlistList.getSelectionModel().getSelectedItem(), false);
            }
        });
        VBox.setVgrow(playlistList, Priority.ALWAYS);
        w.getChildren().add(playlistList);

        HBox btnRow = new HBox(4);
        Button save = new Button("保存到歌单");
        save.setOnAction(e -> savePlaylist());
        Button up = new Button("↑");
        up.setOnAction(e -> moveSelected(-1));
        Button down = new Button("↓");
        down.setOnAction(e -> moveSelected(1));
        Button remove = new Button("移除选中");
        remove.setOnAction(e -> removeFromPlaylist());
        Button clear = new Button("清空列表");
        clear.getStyleClass().add("danger");
        clear.setOnAction(e -> clearPlaylist());
        btnRow.getChildren().addAll(save, up, down, remove, clear);
        w.getChildren().add(btnRow);
        return w;
    }

    public void refreshPlaylist() {
        // 播放列表的增删改都会走到这里（不然界面就是旧的），顺手把"上次的播放列表"存下来
        if (main != null) {
            main.scheduleSessionSave();
        }
        if (playlistList == null) {
            return;
        }
        List<String> items = new ArrayList<>(main.playlist);
        playlistList.getItems().setAll(items);
        playlistList.refresh();
    }

    private void moveSelected(int delta) {
        int idx = playlistList.getSelectionModel().getSelectedIndex();
        if (idx < 0 || idx >= main.playlist.size()) {
            return;
        }
        int ni = idx + delta;
        if (ni < 0 || ni >= main.playlist.size()) {
            return;
        }
        String cur = main.playlist.get(idx);
        main.playlist.remove(idx);
        main.playlist.add(ni, cur);
        // 修正当前播放索引
        String playing = main.currentSongPath();
        if (playing != null) {
            main.currentPlaylistIndex = main.playlist.indexOf(playing);
        }
        refreshPlaylist();
        playlistList.getSelectionModel().select(ni);
    }

    private void savePlaylist() {
        TextInputDialog dlg = new TextInputDialog();
        dlg.setTitle("保存歌单");
        dlg.setHeaderText(null);
        dlg.setContentText("请输入歌单名称：");
        Optional<String> r = dlg.showAndWait();
        if (r.isPresent() && !r.get().strip().isBlank()) {
            if (PlaylistStore.saveCurrentPlaylist(r.get().strip(), main.playlist)) {
                info("成功", "歌单“" + r.get().strip() + "”已保存");
            }
        }
    }

    private void clearPlaylist() {
        if (confirm("清空列表", "确认清空当前播放列表吗？")) {
            main.playlist.clear();
            main.currentPlaylistIndex = -1;
            main.listSeqPlayedIndex = -1;
            main.lib().player().stop();
            main.stopped = true;
            main.paused = false;
            refreshPlaylist();
            main.playbackPanel.refreshCurrentSong();
            main.playbackPanel.updatePlayButton();
        }
    }

    private void removeFromPlaylist() {
        List<Integer> rows = new ArrayList<>(playlistList.getSelectionModel().getSelectedIndices());
        if (rows.isEmpty()) {
            warn("未选择", "请先选择要移除的歌曲");
            return;
        }
        rows.sort(java.util.Collections.reverseOrder());
        for (int r : rows) {
            if (r >= 0 && r < main.playlist.size()) {
                main.playlist.remove(r);
            }
        }
        if (main.currentPlaylistIndex >= main.playlist.size()) {
            main.currentPlaylistIndex = main.playlist.size() - 1;
        }
        if (main.playlist.isEmpty()) {
            main.lib().player().stop();
            main.stopped = true;
            main.paused = false;
        }
        refreshPlaylist();
    }

    // ── 已保存歌单 ──
    private Node buildSavedPlaylistsPanel() {
        VBox w = vbox();
        w.getChildren().add(title("📋 已保存的歌单"));

        savedPlList = new ListView<>();
        savedPlList.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(String fp, boolean empty) {
                super.updateItem(fp, empty);
                if (empty || fp == null) {
                    setText(null);
                } else {
                    String base = new File(fp).getName();
                    int dot = base.lastIndexOf('.');
                    setText(dot > 0 ? base.substring(0, dot) : base);
                }
            }
        });
        savedPlList.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && savedPlList.getSelectionModel().getSelectedItem() != null) {
                openPlaylistDetail(savedPlList.getSelectionModel().getSelectedItem());
            }
        });
        VBox.setVgrow(savedPlList, Priority.ALWAYS);
        w.getChildren().add(savedPlList);

        HBox btnRow = new HBox(4);
        Button add = new Button("添加到播放列表");
        add.setOnAction(e -> savedPlAddToQueue());
        Button del = new Button("删除歌单");
        del.getStyleClass().add("danger");
        del.setOnAction(e -> savedPlDelete());
        btnRow.getChildren().addAll(add, del);
        w.getChildren().add(btnRow);
        refreshSavedPlaylists();
        return w;
    }

    public void refreshSavedPlaylists() {
        if (savedPlList == null) {
            return;
        }
        savedPlList.getItems().setAll(PlaylistStore.getPlaylistFiles());
    }

    private void savedPlAddToQueue() {
        String fp = savedPlList.getSelectionModel().getSelectedItem();
        if (fp == null) {
            warn("未选择", "请先选择一个歌单");
            return;
        }
        for (String s : PlaylistStore.loadPlaylist(fp)) {
            if (!main.playlist.contains(s)) {
                main.playlist.add(s);
            }
        }
        refreshPlaylist();
    }

    private void savedPlDelete() {
        String fp = savedPlList.getSelectionModel().getSelectedItem();
        if (fp == null) {
            warn("未选择", "请先选择一个歌单");
            return;
        }
        if (confirm("删除歌单", "确认删除歌单：" + new File(fp).getName() + " ?")) {
            try {
                Files.deleteIfExists(new File(fp).toPath());
            } catch (IOException e) {
                warn("错误", "删除失败：" + e.getMessage());
            }
            refreshSavedPlaylists();
        }
    }

    // ── 块管理 ──
    private Node buildBlocksPanel() {
        VBox w = vbox();
        w.getChildren().add(title("📋 块管理"));

        blocksList = new ListView<>();
        blocksList.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(String name, boolean empty) {
                super.updateItem(name, empty);
                if (empty || name == null) {
                    setText(null);
                    setStyle("");
                } else {
                    int count = countBy("block", name);
                    String color = main.getBlockColor(name);
                    setText(name + "  (" + count + "首)");
                    setStyle("-fx-text-fill: " + color + ";");
                }
            }
        });
        blocksList.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && blocksList.getSelectionModel().getSelectedItem() != null) {
                openBlockEditor(blocksList.getSelectionModel().getSelectedItem());
            }
        });
        VBox.setVgrow(blocksList, Priority.ALWAYS);
        w.getChildren().add(blocksList);

        HBox inputRow = new HBox(4);
        blockEntry = new TextField();
        blockEntry.setPromptText("输入块名称");
        Button add = new Button("添加块");
        add.setOnAction(e -> blockAdd());
        HBox.setHgrow(blockEntry, Priority.ALWAYS);
        inputRow.getChildren().addAll(blockEntry, add);
        w.getChildren().add(inputRow);

        HBox btnRow = new HBox(4);
        Button color = new Button("🎨 改色");
        color.setOnAction(e -> blockEditColor());
        Button del = new Button("删除块");
        del.getStyleClass().add("danger");
        del.setOnAction(e -> blockDelete());
        btnRow.getChildren().addAll(color, del);
        w.getChildren().add(btnRow);
        refreshBlocks();
        return w;
    }

    public void refreshBlocks() {
        if (blocksList == null) {
            return;
        }
        List<String> names = new ArrayList<>();
        for (Map<String, Object> b : main.lib().blocks()) {
            names.add(String.valueOf(b.get("name")));
        }
        blocksList.getItems().setAll(names);
    }

    private void blockAdd() {
        String name = blockEntry.getText().strip();
        if (name.isEmpty()) {
            warn("提示", "请输入块名称");
            return;
        }
        for (Map<String, Object> b : main.lib().blocks()) {
            if (name.equals(String.valueOf(b.get("name")))) {
                warn("提示", "该块已存在");
                return;
            }
        }
        Map<String, Object> nb = new LinkedHashMap<>();
        nb.put("name", name);
        nb.put("color", Theme.DEFAULT_BLOCK_COLOR);
        main.lib().blocks().add(nb);
        main.lib().setBlocks(main.lib().blocks());
        blockEntry.clear();
        refreshBlocks();
    }

    private void blockDelete() {
        String name = blocksList.getSelectionModel().getSelectedItem();
        if (name == null) {
            warn("未选择", "请选择要删除的块");
            return;
        }
        if (!confirm("确认", "删除块：" + name + " ?")) {
            return;
        }
        main.lib().blocks().removeIf(b -> name.equals(String.valueOf(b.get("name"))));
        main.lib().setBlocks(main.lib().blocks());
        for (Map<String, Object> v : main.lib().ratings().values()) {
            if (name.equals(String.valueOf(v.get("block")))) {
                v.put("block", "");
            }
        }
        main.lib().saveRatings();
        main.libraryPanel.refresh();
        refreshBlocks();
    }

    private void blockEditColor() {
        String name = blocksList.getSelectionModel().getSelectedItem();
        if (name == null) {
            return;
        }
        ColorPicker picker = new ColorPicker(Color.web(main.getBlockColor(name)));
        Alert a = new Alert(Alert.AlertType.NONE);
        a.setTitle("选择颜色");
        a.getDialogPane().setContent(picker);
        a.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);
        if (a.showAndWait().filter(r -> r == ButtonType.OK).isPresent()) {
            String hex = toHex(picker.getValue());
            for (Map<String, Object> b : main.lib().blocks()) {
                if (name.equals(String.valueOf(b.get("name")))) {
                    b.put("color", hex);
                }
            }
            main.lib().setBlocks(main.lib().blocks());
            main.libraryPanel.refresh();
            refreshBlocks();
        }
    }

    private static String toHex(Color c) {
        return String.format("#%02x%02x%02x",
                (int) Math.round(c.getRed() * 255),
                (int) Math.round(c.getGreen() * 255),
                (int) Math.round(c.getBlue() * 255));
    }

    // ── 流派管理 ──
    private Node buildGenresPanel() {
        VBox w = vbox();
        w.getChildren().add(title("🎶 流派管理"));

        genresList = new ListView<>();
        genresList.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);
        // 与块管理面板逐行同构：文字用该流派自己的标识色
        genresList.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(String name, boolean empty) {
                super.updateItem(name, empty);
                if (empty || name == null) {
                    setText(null);
                    setStyle("");
                } else {
                    int count = countBy("genre", name);
                    String color = main.getGenreColor(name);
                    setText(name + "  (" + count + "首)");
                    setStyle("-fx-text-fill: " + color + ";");
                }
            }
        });
        genresList.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && genresList.getSelectionModel().getSelectedItem() != null) {
                openGenreEditor(genresList.getSelectionModel().getSelectedItem());
            }
        });
        VBox.setVgrow(genresList, Priority.ALWAYS);
        w.getChildren().add(genresList);

        HBox inputRow = new HBox(4);
        genreEntry = new TextField();
        genreEntry.setPromptText("输入流派名称");
        Button add = new Button("添加");
        add.setOnAction(e -> genreAdd());
        HBox.setHgrow(genreEntry, Priority.ALWAYS);
        inputRow.getChildren().addAll(genreEntry, add);
        w.getChildren().add(inputRow);

        HBox btnRow = new HBox(4);
        Button color = new Button("🎨 改色");
        color.setOnAction(e -> genreEditColor());
        Button del = new Button("删除选中");
        del.getStyleClass().add("danger");
        del.setOnAction(e -> genreDelete());
        btnRow.getChildren().addAll(color, del);
        w.getChildren().add(btnRow);
        refreshGenres();
        return w;
    }

    /** 改流派标识色 —— 与 {@code blockEditColor()} 一字不差地同构。 */
    private void genreEditColor() {
        String name = genresList.getSelectionModel().getSelectedItem();
        if (name == null) {
            return;
        }
        ColorPicker picker = new ColorPicker(Color.web(main.getGenreColor(name)));
        Alert a = new Alert(Alert.AlertType.NONE);
        a.setTitle("选择颜色");
        a.getDialogPane().setContent(picker);
        a.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);
        if (a.showAndWait().filter(r -> r == ButtonType.OK).isPresent()) {
            main.lib().setGenreColor(name, toHex(picker.getValue()));
            main.libraryPanel.refresh();
            refreshGenres();
        }
    }

    public void refreshGenres() {
        if (genresList == null) {
            return;
        }
        genresList.getItems().setAll(main.lib().genreNames());
    }

    private void genreAdd() {
        String name = genreEntry.getText().strip();
        if (name.isEmpty()) {
            return;
        }
        if (main.lib().genreNames().contains(name)) {
            warn("提示", "该流派已存在");
            return;
        }
        Map<String, Object> ng = new LinkedHashMap<>();
        ng.put("name", name);
        ng.put("color", Theme.DEFAULT_GENRE_COLOR);
        main.lib().genres().add(ng);
        main.lib().setGenres(main.lib().genres());
        genreEntry.clear();
        refreshGenres();
    }

    private void genreDelete() {
        List<String> sel = new ArrayList<>(genresList.getSelectionModel().getSelectedItems());
        if (sel.isEmpty()) {
            warn("未选择", "请先选择要删除的流派");
            return;
        }
        if (!confirm("确认", "删除 " + sel.size() + " 个流派吗？")) {
            return;
        }
        for (String g : sel) {
            main.lib().genres().removeIf(x -> g.equals(String.valueOf(x.get("name"))));
            for (Map<String, Object> v : main.lib().ratings().values()) {
                if (g.equals(String.valueOf(v.get("genre")))) {
                    v.put("genre", "");
                }
            }
        }
        main.lib().setGenres(main.lib().genres());
        main.lib().saveRatings();
        main.libraryPanel.refresh();
        refreshGenres();
    }

    private int countBy(String field, String val) {
        int count = 0;
        for (Map<String, Object> ud : main.lib().ratings().values()) {
            if (val.equals(String.valueOf(ud.get(field)))) {
                count++;
            }
        }
        return count;
    }

    // ── 二级编辑器 ──
    private void openBlockEditor(String name) {
        stack.getChildren().setAll(buildBlockEditor(name));
    }

    private Node buildBlockEditor(String name) {
        VBox w = vbox();
        w.getChildren().add(editorHeader("🧩 块：" + name, "块"));
        List<String> songs = songsByField("block", name);
        ListView<String> lst = songEditorList(songs);
        VBox.setVgrow(lst, Priority.ALWAYS);
        w.getChildren().add(lst);

        HBox b1 = new HBox(4);
        Button all = new Button("全选");
        all.setOnAction(e -> toggleSelectAll(lst));
        Button remove = new Button("移除选中");
        remove.setOnAction(e -> editorRemoveSelected(lst, songs, name, "block"));
        b1.getChildren().addAll(all, remove);
        w.getChildren().add(b1);

        HBox b2 = new HBox(4);
        Button pl = new Button("加入歌单");
        pl.setOnAction(e -> editorAddToPlaylist(lst, songs));
        Button left = new Button("从左边栏添加");
        left.setOnAction(e -> editorAddFromLeft(lst, songs, name, "block"));
        b2.getChildren().addAll(pl, left);
        w.getChildren().add(b2);
        return w;
    }

    private void openGenreEditor(String name) {
        stack.getChildren().setAll(buildGenreEditor(name));
    }

    private Node buildGenreEditor(String name) {
        VBox w = vbox();
        w.getChildren().add(editorHeader("🎶 流派：" + name, "流派"));
        List<String> songs = songsByField("genre", name);
        ListView<String> lst = songEditorList(songs);
        VBox.setVgrow(lst, Priority.ALWAYS);
        w.getChildren().add(lst);

        HBox b1 = new HBox(4);
        Button all = new Button("全选");
        all.setOnAction(e -> toggleSelectAll(lst));
        Button remove = new Button("移除选中");
        remove.setOnAction(e -> editorRemoveSelected(lst, songs, name, "genre"));
        b1.getChildren().addAll(all, remove);
        w.getChildren().add(b1);

        HBox b2 = new HBox(4);
        Button pl = new Button("加入歌单");
        pl.setOnAction(e -> editorAddToPlaylist(lst, songs));
        Button left = new Button("从左边栏添加");
        left.setOnAction(e -> editorAddFromLeft(lst, songs, name, "genre"));
        b2.getChildren().addAll(pl, left);
        w.getChildren().add(b2);
        return w;
    }

    private void openPlaylistDetail(String fp) {
        stack.getChildren().setAll(buildPlaylistDetail(fp));
    }

    private Node buildPlaylistDetail(String fp) {
        String name = new File(fp).getName();
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            name = name.substring(0, dot);
        }
        VBox w = vbox();
        w.getChildren().add(editorHeader("📋 歌单：" + name, "歌单"));
        List<String> songs = new ArrayList<>(PlaylistStore.loadPlaylist(fp));
        ListView<String> lst = songEditorList(songs);
        VBox.setVgrow(lst, Priority.ALWAYS);
        w.getChildren().add(lst);

        HBox b1 = new HBox(4);
        Button all = new Button("全选");
        all.setOnAction(e -> toggleSelectAll(lst));
        Button up = new Button("↑");
        up.setOnAction(e -> moveSongInEditor(lst, songs, -1, fp));
        Button down = new Button("↓");
        down.setOnAction(e -> moveSongInEditor(lst, songs, 1, fp));
        Button remove = new Button("移除选中");
        remove.setOnAction(e -> plDetailRemove(lst, songs, fp));
        b1.getChildren().addAll(all, up, down, remove);
        w.getChildren().add(b1);

        HBox b2 = new HBox(4);
        Button pl = new Button("加入播放列表");
        pl.setOnAction(e -> editorAddToPlaylist(lst, songs));
        Button left = new Button("从左边栏添加");
        left.setOnAction(e -> plDetailAddFromLeft(lst, songs, fp));
        b2.getChildren().addAll(pl, left);
        w.getChildren().add(b2);
        return w;
    }

    private List<String> songsByField(String field, String val) {
        List<String> songs = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> e : main.lib().ratings().entrySet()) {
            if (val.equals(String.valueOf(e.getValue().get(field)))) {
                songs.add(e.getKey());
            }
        }
        return songs;
    }

    private ListView<String> songEditorList(List<String> songs) {
        ListView<String> lst = new ListView<>();
        lst.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);
        lst.setCellFactory(lv -> new SongTitleCell());
        lst.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && lst.getSelectionModel().getSelectedItem() != null) {
                main.playFile(lst.getSelectionModel().getSelectedItem(), false);
            }
        });
        lst.getItems().setAll(songs);
        return lst;
    }

    private void toggleSelectAll(ListView<String> lst) {
        if (lst.getSelectionModel().getSelectedItems().size() == lst.getItems().size()) {
            lst.getSelectionModel().clearSelection();
        } else {
            lst.getSelectionModel().selectAll();
        }
    }

    private void editorRemoveSelected(ListView<String> lst, List<String> songs, String name, String field) {
        List<Integer> rows = new ArrayList<>(lst.getSelectionModel().getSelectedIndices());
        if (rows.isEmpty()) {
            warn("未选择", "请先选择要移除的曲目");
            return;
        }
        rows.sort(java.util.Collections.reverseOrder());
        for (int r : rows) {
            if (r >= 0 && r < songs.size()) {
                String p = songs.remove(r);
                Map<String, Object> ud = main.lib().ratings().get(p);
                if (ud != null && ud.get(field) != null) {
                    ud.put(field, "");
                }
            }
        }
        main.lib().saveRatings();
        main.libraryPanel.refresh();
        lst.getItems().setAll(songs);
    }

    private void editorAddToPlaylist(ListView<String> lst, List<String> songs) {
        List<Integer> rows = new ArrayList<>(lst.getSelectionModel().getSelectedIndices());
        if (rows.isEmpty()) {
            warn("未选择", "请先选择曲目");
            return;
        }
        int added = 0;
        for (int r : rows) {
            if (r >= 0 && r < songs.size()) {
                String p = songs.get(r);
                if (!main.playlist.contains(p)) {
                    main.playlist.add(p);
                    added++;
                }
            }
        }
        refreshPlaylist();
        info("已添加", "已将 " + added + " 首曲目加入播放列表");
    }

    private void editorAddFromLeft(ListView<String> lst, List<String> songs, String name, String field) {
        if (main.selectedPaths.isEmpty()) {
            warn("未选择", "请先在左边栏选择要添加的曲目");
            return;
        }
        for (String p : new ArrayList<>(main.selectedPaths)) {
            if (!songs.contains(p)) {
                songs.add(p);
                main.lib().ratings().computeIfAbsent(p, k -> new LinkedHashMap<>()).put(field, name);
            }
        }
        main.lib().saveRatings();
        main.libraryPanel.refresh();
        lst.getItems().setAll(songs);
    }

    private void plDetailRemove(ListView<String> lst, List<String> songs, String fp) {
        List<Integer> rows = new ArrayList<>(lst.getSelectionModel().getSelectedIndices());
        if (rows.isEmpty()) {
            warn("未选择", "请先选择要移除的曲目");
            return;
        }
        rows.sort(java.util.Collections.reverseOrder());
        for (int r : rows) {
            if (r >= 0 && r < songs.size()) {
                songs.remove(r);
            }
        }
        plDetailSave(songs, fp);
        lst.getItems().setAll(songs);
    }

    private void plDetailAddFromLeft(ListView<String> lst, List<String> songs, String fp) {
        if (main.selectedPaths.isEmpty()) {
            warn("未选择", "请先在左边栏选择曲目");
            return;
        }
        for (String p : new ArrayList<>(main.selectedPaths)) {
            if (!songs.contains(p)) {
                songs.add(p);
            }
        }
        plDetailSave(songs, fp);
        lst.getItems().setAll(songs);
    }

    private void moveSongInEditor(ListView<String> lst, List<String> songs, int delta, String fp) {
        int idx = lst.getSelectionModel().getSelectedIndex();
        if (idx < 0 || idx >= songs.size()) {
            return;
        }
        int ni = idx + delta;
        if (ni < 0 || ni >= songs.size()) {
            return;
        }
        String p = songs.remove(idx);
        songs.add(ni, p);
        plDetailSave(songs, fp);
        lst.getItems().setAll(songs);
        lst.getSelectionModel().select(ni);
    }

    private void plDetailSave(List<String> songs, String fp) {
        try {
            PlaylistStore.saveCurrentPlaylist(new File(fp).getName().replaceAll("\\.json$", ""), songs);
        } catch (Exception ignored) {
        }
    }

    // ── 歌曲编辑 ──
    private Node buildSongEditPanel() {
        VBox container = vbox();
        container.setAlignment(Pos.TOP_CENTER);

        editPathLabel = new Label("未加载曲目");
        editPathLabel.getStyleClass().add("small");
        editPathLabel.setWrapText(true);
        container.getChildren().add(editPathLabel);

        editCoverView = new ImageView();
        editCoverView.setFitWidth(120);
        editCoverView.setFitHeight(120);
        editCoverView.setPreserveRatio(true);
        editCoverLabel = new Label("无封面");
        StackPane coverBox = new StackPane(editCoverView, editCoverLabel);
        coverBox.setPrefSize(120, 120);
        container.getChildren().add(coverBox);

        Button btnCover = new Button("更换封面");
        btnCover.setOnAction(e -> chooseCover());
        container.getChildren().add(btnCover);

        editTitle = new TextField();
        editTitle.setPromptText("歌名");
        editArtist = new TextField();
        editArtist.setPromptText("歌手");
        editScore = new Spinner<>(0.0, 10.0, 0.0, 0.1);
        editScore.setEditable(true);
        // BPM：可手改（0 = 未设置）；±2 快捷键用来一键修正"倍速"错误
        editBpm = new Spinner<>(0.0, 300.0, 0.0, 1.0);
        editBpm.setEditable(true);
        editBpm.setPrefWidth(90);
        Button bpmAnalyze = new Button("🔍 分析");
        bpmAnalyze.setOnAction(e -> analyzeEditBpm());
        Button bpmHalf = new Button("÷2");
        bpmHalf.setOnAction(e -> scaleEditBpm(0.5));
        Button bpmDouble = new Button("×2");
        bpmDouble.setOnAction(e -> scaleEditBpm(2.0));
        HBox bpmRow = new HBox(4, editBpm, bpmAnalyze, bpmHalf, bpmDouble);
        bpmRow.setAlignment(Pos.CENTER_LEFT);
        container.getChildren().add(field("歌名：", editTitle));
        container.getChildren().add(field("歌手：", editArtist));
        container.getChildren().add(field("评分：", editScore));
        container.getChildren().add(field("BPM：", bpmRow));
        editBpmInfo = new Label();
        editBpmInfo.getStyleClass().add("small");
        editBpmInfo.setWrapText(true);
        container.getChildren().add(editBpmInfo);

        editNote = new TextField();
        editNote.setPromptText("备注");
        editGenre = new ComboBox<>();
        editGenre.setEditable(true);
        editBlock = new ComboBox<>();
        editBlock.setEditable(true);
        editComment = new TextField();
        editComment.setPromptText("评论");
        container.getChildren().add(field("备注：", editNote));
        container.getChildren().add(field("流派：", editGenre));
        container.getChildren().add(field("块：", editBlock));
        container.getChildren().add(field("评论：", editComment));

        editNeteaseId = new TextField();
        editNeteaseId.setPromptText("网易云歌曲链接或ID");
        container.getChildren().add(field("绑定ID：", editNeteaseId));

        HBox netRow = new HBox(4);
        Button bind = new Button("绑定");
        bind.setOnAction(e -> neteaseBind());
        Button unbind = new Button("解除");
        unbind.setOnAction(e -> neteaseUnbind());
        Button auto = new Button("自动绑定");
        auto.setOnAction(e -> neteaseAutoBind());
        netRow.getChildren().addAll(bind, unbind, auto);
        container.getChildren().add(netRow);

        Button importLrc = new Button("从网易云导入歌词");
        importLrc.setOnAction(e -> neteaseImportLyrics());
        container.getChildren().add(importLrc);

        Button load = new Button("加载当前播放歌曲");
        load.setOnAction(e -> loadCurrentToEditor());
        Button save = new Button("💾 保存修改");
        save.getStyleClass().add("primary");
        save.setOnAction(e -> saveEdited());
        Button imp = new Button("导入歌曲");
        imp.setOnAction(e -> importSongs());
        Button del = new Button("删除歌曲");
        del.getStyleClass().add("danger");
        del.setOnAction(e -> deleteCurrentSong());
        container.getChildren().addAll(load, save, imp, del);

        ScrollPane scroll = new ScrollPane(container);
        scroll.setFitToWidth(true);
        scroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        VBox w = vbox();
        w.getChildren().add(scroll);
        VBox.setVgrow(scroll, Priority.ALWAYS);
        return w;
    }

    private void loadCurrentToEditor() {
        String path = main.currentSongPath();
        if (path == null) {
            info("提示", "请先播放一首歌曲");
            return;
        }
        fillEditor(path);
    }

    /** 切到歌曲编辑面板时静默加载当前播放曲目；没有播放曲目则清空（不弹窗）。 */
    private void loadCurrentToEditorQuiet() {
        String path = main.currentSongPath();
        if (path == null) {
            clearEditor();
            return;
        }
        fillEditor(path);
    }

    /** 清空编辑器内容（对应原版 load_current_song_to_editor 的空状态）。 */
    private void clearEditor() {
        editPath = null;
        pendingCover = "";
        if (editPathLabel != null) {
            editPathLabel.setText("未加载曲目");
        }
        if (editTitle == null) {
            return;
        }
        editTitle.clear();
        editArtist.clear();
        editScore.getValueFactory().setValue(0.0);
        editBpm.getValueFactory().setValue(0.0);
        updateEditBpmInfo(null);
        editNote.clear();
        editGenre.setValue(null);
        editBlock.setValue(null);
        editComment.clear();
        editNeteaseId.clear();
        updateEditCover(null);
    }

    private void fillEditor(String path) {
        editPath = path;
        pendingCover = "";
        if (editPathLabel != null) {
            editPathLabel.setText("正在编辑：" + new File(path).getName());
        }
        SongInfo info = main.loadSongInfo(path);
        editTitle.setText(info.title);
        editArtist.setText(info.artist);
        editScore.getValueFactory().setValue(info.score);
        BpmStore.Entry bpmEntry = main.bpmStore().get(path);
        editBpm.getValueFactory().setValue(bpmEntry == null ? 0.0 : bpmEntry.bpm);
        updateEditBpmInfo(bpmEntry);
        editNote.setText(info.note);
        editGenre.getItems().setAll(main.lib().genreNames());
        editGenre.setValue(info.genre);
        editBlock.getItems().clear();
        for (Map<String, Object> b : main.lib().blocks()) {
            editBlock.getItems().add(String.valueOf(b.get("name")));
        }
        editBlock.setValue(info.block);
        editComment.setText(info.comment);
        editNeteaseId.setText(main.lib().neteaseBindings().getOrDefault(path, ""));
        updateEditCover(info.cover);
    }

    private void updateEditCover(byte[] cover) {
        if (cover == null) {
            editCoverView.setImage(null);
            editCoverLabel.setVisible(true);
            return;
        }
        try {
            editCoverView.setImage(new Image(new ByteArrayInputStream(cover)));
            editCoverLabel.setVisible(false);
        } catch (Exception e) {
            editCoverView.setImage(null);
            editCoverLabel.setVisible(true);
        }
    }

    private void chooseCover() {
        FileChooser fc = new FileChooser();
        fc.setTitle("选择封面图片");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("图片", "*.jpg", "*.jpeg", "*.png", "*.bmp"));
        File f = fc.showOpenDialog(mainStage());
        if (f != null) {
            try {
                updateEditCover(Files.readAllBytes(f.toPath()));
                pendingCover = f.getAbsolutePath();
            } catch (IOException e) {
                warn("错误", "无效图片");
            }
        }
    }

    private void saveEdited() {
        String path = (editNeteaseId == null) ? null : currentEditPath();
        if (path == null) {
            warn("提示", "请先加载一首歌曲");
            return;
        }
        Map<String, Object> ud = new LinkedHashMap<>();
        ud.put("title", editTitle.getText());
        ud.put("artist", editArtist.getText());
        String cover = !pendingCover.isEmpty() ? pendingCover : String.valueOf(main.lib().ratings().getOrDefault(path, Map.of()).getOrDefault("cover", ""));
        ud.put("cover", cover);
        ud.put("score", editScore.getValue());
        ud.put("note", editNote.getText());
        ud.put("genre", editGenre.getValue() == null ? "" : editGenre.getValue());
        ud.put("block", editBlock.getValue() == null ? "" : editBlock.getValue());
        ud.put("comment", editComment.getText());
        // 保留 play_count
        Object pc = main.lib().ratings().getOrDefault(path, Map.of()).get("play_count");
        if (pc != null) {
            ud.put("play_count", pc);
        }
        main.lib().ratings().put(path, ud);
        main.lib().saveRatings();
        // BPM 单独存 bpm.json：值没变就保留原来的来源标记，改了才算"手动"
        double bpmVal = editBpm.getValue() == null ? 0 : editBpm.getValue();
        BpmStore.Entry prevBpm = main.bpmStore().get(path);
        if (bpmVal > 0) {
            boolean unchanged = prevBpm != null && Math.abs(prevBpm.bpm - bpmVal) < 0.05;
            boolean manual = prevBpm != null && (prevBpm.manual || !unchanged);
            // BPM 变了 = 原来的拍点网格作废（相位是按旧节拍拟出来的），改完顺手在后台重测一个
            boolean keepGrid = unchanged && prevBpm != null && prevBpm.hasGrid();
            main.bpmStore().put(path, bpmVal, prevBpm == null ? 1.0 : prevBpm.confidence, manual,
                    keepGrid ? prevBpm.beatMs : -1,
                    keepGrid ? prevBpm.offsetMs : -1,
                    keepGrid ? prevBpm.phaseConfidence : 0);
            updateEditBpmInfo(main.bpmStore().get(path));
            if (!keepGrid) {
                measureGridAsync(path, bpmVal);
            }
        } else if (prevBpm != null) {
            main.bpmStore().remove(path);
            updateEditBpmInfo(null);
        }
        main.bpmStore().save();
        updateTaskBpmInfo();
        main.lib().invalidateSongInfo(path);
        pendingCover = "";
        main.playbackPanel.refreshCurrentSong();
        main.libraryPanel.refresh();
        info("保存", "歌曲信息已更新");
    }

    // ── BPM（歌曲编辑）──

    /** 对当前编辑的曲目做一次 BPM 分析（后台跑，约 0.5~1 秒）。 */
    private void analyzeEditBpm() {
        String path = currentEditPath();
        if (path == null) {
            warn("提示", "请先加载一首歌曲");
            return;
        }
        if (main.jobCenter().hasRunning()) {
            warn("已有任务在跑", "请等当前任务结束（任务面板可查看 / 停止）。");
            return;
        }
        if (editBpmInfo != null) {
            editBpmInfo.setText("正在分析…");
            editBpmInfo.setStyle("-fx-text-fill:" + main.c("ACCENT") + ";");
        }
        bg(() -> {
            BpmAnalyzer.Result r = BpmAnalyzer.analyze(path);
            Platform.runLater(() -> {
                if (!path.equals(currentEditPath())) {
                    return;     // 分析期间切走了，丢弃结果
                }
                if (!r.usable()) {
                    if (editBpmInfo != null) {
                        editBpmInfo.setText("分析失败（文件损坏或解码异常）");
                        editBpmInfo.setStyle("-fx-text-fill:" + main.c("DANGER") + ";");
                    }
                    return;
                }
                setEditBpmQuiet(r.bpm());
                if (editBpmInfo != null) {
                    editBpmInfo.setText(String.format(java.util.Locale.ROOT,
                            "分析结果 %.1f BPM（置信度 %.2f，需点「💾 保存修改」才会写入；"
                                    + "若是一半/两倍可点 ÷2 或 ×2）", r.bpm(), r.confidence()));
                    editBpmInfo.setStyle("-fx-text-fill:" + main.c("ACCENT") + ";");
                }
            });
        });
    }

    /** 一键按倍数修正 BPM（对付"倍速"错误：把 87 改成 174 或反过来）。 */
    private void scaleEditBpm(double factor) {
        if (editBpm == null) {
            return;
        }
        double v = editBpm.getValue() == null ? 0 : editBpm.getValue();
        if (v <= 0) {
            return;
        }
        setEditBpmQuiet(Math.max(1, Math.min(300, v * factor)));
    }

    private void setEditBpmQuiet(double bpm) {
        if (editBpm != null) {
            editBpm.getValueFactory().setValue(Math.round(bpm * 10) / 10.0);
        }
    }

    /** 刷新任务面板顶部的 BPM 统计文案。 */
    private void updateTaskBpmInfo() {
        if (taskBpmInfo == null) {
            return;
        }
        int total = main.audioPaths.size();
        int has = main.bpmStore().size();
        taskBpmInfo.setText("已分析 BPM " + has + " / " + total + " 首"
                + "　·　已测拍点 " + main.bpmStore().gridCount() + " 首"
                + (total > 0 && has >= total ? "（全部完成）" : "　·　手动改过的 BPM 不会被覆盖"));
    }

    /**
     * 编辑器里那行「卡点网格」说明：动图卡点靠它才知道第一拍落在哪儿。
     */
    private String gridText(BpmStore.Entry e) {
        if (e == null || !e.hasGrid()) {
            return "　·　拍点未测（正在后台测，测完动图卡点就用真实拍点了）";
        }
        return String.format(java.util.Locale.ROOT,
                "　·　拍点：第一拍 +%.0f ms，拍长 %.2f ms（置信度 %.2f）%s",
                e.offsetMs, e.beatMs, e.phaseConfidence,
                e.phaseConfidence < 0.3 ? "　⚠ 网格较模糊" : "");
    }

    /** 后台补一首歌的拍点网格（BPM 刚改过、或扫描时漏掉的）。 */
    private void measureGridAsync(String path, double bpm) {
        if (path == null || bpm <= 0 || BpmAnalyzer.busy()) {
            return;
        }
        if (editBpmInfo != null && path.equals(currentEditPath())) {
            editBpmInfo.setText("正在测拍点（第一拍位置 + 精确拍长）…");
            editBpmInfo.setStyle("-fx-text-fill:" + main.c("ACCENT") + ";");
        }
        bg(() -> {
            BpmAnalyzer.Grid g = BpmAnalyzer.measureGrid(path, bpm);
            if (!g.ok()) {
                Platform.runLater(() -> {
                    if (path.equals(currentEditPath())) {
                        updateEditBpmInfo(main.bpmStore().get(path));
                    }
                });
                return;
            }
            main.bpmStore().updateGrid(path, g.beatMs(), g.offsetMs(), g.confidence());
            main.bpmStore().save();
            Platform.runLater(() -> {
                if (path.equals(currentEditPath())) {
                    updateEditBpmInfo(main.bpmStore().get(path));
                }
            });
        });
    }

    /** 刷新编辑器里的 BPM 状态说明。 */
    private void updateEditBpmInfo(BpmStore.Entry e) {
        if (editBpmInfo == null) {
            return;
        }
        if (e == null || e.bpm <= 0) {
            editBpmInfo.setText("尚无 BPM 数据 · 点「🔍 分析」自动测，或直接手填（保存后生效）");
            editBpmInfo.setStyle("-fx-text-fill:" + main.c("TEXT_MUTED") + ";");
        } else if (e.manual) {
            editBpmInfo.setText(String.format(java.util.Locale.ROOT,
                    "手动设定 %.1f BPM（批量扫描不会覆盖）%s", e.bpm, gridText(e)));
            editBpmInfo.setStyle("-fx-text-fill:" + main.c("SUCCESS") + ";");
        } else {
            editBpmInfo.setText(String.format(java.util.Locale.ROOT,
                    "自动分析 %.1f BPM（置信度 %.2f）%s%s", e.bpm, e.confidence,
                    e.confidence < BpmStore.LOW_CONFIDENCE ? "　⚠ 节奏较模糊，建议核对" : "",
                    gridText(e)));
            editBpmInfo.setStyle("-fx-text-fill:"
                    + main.c(e.confidence < BpmStore.LOW_CONFIDENCE ? "WARNING" : "TEXT_MUTED") + ";");
        }
    }

    /** 全库扫描结束后刷新编辑器（面板已构建且有加载曲目时）。 */
    private void refreshEditorBpm() {
        if (editBpm == null || editPath == null) {
            return;
        }
        BpmStore.Entry e = main.bpmStore().get(editPath);
        if (e != null) {
            setEditBpmQuiet(e.bpm);
            updateEditBpmInfo(e);
        }
    }

    /** 当前编辑面板所加载的曲目路径（未加载时为 null）。 */
    private String currentEditPath() {
        return editPath;
    }

    private void deleteCurrentSong() {
        String path = currentEditPath();
        if (path == null) {
            warn("警告", "请先在歌曲编辑中加载一首歌曲");
            return;
        }
        if (!confirm("确认", "确定要删除这首歌曲吗？\n" + new File(path).getName() + "\n\n删除后无法恢复！")) {
            return;
        }
        try {
            Files.deleteIfExists(new File(path).toPath());
        } catch (IOException e) {
            warn("错误", "删除失败：" + e.getMessage());
            return;
        }
        main.lib().ratings().remove(path);
        main.lib().lyrics().remove(path);
        main.lib().metadataCache().remove(path);
        main.lib().invalidateSongInfo(path);
        main.playlist.remove(path);
        main.audioPaths.remove(path);
        main.lib().saveRatings();
        main.lib().saveLyrics();
        main.lib().saveMetadataCache();
        main.libraryPanel.refresh();
        refreshPlaylist();
        info("成功", "已删除：" + new File(path).getName());
    }

    private void importSongs() {
        FileChooser fc = new FileChooser();
        fc.setTitle("选择要导入的音乐文件");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("音乐文件", "*.mp3", "*.flac"));
        List<File> files = fc.showOpenMultipleDialog(mainStage());
        if (files == null || files.isEmpty()) {
            return;
        }
        int imported = 0;
        int skipped = 0;
        for (File src : files) {
            String raw = src.getName();
            String ext = "";
            int dot = raw.lastIndexOf('.');
            if (dot > 0) {
                ext = raw.substring(dot).toLowerCase();
                raw = raw.substring(0, dot);
            }
            String title = raw;
            String artist = "未知歌手";
            MetadataReader.Result meta = MetadataReader.read(src.getAbsolutePath());
            if (!meta.title().isEmpty()) {
                title = meta.title();
            }
            if (!meta.artist().isEmpty()) {
                artist = meta.artist();
            }
            if ("未知歌手".equals(artist) && raw.contains(" - ")) {
                int idx = raw.indexOf(" - ");
                artist = raw.substring(0, idx).trim();
                title = raw.substring(idx + 3).trim();
            }
            String newName = (artist + " - " + title + ext).replaceAll("[\\\\/:*?\"<>|]", "_");
            File dst = new File(Paths.MUSIC_DIR, newName);
            if (dst.exists()) {
                skipped++;
                continue;
            }
            try {
                Files.move(src.toPath(), dst.toPath(), StandardCopyOption.REPLACE_EXISTING);
                Map<String, Object> ud = new LinkedHashMap<>();
                ud.put("title", title);
                ud.put("artist", artist);
                main.lib().ratings().put(dst.getAbsolutePath(), ud);
                imported++;
            } catch (IOException e) {
                skipped++;
            }
        }
        main.lib().saveRatings();
        main.audioPaths = main.lib().scanMusic();
        main.libraryPanel.refresh();
        info("导入结果", "成功导入 " + imported + " 首，跳过 " + skipped + " 首");
    }

    // ── 网易云绑定 ──
    private void neteaseBind() {
        String path = currentEditPath();
        if (path == null) {
            warn("提示", "请先在歌曲编辑中加载一首歌曲");
            return;
        }
        String val = editNeteaseId.getText().strip();
        String nid = extractId(val);
        if (nid.isEmpty()) {
            warn("错误", "无法识别的链接，请输入纯数字ID或完整URL");
            return;
        }
        NeteaseClient.SongInfoNet info = main.nc().getSongInfo(nid);
        if (info == null) {
            warn("错误", "无法找到ID为 " + nid + " 的歌曲");
            return;
        }
        main.lib().neteaseBindings().put(path, nid);
        main.lib().setNeteaseBindings(main.lib().neteaseBindings());
        editNeteaseId.setText(nid);
        info("绑定成功", "已绑定到: " + info.name() + " - " + info.artists());
    }

    private void neteaseUnbind() {
        String path = currentEditPath();
        if (path == null) {
            return;
        }
        if (main.lib().neteaseBindings().containsKey(path)) {
            main.lib().neteaseBindings().remove(path);
            main.lib().setNeteaseBindings(main.lib().neteaseBindings());
            editNeteaseId.clear();
            info("已解除", "已解除网易云绑定");
        }
    }

    private void neteaseAutoBind() {
        String path = currentEditPath();
        if (path == null) {
            warn("提示", "请先在歌曲编辑中加载一首歌曲");
            return;
        }
        SongInfo info = main.loadSongInfo(path);
        String keyword = (info.artist + " " + info.title).strip();
        bg(() -> {
            List<Map<String, Object>> results = main.nc().searchSong(keyword, 1);
            Platform.runLater(() -> {
                if (!results.isEmpty()) {
                    String id = String.valueOf(results.get(0).get("id"));
                    main.lib().neteaseBindings().put(path, id);
                    main.lib().setNeteaseBindings(main.lib().neteaseBindings());
                    editNeteaseId.setText(id);
                    info("自动绑定成功", "已绑定到: " + results.get(0).get("name") + " - " + results.get(0).get("artists"));
                } else {
                    warn("未找到", "未找到「" + keyword + "」的匹配歌曲");
                }
            });
        });
    }

    private void neteaseImportLyrics() {
        String path = currentEditPath();
        if (path == null) {
            warn("提示", "请先在歌曲编辑中加载一首歌曲");
            return;
        }
        String nid = main.lib().neteaseBindings().getOrDefault(path, editNeteaseId.getText().strip());
        if (!nid.matches("\\d+")) {
            warn("提示", "请先绑定网易云ID");
            return;
        }
        bg(() -> {
            String[] lrc = main.nc().fetchLyrics(nid);
            Platform.runLater(() -> {
                if (lrc == null) {
                    warn("错误", "未找到该歌曲的歌词");
                    return;
                }
                SongInfo info = main.loadSongInfo(path);
                saveNeteaseLyrics(path, lrc, info.artist, info.title);
                main.lib().invalidateSongInfo(path);
                main.playbackPanel.refreshCurrentSong();
                info("导入成功", "歌词已导入并解析。");
            });
        });
    }

    private void saveNeteaseLyrics(String savedPath, String[] lrc, String artist, String title) {
        if (lrc == null) {
            return;
        }
        String orig = lrc[0];
        String trans = lrc.length > 1 ? lrc[1] : null;
        String lfn = (!artist.isEmpty() ? artist + " - " + title : title) + ".lrc";
        lfn = lfn.replaceAll("[\\\\/*?:\"<>|]", "");
        File dest = new File(Paths.LYRICS_DIR, lfn);
        try {
            Files.writeString(dest.toPath(), orig);
            main.lib().lyrics().put(savedPath, dest.getAbsolutePath());
            if (trans != null && !trans.isBlank()) {
                String transFn = lfn.replace(".lrc", ".trans.lrc");
                Files.writeString(new File(Paths.LYRICS_DIR, transFn).toPath(), trans);
            }
            main.lib().saveLyrics();
        } catch (IOException ignored) {
        }
    }

    private static String extractId(String val) {
        if (val.matches("\\d+")) {
            return val;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[?&]id=(\\d+)").matcher(val);
        return m.find() ? m.group(1) : "";
    }

    // ── 评论 ──
    private Node buildCommentsPanel() {
        VBox w = vbox();
        w.getChildren().add(title("💬 网易云评论"));
        commentsStatus = new Label("播放一首歌后加载评论");
        commentsStatus.getStyleClass().add("muted");
        w.getChildren().add(commentsStatus);

        commentsList = new ListView<>();
        VBox.setVgrow(commentsList, Priority.ALWAYS);
        w.getChildren().add(commentsList);

        Button btn = new Button("🔄 加载评论");
        btn.setOnAction(e -> loadComments());
        w.getChildren().add(btn);
        return w;
    }

    private void loadComments() {
        String path = main.currentSongPath();
        if (path == null) {
            commentsStatus.setText("请先播放一首歌曲");
            return;
        }
        String nid = main.lib().neteaseBindings().get(path);
        if (nid == null) {
            commentsStatus.setText("当前歌曲未绑定网易云ID");
            return;
        }
        commentsStatus.setText("正在加载评论...");
        bg(() -> {
            NeteaseClient.CommentsResult r = main.nc().fetchComments(nid, 1,
                    Math.max(5, Math.min(30, main.commentDisplayCount)));
            Platform.runLater(() -> {
                commentsList.getItems().clear();
                if (r.total() == 0) {
                    commentsStatus.setText("暂无评论");
                    return;
                }
                commentsStatus.setText("共 " + r.total() + " 条评论");
                int i = 1;
                for (JsonNode c : r.comments()) {
                    String nick = c.path("user").path("nickname").asText("匿名用户");
                    String content = c.path("content").asText("");
                    int likes = c.path("likedCount").asInt(0);
                    commentsList.getItems().add("#" + i + " " + nick + "  👍" + likes + "\n" + content);
                    i++;
                }
            });
        });
    }

    // ── 歌词查看 ──
    private Node buildLyricsPanel() {
        VBox w = vbox();
        w.getChildren().add(title("📝 歌词查看"));
        lyricsStatus = new Label("播放一首歌曲后显示歌词");
        lyricsStatus.getStyleClass().add("muted");
        w.getChildren().add(lyricsStatus);

        lyricsText = new TextArea();
        lyricsText.setEditable(false);
        lyricsText.setWrapText(true);
        VBox.setVgrow(lyricsText, Priority.ALWAYS);
        w.getChildren().add(lyricsText);

        HBox btnRow = new HBox(4);
        Button load = new Button("🔄 刷新");
        load.setOnAction(e -> loadLyricsStatic());
        Button copy = new Button("📋 复制");
        copy.setOnAction(e -> copyLyrics());
        btnRow.getChildren().addAll(load, copy);
        w.getChildren().add(btnRow);
        return w;
    }

    private void loadLyricsStatic() {
        lyricsText.clear();
        String path = main.currentSongPath();
        if (path == null) {
            lyricsStatus.setText("请先播放一首歌曲");
            return;
        }
        SongInfo info = main.loadSongInfo(path);
        List<SongInfo.LrcLine> lyr = info.lyrics;
        if (lyr.isEmpty()) {
            lyricsStatus.setText("该歌曲无歌词数据");
            return;
        }
        lyricsStatus.setText("「" + info.artist + " - " + info.title + "」共 " + lyr.size() + " 行");
        boolean hasTrans = lyr.stream().anyMatch(l -> l.translation() != null && !l.translation().isEmpty());
        StringBuilder sb = new StringBuilder();
        for (SongInfo.LrcLine item : lyr) {
            int m = (int) (item.time() / 60);
            int s = (int) (item.time() % 60);
            sb.append(String.format("[%02d:%02d] %s", m, s, item.text()));
            if (hasTrans && item.translation() != null && !item.translation().isEmpty()) {
                sb.append("\n        ").append(item.translation());
            }
            sb.append("\n");
        }
        lyricsText.setText(sb.toString());
    }

    private void copyLyrics() {
        String content = lyricsText.getText().strip();
        if (!content.isEmpty()) {
            ClipboardContent cc = new ClipboardContent();
            cc.putString(content);
            Clipboard.getSystemClipboard().setContent(cc);
            lyricsStatus.setText("✅ 已复制到剪贴板");
        }
    }

    // ── 任务（系统任务 + 下载队列）──
    private Node buildTaskPanel() {
        VBox w = vbox();
        w.getChildren().add(title("⏳ 任务"));
        Label hint = new Label("系统任务（扫描等）和网易云下载都在这里，进行中的自动排在最上面。"
                + "扫描全库 BPM 的入口在「设置 → 工具」。");
        hint.getStyleClass().add("small");
        hint.setWrapText(true);
        w.getChildren().add(hint);

        ListView<Object> list = new ListView<>(main.taskRows());
        list.setCellFactory(lv -> new TaskCell());
        VBox.setVgrow(list, Priority.ALWAYS);
        w.getChildren().add(list);

        HBox row = new HBox(4);
        Button clear = new Button("清除已结束");
        clear.setOnAction(e -> {
            main.jobCenter().clearFinished();
            main.downloadManager().tasks().removeIf(
                    t -> t.status.get() == DownloadManager.Status.DONE
                            || t.status.get() == DownloadManager.Status.FAILED);
        });
        Button retryFailed = new Button("重试失败");
        retryFailed.setOnAction(e -> {
            List<DownloadManager.Task> failed = new ArrayList<>(main.downloadManager().tasks().stream()
                    .filter(t -> t.status.get() == DownloadManager.Status.FAILED).toList());
            main.downloadManager().tasks().removeAll(failed);
            for (DownloadManager.Task t : failed) {
                main.downloadManager().enqueue(t.id, t.name, t.artists, t.bitrate);
            }
        });
        row.getChildren().addAll(clear, retryFailed);
        w.getChildren().add(row);
        return w;
    }

    /**
     * 全库 BPM 扫描：登记成一条「系统任务」跑在后台，进度显示在任务面板里，可随时停止。
     *
     * <p>单曲约 0.5~1 秒（VLC 全速解码 + 谱通量 / 自相关），全库几百首约几分钟；
     * 已经分析过的会跳过，用户手改过的（manual）也跳过，不会被覆盖。</p>
     */
    private void startBpmScan(boolean redoAll) {
        if (main.jobCenter().hasRunning()) {
            warn("已有任务在跑", "请等当前任务结束，或先点它的「⏹」停止。");
            return;
        }
        List<String> todo = new ArrayList<>();
        for (String p : main.audioPaths) {
            BpmStore.Entry e = main.bpmStore().get(p);
            if (e != null && e.manual) {
                // 手改过的 BPM 永不覆盖，但拍点网格照样要补（网格不动 bpm 字段）
                if (!e.hasGrid() || redoAll) {
                    todo.add(p);
                }
                continue;
            }
            if (e != null && !redoAll && e.hasGrid()) {
                continue;                       // 已有 BPM + 拍点：默认跳过
            }
            todo.add(p);
        }
        if (todo.isEmpty()) {
            info("无需扫描", "所有歌曲都已有 BPM 和拍点。\n\n"
                    + "想重算请勾选上面的「重新分析已有的」；手动改过的 BPM 不会被覆盖。");
            return;
        }
        JobCenter.Job job = main.jobCenter().start("全库 BPM 扫描");
        job.progress.set(0);
        job.detail.set("准备中… 0 / " + todo.size() + " 首");
        BpmAnalyzer.resetCancel();
        job.onCancel = () -> {
            BpmAnalyzer.cancel();
            job.detail.set("正在停止…");
        };
        final int totalTodo = todo.size();
        bg(() -> {
            int done = 0;
            int failed = 0;
            int lowConf = 0;
            List<Double> vals = new ArrayList<>();
            long t0 = System.currentTimeMillis();
            for (String p : todo) {
                if (BpmAnalyzer.isCancelled()) {
                    break;
                }
                BpmStore.Entry prev = main.bpmStore().get(p);
                if (prev != null && prev.manual) {
                    // 手改过 BPM 的歌：只补拍点网格，绝不碰 bpm / confidence / manual
                    BpmAnalyzer.Grid g = BpmAnalyzer.measureGrid(p, prev.bpm);
                    if (g.ok()) {
                        main.bpmStore().updateGrid(p, g.beatMs(), g.offsetMs(), g.confidence());
                    }
                    done++;
                    final int d0 = done;
                    Platform.runLater(() -> {
                        job.progress.set((double) d0 / totalTodo);
                        job.detail.set(d0 + " / " + totalTodo + " 首");
                    });
                    if (done % 10 == 0) {
                        main.bpmStore().save();
                    }
                    continue;
                }
                BpmAnalyzer.Result r = BpmAnalyzer.analyze(p);
                if (r.usable()) {
                    main.bpmStore().put(p, r.bpm(), r.confidence(), false,
                            r.beatMs(), r.offsetMs(), r.phaseConfidence());
                    vals.add(r.bpm());
                    if (r.confidence() < BpmStore.LOW_CONFIDENCE) {
                        lowConf++;
                    }
                } else {
                    failed++;
                }
                done++;
                final int d = done;
                final int fl = failed;
                Platform.runLater(() -> {
                    job.progress.set((double) d / totalTodo);
                    job.detail.set(d + " / " + totalTodo + " 首" + (fl > 0 ? "　失败 " + fl : ""));
                });
                if (done % 10 == 0) {
                    main.bpmStore().save();
                }
            }
            main.bpmStore().save();
            final boolean cancelled = BpmAnalyzer.isCancelled();
            final int doneF = done;
            final int failedF = failed;
            final int lowF = lowConf;
            final long secs = Math.max(1, (System.currentTimeMillis() - t0) / 1000);
            vals.sort(null);
            final String summary;
            if (cancelled) {
                summary = "已停止 · 完成 " + doneF + " / " + totalTodo + " 首　用时 " + secs + " 秒";
            } else {
                StringBuilder sb = new StringBuilder("完成 " + doneF + " 首");
                if (failedF > 0) {
                    sb.append("（失败 ").append(failedF).append(" 首）");
                }
                if (!vals.isEmpty()) {
                    sb.append(String.format(java.util.Locale.ROOT, "　中位 %.1f BPM　范围 %.0f~%.0f",
                            vals.get(vals.size() / 2), vals.get(0), vals.get(vals.size() - 1)));
                }
                if (lowF > 0) {
                    sb.append("　节奏较模糊 ").append(lowF).append(" 首（可在歌曲编辑里核对 / 用 ÷2 ×2 修正）");
                }
                sb.append("　用时 ").append(secs).append(" 秒");
                summary = sb.toString();
            }
            Platform.runLater(() -> {
                job.state.set(cancelled ? JobCenter.State.CANCELLED : JobCenter.State.DONE);
                job.onCancel = null;
                job.progress.set(1.0);
                job.detail.set(summary);
                refreshEditorBpm();
                updateTaskBpmInfo();
            });
        });
    }

    /**
     * 任务单元格（系统任务与下载任务共用）：种类标签 + 标题 + 详情 + 进度条，
     * 可中断的任务在右侧多一个「⏹」。
     */
    private final class TaskCell extends ListCell<Object> {
        private final Label kindLabel = new Label();
        private final Label nameLabel = new Label();
        private final Label detailLabel = new Label();
        private final javafx.scene.control.ProgressBar bar = new javafx.scene.control.ProgressBar();
        private final Button stop = new Button("⏹");
        private final Region spacer = new Region();
        private final HBox top = new HBox(6, kindLabel, nameLabel, spacer, stop);
        private final VBox box = new VBox(2, top, detailLabel, bar);

        {
            kindLabel.getStyleClass().add("small");
            kindLabel.setMinWidth(34);
            nameLabel.getStyleClass().add("title");
            detailLabel.getStyleClass().add("small");
            detailLabel.setWrapText(true);
            stop.getStyleClass().add("small");
            stop.setMinWidth(28);
            HBox.setHgrow(spacer, Priority.ALWAYS);
            bar.setMaxWidth(Double.MAX_VALUE);
            bar.setPrefHeight(8);
            box.setPadding(new Insets(4, 2, 4, 2));
        }

        @Override
        protected void updateItem(Object item, boolean empty) {
            super.updateItem(item, empty);
            nameLabel.textProperty().unbind();
            detailLabel.textProperty().unbind();
            bar.progressProperty().unbind();
            stop.setVisible(false);
            stop.setManaged(false);
            if (empty || item == null) {
                setText(null);
                setGraphic(null);
                return;
            }
            if (item instanceof JobCenter.Job j) {
                kindLabel.setText("系统");
                kindLabel.setStyle("-fx-text-fill:" + main.c("ACCENT_2") + ";");
                nameLabel.textProperty().bind(j.title);
                detailLabel.textProperty().bind(j.detail);
                bar.progressProperty().bind(j.progress);
                boolean running = j.state.get() == JobCenter.State.RUNNING;
                stop.setVisible(running && j.onCancel != null);
                stop.setManaged(running && j.onCancel != null);
                stop.setOnAction(e -> {
                    if (j.onCancel != null) {
                        j.onCancel.run();
                    }
                });
                switch (j.state.get()) {
                    case RUNNING -> detailLabel.setStyle("-fx-text-fill:" + main.c("ACCENT") + ";");
                    case DONE -> detailLabel.setStyle("-fx-text-fill:" + main.c("SUCCESS") + ";");
                    case FAILED -> detailLabel.setStyle("-fx-text-fill:" + main.c("DANGER") + ";");
                    default -> detailLabel.setStyle("-fx-text-fill:" + main.c("TEXT_MUTED") + ";");
                }
            } else if (item instanceof DownloadManager.Task t) {
                kindLabel.setText("下载");
                kindLabel.setStyle("-fx-text-fill:" + main.c("MUTED") + ";");
                nameLabel.setText(t.label());
                detailLabel.textProperty().bind(t.detail);
                bar.progressProperty().bind(t.progress);
                detailLabel.setStyle(t.status.get() == DownloadManager.Status.FAILED
                        ? "-fx-text-fill:" + main.c("DANGER") + ";"
                        : "");
            }
            setGraphic(box);
        }
    }

    // ── 搜索与筛选 ──
    private Node buildFilterPanel() {
        VBox container = vbox();
        container.getChildren().add(title("🔎 搜索与筛选"));

        filterSearch = new TextField();
        filterSearch.setPromptText("搜索标题/歌手/备注/评论...");
        container.getChildren().add(filterSearch);

        filterMin = new Spinner<>(0.0, 10.0, 0.0, 0.1);
        filterMax = new Spinner<>(0.0, 10.0, 10.0, 0.1);
        filterMin.setEditable(true);
        filterMax.setEditable(true);
        container.getChildren().add(field("最低分：", filterMin));
        container.getChildren().add(field("最高分：", filterMax));

        filterBlock = new ComboBox<>();
        filterBlock.getItems().add("");
        for (Map<String, Object> b : main.lib().blocks()) {
            filterBlock.getItems().add(String.valueOf(b.get("name")));
        }
        filterGenre = new ComboBox<>();
        filterGenre.getItems().add("");
        filterGenre.getItems().addAll(main.lib().genreNames());
        container.getChildren().add(field("块：", filterBlock));
        container.getChildren().add(field("流派：", filterGenre));

        filterSortCombo = new ComboBox<>();
        filterSortCombo.getItems().addAll("标题", "歌手", "评分", "块", "流派", "播放次数");
        filterSortCombo.setValue("标题");
        container.getChildren().add(field("排序：", filterSortCombo));

        Button apply = new Button("✅ 应用筛选");
        apply.getStyleClass().add("primary");
        apply.setOnAction(e -> applyFilter());
        Button reset = new Button("🔄 复位");
        reset.setOnAction(e -> resetFilter());
        container.getChildren().addAll(apply, reset);

        ScrollPane scroll = new ScrollPane(container);
        scroll.setFitToWidth(true);
        VBox w = vbox();
        w.getChildren().add(scroll);
        VBox.setVgrow(scroll, Priority.ALWAYS);
        return w;
    }

    private void applyFilter() {
        String q = filterSearch.getText().strip().toLowerCase();
        double lo = filterMin.getValue();
        double hi = filterMax.getValue();
        String selBlock = filterBlock.getValue() == null ? "" : filterBlock.getValue().strip();
        String selGenre = filterGenre.getValue() == null ? "" : filterGenre.getValue().strip();

        Map<String, String> sortMap = Map.of("标题", "title", "歌手", "artist", "评分", "rating",
                "块", "block", "流派", "genre", "播放次数", "play_count");
        main.filterSortMode = sortMap.getOrDefault(filterSortCombo.getValue(), "title");

        List<String> allp = main.lib().scanMusic();
        List<String> res = new ArrayList<>();
        for (String p : allp) {
            SongInfo info = main.loadSongInfo(p);
            Map<String, Object> ud = main.lib().ratings().get(p);
            if (!q.isEmpty()) {
                String hay = (info.title + info.artist + new File(p).getName()
                        + str(ud, "note") + str(ud, "comment")).toLowerCase();
                if (!hay.contains(q)) {
                    continue;
                }
            }
            double s = num(ud, "score");
            if (!(lo <= s && s <= hi)) {
                continue;
            }
            if (!selBlock.isEmpty() && !selBlock.equals(str(ud, "block"))) {
                continue;
            }
            if (!selGenre.isEmpty() && !selGenre.equals(str(ud, "genre"))) {
                continue;
            }
            res.add(p);
        }
        sortFilter(res);
        main.audioPaths = res;
        main.filterResultVisible = true;
        main.libraryPanel.refresh();
        info("筛选完成", "筛选结果：" + res.size() + " 首歌曲");
    }

    private void sortFilter(List<String> res) {
        // 与音乐库左栏共用同一套规则（LibrarySort）：每个模式都带固定的次级键 = 路径，
        // 这样结果只由曲库本身决定，不受"上一次的列表顺序"影响。
        LibrarySort.sort(res, LibrarySort.Mode.of(main.filterSortMode), new LibrarySort.Accessors(
                main::getCachedTitle,
                main::getCachedArtist,
                p -> num(main.lib().ratings().get(p), "score"),
                p -> str(main.lib().ratings().get(p), "block"),
                p -> str(main.lib().ratings().get(p), "genre"),
                p -> (int) num(main.lib().ratings().get(p), "play_count")));
    }

    private void resetFilter() {
        filterSearch.clear();
        filterMin.getValueFactory().setValue(0.0);
        filterMax.getValueFactory().setValue(10.0);
        filterBlock.setValue("");
        filterGenre.setValue("");
        main.audioPaths = main.lib().scanMusic();
        main.filterResultVisible = false;
        main.libraryPanel.refresh();
    }

    private static String str(Map<String, Object> ud, String key) {
        if (ud == null) {
            return "";
        }
        Object v = ud.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    private static double num(Map<String, Object> ud, String key) {
        if (ud == null) {
            return 0;
        }
        Object v = ud.get(key);
        return v instanceof Number n ? n.doubleValue() : 0;
    }

    // ── 网易云音乐 ──
    private Node buildNeteasePanel() {
        VBox w = vbox();
        w.getChildren().add(title("🎵 网易云音乐"));
        ncStatus = new Label(ncStatusText());
        ncStatus.getStyleClass().add("muted");
        w.getChildren().add(ncStatus);

        TabPane tabs = new TabPane();
        tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        VBox.setVgrow(tabs, Priority.ALWAYS);

        // 登录
        VBox login = vbox();
        ncAccountLabel = new Label("未登录");
        ncAccountLabel.setWrapText(true);
        login.getChildren().add(ncAccountLabel);
        ncPhone = new TextField();
        ncPhone.setPromptText("手机号");
        ncPassword = new TextField();
        ncPassword.setPromptText("密码");
        login.getChildren().add(field("手机号：", ncPhone));
        login.getChildren().add(field("密码：", ncPassword));
        Button btnPhone = new Button("手机号登录");
        btnPhone.setOnAction(e -> ncPhoneLogin());
        login.getChildren().add(btnPhone);
        ncCookie = new TextField();
        ncCookie.setPromptText("浏览器 F12 → Cookie → MUSIC_U 值");
        login.getChildren().add(field("Cookie：", ncCookie));
        Button btnCookie = new Button("Cookie 登录");
        btnCookie.setOnAction(e -> ncCookieLogin());
        login.getChildren().add(btnCookie);
        Button btnQr = new Button("📱 二维码登录");
        btnQr.setOnAction(e -> ncQrLogin());
        login.getChildren().add(btnQr);
        Button btnRefresh = new Button("🔄 刷新账号信息");
        btnRefresh.setOnAction(e -> ncRefreshAccount());
        Button btnLogout = new Button("🚪 退出登录");
        btnLogout.getStyleClass().add("danger");
        btnLogout.setOnAction(e -> ncLogout());
        login.getChildren().addAll(btnRefresh, btnLogout);
        tabs.getTabs().add(new Tab("登录", login));

        // 搜索下载
        VBox search = vbox();
        ncSearch = new TextField();
        ncSearch.setPromptText("输入歌手/歌名搜索");
        search.getChildren().add(ncSearch);
        Button btnSearch = new Button("🔍 搜索");
        btnSearch.setOnAction(e -> ncSearch());
        search.getChildren().add(btnSearch);
        ncBitrate = new ComboBox<>();
        ncBitrate.getItems().addAll(BR_OPTIONS);
        ncBitrate.setValue(brDisplay(main.currentDlBr));
        ncBitrate.setOnAction(e -> {
            main.currentDlBr = bitrateMap().getOrDefault(ncBitrate.getValue(), 999000);
            main.lib().config().put("current_dl_br", main.currentDlBr);
            main.lib().saveConfig();
            if (dlBrCombo != null) {
                dlBrCombo.setValue(ncBitrate.getValue());
            }
        });
        search.getChildren().add(field("音质：", ncBitrate));
        ncResults = new ListView<>();
        ncResults.setCellFactory(lv -> new NcSongCell());
        ncResults.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && ncResults.getSelectionModel().getSelectedItem() != null) {
                NcItem it = ncResults.getSelectionModel().getSelectedItem();
                ncDownload(it.id(), it.name(), it.artists());
            }
        });
        VBox.setVgrow(ncResults, Priority.ALWAYS);
        search.getChildren().add(ncResults);
        tabs.getTabs().add(new Tab("搜索下载", search));

        // 导入单曲
        VBox impTab = vbox();
        ncImportId = new TextField();
        ncImportId.setPromptText("输入网易云歌曲ID或链接");
        impTab.getChildren().add(ncImportId);
        Button btnImport = new Button("📥 导入单曲");
        btnImport.setOnAction(e -> ncImportSingle());
        impTab.getChildren().add(btnImport);
        tabs.getTabs().add(new Tab("导入单曲", impTab));

        // 歌单
        VBox plTab = vbox();
        ncPlSource = new ComboBox<>();
        ncPlSource.getItems().addAll("我的歌单", "每日推荐", "搜索歌单");
        ncPlSource.setValue("我的歌单");
        ncPlSource.setOnAction(e -> ncLoadPlaylists());
        plTab.getChildren().add(ncPlSource);

        // 搜索行（仅「搜索歌单」使用）
        ncPlSearchRow = new HBox(6);
        ncPlSearch = new TextField();
        ncPlSearch.setPromptText("输入关键词搜索歌单");
        ncPlSearch.setOnAction(e -> ncLoadPlaylists());
        Button btnSearchPl = new Button("🔍");
        btnSearchPl.setOnAction(e -> ncLoadPlaylists());
        HBox.setHgrow(ncPlSearch, Priority.ALWAYS);
        ncPlSearchRow.getChildren().addAll(ncPlSearch, btnSearchPl);
        plTab.getChildren().add(ncPlSearchRow);

        ncPlStatus = new Label("");
        ncPlStatus.getStyleClass().add("muted");
        ncPlStatus.setWrapText(true);
        plTab.getChildren().add(ncPlStatus);

        // 歌曲视图的导航行（返回 + 全选）
        HBox navRow = new HBox(6);
        ncBackBtn = new Button("← 返回歌单");
        ncBackBtn.setOnAction(e -> ncBackToPlaylists());
        ncSelectAllBtn = new Button("全选/取消");
        ncSelectAllBtn.setOnAction(e -> ncToggleSelectAll());
        navRow.getChildren().addAll(ncBackBtn, ncSelectAllBtn);
        plTab.getChildren().add(navRow);

        ncContent = new StackPane();
        VBox.setVgrow(ncContent, Priority.ALWAYS);
        plTab.getChildren().add(ncContent);

        // 批量处理行（歌曲视图显示）
        ncBatchBox = vbox();
        ncBatchBlockCombo = new ComboBox<>();
        ncBatchBlockCombo.setPromptText("块（可选，不选则不归属）");
        ncBatchGenreCombo = new ComboBox<>();
        ncBatchGenreCombo.setPromptText("流派（可选，不选则不归属）");
        ncBatchAddQueue = new CheckBox("同时加入当前播放列表");
        Button batchGo = new Button("📥 批量下载并归属");
        batchGo.getStyleClass().add("primary");
        batchGo.setOnAction(e -> ncBatchProcess());
        ncBatchBox.getChildren().addAll(
                field("块：", ncBatchBlockCombo),
                field("流派：", ncBatchGenreCombo),
                ncBatchAddQueue, batchGo);
        plTab.getChildren().add(ncBatchBox);

        tabs.getTabs().add(new Tab("歌单", plTab));
        ncLoadPlaylists();

        // 批量操作
        VBox batch = vbox();
        Button btnBatchBind = new Button("🔍 批量自动绑定网易云ID");
        btnBatchBind.setOnAction(e -> ncBatchBind());
        Button btnBatchLyrics = new Button("📝 一键导入所有歌词");
        btnBatchLyrics.setOnAction(e -> ncBatchLyrics());
        batch.getChildren().addAll(btnBatchBind, btnBatchLyrics);
        ncBatchStatus = new Label("");
        ncBatchStatus.getStyleClass().add("muted");
        ncBatchStatus.setWrapText(true);
        batch.getChildren().add(ncBatchStatus);
        tabs.getTabs().add(new Tab("批量操作", batch));

        w.getChildren().add(tabs);
        return w;
    }

    private String ncStatusText() {
        return main.nc().isLoggedIn() ? "✅ 已登录" : "⚠️ 未登录（VIP歌曲可能无法下载）";
    }

    private void ncPhoneLogin() {
        String phone = ncPhone.getText().strip();
        String pw = ncPassword.getText().strip();
        if (phone.isEmpty() || pw.isEmpty()) {
            return;
        }
        ncStatus.setText("正在登录...");
        bg(() -> {
            NeteaseClient.LoginResult r = main.nc().loginCellphone(phone, pw);
            Platform.runLater(() -> {
                ncStatus.setText(ncStatusText());
                if (r.ok()) {
                    info("登录成功", "✅ " + r.message());
                } else {
                    warn("登录失败", r.message());
                }
            });
        });
    }

    private void ncCookieLogin() {
        String val = ncCookie.getText().strip();
        if (val.isEmpty()) {
            return;
        }
        bg(() -> {
            NeteaseClient.LoginResult r = main.nc().loginCookie(val);
            Platform.runLater(() -> {
                ncStatus.setText(ncStatusText());
                if (r.ok()) {
                    info("登录成功", r.message());
                } else {
                    warn("登录失败", r.message());
                }
            });
        });
    }

    private void ncQrLogin() {
        NeteaseClient.QrKeyResult r = main.nc().loginQrcodeKey();
        if (!r.ok()) {
            warn("错误", r.message());
            return;
        }
        String unikey = r.unikey();
        String qrUrl = "https://music.163.com/login?codekey=" + unikey;
        // 点击后自动复制二维码链接到剪贴板（备用）
        try {
            ClipboardContent cc = new ClipboardContent();
            cc.putString(qrUrl);
            Clipboard.getSystemClipboard().setContent(cc);
        } catch (Exception ignored) {
        }

        // 获取二维码图片并直接在窗口内展示（关键：二维码必须编码本 unikey，
        // 只复制链接在浏览器打开时，页面会另生成一个 codekey，导致永远扫不上）
        ImageView qrView = null;
        String dataUrl = main.nc().qrcodeImage(unikey);
        if (dataUrl != null && dataUrl.startsWith("data:image/png;base64,")) {
            try {
                byte[] bytes = java.util.Base64.getDecoder()
                        .decode(dataUrl.substring("data:image/png;base64,".length()));
                Image img = new Image(new ByteArrayInputStream(bytes));
                qrView = new ImageView(img);
                qrView.setFitWidth(230);
                qrView.setFitHeight(230);
                qrView.setPreserveRatio(true);
            } catch (Exception ignored) {
            }
        }

        Dialog<Void> qrDlg = new Dialog<>();
        qrDlg.setTitle("扫码登录");
        qrDlg.setHeaderText("请用网易云APP扫描二维码");
        qrDlg.getDialogPane().getButtonTypes().add(ButtonType.CANCEL);
        if (this.getScene() != null) {
            qrDlg.initOwner(this.getScene().getWindow());
        }
        VBox content = new VBox(12);
        content.setAlignment(Pos.CENTER);
        content.setPadding(new Insets(8));
        if (qrView != null) {
            content.getChildren().add(qrView);
        }
        Label hint = new Label("二维码链接已自动复制到剪贴板，也可粘贴到浏览器打开。");
        hint.setWrapText(true);
        hint.getStyleClass().add("muted");
        content.getChildren().add(hint);
        qrDlg.getDialogPane().setContent(content);
        qrDlg.show();

        ncStatus.setText("请用网易云APP扫码...");
        bg(() -> {
            for (int i = 0; i < 120; i++) {
                int st = main.nc().loginQrcodePoll(unikey);
                if (st == 1) {
                    Platform.runLater(() -> {
                        qrDlg.close();
                        ncStatus.setText(ncStatusText());
                        info("登录成功", "✅ 登录成功");
                    });
                    return;
                } else if (st == 0) {
                    Platform.runLater(() -> ncStatus.setText("已扫码，请确认..."));
                } else if (st == -2) {
                    Platform.runLater(() -> {
                        qrDlg.close();
                        ncStatus.setText("二维码已过期");
                    });
                    return;
                }
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ignored) {
                }
            }
            Platform.runLater(() -> {
                qrDlg.close();
                ncStatus.setText("登录超时");
            });
        });
    }

    private void ncLogout() {
        main.nc().logout();
        ncStatus.setText(ncStatusText());
        ncAccountLabel.setText("未登录");
    }

    private void ncRefreshAccount() {
        if (!main.nc().isLoggedIn()) {
            ncAccountLabel.setText("未登录");
            return;
        }
        bg(() -> {
            JsonNode d = main.nc().accountInfo();
            Platform.runLater(() -> {
                if (NeteaseClient.code(d) == null || NeteaseClient.code(d) != 200) {
                    ncAccountLabel.setText("登录状态异常");
                    return;
                }
                JsonNode prof = d.path("profile");
                JsonNode acct = d.path("account");
                String nick = prof.hasNonNull("nickname") ? prof.get("nickname").asText()
                        : acct.hasNonNull("userName") ? acct.get("userName").asText("用户") : "用户";
                main.nc().setUid(prof.hasNonNull("userId") ? String.valueOf(prof.get("userId").asLong())
                        : acct.hasNonNull("id") ? String.valueOf(acct.get("id").asLong()) : "");
                int vip = acct.path("vipType").asInt(0);
                String vipText = vip > 0 ? "👑 VIP" + vip : "非VIP用户";
                ncAccountLabel.setText(nick + "\n" + vipText);
            });
        });
    }

    private static final List<String> BR_OPTIONS = List.of("无限制", "高品质 320k", "中等 192k", "标准 128k");

    private Map<String, Integer> bitrateMap() {
        return Map.of("无限制", 999000, "标准 128k", 128000, "中等 192k", 192000, "高品质 320k", 320000);
    }

    private static String brDisplay(int br) {
        return switch (br) {
            case 128000 -> "标准 128k";
            case 192000 -> "中等 192k";
            case 999000 -> "无限制";
            default -> "高品质 320k";
        };
    }

    private void ncSearch() {
        String kw = ncSearch.getText().strip();
        if (kw.isEmpty()) {
            return;
        }
        ncResults.getItems().setAll(new NcItem("", "搜索中...", ""));
        bg(() -> {
            List<Map<String, Object>> songs = main.nc().searchSong(kw, 30);
            Platform.runLater(() -> {
                List<NcItem> items = new ArrayList<>();
                for (Map<String, Object> s : songs) {
                    String id = String.valueOf(s.get("id"));
                    String name = s.get("name").toString();
                    String artists = s.get("artists").toString();
                    String album = String.valueOf(s.getOrDefault("album", ""));
                    int dur = 0;
                    Object d = s.get("duration");
                    if (d instanceof Number n) {
                        dur = (int) (n.longValue() / 1000);
                    }
                    int fee = s.get("fee") instanceof Number n ? n.intValue() : 0;
                    items.add(new NcItem(id, name, artists, album, dur, fee));
                }
                ncResults.getItems().setAll(items);
            });
        });
    }

    private void ncImportSingle() {
        String nid = extractId(ncImportId.getText().strip());
        if (nid.isEmpty()) {
            warn("错误", "无法识别的链接或ID");
            return;
        }
        ncDownload(nid, "", "");
    }

    private void ncDownload(String nid, String name, String artists) {
        int br = bitrateMap().getOrDefault(ncBitrate.getValue(), 320000);
        main.downloadManager().enqueue(nid, name, artists, br);
        if (ncPlStatus != null) {
            ncPlStatus.setText("已加入下载队列：" + (name.isBlank() ? nid : name));
        }
    }

    // ── 歌单视图 ──
    private void ncLoadPlaylists() {
        String raw = ncPlSource.getValue();
        final String src = (raw == null) ? "我的歌单" : raw;
        ncShowPlaylistView();
        setVisibleManaged(ncPlSearchRow, "搜索歌单".equals(src));
        if (("我的歌单".equals(src) || "每日推荐".equals(src)) && !main.nc().isLoggedIn()) {
            ncPlStatus.setText("请先登录网易云");
            ncContent.getChildren().setAll(emptyLabel("请先登录网易云"));
            return;
        }
        ncPlStatus.setText("加载中...");
        bg(() -> {
            if ("我的歌单".equals(src)) {
                List<JsonNode> pls = main.nc().getUserPlaylists();
                Platform.runLater(() -> {
                    if (pls.isEmpty()) {
                        ncPlStatus.setText("未获取到歌单，请确认已登录");
                        ncContent.getChildren().setAll(emptyLabel("未获取到歌单"));
                    } else {
                        ncPlStatus.setText("找到 " + pls.size() + " 个我的歌单 · 双击进入");
                        ncShowMyPlaylistGrid(pls);
                    }
                });
            } else if ("每日推荐".equals(src)) {
                List<NcItem> songs = ncDailySongs();
                Platform.runLater(() -> ncShowSongs(songs, "每日推荐", "", false));
            } else {
                String kw = ncPlSearch.getText().strip();
                if (kw.isEmpty()) {
                    Platform.runLater(() -> {
                        ncPlStatus.setText("请输入关键词搜索歌单");
                        ncContent.getChildren().setAll(emptyLabel("输入关键词搜索歌单"));
                    });
                    return;
                }
                List<JsonNode> pls = main.nc().searchPlaylists(kw, 20);
                Platform.runLater(() -> {
                    if (pls.isEmpty()) {
                        ncPlStatus.setText("未找到相关歌单");
                        ncContent.getChildren().setAll(emptyLabel("未找到相关歌单"));
                    } else {
                        ncPlStatus.setText("找到 " + pls.size() + " 个歌单 · 双击查看歌曲");
                        ncShowSearchPlaylistList(pls);
                    }
                });
            }
        });
    }

    private void ncShowPlaylistView() {
        setVisibleManaged(ncBackBtn, false);
        setVisibleManaged(ncSelectAllBtn, false);
        setVisibleManaged(ncBatchBox, false);
        ncCurrentPlId = "";
        ncCurrentPlName = "";
        ncIsMyPlaylist = false;
        ncSongList = null;
    }

    private void ncBackToPlaylists() {
        ncLoadPlaylists();
    }

    private Label emptyLabel(String text) {
        Label l = new Label(text);
        l.getStyleClass().add("muted");
        l.setWrapText(true);
        return l;
    }

    private void ncShowMyPlaylistGrid(List<JsonNode> pls) {
        TilePane grid = new TilePane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(6));
        grid.setPrefColumns(2);
        for (JsonNode pl : pls) {
            grid.getChildren().add(playlistCard(pl, true));
        }
        ScrollPane sp = new ScrollPane(grid);
        sp.setFitToWidth(true);
        sp.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        ncContent.getChildren().setAll(sp);
    }

    private Node playlistCard(JsonNode pl, boolean isMy) {
        String plid = String.valueOf(pl.path("id").asLong());
        String name = pl.path("name").asText("未命名");
        int count = pl.path("trackCount").asInt(pl.path("trackNum").asInt(0));
        String coverUrl = pl.path("coverImgUrl").asText("");
        VBox card = new VBox(6);
        card.setAlignment(Pos.CENTER);
        card.setPadding(new Insets(8));
        card.getStyleClass().add("card");
        card.setCursor(Cursor.HAND);

        StackPane cover = new StackPane();
        Label ph = new Label("📀");
        ph.setStyle("-fx-font-size:44px; -fx-text-fill:" + main.c("ACCENT") + ";");
        ImageView iv = new ImageView();
        iv.setFitWidth(96);
        iv.setFitHeight(96);
        iv.setPreserveRatio(false);
        iv.setSmooth(true);
        if (coverUrl != null && !coverUrl.isBlank()) {
            try {
                iv.setImage(new Image(coverUrl, 96, 96, false, true, true));
            } catch (Exception ignored) {
            }
        }
        cover.getChildren().addAll(ph, iv);
        cover.setMinSize(96, 96);
        card.getChildren().add(cover);

        Label nameLbl = new Label(name);
        nameLbl.setWrapText(true);
        nameLbl.getStyleClass().add("card-title");
        nameLbl.setMaxWidth(110);
        nameLbl.setAlignment(Pos.CENTER);
        card.getChildren().add(nameLbl);

        Label countLbl = new Label(count + "首");
        countLbl.getStyleClass().add("small");
        card.getChildren().add(countLbl);

        card.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2) {
                ncOpenPlaylistSongs(plid, name, isMy);
            }
        });
        return card;
    }

    private void ncShowSearchPlaylistList(List<JsonNode> pls) {
        VBox list = new VBox(4);
        list.setPadding(new Insets(4));
        for (JsonNode pl : pls) {
            String plid = String.valueOf(pl.path("id").asLong());
            String name = pl.path("name").asText("未命名");
            int count = pl.path("trackCount").asInt(pl.path("trackNum").asInt(0));
            JsonNode creator = pl.path("creator");
            String creatorName = creator.hasNonNull("nickname") ? creator.get("nickname").asText() : "";
            VBox card = new VBox(4);
            card.setPadding(new Insets(6, 8, 6, 8));
            card.getStyleClass().add("card");
            card.setCursor(Cursor.HAND);
            Label nameLbl = new Label("☁️ " + name);
            nameLbl.getStyleClass().add("card-title");
            Label sub = new Label(count + "首" + (creatorName.isBlank() ? "" : " · by " + creatorName));
            sub.getStyleClass().add("small");
            Button view = new Button("👁 查看歌曲");
            view.setOnAction(e -> ncOpenPlaylistSongs(plid, name, false));
            card.getChildren().addAll(nameLbl, sub, view);
            card.setOnMouseClicked(e -> {
                if (e.getClickCount() == 2) {
                    ncOpenPlaylistSongs(plid, name, false);
                }
            });
            list.getChildren().add(card);
        }
        ScrollPane sp = new ScrollPane(list);
        sp.setFitToWidth(true);
        sp.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        ncContent.getChildren().setAll(sp);
    }

    private void ncOpenPlaylistSongs(String plid, String plname, boolean isMy) {
        ncPlStatus.setText("加载「" + plname + "」歌曲列表...");
        bg(() -> {
            JsonNode detail = main.nc().getPlaylistDetail(plid);
            Platform.runLater(() -> {
                if (detail == null) {
                    warn("错误", "加载歌单详情失败");
                    return;
                }
                List<NcItem> items = new ArrayList<>();
                JsonNode tracks = detail.get("tracks");
                if (tracks != null && tracks.isArray()) {
                    for (JsonNode t : tracks) {
                        items.add(ncSongFromJson(t));
                    }
                }
                ncShowSongs(items, plname, plid, isMy);
            });
        });
    }

    private List<NcItem> ncDailySongs() {
        List<NcItem> items = new ArrayList<>();
        for (JsonNode s : main.nc().dailyRecommendSongs()) {
            items.add(ncSongFromJson(s));
        }
        return items;
    }

    private NcItem ncSongFromJson(JsonNode t) {
        String id = String.valueOf(t.path("id").asLong());
        String name = t.path("name").asText("");
        List<String> ar = new ArrayList<>();
        if (t.path("ar").isArray()) {
            for (JsonNode a : t.get("ar")) {
                if (a.hasNonNull("name")) {
                    ar.add(a.get("name").asText());
                }
            }
        }
        String artists = String.join("/", ar);
        String album = t.path("al").hasNonNull("name") ? t.path("al").get("name").asText() : "";
        int dur = (int) (t.path("dt").asLong(0) / 1000);
        int fee = t.path("fee").asInt(0);
        return new NcItem(id, name, artists, album, dur, fee);
    }

    private void ncShowSongs(List<NcItem> songs, String title, String plid, boolean isMy) {
        ncCurrentPlId = plid;
        ncCurrentPlName = title;
        ncIsMyPlaylist = isMy;
        ncSongList = new ListView<>();
        ncSongList.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);
        ncSongList.setCellFactory(lv -> new NcSongCell());
        ncSongList.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2) {
                NcItem it = ncSongList.getSelectionModel().getSelectedItem();
                if (it != null && !it.id().isEmpty()) {
                    ncDownload(it.id(), it.name(), it.artists());
                }
            }
        });
        ncSongList.getItems().setAll(songs);
        ncContent.getChildren().setAll(ncSongList);
        ncPlStatus.setText("「" + title + "」共 " + songs.size() + " 首 · 多选后批量下载，双击单曲下载");
        refreshNcBatchCombos();
        setVisibleManaged(ncBackBtn, true);
        setVisibleManaged(ncSelectAllBtn, true);
        setVisibleManaged(ncBatchBox, true);
    }

    private void refreshNcBatchCombos() {
        ncBatchBlockCombo.getItems().setAll(NC_NONE);
        for (Map<String, Object> b : main.lib().blocks()) {
            ncBatchBlockCombo.getItems().add(String.valueOf(b.get("name")));
        }
        ncBatchBlockCombo.setValue(NC_NONE);
        ncBatchGenreCombo.getItems().setAll(NC_NONE);
        ncBatchGenreCombo.getItems().addAll(main.lib().genreNames());
        ncBatchGenreCombo.setValue(NC_NONE);
    }

    private void ncToggleSelectAll() {
        if (ncSongList == null) {
            return;
        }
        if (ncSongList.getSelectionModel().getSelectedItems().size() == ncSongList.getItems().size()) {
            ncSongList.getSelectionModel().clearSelection();
        } else {
            ncSongList.getSelectionModel().selectAll();
        }
    }

    private void ncBatchProcess() {
        if (ncSongList == null || ncSongList.getSelectionModel().getSelectedItems().isEmpty()) {
            warn("未选择", "请先在歌曲列表多选要下载/归属的歌曲");
            return;
        }
        List<NcItem> sel = new ArrayList<>(ncSongList.getSelectionModel().getSelectedItems());
        String block = noneToNull(ncBatchBlockCombo.getValue());
        String genre = noneToNull(ncBatchGenreCombo.getValue());
        boolean addQueue = ncBatchAddQueue.isSelected();
        if (block != null) {
            ncEnsureBlock(block);
        }
        if (genre != null) {
            ncEnsureGenre(genre);
        }
        ncPlStatus.setText("处理中：查重并下载 " + sel.size() + " 首...");
        bg(() -> {
            List<String> allPaths = main.lib().scanMusic();
            Map<String, String> reverse = new HashMap<>();
            for (Map.Entry<String, String> e : main.lib().neteaseBindings().entrySet()) {
                if (new File(e.getKey()).exists()) {
                    reverse.put(e.getValue(), e.getKey());
                }
            }
            int exist = 0;
            int download = 0;
            List<String> toQueue = new ArrayList<>();
            for (NcItem s : sel) {
                String sid = s.id();
                if (sid == null || sid.isEmpty()) {
                    continue;
                }
                String matched = reverse.get(sid);
                if (matched == null) {
                    matched = ncFindLocalByFilename(s.name(), s.artists(), allPaths);
                }
                if (matched != null) {
                    exist++;
                    ncAssignLocalRating(matched, block, genre);
                    if (addQueue && !main.playlist.contains(matched)) {
                        toQueue.add(matched);
                    }
                    continue;
                }
                int br = bitrateMap().getOrDefault(ncBitrate.getValue(), 320000);
                main.downloadManager().enqueue(sid, s.name(), s.artists(), br, block, genre, addQueue);
                download++;
            }
            final int fExist = exist;
            final int fDownload = download;
            Platform.runLater(() -> {
                if (addQueue && !toQueue.isEmpty()) {
                    for (String p : toQueue) {
                        if (!main.playlist.contains(p)) {
                            main.playlist.add(p);
                        }
                    }
                    main.functionPanels.refreshPlaylist();
                }
                ncPlStatus.setText("✅ 已存在 " + fExist + " 首（直接关联，未重复下载）· 新下载 " + fDownload + " 首");
                main.libraryPanel.refresh();
            });
        });
    }

    private void ncAssignLocalRating(String path, String block, String genre) {
        boolean needSave = false;
        if (block != null) {
            main.lib().ratings().computeIfAbsent(path, k -> new LinkedHashMap<>()).put("block", block);
            needSave = true;
        }
        if (genre != null) {
            main.lib().ratings().computeIfAbsent(path, k -> new LinkedHashMap<>()).put("genre", genre);
            needSave = true;
        }
        if (needSave) {
            main.lib().saveRatings();
        }
    }

    private String ncFindLocalByFilename(String name, String artists, List<String> allPaths) {
        String target = ((artists == null || artists.isBlank()) ? "" : artists + " - ") + name;
        for (String p : allPaths) {
            String base = new File(p).getName();
            int dot = base.lastIndexOf('.');
            if (dot > 0) {
                base = base.substring(0, dot);
            }
            if (base.equals(target)) {
                return p;
            }
        }
        return null;
    }

    /** 该网易云ID是否已在本地存在（用于条目上的「已下载」标记）。 */
    private boolean ncHasLocal(String nid) {
        if (nid == null || nid.isEmpty()) {
            return false;
        }
        for (String v : main.lib().neteaseBindings().values()) {
            if (nid.equals(v)) {
                return true;
            }
        }
        return false;
    }

    private static String feeColor(String ft) {
        return switch (ft) {
            case "VIP" -> "#e6a817";
            case "付费" -> "#cc4444";
            default -> "#00cc66";
        };
    }

    private void ncEnsureBlock(String name) {
        for (Map<String, Object> b : main.lib().blocks()) {
            if (name.equals(String.valueOf(b.get("name")))) {
                return;
            }
        }
        Map<String, Object> nb = new LinkedHashMap<>();
        nb.put("name", name);
        nb.put("color", Theme.DEFAULT_BLOCK_COLOR);
        main.lib().blocks().add(nb);
        main.lib().setBlocks(main.lib().blocks());
    }

    private void ncEnsureGenre(String name) {
        if (!main.lib().genreNames().contains(name)) {
            Map<String, Object> ng = new LinkedHashMap<>();
            ng.put("name", name);
            ng.put("color", Theme.DEFAULT_GENRE_COLOR);
            main.lib().genres().add(ng);
            main.lib().setGenres(main.lib().genres());
        }
    }

    private static String noneToNull(String v) {
        return (v == null || v.isBlank() || NC_NONE.equals(v)) ? null : v;
    }

    private static void setVisibleManaged(Node n, boolean v) {
        n.setVisible(v);
        n.setManaged(v);
    }

    private void ncBatchBind() {
        List<String> allp = main.lib().scanMusic();
        List<String> toBind = new ArrayList<>();
        for (String p : allp) {
            if (!main.lib().neteaseBindings().containsKey(p)) {
                toBind.add(p);
            }
        }
        if (toBind.isEmpty()) {
            info("完成", "所有歌曲已绑定");
            return;
        }
        if (!confirm("确认", "将为 " + toBind.size() + " 首未绑定歌曲自动搜索绑定网易云ID，可能耗时较久，继续？")) {
            return;
        }
        bg(() -> {
            int bound = 0;
            for (int i = 0; i < toBind.size(); i++) {
                String p = toBind.get(i);
                SongInfo info = main.loadSongInfo(p);
                String kw = (info.artist + " " + info.title).strip();
                if (!kw.isEmpty()) {
                    try {
                        List<Map<String, Object>> r = main.nc().searchSong(kw, 1);
                        if (!r.isEmpty()) {
                            main.lib().neteaseBindings().put(p, String.valueOf(r.get(0).get("id")));
                            bound++;
                        }
                    } catch (Exception ignored) {
                    }
                }
                int fi = i + 1;
                int boundSnapshot = bound;
                Platform.runLater(() -> ncBatchStatus.setText("处理中 " + fi + "/" + toBind.size() + "... 已绑定 " + boundSnapshot));
            }
            main.lib().setNeteaseBindings(main.lib().neteaseBindings());
            int boundFinal = bound;
            Platform.runLater(() -> ncBatchStatus.setText("✅ 完成：绑定 " + boundFinal + "/" + toBind.size() + " 首"));
        });
    }

    private void ncBatchLyrics() {
        List<String[]> toProcess = new ArrayList<>();
        for (Map.Entry<String, String> e : main.lib().neteaseBindings().entrySet()) {
            if (new File(e.getKey()).exists()) {
                toProcess.add(new String[]{e.getKey(), e.getValue()});
            }
        }
        if (toProcess.isEmpty()) {
            info("完成", "没有已绑定ID的歌曲");
            return;
        }
        if (!confirm("确认", "将为 " + toProcess.size() + " 首已绑定歌曲从网易云获取歌词，继续？")) {
            return;
        }
        bg(() -> {
            int okCount = 0;
            for (int i = 0; i < toProcess.size(); i++) {
                String[] pn = toProcess.get(i);
                try {
                    String[] lrc = main.nc().fetchLyrics(pn[1]);
                    if (lrc != null) {
                        SongInfo info = main.loadSongInfo(pn[0]);
                        saveNeteaseLyrics(pn[0], lrc, info.artist, info.title);
                        okCount++;
                    }
                } catch (Exception ignored) {
                }
                int fi = i + 1;
                int okSnapshot = okCount;
                Platform.runLater(() -> ncBatchStatus.setText("导入歌词 " + fi + "/" + toProcess.size() + "... 完成 " + okSnapshot));
            }
            main.lib().saveLyrics();
            int okFinal = okCount;
            Platform.runLater(() -> ncBatchStatus.setText("✅ 歌词完成：" + okFinal + "/" + toProcess.size() + " 首"));
        });
    }

    // ── 均衡器面板 ──

    private Node buildEqPanel() {
        VBox container = vbox();
        container.getChildren().add(title("🎚️ 均衡器"));

        PlayerEngine eng = main.lib().player();
        if (!eng.eqAvailable()) {
            Label noEq = new Label("⚠ 当前 libvlc 未提供均衡器接口，本面板不可用。");
            noEq.getStyleClass().add("small");
            noEq.setWrapText(true);
            container.getChildren().add(noEq);
            return container;
        }

        eqOnCheck = new CheckBox("启用均衡器（10 段 + 前级）");
        eqOnCheck.setSelected(main.eqStore().on());
        eqOnCheck.setOnAction(e -> {
            main.eqStore().setOn(eqOnCheck.isSelected());
            main.eqStore().save();
            pushEqToEngine();
        });
        container.getChildren().add(eqOnCheck);

        eqCombo = new ComboBox<>();
        eqCombo.setMaxWidth(Double.MAX_VALUE);
        eqCombo.setOnAction(e -> onEqComboChanged());
        container.getChildren().add(field("预设：", eqCombo));

        eqSongLabel = new Label();
        eqSongLabel.getStyleClass().add("small");
        eqSongLabel.setWrapText(true);
        eqDirtyLabel = new Label();
        eqDirtyLabel.getStyleClass().add("small");
        eqDirtyLabel.setWrapText(true);
        container.getChildren().addAll(eqSongLabel, eqDirtyLabel);

        container.getChildren().add(groupTitle("调节区"));
        Label unitHint = new Label("单位 dB（-20 ~ +20），拖动实时生效；每段 0 dB 表示不改变该频段。"
                + "前级 12 dB 为中性（VLC 均衡器内部把干信号按 1/4 混合，需 12 dB 抵消），"
                + "调到 12 以下会整体变小声。");
        unitHint.getStyleClass().add("small");
        unitHint.setWrapText(true);
        container.getChildren().add(unitHint);

        List<Float> freqs = eng.eqBandFrequencies();
        if (freqs == null || freqs.size() < EqPreset.BANDS) {
            freqs = new ArrayList<>();
            for (float f : EqPreset.DEFAULT_FREQS) {
                freqs.add(f);
            }
        }

        HBox bandRow = new HBox(2);
        bandRow.setAlignment(Pos.CENTER);
        for (int i = 0; i < EqPreset.BANDS; i++) {
            final int idx = i;
            Label val = new Label("0.0");
            val.getStyleClass().add("small");
            val.setMinWidth(30);
            val.setPrefWidth(30);
            val.setAlignment(Pos.CENTER);
            eqBandValueLabels[i] = val;

            Slider s = new Slider(EqPreset.MIN_DB, EqPreset.MAX_DB, 0);
            s.setOrientation(Orientation.VERTICAL);
            s.setPrefHeight(170);
            s.setMinHeight(120);
            s.setMinWidth(22);
            s.setPrefWidth(26);
            s.setMaxWidth(30);
            s.setShowTickMarks(false);
            s.setShowTickLabels(false);
            s.valueProperty().addListener((o, a, b) -> {
                if (eqQuiet) {
                    return;
                }
                // 0.5 dB 步进
                double snapped = Math.round(b.doubleValue() * 2) / 2.0;
                if (Math.abs(snapped - b.doubleValue()) > 1e-6) {
                    s.setValue(snapped);
                    return;
                }
                eqBandValueLabels[idx].setText(fmtDb(snapped));
                onEqEdited();
            });
            eqSliders[i] = s;

            Label freq = new Label(EqPreset.freqLabel(freqs.get(i)));
            freq.getStyleClass().add("small");
            freq.setMinWidth(30);
            freq.setPrefWidth(30);
            freq.setAlignment(Pos.CENTER);

            VBox col = new VBox(2);
            col.setAlignment(Pos.CENTER);
            col.getChildren().addAll(val, s, freq);
            bandRow.getChildren().add(col);
        }
        ScrollPane bandScroll = new ScrollPane(bandRow);
        bandScroll.setFitToHeight(true);
        bandScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.AS_NEEDED);
        bandScroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        bandScroll.setPrefHeight(232);
        bandScroll.setMinHeight(232);
        container.getChildren().add(bandScroll);

        eqPreampSlider = new Slider(EqPreset.MIN_DB, EqPreset.MAX_DB, EqPreset.NEUTRAL_PREAMP);
        eqPreampSlider.setMaxWidth(Double.MAX_VALUE);
        eqPreampSlider.valueProperty().addListener((o, a, b) -> {
            if (eqQuiet) {
                return;
            }
            double snapped = Math.round(b.doubleValue() * 2) / 2.0;
            if (Math.abs(snapped - b.doubleValue()) > 1e-6) {
                eqPreampSlider.setValue(snapped);
                return;
            }
            eqPreampValue.setText(preampLabelText(snapped));
            onEqEdited();
        });
        eqPreampValue = new Label(preampLabelText(EqPreset.NEUTRAL_PREAMP));
        eqPreampValue.getStyleClass().add("small");
        container.getChildren().addAll(field("前级：", eqPreampSlider), eqPreampValue);

        HBox btnRow = new HBox(4);
        Button btnSave = new Button("💾 保存到预设");
        btnSave.setOnAction(e -> showEqSaveMenu(btnSave));
        Button btnReset = new Button("↩ 重置");
        btnReset.setOnAction(e -> resetEqDraft());
        Button btnZero = new Button("⟲ 归零");
        btnZero.setOnAction(e -> {
            eqDraft = new EqPreset();
            loadEqControlsFrom(eqDraft);
            pushEqToEngine();
            updateEqDirty();
        });
        btnRow.getChildren().addAll(btnSave, btnReset, btnZero);
        container.getChildren().add(btnRow);

        ScrollPane scroll = new ScrollPane(container);
        scroll.setFitToWidth(true);
        VBox w = vbox();
        w.getChildren().add(scroll);
        VBox.setVgrow(scroll, Priority.ALWAYS);

        initEqPanel();
        return w;
    }

    /** 面板首次构建 / 主题刷新重建时初始化选中项与滑块。 */
    private void initEqPanel() {
        if (eqDraft == null) {
            eqSongPath = main.currentSongPath();
            EqPreset song = main.eqStore().forSong(eqSongPath, main.neteaseIdFor(eqSongPath));
            selectEqTarget(song != null ? "song" : "global", "", false);
        } else {
            refreshEqComboQuiet();
            loadEqControlsFrom(eqDraft);
            updateEqDirty();
        }
        updateEqSongLabel();
    }

    /** 切换编辑目标（同时决定「正在生效」的参数）。 */
    private void selectEqTarget(String kind, String name, boolean applyNow) {
        eqTargetKind = kind;
        eqTargetName = name == null ? "" : name;
        EqPreset base = baselineOf(kind, eqTargetName);
        if (base == null) {
            base = main.eqStore().global().copy();
        }
        eqBaseline = base.copy();
        eqDraft = base.copy();
        refreshEqComboQuiet();
        loadEqControlsFrom(eqDraft);
        updateEqDirty();
        updateEqSongLabel();
        if (applyNow) {
            pushEqToEngine();
        }
    }

    /** 某个目标的已保存值。 */
    private EqPreset baselineOf(String kind, String name) {
        EqStore st = main.eqStore();
        switch (kind) {
            case "song": {
                EqPreset p = st.forSong(eqSongPath, main.neteaseIdFor(eqSongPath));
                // 这首歌还没有独立预设：以全局为起点（「重置」也回到这里）
                return p != null ? p : st.global().copy();
            }
            case "factory":
                return main.lib().player().eqFactoryPreset(name);
            case "user":
                return st.preset(name);
            case "global":
            default:
                return st.global().copy();
        }
    }

    private void onEqComboChanged() {
        if (eqQuiet || eqCombo == null) {
            return;
        }
        String v = eqCombo.getValue();
        if (v == null) {
            return;
        }
        if (EQ_NEW_ITEM.equals(v)) {
            createEqUserPreset();
            return;
        }
        eqSongPath = main.currentSongPath();
        if (EQ_SONG_ITEM.equals(v)) {
            selectEqTarget("song", "", true);
        } else if (EQ_GLOBAL_ITEM.equals(v)) {
            selectEqTarget("global", "", true);
        } else if (v.startsWith(EQ_FACTORY_PREFIX)) {
            selectEqTarget("factory", v.substring(EQ_FACTORY_PREFIX.length()), true);
        } else if (v.startsWith(EQ_USER_PREFIX)) {
            selectEqTarget("user", v.substring(EQ_USER_PREFIX.length()), true);
        }
    }

    /** 重建下拉列表并静默设回当前目标（不触发 onEqComboChanged）。 */
    private void refreshEqComboQuiet() {
        if (eqCombo == null) {
            return;
        }
        boolean prev = eqQuiet;
        eqQuiet = true;
        List<String> items = new ArrayList<>();
        items.add(EQ_SONG_ITEM);
        items.add(EQ_GLOBAL_ITEM);
        for (String f : main.lib().player().eqFactoryPresetNames()) {
            items.add(EQ_FACTORY_PREFIX + f);
        }
        for (String u : main.eqStore().presetNames()) {
            items.add(EQ_USER_PREFIX + u);
        }
        items.add(EQ_NEW_ITEM);
        eqCombo.getItems().setAll(items);
        eqCombo.setValue(eqDisplayOf(eqTargetKind, eqTargetName));
        eqQuiet = prev;
    }

    private static String eqDisplayOf(String kind, String name) {
        switch (kind) {
            case "song":
                return EQ_SONG_ITEM;
            case "factory":
                return EQ_FACTORY_PREFIX + name;
            case "user":
                return EQ_USER_PREFIX + name;
            case "global":
            default:
                return EQ_GLOBAL_ITEM;
        }
    }

    /** 把参数写进控件（静默，不触发保存 / 应用）。 */
    private void loadEqControlsFrom(EqPreset p) {
        boolean prev = eqQuiet;
        eqQuiet = true;
        for (int i = 0; i < EqPreset.BANDS; i++) {
            if (eqSliders[i] != null) {
                eqSliders[i].setValue(p.band(i));
            }
            if (eqBandValueLabels[i] != null) {
                eqBandValueLabels[i].setText(fmtDb(p.band(i)));
            }
        }
        if (eqPreampSlider != null) {
            eqPreampSlider.setValue(p.preamp());
        }
        if (eqPreampValue != null) {
            eqPreampValue.setText(preampLabelText(p.preamp()));
        }
        eqQuiet = prev;
    }

    /** 从控件读出草稿（拖滑块后草稿会偏离目标的已存值）。 */
    private void syncDraftFromControls() {
        EqPreset p = new EqPreset();
        for (int i = 0; i < EqPreset.BANDS; i++) {
            if (eqSliders[i] != null) {
                p.setBand(i, (float) eqSliders[i].getValue());
            }
        }
        if (eqPreampSlider != null) {
            p.setPreamp((float) eqPreampSlider.getValue());
        }
        eqDraft = p;
    }

    private void onEqEdited() {
        if (eqQuiet) {
            return;
        }
        syncDraftFromControls();
        pushEqToEngine();
        updateEqDirty();
    }

    private void pushEqToEngine() {
        if (eqDraft == null) {
            return;
        }
        main.lib().player().applyEq(eqDraft, main.eqStore().on());
    }

    private void updateEqDirty() {
        if (eqDirtyLabel == null) {
            return;
        }
        boolean dirty = eqDraft != null && eqBaseline != null && !eqDraft.sameAs(eqBaseline);
        eqDirtyLabel.setText(dirty ? "● 有未保存的改动（换曲或关闭程序会丢弃）" : "");
        eqDirtyLabel.setStyle("-fx-text-fill:" + main.c(dirty ? "WARNING" : "TEXT_MUTED") + ";");
    }

    private void updateEqSongLabel() {
        if (eqSongLabel == null) {
            return;
        }
        String path = main.currentSongPath();
        String title = path == null ? "" : main.getCachedTitle(path);
        StringBuilder sb = new StringBuilder();
        if ("song".equals(eqTargetKind)) {
            sb.append("正在编辑：单曲预设");
            sb.append(path == null ? "（未播放）" : " · 《" + title + "》");
        } else {
            sb.append("正在编辑：").append(eqDisplayOf(eqTargetKind, eqTargetName));
            if (path != null) {
                sb.append(" · 当前曲目《").append(title).append("》");
            }
        }
        sb.append("　已存单曲预设 ").append(main.eqStore().songCount()).append(" 首");
        if (!"song".equals(eqTargetKind) && path != null
                && main.eqStore().forSong(path, main.neteaseIdFor(path)) != null) {
            sb.append("\n⚠ 当前曲目有自己的单曲预设，改这里（全局）对它无效");
        }
        eqSongLabel.setText(sb.toString());
    }

    private void resetEqDraft() {
        if (eqBaseline == null) {
            return;
        }
        eqDraft = eqBaseline.copy();
        loadEqControlsFrom(eqDraft);
        pushEqToEngine();
        updateEqDirty();
    }

    private void showEqSaveMenu(Node anchor) {
        syncDraftFromControls();
        ContextMenu m = new ContextMenu();
        String cur = main.currentSongPath();
        MenuItem toSong = new MenuItem(cur == null ? "存到本曲预设（未播放）" : "存到本曲预设");
        toSong.setDisable(cur == null);
        toSong.setOnAction(e -> saveEqToSong());
        MenuItem toGlobal = new MenuItem("存到全局预设");
        toGlobal.setOnAction(e -> saveEqToGlobal());
        MenuItem toNew = new MenuItem("新建预设…");
        toNew.setOnAction(e -> createEqUserPreset());
        m.getItems().addAll(toSong, toGlobal, new SeparatorMenuItem(), toNew);
        m.show(anchor, Side.TOP, 0, 0);
    }

    private void saveEqToSong() {
        String path = main.currentSongPath();
        if (path == null) {
            warn("无法保存", "当前没有播放中的曲目。");
            return;
        }
        syncDraftFromControls();
        main.eqStore().saveSong(path, main.neteaseIdFor(path), eqDraft);
        main.eqStore().save();
        eqSongPath = path;
        eqTargetKind = "song";
        eqTargetName = "";
        eqBaseline = eqDraft.copy();
        refreshEqComboQuiet();
        updateEqDirty();
        updateEqSongLabel();
        info("已保存", "已保存为《" + main.getCachedTitle(path) + "》的单曲预设。\n"
                + "下次播放这首歌会自动切换到它。");
    }

    private void saveEqToGlobal() {
        syncDraftFromControls();
        main.eqStore().setGlobal(eqDraft);
        main.eqStore().save();
        eqTargetKind = "global";
        eqTargetName = "";
        eqBaseline = eqDraft.copy();
        refreshEqComboQuiet();
        updateEqDirty();
        updateEqSongLabel();
        info("已保存", "已保存为全局预设。");
    }

    private void createEqUserPreset() {
        syncDraftFromControls();
        TextInputDialog d = new TextInputDialog("我的预设");
        d.setTitle("新建预设");
        d.setHeaderText(null);
        d.setContentText("预设名称：");
        Optional<String> r = d.showAndWait();
        if (r.isEmpty() || r.get().isBlank()) {
            refreshEqComboQuiet();
            return;
        }
        String name = r.get().trim();
        main.eqStore().putPreset(name, eqDraft);
        main.eqStore().save();
        eqTargetKind = "user";
        eqTargetName = name;
        eqBaseline = eqDraft.copy();
        refreshEqComboQuiet();
        loadEqControlsFrom(eqDraft);
        updateEqDirty();
        updateEqSongLabel();
        info("已保存", "预设「" + name + "」已创建。");
    }

    /**
     * 换曲后同步均衡器面板：未保存的草稿静默丢弃，按「有单曲预设用单曲、
     * 否则用全局」重新决定目标（实际生效由 MainWindow 在 play() 前完成）。
     */
    public void syncEq() {
        String path = main.currentSongPath();
        if (path != null && path.equals(eqSongPath) && eqDraft != null) {
            // 同一首歌重播：保留草稿，并把草稿重新压回引擎
            // （MainWindow 已按已保存预设应用过一次，不重压会与界面不一致）
            pushEqToEngine();
            updateEqSongLabel();
            updateEqDirty();
            return;
        }
        eqSongPath = path;
        eqDraft = null;
        if (eqCombo == null) {
            return;
        }
        EqPreset song = main.eqStore().forSong(path, main.neteaseIdFor(path));
        selectEqTarget(song != null ? "song" : "global", "", false);
    }

    private static String fmtDb(double db) {
        return (db > 0.0001 ? "+" : "") + String.format(java.util.Locale.ROOT, "%.1f", db);
    }



    /** 前级标签：12 dB 标注成「中性」，因为那才是 VLC 里不改变音量的值。 */
    private static String preampLabelText(double db) {
        boolean neutral = Math.abs(db - EqPreset.NEUTRAL_PREAMP) < 0.05;
        return "前级 " + fmtDb(db) + " dB" + (neutral ? "（中性，不改变音量）" : "");
    }

    // ── 偏好（块 / 流派 / 歌手的平均评分）──

    /**
     * 💖 偏好：按平均评分给块 / 流派 / 歌手排名。
     *
     * <p>统计规则见 {@link PreferenceStats}：<b>0 分不计入</b>（既不算分子也不算分母），
     * 所以平均分不会被"没听过的歌"稀释；一首都没打分的分组不上榜。</p>
     */
    private Node buildPreferencesPanel() {
        VBox container = vbox();
        container.getChildren().add(title("💖 偏好"));

        Label hint = new Label("按平均评分给 块 / 流派 / 歌手 排名（满分 10 分）。"
                + "只统计打过分的歌 —— 0 分既不计入平均分、也不占分母，"
                + "所以这里的「平均分」就是你对这一类东西的真实口味，不会被没听过的歌稀释。");
        hint.getStyleClass().add("small");
        hint.setWrapText(true);

        prefDimCombo = new ComboBox<>();
        prefDimCombo.getItems().addAll("块", "流派", "歌手");
        prefDimCombo.setValue("块");
        prefDimCombo.setMaxWidth(Double.MAX_VALUE);
        prefDimCombo.setOnAction(e -> refreshPreferences());

        prefMinTwoCheck = new CheckBox("至少 2 首有评分才上榜（避免「一首封神」）");
        prefMinTwoCheck.setSelected(false);
        prefMinTwoCheck.setOnAction(e -> refreshPreferences());

        Button refresh = new Button("🔄 重新统计");
        refresh.setOnAction(e -> refreshPreferences());

        prefSummary = new Label("");
        prefSummary.getStyleClass().add("small");
        prefSummary.setWrapText(true);

        prefList = vbox();
        ScrollPane scroll = new ScrollPane(prefList);
        scroll.setFitToWidth(true);
        VBox.setVgrow(scroll, Priority.ALWAYS);

        container.getChildren().addAll(hint, prefDimCombo, prefMinTwoCheck, refresh, prefSummary, scroll);
        refreshPreferences();
        return container;
    }

    /** 重算并重画偏好榜。 */
    private void refreshPreferences() {
        if (prefList == null) {
            return;
        }
        PreferenceStats.Dimension dim = PreferenceStats.Dimension.ofLabel(
                prefDimCombo == null || prefDimCombo.getValue() == null ? "块" : prefDimCombo.getValue());
        List<String> paths = main.audioPaths == null ? List.of() : new ArrayList<>(main.audioPaths);
        int minRated = prefMinTwoCheck != null && prefMinTwoCheck.isSelected() ? 2 : 1;
        List<PreferenceStats.Row> rows = PreferenceStats.rank(dim, paths,
                main.lib().ratings(), main::getCachedArtist, minRated);

        int ratedSongs = 0;
        for (String p : paths) {
            Map<String, Object> ud = main.lib().ratings().get(p);
            if (num(ud, "score") > 0) {
                ratedSongs++;
            }
        }
        prefSummary.setText("共 " + paths.size() + " 首，其中 " + ratedSongs + " 首有评分；"
                + "下面按「" + dim.label + "」平均分排名（0 分不计入"
                + (minRated > 1 ? "，且只算 ≥2 首有评分的分组" : "") + "）");

        if (rows.isEmpty()) {
            Label empty = new Label("还没有打过分的歌 —— 先去播放区或歌曲编辑里给几首歌打分吧。");
            empty.getStyleClass().add("small");
            empty.setWrapText(true);
            prefList.getChildren().setAll(empty);
            return;
        }

        List<Node> nodes = new ArrayList<>();
        int rank = 0;
        for (PreferenceStats.Row row : rows) {
            rank++;
            Label name = new Label(rank + ". " + row.name());
            name.setMinWidth(104);
            name.setMaxWidth(104);
            name.getStyleClass().add("small");

            Region bar = new Region();
            bar.setPrefHeight(12);
            // 按满分 10 分给长度；最短 4px，免得 0.1 分的看不见
            bar.setPrefWidth(Math.max(4, 120 * Math.min(1.0, row.average() / 10.0)));
            bar.setStyle("-fx-background-color: " + ColorUtil.scoreToColor(row.average()) + ";"
                    + " -fx-background-radius: 6;");

            Label val = new Label(String.format("%.2f 分 · %d 首有评分 / 共 %d 首",
                    row.average(), row.ratedCount(), row.totalCount()));
            val.getStyleClass().add("small");

            HBox line = new HBox(6, name, bar, val);
            line.setAlignment(Pos.CENTER_LEFT);
            nodes.add(line);
        }
        prefList.getChildren().setAll(nodes);
    }

    // ── 设置 ──
    private Node buildSettingsPanel() {
        VBox container = vbox();
        container.getChildren().add(title("⚙️ 设置"));

        // 版本信息（置顶显示，进页面即可见）
        Label ver = new Label("📦 " + AppInfo.DISPLAY);
        ver.getStyleClass().add("title");
        Label verHint = new Label("当前版本 " + AppInfo.VERSION + "（" + AppInfo.EDITION + " 版）｜ 更新日志见 CHANGELOG.md");
        verHint.getStyleClass().add("small");
        verHint.setWrapText(true);
        container.getChildren().addAll(ver, verHint);

        Label themeGroup = new Label("🎨 主题配色");
        themeGroup.getStyleClass().add("title");
        container.getChildren().add(themeGroup);
        themeCombo = new ComboBox<>();
        themeCombo.getItems().addAll(Theme.THEME_PRESETS.keySet());
        themeCombo.setValue(main.themeName);
        container.getChildren().add(themeCombo);
        Button btnTheme = new Button("✨ 应用主题");
        btnTheme.getStyleClass().add("primary");
        btnTheme.setOnAction(e -> main.applyTheme(themeCombo.getValue(), true));
        container.getChildren().add(btnTheme);

        container.getChildren().add(groupTitle("🎨 控件不透明度"));
        Label opHint = new Label("调整面板 / 卡片 / 按钮的透明程度（100% 为完全不透明）");
        opHint.getStyleClass().add("small");
        opHint.setWrapText(true);
        container.getChildren().add(opHint);
        Label opVal = new Label(Math.round(main.uiOpacity * 100) + "%");
        opVal.getStyleClass().add("small");
        Slider opSlider = new Slider(0.2, 1.0, main.uiOpacity);
        opSlider.setShowTickMarks(false);
        opSlider.setShowTickLabels(false);
        opSlider.setMaxWidth(Double.MAX_VALUE);
        opSlider.valueProperty().addListener((o, a, b) -> {
            // 按 5% 步进刷新，避免拖动时反复重建样式表
            int pct = (int) Math.round(b.doubleValue() * 20) * 5;
            opVal.setText(pct + "%");
            double target = pct / 100.0;
            if (Math.abs(target - main.uiOpacity) >= 0.001) {
                main.setUiOpacity(target);
                opSlider.setValue(target);
            }
        });
        HBox opRow = field("透明度：", opSlider);
        container.getChildren().addAll(opRow, opVal);

        container.getChildren().add(groupTitle("⚡ 性能（省电）"));
        Label perfHint = new Label("把悬浮窗动画的重画频率从屏幕刷新率（通常 60fps）降到 30fps。"
                + "正弦伸缩是按真实时间算相位的，降帧只影响采样密度、不影响节奏；"
                + "每秒少提交一半的画面给系统合成器，这是笔记本上最实在的一块电。");
        perfHint.getStyleClass().add("small");
        perfHint.setWrapText(true);
        CheckBox lowFpsCheck = new CheckBox("动画 30fps（省电）");
        lowFpsCheck.setSelected(Config.getBool(main.lib().config(), "anim_low_fps", true));
        Label lowFpsState = new Label("点一下立即生效（下一帧就换节奏），不用重启");
        lowFpsState.getStyleClass().add("small");
        lowFpsState.setWrapText(true);
        lowFpsCheck.selectedProperty().addListener((o, a, b) -> {
            main.gifOverlay().setLowFps(b);
            lowFpsState.setText(b
                    ? "已切到 30fps：悬浮窗伸缩每秒少画一半的帧"
                    : "已切到 60fps：跟着屏幕刷新率画，最顺但更费电");
        });
        container.getChildren().addAll(perfHint, lowFpsCheck, lowFpsState);

        container.getChildren().add(groupTitle("歌曲备注显示"));
        noteCombo = new ComboBox<>();
        noteCombo.getItems().addAll("默认展开", "默认折叠", "仅显示备注");
        Map<String, String> noteMap = Map.of("expanded", "默认展开", "folded", "默认折叠", "note_only", "仅显示备注");
        noteCombo.setValue(noteMap.getOrDefault(main.noteDisplayMode, "默认展开"));
        container.getChildren().add(noteCombo);
        Button btnNote = new Button("保存备注设置");
        btnNote.setOnAction(e -> saveNoteSetting());
        container.getChildren().add(btnNote);

        container.getChildren().add(groupTitle("歌手显示"));
        artistCheck = new CheckBox("隐藏歌手");
        artistCheck.setSelected(main.artistHidden);
        container.getChildren().add(artistCheck);
        Button btnArtist = new Button("保存歌手设置");
        btnArtist.setOnAction(e -> saveArtistSetting());
        container.getChildren().add(btnArtist);

        container.getChildren().add(groupTitle("封面样式"));
        coverStyleCombo = new ComboBox<>();
        coverStyleCombo.getItems().addAll("🎵 圆形旋转", "🔲 方形静态");
        coverStyleCombo.setValue("circle_rotate".equals(main.coverStyle) ? "🎵 圆形旋转" : "🔲 方形静态");
        container.getChildren().add(coverStyleCombo);
        Button btnCover = new Button("应用封面样式");
        btnCover.setOnAction(e -> saveCoverStyle());
        container.getChildren().add(btnCover);

        container.getChildren().add(groupTitle("索引条显示"));
        indexCheck = new CheckBox("显示索引条");
        indexCheck.setSelected(main.showIndexHeaders);
        container.getChildren().add(indexCheck);
        Button btnIndex = new Button("保存索引条设置");
        btnIndex.setOnAction(e -> saveIndexSetting());
        container.getChildren().add(btnIndex);

        container.getChildren().add(groupTitle("📝 歌词显示"));
        Label lyricHint = new Label("同时作用于播放区三行歌词、桌面歌词与「歌词」面板；切换后立即生效。"
                + "「仅中文」在缺少翻译的行会回退显示原文。");
        lyricHint.getStyleClass().add("small");
        lyricHint.setWrapText(true);
        container.getChildren().add(lyricHint);
        lyricModeCombo = new ComboBox<>();
        lyricModeCombo.getItems().addAll(LYRIC_MODE_ITEMS);
        lyricModeCombo.setValue(MainWindow.lyricsModeDisplay(main.lyricsDisplayMode));
        lyricModeCombo.setOnAction(e -> main.setLyricsDisplayMode(
                LYRIC_MODE_INTERNAL.getOrDefault(lyricModeCombo.getValue(), Config.LYRICS_MODE_BILINGUAL)));
        container.getChildren().add(field("显示：", lyricModeCombo));

        container.getChildren().add(groupTitle("播放后端"));
        backendCombo = new ComboBox<>();
        backendCombo.getItems().add("vlc");
        backendCombo.setValue(com.potato.player.core.Config.getString(main.lib().config(), "backend", "vlc"));
        container.getChildren().add(backendCombo);
        Button btnBackend = new Button("应用后端");
        btnBackend.setOnAction(e -> saveBackend());
        container.getChildren().add(btnBackend);

        container.getChildren().add(groupTitle("下载音质"));
        dlBrCombo = new ComboBox<>();
        dlBrCombo.getItems().addAll(BR_OPTIONS);
        dlBrCombo.setValue(brDisplay(main.currentDlBr));
        dlBrCombo.setOnAction(e -> {
            main.currentDlBr = bitrateMap().getOrDefault(dlBrCombo.getValue(), 999000);
            main.lib().config().put("current_dl_br", main.currentDlBr);
            main.lib().saveConfig();
            if (ncBitrate != null) {
                ncBitrate.setValue(dlBrCombo.getValue());
            }
        });
        container.getChildren().add(dlBrCombo);

        container.getChildren().add(groupTitle("🖼️ 背景图片"));
        HBox bgRow = new HBox(4);
        Button btnBg = new Button("选择背景图");
        btnBg.setOnAction(e -> chooseBackground());
        Button btnBgClear = new Button("清除背景");
        btnBgClear.setOnAction(e -> {
            main.setBackgroundImage(null);
            main.lib().saveConfig();
        });
        bgRow.getChildren().addAll(btnBg, btnBgClear);
        container.getChildren().add(bgRow);

        container.getChildren().add(groupTitle("🖥 桌面歌词"));
        Label dlHint = new Label("悬浮置顶歌词窗：拖动移动、滚轮调字号、右键菜单可锁定/切换样式；"
                + "锁定后鼠标穿透到桌面，解锁入口在此页或播放区按钮。");
        dlHint.getStyleClass().add("small");
        dlHint.setWrapText(true);
        container.getChildren().add(dlHint);

        dlOnCheck = new CheckBox("显示桌面歌词（悬浮置顶窗口）");
        dlOnCheck.setSelected(main.desktopLyricsShowing());
        dlOnCheck.setOnAction(e -> main.setDesktopLyrics(dlOnCheck.isSelected()));
        container.getChildren().add(dlOnCheck);

        dlStyleCombo = new ComboBox<>();
        dlStyleCombo.getItems().addAll("描边文字（无底，最通透）", "半透明圆角底条");
        dlStyleCombo.setValue("bar".equals(main.desktopLyrics().styleMode())
                ? "半透明圆角底条" : "描边文字（无底，最通透）");
        dlStyleCombo.setOnAction(e -> main.desktopLyrics()
                .setStyleMode(dlStyleCombo.getValue().startsWith("半透明") ? "bar" : "text"));
        container.getChildren().add(field("样式：", dlStyleCombo));

        dlFontSpinner = new Spinner<>(14.0, 64.0, main.desktopLyrics().fontSize(), 1.0);
        dlFontSpinner.setEditable(true);
        dlFontSpinner.valueProperty().addListener((o, a, b) -> main.desktopLyrics().setFontSize(b));
        container.getChildren().add(field("字号：", dlFontSpinner));

        dlLockCheck = new CheckBox("锁定（鼠标穿透，不挡桌面点击）");
        dlLockCheck.setSelected(main.desktopLyrics().isLocked());
        dlLockCheck.setOnAction(e -> main.desktopLyrics().setLocked(dlLockCheck.isSelected()));
        container.getChildren().add(dlLockCheck);

        HBox dlBtnRow = new HBox(6);
        Button dlReset = new Button("↩ 重置位置");
        dlReset.setOnAction(e -> main.desktopLyrics().resetPosition());
        Button dlClose = new Button("✖ 关闭桌面歌词");
        dlClose.setOnAction(e -> main.setDesktopLyrics(false));
        dlBtnRow.getChildren().addAll(dlReset, dlClose);
        container.getChildren().add(dlBtnRow);

        container.getChildren().add(groupTitle("🎞 动图卡点"));
        Label gifHint = new Label("导入动图后单独弹出一个可拖动的置顶悬浮窗（和桌面歌词一样）。"
                + "支持 GIF / PNG / JPG，也支持 WebM / MP4 等视频（视频借 VLC 逐帧抓成动图，"
                + "几秒的片子后台解一两秒，解完自动换上）。"
                + "「纵向正弦伸缩」是个独立开关：图片高度随时间走一条纯正弦 —— "
                + "先从原高缩到 l×(1−Ay)，再涨到 l×(1+Ay)，回到原高，如此循环（T 默认 1 秒）；"
                + "每轮幅度完全相同，处处连续，没有任何跳变或额外效果。"
                + "「横向收放 Ax」和它共用同一条正弦但反相：拉到最高时横向收窄 Ax%、压到最矮时横向加宽 Ax%"
                + "（Ax = Ay 时横竖相乘一阶抵消、面积几乎不变，看着最 Q 弹）；横向以图心为轴对称，"
                + "Ax=0 时窗口尺寸与以前一模一样。"
                + "纵向锚点仍是「有内容的最底端」，钉住不动（透明留白不算底），静态图片也能用。"
                + "只在播放时动：暂停或停止会把姿态冻在原地（不重置也不归位）。"
                + "「跟拍卡点」把伸缩的一轮锁到拍点上：周期取「最接近你设的 T 的整数拍」"
                + "（整拍/半拍就是上面那个勾），拍点可以落在伸长峰或压缩谷上；"
                + "「第一拍落在哪儿、一拍到底多长」是<b>从音频里拟合出来的</b>"
                + "（每首歌的拍点存在 bpm.json，播放时发现没有会后台自动补），"
                + "所以换歌、拖进度条都会立刻重新对上，几百拍也不会走偏；"
                + "拟合不出来或觉得偏了，用下面的「🎯 重测」+「拍点微调」手动挪"
                + "（libvlc 报时会系统性滞后约 110ms，默认已预置 +110ms 抵消掉）；"
                + "锁的方式是每帧把相位往目标挪 2%，所以照样没有跳变。"
                + "当前歌曲没有 BPM、或没在播放时，就按 T 自由跑。动图循环同样会用这套整数拍规则。"
                + "悬浮窗上还能直接控歌：**双击 = 下一首，按住左右小幅快晃 = 上一首**，"
                + "鼠标停在图上时**空格 = 播放/暂停，方向键**：↑ 音量+并放大、↓ 音量−并缩小、"
                + "← 上一首、→ 下一首；"
                + "其余播放控制（播放/暂停、上下首、停止、音量、播放模式、桌面歌词、沉浸模式）"
                + "都在悬浮窗的右键菜单里。这一整套「特殊手势」可以在下面单独关掉。");
        gifHint.getStyleClass().add("small");
        gifHint.setWrapText(true);
        container.getChildren().add(gifHint);

        HBox gifImportRow = new HBox(6);
        Button gifImport = new Button("📂 导入动图…");
        gifImport.setOnAction(e -> importGif());
        gifToggleBtn = new Button("显示动图");
        gifToggleBtn.setOnAction(e -> toggleGif());
        gifImportRow.getChildren().addAll(gifImport, gifToggleBtn);
        container.getChildren().add(gifImportRow);

        gifInfo = new Label();
        gifInfo.getStyleClass().add("small");
        gifInfo.setWrapText(true);
        container.getChildren().add(gifInfo);

        gifGesturesCheck = new CheckBox("悬浮窗特殊手势：双击 = 下一首、按住左右晃动 = 上一首、"
                + "鼠标停在图上时 空格 = 播放/暂停、↑↓ = 音量+缩放、←→ = 上下一首");
        gifGesturesCheck.setWrapText(true);
        gifGesturesCheck.setSelected(main.gifOverlay().isGesturesOn());
        gifGesturesCheck.setOnAction(e -> main.gifOverlay().setGesturesOn(gifGesturesCheck.isSelected()));
        container.getChildren().add(gifGesturesCheck);

        gifIntBeatCheck = new CheckBox("只用整拍（每圈都踩在正拍上；动图循环与伸缩卡点共用）");
        gifIntBeatCheck.setSelected(main.gifOverlay().isIntegerBeats());
        gifIntBeatCheck.setOnAction(e -> {
            main.gifOverlay().setIntegerBeats(gifIntBeatCheck.isSelected());
            syncGif();
        });
        container.getChildren().add(gifIntBeatCheck);

        gifStretchCheck = new CheckBox("纵向正弦伸缩（纯正弦、无跳变）");
        gifStretchCheck.setSelected(main.gifOverlay().isStretchOn());
        gifStretchCheck.setOnAction(e -> {
            main.gifOverlay().setStretchOn(gifStretchCheck.isSelected());
            syncGif();
        });
        container.getChildren().add(gifStretchCheck);

        gifStretchPeriodSpinner = new Spinner<>(0.2, 6.0,
                main.gifOverlay().stretchPeriod(), 0.1);
        gifStretchPeriodSpinner.setEditable(true);
        gifStretchPeriodSpinner.valueProperty().addListener(
                (o, a, b) -> main.gifOverlay().setStretchPeriod(b));
        Label secUnit0 = new Label("秒一轮");
        secUnit0.getStyleClass().add("small");
        HBox periodRow = new HBox(6, gifStretchPeriodSpinner, secUnit0);
        periodRow.setAlignment(Pos.CENTER_LEFT);
        container.getChildren().add(field("周期：", periodRow));

        // ── 跟拍卡点：把伸缩的一轮锁到拍点上 ──
        gifBeatLockCheck = new CheckBox("跟拍卡点（有 BPM 时把一轮锁到拍点上，T 当目标时长）");
        gifBeatLockCheck.setSelected(main.gifOverlay().isBeatLock());
        gifBeatLockCheck.setOnAction(e -> {
            main.gifOverlay().setBeatLock(gifBeatLockCheck.isSelected());
            syncGif();
        });
        container.getChildren().add(gifBeatLockCheck);

        gifBeatOnCombo = new ComboBox<>();
        gifBeatOnCombo.getItems().addAll("伸长（拉到最高）", "压缩（压到最矮）");
        gifBeatOnCombo.getSelectionModel().select(main.gifOverlay().isBeatOnPeak() ? 0 : 1);
        gifBeatOnCombo.setOnAction(e -> {
            main.gifOverlay().setBeatOnPeak(
                    gifBeatOnCombo.getSelectionModel().getSelectedIndex() == 0);
            syncGif();
        });
        container.getChildren().add(field("拍点落在：", gifBeatOnCombo));

        gifBeatTrimSpinner = new Spinner<>(-400.0, 400.0,
                main.gifOverlay().beatTrim(), 10.0);
        gifBeatTrimSpinner.setEditable(true);
        gifBeatTrimSpinner.valueProperty().addListener(
                (o, a, b) -> main.gifOverlay().setBeatTrim(b));
        Label trimUnit = new Label("ms（正 = 动画提前；libvlc 报时系统性滞后约 110ms，已预置 +110）");
        trimUnit.getStyleClass().add("small");
        HBox trimRow = new HBox(6, gifBeatTrimSpinner, trimUnit);
        trimRow.setAlignment(Pos.CENTER_LEFT);
        container.getChildren().add(field("拍点微调：", trimRow));

        // 自动拟合出的相位万一不对（节奏模糊 / 反拍比正拍响），给一个手动重测的出口
        Button gifGridBtn = new Button("🎯 重测当前歌的拍点");
        gifGridBtn.setOnAction(e -> {
            if (!main.gifOverlay().remeasureGrid()) {
                warn("测不了", "当前没有歌曲，或这首歌还没有 BPM（先在歌曲编辑里分析/填一个）。");
                return;
            }
            syncGif();
        });
        container.getChildren().add(gifGridBtn);

        // Ay = 竖直振幅，独立设置项：高度在 l·(1±Ay) 之间摆动
        gifAmpYSpinner = new Spinner<>(0.0, 100.0,
                main.gifOverlay().ampY() * 100, 1.0);
        gifAmpYSpinner.setEditable(true);
        gifAmpYSpinner.valueProperty().addListener(
                (o, a, b) -> main.gifOverlay().setAmpY(b / 100.0));
        Label pct = new Label("%（高度在 l×(1±Ay) 之间）");
        pct.getStyleClass().add("small");
        HBox ampRow = new HBox(6, gifAmpYSpinner, pct);
        ampRow.setAlignment(Pos.CENTER_LEFT);
        container.getChildren().add(field("竖直振幅 Ay：", ampRow));

        // Ax = 横向收放，和 Ay 共用相位但反相：伸长时收窄、压缩时加宽
        gifAmpXSpinner = new Spinner<>(0.0, 100.0,
                main.gifOverlay().ampX() * 100, 1.0);
        gifAmpXSpinner.setEditable(true);
        gifAmpXSpinner.valueProperty().addListener(
                (o, a, b) -> main.gifOverlay().setAmpX(b / 100.0));
        Label pctX = new Label("%（伸长时收窄 Ax%、压缩时加宽 Ax%）");
        pctX.getStyleClass().add("small");
        HBox ampXRow = new HBox(6, gifAmpXSpinner, pctX);
        ampXRow.setAlignment(Pos.CENTER_LEFT);
        container.getChildren().add(field("横向收放 Ax：", ampXRow));

        gifWidthSpinner = new Spinner<>(64.0, 1200.0, main.gifOverlay().width(), 10.0);
        gifWidthSpinner.setEditable(true);
        gifWidthSpinner.valueProperty().addListener((o, a, b) -> main.gifOverlay().setWidth(b));
        container.getChildren().add(field("宽度：", gifWidthSpinner));

        gifLockCheck = new CheckBox("锁定（鼠标穿透，不挡桌面点击）");
        gifLockCheck.setSelected(main.gifOverlay().isLocked());
        gifLockCheck.setOnAction(e -> main.gifOverlay().setLocked(gifLockCheck.isSelected()));
        container.getChildren().add(gifLockCheck);

        HBox gifBtnRow = new HBox(6);
        Button gifResetBtn = new Button("↩ 重置位置");
        gifResetBtn.setOnAction(e -> main.gifOverlay().resetPosition());
        Button gifClearBtn = new Button("🗑 移除动图");
        gifClearBtn.setOnAction(e -> {
            main.gifOverlay().clear();
            syncGif();
        });
        gifBtnRow.getChildren().addAll(gifResetBtn, gifClearBtn);
        container.getChildren().add(gifBtnRow);
        syncGif();

        // ── 🐾 桌宠 · 迷迭香 ──
        container.getChildren().add(groupTitle("🐾 桌宠 · 迷迭香"));
        Label petHint = new Label("把明日方舟基建模型「迷迭香」放到桌面上：会自己溜达、坐下、睡觉，"
                + "点一下会跟你打招呼，按住能拖到任意位置，滚轮缩放，右键有菜单。"
                + "素材是离线烘焙的帧序列（Spine 3.5 基建模型 → PNG，带透明通道），"
                + "放在工程目录的 pets/rosmontis/ 下（不进公开仓库）；"
                + "换机器/丢了素材可以运行 tools/bake-pet.mjs 重新烘焙。");
        petHint.getStyleClass().add("small");
        petHint.setWrapText(true);
        container.getChildren().add(petHint);

        petShowCheck = new CheckBox("显示桌宠（迷迭香）");
        petShowCheck.setSelected(main.petShowing());
        petShowCheck.setOnAction(e -> {
            boolean want = petShowCheck.isSelected();
            if (want && !main.setPet(true)) {
                petShowCheck.setSelected(false);
                if (petState != null) {
                    petState.setText("⚠️ 没找到桌宠素材（pets/rosmontis）：先运行 tools/bake-pet.mjs。");
                }
                return;
            }
            if (!want) {
                main.setPet(false);
            }
            syncPet();
        });
        container.getChildren().add(petShowCheck);

        petState = new Label();
        petState.getStyleClass().add("small");
        petState.setWrapText(true);
        container.getChildren().add(petState);

        petSizeSpinner = new Spinner<>(70.0, 420.0, 150.0, 10.0);
        petSizeSpinner.setEditable(true);
        petSizeSpinner.valueProperty().addListener((o, a, b) -> main.pet().setPetWidth(b));
        container.getChildren().add(field("大小（像素）：", petSizeSpinner));

        petSpeedSpinner = new Spinner<>(10.0, 220.0, 55.0, 5.0);
        petSpeedSpinner.setEditable(true);
        petSpeedSpinner.valueProperty().addListener((o, a, b) -> main.pet().setSpeed(b));
        container.getChildren().add(field("散步速度（像素/秒）：", petSpeedSpinner));

        petAutoCheck = new CheckBox("自己走动（会溜达、坐下、睡觉）");
        petAutoCheck.setOnAction(e -> main.pet().setAutoMove(petAutoCheck.isSelected()));
        container.getChildren().add(petAutoCheck);

        petThroughCheck = new CheckBox("鼠标穿透（点不到她，右键菜单也会一起关掉）");
        petThroughCheck.setDisable(!MacWindowClickThrough.isAvailable());
        petThroughCheck.setOnAction(e -> main.pet().setClickThrough(petThroughCheck.isSelected()));
        container.getChildren().add(petThroughCheck);

        HBox petBtnRow = new HBox(6);
        Button petHello = new Button("👋 打个招呼");
        petHello.setOnAction(e -> main.pet().greet());
        Button petGround = new Button("⬇️ 回到地面");
        petGround.setOnAction(e -> main.pet().resetToGround());
        Button petReload = new Button("🔄 重新加载素材");
        petReload.setOnAction(e -> {
            java.io.File dir = com.potato.player.core.PetAssets.resolveDir(main.lib().config(),
                    DesktopPet.CHAR_ID);
            if (!main.pet().reloadAssets(dir)) {
                petState.setText("⚠️ 这个目录里没有可用素材：" + dir);
            }
            syncPet();
        });
        petBtnRow.getChildren().addAll(petHello, petGround, petReload);
        container.getChildren().add(petBtnRow);
        syncPet();

        // ── 🌫 屏幕起雾（测试功能，默认关）──
        container.getChildren().add(groupTitle("🌫 屏幕起雾（测试功能）"));
        Label fogHint = new Label("放歌的时候屏幕会慢慢「起雾」，像冬天玻璃上凝的那层；想看清楚就得拿上面那个小动图"
                + "在雾上来回擦 —— 擦过的地方会露出来，但过一会儿又会重新雾上。"
                + "雾层是全屏透明+鼠标穿透的，不挡点桌面和其它应用；默认关闭。");
        fogHint.getStyleClass().add("small");
        fogHint.setWrapText(true);

        CheckBox fogCheck = new CheckBox("启用屏幕起雾（测试）");
        fogCheck.setSelected(main.fogOverlay().isOn());
        Label fogState = new Label("");
        fogState.getStyleClass().add("small");
        fogState.setWrapText(true);
        fogCheck.setOnAction(e -> {
            boolean want = fogCheck.isSelected();
            if (!main.fogOverlay().setOn(want)) {
                fogCheck.setSelected(false);
                fogState.setText("⚠️ 这台机器上拿不到「鼠标穿透」能力，为避免整屏点不动，起雾没有开启。");
                return;
            }
            if (want && !main.gifOverlayShowing()) {
                fogState.setText("已开启，但小动图现在是关着的 —— 先把「动图卡点」里的图显示出来才能擦。");
            } else {
                fogState.setText(want ? "已开启：现在开始起雾，拖小动图擦。" : "已关闭。");
            }
        });
        container.getChildren().addAll(fogHint, fogCheck, fogState);

        // 铺满时间
        Label fogFillVal = new Label(Math.round(main.fogOverlay().fillSeconds()) + " 秒");
        fogFillVal.getStyleClass().add("small");
        Slider fogFillSlider = new Slider(FogOverlay.FILL_MIN_SEC, FogOverlay.FILL_MAX_SEC,
                main.fogOverlay().fillSeconds());
        fogFillSlider.setMaxWidth(Double.MAX_VALUE);
        fogFillSlider.valueProperty().addListener((o, a, b) -> {
            double v = Math.round(b.doubleValue() / 5.0) * 5.0;
            fogFillVal.setText((long) v + " 秒");
            main.fogOverlay().setFillSeconds(v);
        });
        container.getChildren().addAll(field("铺满整屏要多久：", fogFillSlider), fogFillVal);

        // 浓度上限
        Label fogAlphaVal = new Label(Math.round(main.fogOverlay().maxAlpha() * 100) + "%");
        fogAlphaVal.getStyleClass().add("small");
        Slider fogAlphaSlider = new Slider(10, 90, main.fogOverlay().maxAlpha() * 100);
        fogAlphaSlider.setMaxWidth(Double.MAX_VALUE);
        fogAlphaSlider.valueProperty().addListener((o, a, b) -> {
            int v = (int) (Math.round(b.doubleValue() / 5.0) * 5.0);
            fogAlphaVal.setText(v + "%");
            main.fogOverlay().setMaxAlpha(v / 100.0);
        });
        container.getChildren().addAll(field("最浓时的不透明度：", fogAlphaSlider), fogAlphaVal);

        // 擦除力度
        Label fogWipeVal = new Label(Math.round(main.fogOverlay().wipeStrength() * 100) + "%");
        fogWipeVal.getStyleClass().add("small");
        Slider fogWipeSlider = new Slider(10, 100, main.fogOverlay().wipeStrength() * 100);
        fogWipeSlider.setMaxWidth(Double.MAX_VALUE);
        fogWipeSlider.valueProperty().addListener((o, a, b) -> {
            int v = (int) (Math.round(b.doubleValue() / 5.0) * 5.0);
            fogWipeVal.setText(v + "%（越小越要来回擦）");
            main.fogOverlay().setWipeStrength(v / 100.0);
        });
        container.getChildren().addAll(field("一把擦掉多少：", fogWipeSlider), fogWipeVal);

        // 擦除半径
        Label fogRadiusVal = new Label(String.format("%.1f 倍小动图宽", main.fogOverlay().wipeScale()));
        fogRadiusVal.getStyleClass().add("small");
        Slider fogRadiusSlider = new Slider(20, 250, main.fogOverlay().wipeScale() * 100);
        fogRadiusSlider.setMaxWidth(Double.MAX_VALUE);
        fogRadiusSlider.valueProperty().addListener((o, a, b) -> {
            double v = Math.round(b.doubleValue() / 10.0) / 10.0;
            fogRadiusVal.setText(String.format("%.1f 倍小动图宽", v));
            main.fogOverlay().setWipeScale(v);
        });
        container.getChildren().addAll(field("擦除半径：", fogRadiusSlider), fogRadiusVal);

        HBox fogBtnRow = new HBox(6);
        Button fogNowBtn = new Button("🌫 立刻铺满");
        fogNowBtn.setOnAction(e -> {
            main.fogOverlay().setOn(true);
            main.fogOverlay().fogNow();
            fogCheck.setSelected(true);
            fogState.setText("已铺满（调试用）。");
        });
        Button fogClearBtn = new Button("🧽 一键清雾");
        fogClearBtn.setOnAction(e -> main.fogOverlay().clearFog());
        fogBtnRow.getChildren().addAll(fogNowBtn, fogClearBtn);
        container.getChildren().add(fogBtnRow);

        container.getChildren().add(groupTitle("工具"));
        Button btnRescan = new Button("🔄 刷新歌曲库");
        btnRescan.setOnAction(e -> rescan());
        container.getChildren().add(btnRescan);

        Label bpmHint = new Label("逐首分析速度 + 拍点（每首约 0.7 秒，全库几百首约几分钟）。"
                + "「拍点」= 第一拍落在哪儿 + 一拍精确多长，动图/弹簧卡点靠它才踩得到拍上；"
                + "进度和「停止」在「⏳ 任务」面板里看；手动改过的 BPM 不会被覆盖（只补拍点）。");
        bpmHint.getStyleClass().add("small");
        bpmHint.setWrapText(true);
        container.getChildren().add(bpmHint);
        CheckBox bpmRedo = new CheckBox("重新分析已有的（默认只补缺 BPM / 缺拍点的）");
        container.getChildren().add(bpmRedo);
        Button btnBpmScan = new Button("⚡ 扫描全库 BPM");
        btnBpmScan.setOnAction(e -> startBpmScan(bpmRedo.isSelected()));
        container.getChildren().add(btnBpmScan);
        taskBpmInfo = new Label();
        taskBpmInfo.getStyleClass().add("small");
        taskBpmInfo.setWrapText(true);
        updateTaskBpmInfo();
        container.getChildren().add(taskBpmInfo);

        Button btnBatchLyrics = new Button("📝 批量导入歌词(.lrc)");
        btnBatchLyrics.setOnAction(e -> batchImportLyrics());
        container.getChildren().add(btnBatchLyrics);
        Button btnBatchDelete = new Button("🗑 批量删除歌曲");
        btnBatchDelete.getStyleClass().add("danger");
        btnBatchDelete.setOnAction(e -> batchDeleteSongs());
        container.getChildren().add(btnBatchDelete);

        ScrollPane scroll = new ScrollPane(container);
        scroll.setFitToWidth(true);
        VBox w = vbox();
        w.getChildren().add(scroll);
        VBox.setVgrow(scroll, Priority.ALWAYS);
        return w;
    }

    private Label groupTitle(String text) {
        Label l = new Label(text);
        l.getStyleClass().add("title");
        return l;
    }

    private void saveNoteSetting() {
        Map<String, String> map = Map.of("默认展开", "expanded", "默认折叠", "folded", "仅显示备注", "note_only");
        main.noteDisplayMode = map.getOrDefault(noteCombo.getValue(), "expanded");
        main.lib().config().put("note_display_mode", main.noteDisplayMode);
        main.lib().saveConfig();
        main.libraryPanel.refresh();
    }

    private void saveArtistSetting() {
        main.artistHidden = artistCheck.isSelected();
        main.lib().config().put("artist_hidden", main.artistHidden);
        main.lib().saveConfig();
        main.libraryPanel.refresh();
    }

    private void saveCoverStyle() {
        main.coverStyle = "🎵 圆形旋转".equals(coverStyleCombo.getValue()) ? "circle_rotate" : "square_static";
        main.lib().config().put("cover_style", main.coverStyle);
        main.lib().saveConfig();
        main.coverOriginalImage = null;
        main.playbackPanel.refreshTheme();
        main.playbackPanel.refreshCurrentSong();
    }

    private void saveIndexSetting() {
        main.showIndexHeaders = indexCheck.isSelected();
        main.lib().config().put("show_index_headers", main.showIndexHeaders);
        main.lib().saveConfig();
        main.libraryPanel.refresh();
    }

    private void saveBackend() {
        String val = backendCombo.getValue();
        main.lib().config().put("backend", val);
        main.lib().saveConfig();
        info("已应用", "后端已切换为 " + val);
    }

    private void chooseBackground() {
        FileChooser fc = new FileChooser();
        fc.setTitle("选择背景图片");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("图片", "*.jpg", "*.jpeg", "*.png", "*.bmp", "*.webp"));
        File f = fc.showOpenDialog(mainStage());
        if (f != null) {
            main.setBackgroundImage(f.getAbsolutePath());
            main.lib().saveConfig();
        }
    }

    private void rescan() {
        main.audioPaths = main.lib().scanMusic();
        main.libraryPanel.refresh();
        info("已刷新", "音乐库已刷新");
    }

    private void batchImportLyrics() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("选择包含 .lrc 文件的文件夹");
        File folder = dc.showDialog(mainStage());
        if (folder == null) {
            return;
        }
        Map<String, String> lrcFiles = new HashMap<>();
        File[] files = folder.listFiles();
        if (files != null) {
            for (File f : files) {
                String n = f.getName();
                if (n.endsWith(".lrc") && !n.endsWith(".trans.lrc")) {
                    lrcFiles.put(n.substring(0, n.length() - 4), f.getAbsolutePath());
                }
            }
        }
        int imported = 0;
        java.util.Set<String> matched = new java.util.HashSet<>();
        for (String path : main.audioPaths) {
            String musicName = new File(path).getName();
            int dot = musicName.lastIndexOf('.');
            if (dot > 0) {
                musicName = musicName.substring(0, dot);
            }
            String matchedSrc = null;
            if (lrcFiles.containsKey(musicName)) {
                matchedSrc = lrcFiles.get(musicName);
            } else {
                SongInfo info = main.loadSongInfo(path);
                String title = info.title.strip();
                String artist = info.artist.strip();
                String key = (!artist.isEmpty() && !title.isEmpty()) ? artist + " - " + title : title;
                if (!key.isEmpty() && lrcFiles.containsKey(key)) {
                    matchedSrc = lrcFiles.get(key);
                }
            }
            if (matchedSrc != null) {
                List<SongInfo.LrcLine> data = com.potato.player.core.LrcParser.parseLrcFile(matchedSrc, null);
                if (!data.isEmpty()) {
                    main.lib().lyrics().put(path, data);
                    imported++;
                    matched.add(matchedSrc);
                }
            }
        }
        for (String src : matched) {
            try {
                File dst = new File(Paths.LYRICS_DIR, new File(src).getName());
                Files.move(new File(src).toPath(), dst.toPath(), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
            }
        }
        main.lib().saveLyrics();
        info("批量导入歌词", "成功导入 " + imported + " 首歌词，剩余 " + (lrcFiles.size() - matched.size()) + " 个文件未匹配");
    }

    private void batchDeleteSongs() {
        if (main.selectedPaths.isEmpty()) {
            info("提示", "请先在左边栏选择要删除的歌曲");
            return;
        }
        List<String> sel = new ArrayList<>(main.selectedPaths);
        if (!confirm("确认", "确定要删除选中的 " + sel.size() + " 首歌曲吗？（此操作不可恢复！）")) {
            return;
        }
        int deleted = 0;
        for (String p : sel) {
            try {
                Files.deleteIfExists(new File(p).toPath());
                main.lib().ratings().remove(p);
                main.lib().lyrics().remove(p);
                main.playlist.remove(p);
                deleted++;
            } catch (IOException ignored) {
            }
        }
        main.audioPaths = main.lib().scanMusic();
        main.selectedPaths.clear();
        main.lib().saveRatings();
        main.lib().saveLyrics();
        main.libraryPanel.refresh();
        refreshPlaylist();
        info("完成", "已删除 " + deleted + " 首歌曲");
    }

    // ── 刷新入口 ──
    public void refreshCurrentSong() {
        // 无操作（与原版一致）
    }

    /** 桌面歌词开关/锁定变化后同步设置页控件（面板未构建时自动忽略）。 */
    public void syncDesktopLyrics() {
        if (dlOnCheck != null) {
            dlOnCheck.setSelected(main.desktopLyricsShowing());
        }
        if (dlLockCheck != null) {
            dlLockCheck.setSelected(main.desktopLyrics().isLocked());
        }
        if (dlFontSpinner != null) {
            dlFontSpinner.getValueFactory().setValue(main.desktopLyrics().fontSize());
        }
        if (dlStyleCombo != null) {
            dlStyleCombo.setValue("bar".equals(main.desktopLyrics().styleMode())
                    ? "半透明圆角底条" : "描边文字（无底，最通透）");
        }
    }

    // ── 动图卡点 ──

    /** 导入动图（GIF 动图 / PNG·JPG 静态图 / WebM·MP4 等视频）并立即显示。 */
    private void importGif() {
        FileChooser fc = new FileChooser();
        fc.setTitle("导入动图");
        fc.getExtensionFilters().addAll(
                new FileChooser.ExtensionFilter("动图 / 图片 / 视频",
                        "*.gif", "*.png", "*.jpg", "*.jpeg",
                        "*.webm", "*.mp4", "*.m4v", "*.mov", "*.mkv", "*.avi", "*.wmv", "*.flv"),
                new FileChooser.ExtensionFilter("视频（WebM 等）",
                        "*.webm", "*.mp4", "*.m4v", "*.mov", "*.mkv", "*.avi", "*.wmv", "*.flv"),
                new FileChooser.ExtensionFilter("图片", "*.gif", "*.png", "*.jpg", "*.jpeg"),
                new FileChooser.ExtensionFilter("全部文件", "*.*"));
        File f = fc.showOpenDialog(mainStage());
        if (f == null) {
            return;
        }
        if (!main.gifOverlay().load(f)) {
            warn("导入失败", "读不了这个文件：" + f.getName()
                    + "\n（支持 GIF / PNG / JPG 图片，以及 WebM / MP4 等视频；"
                    + "单边超过 4096 像素或像素总量过大的动图会被拒绝）");
            return;
        }
        main.setGifOverlay(true);
        syncGif();
        if (com.potato.player.core.VideoFrames.isVideo(f) && gifInfo != null) {
            // 视频动图是后台抓帧（一两秒），这里给个行内提示，不弹模态框
            // 解完 GifOverlay 会回调 syncGif()，把这一行换回真实的帧数信息
            gifInfo.setText("正在解码视频动图：" + f.getName()
                    + "（借 VLC 抓帧，几秒的片子约 1~2 秒；进度见「任务」面板）");
        }
    }

    /** 显示/隐藏动图悬浮窗（没导入过就先提示导入）。 */
    private void toggleGif() {
        if (main.gifOverlayShowing()) {
            main.setGifOverlay(false);
            return;
        }
        if (!main.setGifOverlay(true)) {
            info("还没有动图", "先点「📂 导入动图…」选一个文件（GIF / PNG / JPG，或 WebM / MP4 等视频）。");
            return;
        }
        syncGif();
    }

    /** 动图开关 / 导入 / 尺寸变化后同步设置页控件（面板未构建时忽略）。 */
    public void syncGif() {
        if (gifToggleBtn == null) {
            return;
        }
        boolean has = main.gifOverlay().hasGif();
        gifToggleBtn.setText(main.gifOverlayShowing() ? "隐藏动图" : "显示动图");
        gifToggleBtn.setDisable(!has);
        if (gifInfo != null) {
            gifInfo.setText(main.gifOverlay().infoLine());
        }
        if (gifWidthSpinner != null) {
            double w = main.gifOverlay().width();
            if (Math.abs(gifWidthSpinner.getValue() - w) > 0.01) {
                gifWidthSpinner.getValueFactory().setValue(w);
            }
        }
        if (gifLockCheck != null) {
            gifLockCheck.setSelected(main.gifOverlay().isLocked());
        }
        if (gifGesturesCheck != null) {
            gifGesturesCheck.setSelected(main.gifOverlay().isGesturesOn());
        }
        if (gifIntBeatCheck != null) {
            gifIntBeatCheck.setSelected(main.gifOverlay().isIntegerBeats());
        }
        if (gifStretchCheck != null) {
            gifStretchCheck.setSelected(main.gifOverlay().isStretchOn());
        }
        if (gifStretchPeriodSpinner != null) {
            double period = main.gifOverlay().stretchPeriod();
            if (Math.abs(gifStretchPeriodSpinner.getValue() - period) > 0.001) {
                gifStretchPeriodSpinner.getValueFactory().setValue(period);
            }
        }
        if (gifAmpYSpinner != null) {
            double pctNow = main.gifOverlay().ampY() * 100;
            if (Math.abs(gifAmpYSpinner.getValue() - pctNow) > 0.01) {
                gifAmpYSpinner.getValueFactory().setValue(pctNow);
            }
        }
        if (gifAmpXSpinner != null) {
            double pctNowX = main.gifOverlay().ampX() * 100;
            if (Math.abs(gifAmpXSpinner.getValue() - pctNowX) > 0.01) {
                gifAmpXSpinner.getValueFactory().setValue(pctNowX);
            }
        }
        if (gifBeatLockCheck != null) {
            gifBeatLockCheck.setSelected(main.gifOverlay().isBeatLock());
        }
        if (gifBeatOnCombo != null) {
            gifBeatOnCombo.getSelectionModel().select(main.gifOverlay().isBeatOnPeak() ? 0 : 1);
        }
        if (gifBeatTrimSpinner != null) {
            double trimNow = main.gifOverlay().beatTrim();
            if (Math.abs(gifBeatTrimSpinner.getValue() - trimNow) > 0.01) {
                gifBeatTrimSpinner.getValueFactory().setValue(trimNow);
            }
        }
    }

    /** 桌宠状态变化后同步设置页控件（面板未构建时忽略）。 */
    public void syncPet() {
        if (petShowCheck == null) {
            return;
        }
        DesktopPet pet = main.petIfAny();
        boolean showing = main.petShowing();
        petShowCheck.setSelected(showing);
        if (petSizeSpinner != null) {
            double w = pet != null ? pet.petWidth() : com.potato.player.core.Config.getDouble(
                    main.lib().config(), "pet_width", 150);
            if (Math.abs(petSizeSpinner.getValue() - w) > 0.01) {
                petSizeSpinner.getValueFactory().setValue(w);
            }
        }
        if (petSpeedSpinner != null) {
            double v = pet != null ? pet.speed() : com.potato.player.core.Config.getDouble(
                    main.lib().config(), "pet_speed", 55);
            if (Math.abs(petSpeedSpinner.getValue() - v) > 0.01) {
                petSpeedSpinner.getValueFactory().setValue(v);
            }
        }
        if (petAutoCheck != null) {
            petAutoCheck.setSelected(pet != null ? pet.isAutoMove()
                    : com.potato.player.core.Config.getBool(main.lib().config(), "pet_auto", true));
        }
        if (petThroughCheck != null) {
            petThroughCheck.setSelected(pet != null ? pet.isClickThrough()
                    : com.potato.player.core.Config.getBool(main.lib().config(), "pet_click_through", false));
        }
        if (petState == null) {
            return;
        }
        java.io.File dir = pet != null ? pet.assetDir()
                : com.potato.player.core.PetAssets.resolveDir(main.lib().config(), DesktopPet.CHAR_ID);
        if (!com.potato.player.core.PetAssets.available(dir)) {
            petState.setText("⚠️ 没找到素材目录：" + dir
                    + "\n先运行 tools/bake-pet.mjs（需要 rhodes-containment-protocol 的基建模型），"
                    + "或用 -Dpotato.petDir=… / 配置 pet_dir 指向别处。");
            return;
        }
        if (pet == null) {
            petState.setText("素材已就绪（" + dir + "），勾选上面的开关她就出来了。");
            return;
        }
        String clips = pet.loadedClips();
        String err = pet.loadError();
        if (err != null && !err.isBlank()) {
            petState.setText("⚠️ 加载出错：" + err);
        } else if (clips.isEmpty()) {
            petState.setText("正在后台加载素材…（首次约 1~2 秒）");
        } else {
            petState.setText((showing ? "已出场" : "未出场")
                    + " · 当前：" + pet.stateName()
                    + " · 已加载动作：" + clips
                    + " · 位置 (" + Math.round(pet.anchorX()) + ", " + Math.round(pet.anchorY()) + ")");
        }
    }

    public void refreshTheme() {
        // 各面板内部含有内联主题色，主题切换后必须重建才不会残留旧配色
        panels.clear();
        playlistList = null;
        blocksList = null;
        genresList = null;
        if (currentPanelName != null) {
            switchTo(currentPanelName);
        }
    }

    private javafx.stage.Stage mainStage() {
        return (javafx.stage.Stage) getScene().getWindow();
    }

    /** 网易云歌曲条目：两行详情 + 加高行。 */
    private final class NcSongCell extends ListCell<NcItem> {
        private final VBox box = new VBox(2);
        private final HBox top = new HBox(6);
        private final Label nameLabel = new Label();
        private final Label localLabel = new Label();
        private final Label feeLabel = new Label();
        private final Label subLabel = new Label();
        private final Region spacer = new Region();

        {
            setPrefHeight(54);
            top.setAlignment(Pos.CENTER_LEFT);
            nameLabel.getStyleClass().add("title");
            nameLabel.setStyle("-fx-font-weight:bold;");
            localLabel.setStyle("-fx-font-size:9px; -fx-text-fill:" + main.c("SUCCESS") + ";");
            feeLabel.setStyle("-fx-font-size:9px; -fx-font-weight:bold; -fx-padding:1px 5px; -fx-background-radius:3px;");
            subLabel.getStyleClass().add("small");
            HBox.setHgrow(spacer, Priority.ALWAYS);
            top.getChildren().addAll(nameLabel, localLabel, spacer, feeLabel);
            box.getChildren().addAll(top, subLabel);
            box.setPadding(new Insets(6, 8, 6, 8));
        }

        @Override
        protected void updateItem(NcItem it, boolean empty) {
            super.updateItem(it, empty);
            if (empty || it == null) {
                setText(null);
                setGraphic(null);
                return;
            }
            nameLabel.setText(it.name());
            String ft = it.feeText();
            feeLabel.setText(ft);
            feeLabel.setStyle("-fx-font-size:9px; -fx-font-weight:bold; -fx-padding:1px 5px; "
                    + "-fx-background-radius:3px; -fx-text-fill:" + feeColor(ft)
                    + "; -fx-background-color:" + main.c("CARD_ALTERNATE") + ";");
            localLabel.setText(ncHasLocal(it.id()) ? "🟢 已下载" : "");
            String sub = "👤 " + it.artists();
            if (it.album() != null && !it.album().isBlank()) {
                sub += "  |  💿 " + it.album();
            }
            sub += "  |  ⏱ " + it.durationText();
            subLabel.setText(sub);
            setGraphic(box);
        }
    }

    /** 歌单/编辑器列表单元格（显示标题、交替行色、当前播放高亮）。 */
    private final class SongTitleCell extends ListCell<String> {
        @Override
        protected void updateItem(String path, boolean empty) {
            super.updateItem(path, empty);
            if (empty || path == null) {
                setText(null);
                setStyle("");
                return;
            }
            setText(main.getCachedTitle(path));
            String playing = main.currentSongPath();
            if (isSelected()) {
                setStyle("-fx-text-fill: white;");
            } else if (path.equals(playing) && !main.stopped) {
                setStyle("-fx-text-fill: " + main.c("ACCENT") + "; -fx-font-weight: bold;");
            } else {
                setStyle("-fx-text-fill: " + main.c("TEXT") + ";");
            }
        }
    }
}
