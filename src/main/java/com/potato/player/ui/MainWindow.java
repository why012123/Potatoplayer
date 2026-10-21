package com.potato.player.ui;

import com.potato.player.core.Config;
import com.potato.player.core.BpmStore;
import com.potato.player.core.EqPreset;
import com.potato.player.core.EqStore;
import com.potato.player.core.Library;
import com.potato.player.core.NeteaseClient;
import com.potato.player.core.Paths;
import com.potato.player.core.PlaylistStore;
import com.potato.player.core.PlayerEngine;
import com.potato.player.core.SongInfo;
import com.potato.player.core.Theme;
import javafx.animation.Animation;
import javafx.animation.Interpolator;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.PauseTransition;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.CacheHint;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 主窗口：状态中枢与播放控制（对应 Potatoplayer_qt.py 的 MainWindow）。
 */
public class MainWindow {

    private final Stage stage;
    private final Scene scene;

    // ── 核心对象 ──
    private final Library lib = new Library();
    private final NeteaseClient nc = new NeteaseClient();
    /** 均衡器数据（全局预设 / 单曲预设 / 用户预设）。 */
    private EqStore eqStore;
    /** BPM 数据（分析结果 + 手动修正）。 */
    private BpmStore bpmStore;
    /** 系统任务中心（全库扫描等长任务，在「任务」面板显示）。 */
    private final JobCenter jobCenter = new JobCenter();

    // ── 主题 ──
    public String themeName;
    public Map<String, String> theme;

    // ── 配置 ──
    public String noteDisplayMode;
    public boolean artistHidden;
    public String coverStyle;
    public int currentVolume;
    public String playMode;
    public String sortMode;
    public String filterSortMode;
    public boolean showIndexHeaders;
    public int commentDisplayCount;
    public int currentDlBr;
    public boolean bilingualLyrics;
    public boolean preferChineseLyrics;
    /** 歌词显示模式：双语 / 仅中文 / 仅原文（Config.LYRICS_MODE_*）。 */
    public String lyricsDisplayMode;
    /** 控件（面板/卡片/按钮）不透明度 0.2 ~ 1.0。 */
    public double uiOpacity;

    // ── 播放状态 ──
    public final List<String> playlist = new ArrayList<>();
    public int currentPlaylistIndex = -1;
    public boolean paused = false;
    public boolean stopped = true;
    public boolean dragging = false;
    public double currentPos = 0.0;
    public double lastTick = 0.0;
    public int skipUpdates = 0;
    public int totalSeconds = 0;
    public String durationStr = "0:00";
    public final List<Integer> history = new ArrayList<>();
    public int listSeqPlayedIndex = -1;
    public List<Integer> shuffleQueue = new ArrayList<>();
    public int shufflePos = 0;
    private boolean switchingSong = false;

    // ── 选中 / 过滤 ──
    public final Set<String> selectedPaths = new HashSet<>();
    public boolean filterResultVisible = false;
    public List<String> currentFilterPaths = new ArrayList<>();
    public final Set<String> collapsedGroups = new HashSet<>();
    public boolean ratingFilterActive = false;
    public double ratingFilterMin = 0.0;
    public double ratingFilterMax = 10.0;

    // ── 封面旋转 ──
    public Image coverOriginalImage = null;
    public double coverRotationAngle = 0.0;

    // ── 歌词 ──
    public List<SongInfo.LrcLine> currentLyrics = new ArrayList<>();
    public int currentLyricIndex = -1;

    // ── 音频文件 ──
    public List<String> audioPaths = new ArrayList<>();

    // ── 定时器 ──
    private Timeline progressTimer;
    private Timeline coverTimer;
    private Timeline lyricsTimer;

    // ── 面板 ──
    public SongLibraryPanel libraryPanel;
    public PlaybackPanel playbackPanel;
    public FunctionPanels functionPanels;
    private DownloadManager downloadManager;
    /** 「任务」面板的统一列表：系统任务 + 下载任务（进行中的排在前面）。 */
    private final javafx.collections.ObservableList<Object> taskRows =
            javafx.collections.FXCollections.observableArrayList();
    /** 桌面歌词悬浮窗（懒创建）。 */
    private DesktopLyrics desktopLyrics;
    /** 动图卡点悬浮窗（懒创建）。 */
    private GifOverlay gifOverlay;
    private FogOverlay fogOverlay;
    /** 迷迭香桌宠（懒创建）。 */
    private DesktopPet pet;

    /** 沉浸模式：左右侧栏淡出屏幕外，播放面板占满整宽。 */
    public boolean immersive;
    /** 沉浸/常规切换的过渡时长（侧栏滑动与播放区内容淡入共用）。 */
    private static final int TRANSITION_MS = 300;
    /** 过渡进行中：冻结周期刷新，别在动画中间改文字/旋转角。 */
    private boolean transitioning;
    /** 过渡收尾定时器（连续快速切换时要把上一个停掉，免得提前解冻）。 */
    private PauseTransition transitionSettle;
    private HBox content;

    private File cssFile;
    private boolean closing = false;
    private final ImageView backgroundView = new ImageView();

    public MainWindow(Stage stage) {
        com.potato.player.core.StartupTimer.mark("开始建界面");
        this.stage = stage;
        initState();
        com.potato.player.core.StartupTimer.mark("状态初始化");
        StackPane root = buildUi();
        com.potato.player.core.StartupTimer.mark("三栏界面构建");
        this.scene = new Scene(root, 1200, 700);
        applyCss();
        applyBackground();
        com.potato.player.core.StartupTimer.mark("主题/样式");
        stage.setScene(scene);
        stage.setTitle("Potato Player");
        stage.setMinWidth(1000);
        stage.setMinHeight(600);
        initPlayback();
        loadInitial();
        // 首次启动时填充歌曲库
        libraryPanel.refresh();
        com.potato.player.core.StartupTimer.mark("歌曲库列表");
        stage.show();
        com.potato.player.core.StartupTimer.mark("主窗口显示");

        // libvlc 的载入（约 400ms）挪到这里：窗口已经出来了，后台低优先级线程慢慢热
        lib.warmUpPlayerAsync();
        com.potato.player.core.StartupTimer.mark("已交给后台预热 libvlc");

        // 悬浮窗 / 歌词的恢复放到首帧之后：它们各自要建透明置顶窗口 + 写配置，
        // 以前挡在 stage.show() 之后立刻执行，会把第一次绘制也一起拖慢
        Platform.runLater(() -> {
            restoreOverlays();
            restoreSessionPlaylist();   // 上次的播放列表：等首帧之后再读，不挡启动
        });
        com.potato.player.core.StartupTimer.mark("启动完成（首帧）");
        // ESC 退出沉浸模式（冒泡阶段，谁都没吃掉才轮到它）
        scene.setOnKeyPressed(e -> {
            if (e.getCode() == KeyCode.ESCAPE && immersive) {
                setImmersive(false);
                e.consume();
            }
        });

        // 遥控键：鼠标正停在小动图上时，空格 = 播放/暂停、↑↓ = 音量+缩放、←→ = 上/下一首。
        // 这里用**事件过滤器**（捕获阶段）：焦点即使在某个按钮/输入框上，这几个键也先给动图 ——
        // "鼠标悬停在动图上"本身就是要接管这几个键的意思；鼠标一移开就恢复原状。
        scene.addEventFilter(KeyEvent.KEY_PRESSED, e -> {
            if (gifOverlay != null && gifOverlay.isShowing() && gifOverlay.isMouseOverSticker()
                    && gifOverlay.handleGestureKey(e.getCode())) {
                e.consume();
            }
        });

        stage.setOnCloseRequest(e -> close());
    }

    /** 恢复上次开着的悬浮窗（桌面歌词 / 动图 / 起雾）；在首帧之后调用。 */
    private void restoreOverlays() {
        if (Config.getBool(lib.config(), "desktop_lyrics_on", false)) {
            desktopLyrics().show();
            stage.requestFocus();
        }
        syncDesktopLyricsUi();

        if (Config.getBool(lib.config(), "gif_on", false)) {
            if (gifOverlay().show()) {
                stage.requestFocus();
            }
        }
        syncGifUi();

        // 屏幕起雾（测试功能，默认关）
        if (Config.getBool(lib.config(), "fog_on", false)) {
            fogOverlay().setOn(true);
        }

        // 迷迭香桌宠（素材在 pets/rosmontis；没有素材就静默不显示）
        if (Config.getBool(lib.config(), "pet_on", false)) {
            if (pet().show()) {
                syncPetUi();
            } else {
                lib.config().put("pet_on", false);
            }
        }
        com.potato.player.core.StartupTimer.mark("悬浮窗/歌词恢复");
    }

    // ── 状态初始化 ──
    private void initState() {
        // 静音 Jaudiotagger 的 INFO 日志
        java.util.logging.Logger.getLogger("org.jaudiotagger").setLevel(java.util.logging.Level.WARNING);
        Paths.ensureDirs();
        Map<String, Object> config = lib.config();

        themeName = Config.getString(config, "theme", Theme.DEFAULT_THEME);
        theme = Theme.resolve(themeName);

        noteDisplayMode = Config.getString(config, "note_display_mode", "expanded");
        artistHidden = Config.getBool(config, "artist_hidden", false);
        coverStyle = Config.getString(config, "cover_style", "circle_rotate");
        currentVolume = Config.getInt(config, "volume", 70);
        playMode = Config.getString(config, "play_mode", "list_loop");
        sortMode = Config.getString(config, "sort_mode", "title");
        filterSortMode = Config.getString(config, "filter_sort_mode", "title");
        showIndexHeaders = Config.getBool(config, "show_index_headers", true);
        commentDisplayCount = Config.getInt(config, "comment_display_count", 15);
        currentDlBr = Config.getInt(config, "current_dl_br", 999000);
        lyricsDisplayMode = Config.lyricsDisplayMode(config);
        bilingualLyrics = Config.LYRICS_MODE_BILINGUAL.equals(lyricsDisplayMode);
        preferChineseLyrics = !Config.LYRICS_MODE_ORIGINAL.equals(lyricsDisplayMode);
        uiOpacity = Config.getDouble(config, "ui_opacity", 0.80);

        audioPaths = lib.scanMusic();
        eqStore = EqStore.load();
        bpmStore = BpmStore.load();
        downloadManager = new DownloadManager(nc, lib, this::onDownloadFinished);
        downloadManager.setPlaylistSink(p -> {
            if (!playlist.contains(p)) {
                playlist.add(p);
            }
            if (functionPanels != null) {
                functionPanels.refreshPlaylist();
            }
        });
        // 两个来源任一变化都重建统一任务列表（监听只挂一次）
        jobCenter.jobs().addListener(
                (javafx.collections.ListChangeListener<JobCenter.Job>) c -> rebuildTaskRows());
        downloadManager.tasks().addListener(
                (javafx.collections.ListChangeListener<DownloadManager.Task>) c -> rebuildTaskRows());
    }

    public javafx.collections.ObservableList<Object> taskRows() {
        return taskRows;
    }

    /** 重建统一任务列表：进行中的在前，其余按加入顺序。 */
    private void rebuildTaskRows() {
        List<Object> running = new ArrayList<>();
        List<Object> rest = new ArrayList<>();
        for (JobCenter.Job j : jobCenter.jobs()) {
            (j.state.get() == JobCenter.State.RUNNING ? running : rest).add(j);
        }
        for (DownloadManager.Task t : downloadManager.tasks()) {
            boolean active = t.status.get() == DownloadManager.Status.QUEUED
                    || t.status.get() == DownloadManager.Status.DOWNLOADING;
            (active ? running : rest).add(t);
        }
        taskRows.setAll(running);
        taskRows.addAll(rest);
    }

    /** 下载完成回调（已在 FX 线程）。 */
    private void onDownloadFinished() {
        audioPaths = lib.scanMusic();
        libraryPanel.refresh();
    }

    private StackPane buildUi() {
        // 背景图层（置于最底层，玻璃面板半透明透出）
        backgroundView.setPreserveRatio(false);
        backgroundView.setSmooth(true);
        backgroundView.setOpacity(0.9);

        content = new HBox(8);
        content.setPadding(new Insets(12));
        content.setAlignment(Pos.CENTER_LEFT);

        libraryPanel = new SongLibraryPanel(this);
        playbackPanel = new PlaybackPanel(this);
        functionPanels = new FunctionPanels(this);

        // 三栏：3 / 5 / 4
        libraryPanel.setPrefWidth(260);
        playbackPanel.setPrefWidth(400);
        functionPanels.setPrefWidth(320);
        HBox.setHgrow(libraryPanel, Priority.ALWAYS);
        HBox.setHgrow(playbackPanel, Priority.ALWAYS);
        HBox.setHgrow(functionPanels, Priority.ALWAYS);

        content.getChildren().addAll(libraryPanel, playbackPanel, functionPanels);

        StackPane root = new StackPane(backgroundView, content);
        root.getStyleClass().add("root");
        backgroundView.fitWidthProperty().bind(root.widthProperty());
        backgroundView.fitHeightProperty().bind(root.heightProperty());
        return root;
    }

    public DownloadManager downloadManager() {
        return downloadManager;
    }

    /** 系统任务中心（「任务」面板显示）。 */
    public JobCenter jobCenter() {
        return jobCenter;
    }

    public BpmStore bpmStore() {
        return bpmStore;
    }

    // ── 桌面歌词 ──

    /** 桌面歌词窗口（懒创建；创建对象本身不会弹出窗口）。 */
    public DesktopLyrics desktopLyrics() {
        if (desktopLyrics == null) {
            desktopLyrics = new DesktopLyrics(this);
        }
        return desktopLyrics;
    }

    public boolean desktopLyricsShowing() {
        return desktopLyrics != null && desktopLyrics.isShowing();
    }

    public void setDesktopLyrics(boolean on) {
        if (on) {
            desktopLyrics().show();
        } else {
            desktopLyrics().hide();
        }
        syncDesktopLyricsUi();
    }

    // ── 动图卡点悬浮窗 ──

    /** 动图悬浮窗（懒创建；创建对象本身不会弹出窗口）。 */
    public GifOverlay gifOverlay() {
        if (gifOverlay == null) {
            gifOverlay = new GifOverlay(this);
        }
        return gifOverlay;
    }

    public boolean gifOverlayShowing() {
        return gifOverlay != null && gifOverlay.isShowing();
    }

    /** 🌫 屏幕起雾（测试功能，默认关）。 */
    public FogOverlay fogOverlay() {
        if (fogOverlay == null) {
            fogOverlay = new FogOverlay(this);
        }
        return fogOverlay;
    }

    /** 已经创建过的雾层（没有就返回 null）：给「移动即擦雾」用，避免为了擦一下就把雾层建出来。 */
    public FogOverlay fogOverlayIfAny() {
        return fogOverlay;
    }

    /**
     * 显示/隐藏动图悬浮窗。
     *
     * @return false 表示还没有导入动图（调用方负责提示）
     */
    public boolean setGifOverlay(boolean on) {
        boolean ok = true;
        if (on) {
            ok = gifOverlay().show();
        } else {
            gifOverlay().hide();
        }
        syncGifUi();
        return ok;
    }

    /** 动图开关 / 导入 / 尺寸变化后，同步设置页控件。 */
    public void syncGifUi() {
        if (functionPanels != null) {
            functionPanels.syncGif();
        }
    }

    // ── 迷迭香桌宠 ──

    /** 桌宠（懒创建；创建对象本身不会弹窗）。 */
    public DesktopPet pet() {
        if (pet == null) {
            pet = new DesktopPet(this);
        }
        return pet;
    }

    /** 已经创建过的桌宠（没有就返回 null）：给「同步设置页」用，避免为了刷新状态就把它建出来。 */
    public DesktopPet petIfAny() {
        return pet;
    }

    public boolean petShowing() {
        return pet != null && pet.isShowing();
    }

    /**
     * 显示 / 隐藏桌宠。
     *
     * @return false 表示素材缺失（{@code pets/rosmontis} 不存在），调用方负责提示
     */
    public boolean setPet(boolean on) {
        boolean ok = true;
        if (on) {
            ok = pet().show();
            if (ok) {
                pet().setClickThrough(pet().isClickThrough());
            }
        } else if (pet != null) {
            pet.hide();
        }
        syncPetUi();
        lib.config().put("pet_on", on && ok);
        lib.saveConfig();
        return ok;
    }

    /** 桌宠状态变化后刷新设置页。 */
    public void syncPetUi() {
        if (functionPanels != null) {
            functionPanels.syncPet();
        }
    }

    /** 现在是不是真的在放声音（桌宠据此决定睡不睡）。 */
    public boolean isPlayingAudio() {
        return !stopped && !paused && currentSongPath() != null;
    }

    /** 把主窗口叫到前面来（双击桌宠时用）。 */
    public void showPlayerWindow() {
        stage.show();
        stage.setIconified(false);
        stage.toFront();
        stage.requestFocus();
    }

    // ── 沉浸模式 ──

    public boolean isImmersive() {
        return immersive;
    }

    public void toggleImmersive() {
        setImmersive(!immersive);
    }

    /**
     * 进入/退出沉浸模式：左右侧栏边淡出边向两侧滑出屏幕，播放面板占满整宽，
     * 面板内部切换为「左 40% 控件 + 右 60% 七行歌词」。
     */
    public void setImmersive(boolean on) {
        if (immersive == on) {
            return;
        }
        immersive = on;
        double libW = Math.max(libraryPanel.getWidth(), libraryPanel.getPrefWidth());
        double funW = Math.max(functionPanels.getWidth(), functionPanels.getPrefWidth());

        // 过渡期间冻结那几个周期性刷新（歌词 200ms / 封面旋转 100ms / 进度 300ms）：
        // 它们每帧都在改文字和旋转角，会让正在做位移/淡出的节点不断重新布局 —— 动画就会一顿一顿。
        transitioning = true;
        if (transitionSettle != null) {
            transitionSettle.stop();
        }
        PauseTransition settle = new PauseTransition(Duration.millis(TRANSITION_MS + 120));
        transitionSettle = settle;
        settle.setOnFinished(e -> {
            transitioning = false;
            cacheForTransition(libraryPanel, false);
            cacheForTransition(functionPanels, false);
            if (playbackPanel != null) {
                playbackPanel.refreshAfterTransition();
            }
        });
        settle.play();

        if (on) {
            // 动画期间侧栏盖在播放面板之上，滑出后即完全隐藏
            libraryPanel.toFront();
            functionPanels.toFront();
            libraryPanel.setManaged(false);
            functionPanels.setManaged(false);
            playbackPanel.setImmersive(true);
        } else {
            // toFront() 是靠调整 children 顺序实现的，会打乱 HBox 的三栏排列，退出时必须还原
            content.getChildren().setAll(libraryPanel, playbackPanel, functionPanels);
            libraryPanel.setTranslateX(-libW);
            functionPanels.setTranslateX(funW);
            libraryPanel.setOpacity(0);
            functionPanels.setOpacity(0);
            libraryPanel.setManaged(true);
            functionPanels.setManaged(true);
            playbackPanel.setImmersive(false);
        }

        // 关键：先把这棵子树的 CSS/布局一次做完，再开始动画。
        // 以前是"换了子树立刻起动画"，于是第一帧要边布局边画（面板重排 + 换尺寸），看着就是卡一下。
        content.applyCss();
        content.layout();

        // 过渡期间把两侧面板渲染成缓存位图：每帧只是搬纹理 + 调透明度，不再重画面板内部
        cacheForTransition(libraryPanel, true);
        cacheForTransition(functionPanels, true);

        slide(libraryPanel, on ? -libW : 0, on ? 0 : 1, Interpolator.EASE_BOTH);
        slide(functionPanels, on ? funW : 0, on ? 0 : 1, Interpolator.EASE_BOTH);
    }

    /** 过渡期间开/关缓存位图（结束后恢复默认，免得静止时文字发虚）。 */
    private static void cacheForTransition(javafx.scene.Node node, boolean on) {
        node.setCache(on);
        node.setCacheHint(on ? CacheHint.SPEED : CacheHint.DEFAULT);
    }

    /** 平移 + 淡入淡出动画（与播放区内容的淡入用同一个时长，看着才是一个动作）。 */
    private void slide(javafx.scene.Node node, double targetX, double targetOpacity, Interpolator ip) {
        Timeline t = new Timeline(new KeyFrame(Duration.millis(TRANSITION_MS),
                new KeyValue(node.translateXProperty(), targetX, ip),
                new KeyValue(node.opacityProperty(), targetOpacity, ip)));
        t.play();
    }

    public void toggleDesktopLyrics() {
        setDesktopLyrics(!desktopLyricsShowing());
    }

    /** 桌面歌词开关状态变化后，同步播放区按钮与设置页控件。 */
    public void syncDesktopLyricsUi() {
        if (playbackPanel != null) {
            playbackPanel.syncDesktopLyrics(desktopLyricsShowing());
        }
        if (functionPanels != null) {
            functionPanels.syncDesktopLyrics();
        }
    }

    /** 应用背景图（读取 config 的 bg_image_path）。 */
    private void applyBackground() {
        String path = Config.getString(lib.config(), "bg_image_path", "");
        setBackgroundImage(path.isEmpty() ? null : path);
    }

    /** 设置背景图；null 清除。 */
    public void setBackgroundImage(String path) {
        if (path == null || path.isEmpty() || !new File(path).exists()) {
            backgroundView.setImage(null);
            lib.config().put("bg_image_path", "");
            return;
        }
        try {
            backgroundView.setImage(new Image(new File(path).toURI().toString()));
            lib.config().put("bg_image_path", path);
        } catch (Exception ignored) {
            backgroundView.setImage(null);
        }
    }

    public ImageView backgroundView() {
        return backgroundView;
    }

    // ── 主题 ──
    public String c(String key) {
        return theme.getOrDefault(key, "");
    }

    public void applyTheme(String name, boolean save) {
        themeName = name;
        theme = Theme.resolve(name);
        applyCss();
        if (save) {
            lib.config().put("theme", name);
            lib.saveConfig();
        }
        libraryPanel.refresh();
        playbackPanel.refreshCurrentSong();
        if (desktopLyrics != null) {
            desktopLyrics.applyStyle();
        }
        functionPanels.refreshTheme();
    }

    private void applyCss() {
        String css = ThemeCss.build(theme, uiOpacity);
        try {
            if (cssFile == null) {
                cssFile = File.createTempFile("potato-theme", ".css");
                cssFile.deleteOnExit();
            }
            Files.writeString(cssFile.toPath(), css);
            scene.getStylesheets().setAll(cssFile.toURI().toString());
        } catch (IOException ignored) {
        }
    }

    /** 调整控件不透明度（0.2 ~ 1.0）并即时生效、持久化。 */
    /** 歌词显示模式的中文展示名。 */
    public static String lyricsModeDisplay(String mode) {
        return switch (Config.normalizeLyricsMode(mode)) {
            case Config.LYRICS_MODE_TRANSLATION -> "仅中文";
            case Config.LYRICS_MODE_ORIGINAL -> "仅原文";
            default -> "双语（原文+翻译）";
        };
    }

    /**
     * 切换歌词显示模式（双语 / 仅中文 / 仅原文），立即生效。
     * 同时作用于播放区三行歌词、桌面歌词与「歌词」面板。
     */
    public void setLyricsDisplayMode(String mode) {
        lyricsDisplayMode = Config.normalizeLyricsMode(mode);
        bilingualLyrics = Config.LYRICS_MODE_BILINGUAL.equals(lyricsDisplayMode);
        preferChineseLyrics = !Config.LYRICS_MODE_ORIGINAL.equals(lyricsDisplayMode);
        Map<String, Object> cfg = lib.config();
        cfg.put("lyrics_display_mode", lyricsDisplayMode);
        cfg.put("bilingual_lyrics", bilingualLyrics);
        cfg.put("prefer_chinese_lyrics", preferChineseLyrics);
        lib.saveConfig();
        // 歌词是随 SongInfo 一起缓存的，不清缓存切换不会生效
        lib.clearSongInfoCache();
        playbackPanel.refreshCurrentSong();
        if (desktopLyrics != null) {
            desktopLyrics.update();
        }
    }

    public void setUiOpacity(double value) {
        uiOpacity = Math.max(0.2, Math.min(1.0, value));
        lib.config().put("ui_opacity", uiOpacity);
        lib.saveConfig();
        applyCss();
    }

    // ── 播放初始化 ──
    private void initPlayback() {
        // 只挂回调，不碰引擎（libvlc 的载入挪到窗口显示之后）
        lib.setPlayerListener(() -> {
            if (!switchingSong) {
                Platform.runLater(this::nextSong);
            }
        });

        progressTimer = new Timeline(new KeyFrame(Duration.millis(300), e -> updateProgress()));
        progressTimer.setCycleCount(Animation.INDEFINITE);
        coverTimer = new Timeline(new KeyFrame(Duration.millis(100), e -> updateCoverRotation()));
        coverTimer.setCycleCount(Animation.INDEFINITE);
        lyricsTimer = new Timeline(new KeyFrame(Duration.millis(200), e -> updateLyricsDisplay()));
        lyricsTimer.setCycleCount(Animation.INDEFINITE);
        // 三个周期刷新都交给状态机决定（开机时没在放歌 → 一个都不跑）
        syncPlaybackTimers();
    }

    private void loadInitial() {
        if (!nc.serverCheck()) {
            nc.serverStart();
        }
    }

    // ── 上次会话的播放列表 ──

    /** 同一轮里被调多次也只写一次文件。 */
    private boolean sessionSaveScheduled;

    /**
     * 把「当前播放列表 + 正在听第几首」下标记下来，退出时同步回来。
     *
     * <p>调用点：换曲、播放列表任何改动（{@code FunctionPanels#refreshPlaylist}）、以及关窗口。
     * 用 {@code Platform.runLater} 合并：一次批量加 300 首只会写一次盘。</p>
     */
    public void scheduleSessionSave() {
        if (sessionSaveScheduled || closing) {
            return;
        }
        sessionSaveScheduled = true;
        Platform.runLater(() -> {
            sessionSaveScheduled = false;
            PlaylistStore.saveSession(playlist, currentPlaylistIndex);
        });
    }

    /**
     * 启动时恢复上次退出时的播放列表。
     *
     * <p>只恢复**列表和"当时在听第几首"**，不自动播放：所以面板上会显示上次那首的名字/封面/时长，
     * 进度条在 0:00，按播放（或空格）就从它开始放。用户这次已经自己加过歌就不覆盖。</p>
     */
    private void restoreSessionPlaylist() {
        if (!playlist.isEmpty()) {
            return;
        }
        PlaylistStore.Session session = PlaylistStore.loadSession();
        if (session.isEmpty()) {
            return;
        }
        playlist.addAll(session.playlist());
        currentPlaylistIndex = (session.index() >= 0 && session.index() < playlist.size())
                ? session.index() : -1;
        functionPanels.refreshPlaylist();
        playbackPanel.refreshCurrentSong();
        playbackPanel.updateBar();
    }

    // ── 播放控制 ──
    public void playFile(String filepath) {
        playFile(filepath, true);
    }

    public void playFile(String filepath, boolean addToHistory) {
        if (switchingSong) {
            return;
        }
        switchingSong = true;
        try {
            playFileImpl(filepath, addToHistory);
        } finally {
            switchingSong = false;
        }
    }

    private void playFileImpl(String filepath, boolean addToHistory) {
        scheduleSessionSave();
        int oldIndex = (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size())
                ? currentPlaylistIndex : -1;

        if ("random".equals(playMode)) {
            if (!playlist.contains(filepath)) {
                playlist.add(filepath);
            }
            currentPlaylistIndex = playlist.indexOf(filepath);
        } else if ("list_sequential".equals(playMode)) {
            if (!playlist.contains(filepath)) {
                playlist.add(filepath);
            }
            currentPlaylistIndex = playlist.indexOf(filepath);
            if (addToHistory && currentPlaylistIndex > listSeqPlayedIndex) {
                listSeqPlayedIndex = currentPlaylistIndex;
            }
        } else {
            playlist.remove(filepath);
            playlist.add(0, filepath);
            currentPlaylistIndex = 0;
        }

        if (addToHistory && !stopped && oldIndex != -1 && oldIndex != currentPlaylistIndex) {
            if (history.isEmpty() || history.get(history.size() - 1) != oldIndex) {
                history.add(oldIndex);
            }
        }

        Map<String, Object> rating = lib.ratings().computeIfAbsent(filepath, k -> new LinkedHashMap<>());
        int pc = (rating.get("play_count") instanceof Number n) ? n.intValue() : 0;
        rating.put("play_count", pc + 1);
        lib.saveRatings();

        if (!addToHistory) {
            selectedPaths.clear();
        }

        applyEqForSong(filepath);
        lib.player().play(filepath);
        stopped = false;
        paused = false;
        currentPos = 0.0;
        lastTick = nowSeconds();
        skipUpdates = 3;

        refreshAfterPlay(filepath);
    }

    private void refreshAfterPlay(String filepath) {
        playbackPanel.refreshCurrentSong();
        playbackPanel.updatePlayButton();
        playbackPanel.updateBar();
        libraryPanel.refreshPlaylist();
        libraryPanel.refresh();
        functionPanels.refreshCurrentSong();
        functionPanels.syncEq();
    }

    public void pauseOrResume() {
        if (stopped && !playlist.isEmpty()) {
            int idx = (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size())
                    ? currentPlaylistIndex : 0;
            playFile(playlist.get(idx), false);
            return;
        }
        if (paused) {
            lib.player().resume();
            paused = false;
            lastTick = nowSeconds();
        } else {
            lib.player().pause();
            paused = true;
        }
        playbackPanel.updatePlayButton();
    }

    public void stop() {
        lib.player().stop();
        stopped = true;
        paused = false;
        currentPos = 0.0;
        skipUpdates = 0;
        history.clear();
        listSeqPlayedIndex = -1;
        playbackPanel.updatePlayButton();
        playbackPanel.updateBar();
    }

    public void seek(double seconds) {
        if (!stopped) {
            lib.player().seek(seconds);
            currentPos = seconds;
            lastTick = nowSeconds();
            skipUpdates = 2;
            playbackPanel.updateBar();
        }
    }

    public void setVolume(int value) {
        currentVolume = value;
        lib.setPlayerVolume(currentVolume);
        playbackPanel.updateVolumeLabel();
        lib.config().put("volume", currentVolume);
        lib.saveConfig();
    }

    public void nextSong() {
        if (playlist.isEmpty()) {
            return;
        }
        if ("single_loop".equals(playMode)) {
            if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                playFile(playlist.get(currentPlaylistIndex), false);
            }
            return;
        }
        if ("random".equals(playMode)) {
            if (shuffleQueue.isEmpty()) {
                regenerateShuffle();
            }
            shufflePos = (shufflePos + 1) % shuffleQueue.size();
            playFile(playlist.get(shuffleQueue.get(shufflePos)));
            return;
        }
        if ("list_sequential".equals(playMode)) {
            int nxt = currentPlaylistIndex + 1;
            if (nxt >= playlist.size()) {
                stop();
                return;
            }
            playFile(playlist.get(nxt));
            return;
        }
        // list_loop（默认循环播放）
        if (playlist.size() <= 1) {
            if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                playFile(playlist.get(currentPlaylistIndex), false);
            }
            return;
        }
        String old = playlist.remove(0);
        playlist.add(old);
        currentPlaylistIndex = 0;
        playFile(playlist.get(0), false);
    }

    public void prevSong() {
        if (playlist.isEmpty()) {
            return;
        }
        if ("single_loop".equals(playMode)) {
            if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                playFile(playlist.get(currentPlaylistIndex), false);
            }
            return;
        }
        if ("random".equals(playMode)) {
            if (!history.isEmpty()) {
                int prevIdx = history.remove(history.size() - 1);
                if (prevIdx >= 0 && prevIdx < playlist.size()) {
                    playFile(playlist.get(prevIdx), false);
                    return;
                }
            }
            if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                playFile(playlist.get(currentPlaylistIndex), false);
            }
            return;
        }
        if ("list_sequential".equals(playMode)) {
            if (!history.isEmpty()) {
                int prevIdx = history.remove(history.size() - 1);
                if (prevIdx >= 0 && prevIdx < playlist.size()) {
                    playFile(playlist.get(prevIdx), false);
                    return;
                }
            }
            if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                playFile(playlist.get(currentPlaylistIndex), false);
            }
            return;
        }
        // list_loop
        if (playlist.size() <= 1) {
            if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                playFile(playlist.get(currentPlaylistIndex), false);
            }
            return;
        }
        String last = playlist.remove(playlist.size() - 1);
        playlist.add(0, last);
        currentPlaylistIndex = 0;
        playFile(last, false);
    }

    public void regenerateShuffle() {
        if (playlist.isEmpty()) {
            return;
        }
        List<Integer> indices = new ArrayList<>();
        for (int i = 0; i < playlist.size(); i++) {
            indices.add(i);
        }
        java.util.Collections.shuffle(indices);
        if (!stopped && indices.contains(currentPlaylistIndex)) {
            indices.remove(Integer.valueOf(currentPlaylistIndex));
            indices.add(0, currentPlaylistIndex);
        }
        shuffleQueue = indices;
        shufflePos = 0;
    }

    public void setPlayMode(String mode) {
        String old = playMode;
        playMode = mode;
        lib.config().put("play_mode", mode);
        lib.saveConfig();
        history.clear();

        if ("random".equals(old) && ("list_loop".equals(mode) || "list_sequential".equals(mode))) {
            if (!stopped && currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                String cur = playlist.get(currentPlaylistIndex);
                playlist.remove(cur);
                playlist.add(0, cur);
                currentPlaylistIndex = 0;
            }
        }
        if ("list_sequential".equals(old) && "list_loop".equals(mode)) {
            if (!stopped && currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
                List<String> before = new ArrayList<>(playlist.subList(0, currentPlaylistIndex));
                List<String> after = new ArrayList<>(playlist.subList(currentPlaylistIndex, playlist.size()));
                playlist.clear();
                playlist.addAll(after);
                playlist.addAll(before);
                currentPlaylistIndex = 0;
            }
        }
        if ("list_sequential".equals(mode)) {
            listSeqPlayedIndex = (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size())
                    ? currentPlaylistIndex : -1;
        }
        if ("random".equals(mode)) {
            regenerateShuffle();
        }
        playbackPanel.updateModeDisplay();
        libraryPanel.refreshPlaylist();
    }

    // ── 周期刷新的开关（省电：不播放时不该每秒白醒好几次）──

    /**
     * 按播放状态开关三个周期性刷新。
     *
     * <p>它们以前是开机就一直跑的：暂停 / 停止时每 100~300 ms 醒一次算出来的结果
     * 跟上一帧完全一样，纯粹是白烧电。现在只有「真的在放」才跑；
     * 封面旋转还要额外满足「圆形旋转」样式（方形静态时本来就不用转）。</p>
     */
    public void syncPlaybackTimers() {
        boolean playing = !stopped && !paused && currentSongPath() != null;
        setTimerRunning(progressTimer, playing);
        setTimerRunning(lyricsTimer, playing);
        setTimerRunning(coverTimer, playing && "circle_rotate".equals(coverStyle));
    }

    private static void setTimerRunning(Timeline t, boolean run) {
        if (t == null) {
            return;
        }
        boolean running = t.getStatus() == Animation.Status.RUNNING;
        if (run && !running) {
            t.play();
        } else if (!run && running) {
            t.stop();
        }
    }

    /** 悬浮窗的 60fps 动画计时器也按同样规则开关。 */
    public void refreshOverlayTimer() {
        if (gifOverlay != null) {
            gifOverlay.refreshTimer();
        }
    }

    // ── 进度与封面 ──
    private void updateProgress() {
        if (closing || transitioning) {
            return;
        }
        if (skipUpdates > 0) {
            skipUpdates--;
            return;
        }
        if (!stopped && !paused && !dragging) {
            Double t = lib.player().getTime();
            if (t != null) {
                currentPos = t;
            } else {
                double now = nowSeconds();
                currentPos += now - lastTick;
                lastTick = now;
            }
            playbackPanel.updateBar();
            if (totalSeconds > 0 && currentPos >= totalSeconds - 0.5) {
                if (!switchingSong) {
                    nextSong();
                }
            }
        }
    }

    private void updateCoverRotation() {
        if (closing || transitioning) {
            return;
        }
        if (!"circle_rotate".equals(coverStyle) || stopped || paused || coverOriginalImage == null) {
            return;
        }
        coverRotationAngle = (coverRotationAngle + 1.5) % 360;
        playbackPanel.updateCoverRotation(coverRotationAngle);
    }

    private void updateLyricsDisplay() {
        if (transitioning) {
            return;   // 过渡结束后 refreshAfterTransition() 会补一次
        }
        playbackPanel.updateLyricsDisplay();
        if (desktopLyrics != null) {
            desktopLyrics.update();
        }
    }

    // ── 歌曲信息 ──
    public SongInfo loadSongInfo(String filepath) {
        return lib.loadSongInfo(filepath);
    }

    public String getCachedTitle(String filepath) {
        return lib.getCachedTitle(filepath);
    }

    public String getCachedArtist(String filepath) {
        return lib.getCachedArtist(filepath);
    }

    /** 只要标题，且不读标签（歌曲列表用；见 Library#getCachedSongTitle）。 */
    public String getCachedSongTitle(String filepath) {
        return lib.getCachedSongTitle(filepath);
    }

    public String getBlockColor(String name) {
        return lib.getBlockColor(name);
    }

    /** 流派标识色（和 getBlockColor 一样，颜色就存在 genres.json 里）。 */
    public String getGenreColor(String name) {
        return lib.getGenreColor(name);
    }

    public String currentSongPath() {
        if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.size()) {
            return playlist.get(currentPlaylistIndex);
        }
        return null;
    }

    public Library lib() {
        return lib;
    }

    public NeteaseClient nc() {
        return nc;
    }

    public EqStore eqStore() {
        return eqStore;
    }

    /** 曲目绑定的网易云 ID（无则空串）；作均衡器单曲预设的兜底键。 */
    public String neteaseIdFor(String path) {
        if (path == null) {
            return "";
        }
        String nid = lib.neteaseBindings().get(path);
        return nid == null ? "" : nid;
    }

    /**
     * 换曲前把这首歌该用的均衡器套到播放引擎上：有单曲预设用单曲，
     * 否则用全局；总开关关闭时直接旁路。必须在 play() 之前调用。
     */
    private void applyEqForSong(String filepath) {
        EqPreset song = eqStore.forSong(filepath, neteaseIdFor(filepath));
        lib.player().applyEq(song != null ? song : eqStore.global(), eqStore.on());
    }

    private static double nowSeconds() {
        return System.currentTimeMillis() / 1000.0;
    }

    // ── 关闭 ──
    private void close() {
        closing = true;
        PlaylistStore.saveSession(playlist, currentPlaylistIndex);   // 退出前把会话存下来
        progressTimer.stop();
        coverTimer.stop();
        lyricsTimer.stop();
        try {
            PlayerEngine engine = lib.playerIfAny();
            if (engine != null) {
                engine.stop();
            }
        } catch (Exception ignored) {
        }
        try {
            lib.saveMetadataCache();
            lib.saveRatings();
            lib.saveLyrics();
        } catch (Exception ignored) {
        }
        if (desktopLyrics != null) {
            desktopLyrics.dispose();
        }
        if (gifOverlay != null) {
            gifOverlay.dispose();
        }
        if (fogOverlay != null) {
            fogOverlay.dispose();
        }
        if (pet != null) {
            pet.dispose();
        }
        if (downloadManager != null) {
            downloadManager.shutdown();
        }
        try {
            nc.serverStop();
        } catch (Exception ignored) {
        }
        lib.releasePlayer();
        Platform.exit();
    }
}
