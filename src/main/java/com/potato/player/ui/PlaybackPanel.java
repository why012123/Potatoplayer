package com.potato.player.ui;

import com.potato.player.core.SongInfo;
import com.potato.player.core.Theme;
import javafx.animation.FadeTransition;
import javafx.animation.Interpolator;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.Node;
import javafx.scene.control.Slider;
import javafx.scene.control.Spinner;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.Tooltip;
import javafx.scene.control.SpinnerValueFactory;
import javafx.scene.effect.DropShadow;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.paint.Color;
import javafx.scene.CacheHint;
import javafx.scene.Cursor;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.shape.Circle;
import javafx.scene.shape.Rectangle;
import javafx.scene.text.TextAlignment;
import javafx.util.Duration;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 中央播放面板（对应 PlaybackPanel）。
 */
public class PlaybackPanel extends VBox {

    private final MainWindow main;

    private final ImageView coverView = new ImageView();
    private final Label coverPlaceholder = new Label("无封面");
    private final Label titleLabel = new Label("歌曲：...");
    private final Label artistLabel = new Label("歌手：...");
    private final Label durationLabel = new Label("时长：...");
    /** 进度条滑块直径（与 ThemeCss 里 .slider .thumb 的 pref-width/height 一致）。 */
    private static final double PROGRESS_THUMB = 18;
    private final Slider progressSlider = new Slider(0, 1000, 0);
    private final Label timeLabel = new Label("0:00 / 0:00");
    // ── 歌词（三行：前一句 / 本句 / 后一句，对应原版 update_lyrics_display）──
    /** 歌词：三对（每对 = 一句 + 它的翻译）。对内 4pt、对与对之间 10pt。 */
    private final VBox lyricsBox = new VBox(10);
    private VBox lyricsPairPrev;
    private VBox lyricsPairCur;
    private VBox lyricsPairNext;
    private final Label lyricPrev = new Label();
    private final Label lyricPrevTrans = new Label();
    private final Label lyricCur = new Label();
    private final Label lyricCurTrans = new Label();
    private final Label lyricNext = new Label();
    private final Label lyricNextTrans = new Label();
    private final Label volumeLabel = new Label();
    private final Slider volumeSlider = new Slider(0, 100, 70);
    private final Spinner<Double> scoreSpinner = new Spinner<>(0.0, 10.0, 0.0, 0.1);
    private final Button btnPrev = new Button("⏮");
    private final Button btnPlay = new Button("▶");
    private final Button btnNext = new Button("⏭");
    private final Button btnStop = new Button("⏹");
    private final ComboBox<String> modeCombo = new ComboBox<>();
    private final ToggleButton btnDesktopLyrics = new ToggleButton("🖥 桌面歌词");
    private boolean suppressMode = false;
    private final Visualizer visualizer = new Visualizer();
    private final DropShadow coverGlow = new DropShadow();

    // ── 沉浸模式（点击封面进入：左右侧栏淡出，右半侧显示七行歌词）──
    private static final int IMM_SLOTS = 7;      // 3 + 1 + 3
    private static final int IMM_CENTER = 3;
    private final VBox normalColumn = new VBox(6);
    private final HBox immersiveRow = new HBox(18);
    private final VBox immersiveLeft = new VBox(6);
    private final VBox immersiveRight = new VBox(6);
    private final Region immDivider = new Region();
    private final VBox[] immSlot = new VBox[IMM_SLOTS];
    private final Label[] immLine = new Label[IMM_SLOTS];
    private final Label[] immTrans = new Label[IMM_SLOTS];
    private boolean immersive = false;
    /** 沉浸切换的淡入淡出时长（与 MainWindow 侧栏滑动同一个值）。 */
    private static final int IMM_FADE_MS = 300;
    /** 上一套沉浸配色的指纹：主题没变就别再逐行 setStyle（每次都会重新解析 CSS）。 */
    private String immersiveStyleKey = "";

    // 两种布局间搬移的共享控件
    private StackPane coverBox;
    private HBox volRow, scoreRow, ctrlRow, modeRow;
    private Region bottomSpacer;
    private Tooltip coverHint;

    private static final Map<String, String> MODE_MAP = Map.of(
            "list_loop", "循环播放", "list_sequential", "列表播放",
            "single_loop", "单曲循环", "random", "随机播放");
    private static final Map<String, String> MODE_INTERNAL = Map.of(
            "循环播放", "list_loop", "列表播放", "list_sequential",
            "单曲循环", "single_loop", "随机播放", "random");

    public PlaybackPanel(MainWindow main) {
        super(6);
        this.main = main;
        getStyleClass().add("panel");
        setPadding(new Insets(10));
        setAlignment(Pos.TOP_CENTER);
        build();
    }

    private void build() {
        // 封面（点击进入/退出沉浸模式）
        coverView.setFitWidth(200);
        coverView.setFitHeight(200);
        coverView.setPreserveRatio(true);
        coverView.setSmooth(true);
        applyCoverClip();
        applyCoverGlow();
        coverBox = new StackPane(coverView, coverPlaceholder);
        coverBox.setPrefSize(200, 200);
        coverBox.setCursor(Cursor.HAND);
        coverHint = new Tooltip("点击封面进入沉浸模式");
        Tooltip.install(coverBox, coverHint);
        coverBox.setOnMouseClicked(e -> main.toggleImmersive());

        titleLabel.getStyleClass().add("title");
        titleLabel.setAlignment(Pos.CENTER);
        titleLabel.setMaxWidth(Double.MAX_VALUE);
        artistLabel.getStyleClass().add("muted");
        artistLabel.setAlignment(Pos.CENTER);
        durationLabel.getStyleClass().add("small");
        durationLabel.setAlignment(Pos.CENTER);

        // 进度条
        progressSlider.setMaxWidth(Double.MAX_VALUE);
        progressSlider.setOnMousePressed(e -> main.dragging = true);
        progressSlider.setOnMouseReleased(e -> onSliderReleased());

        timeLabel.getStyleClass().add("small");
        timeLabel.setAlignment(Pos.CENTER);

        // 歌词：前一句 / 本句 / 后一句（三行富文本）
        lyricsBox.setAlignment(Pos.CENTER);
        lyricsBox.setMinHeight(124);
        lyricsBox.setMaxWidth(Double.MAX_VALUE);
        for (Label l : lyricLabels()) {
            l.setAlignment(Pos.CENTER);
            l.setWrapText(true);
            l.setMinHeight(Label.USE_PREF_SIZE);
            l.setMaxWidth(Double.MAX_VALUE);
        }
        // 「一句 + 它的翻译」配成一对：对内 4pt、对与对之间 10pt。
        // 原来六行平铺在 VBox(1) 里，本句的降部（y/g/p）和翻译的升部只隔 1pt，看着像被切了一半。
        lyricsPairPrev = new VBox(4, lyricPrev, lyricPrevTrans);
        lyricsPairCur = new VBox(4, lyricCur, lyricCurTrans);
        lyricsPairNext = new VBox(4, lyricNext, lyricNextTrans);
        for (VBox pair : new VBox[]{lyricsPairPrev, lyricsPairCur, lyricsPairNext}) {
            pair.setAlignment(Pos.CENTER);
            pair.setFillWidth(true);
            pair.setMaxWidth(Double.MAX_VALUE);
        }
        lyricsBox.getChildren().setAll(lyricsPairPrev, lyricsPairCur, lyricsPairNext);
        applyLyricsStyle();

        // 音量
        volRow = new HBox(8);
        volRow.setAlignment(Pos.CENTER);
        volumeLabel.getStyleClass().add("small");
        volumeLabel.setText("音量：" + main.currentVolume + "%");
        volumeSlider.setMaxWidth(160);
        volumeSlider.setValue(main.currentVolume);
        volumeSlider.valueProperty().addListener((o, a, b) -> main.setVolume(b.intValue()));
        volRow.getChildren().addAll(volumeLabel, volumeSlider);

        // 评分
        scoreRow = new HBox(8);
        scoreRow.setAlignment(Pos.CENTER);
        Label scoreLbl = new Label("评分：");
        scoreLbl.getStyleClass().add("small");
        scoreSpinner.setPrefWidth(80);
        scoreSpinner.setEditable(true);
        Button btnSaveScore = new Button("保存");
        btnSaveScore.setOnAction(e -> saveScore());
        scoreRow.getChildren().addAll(scoreLbl, scoreSpinner, btnSaveScore);

        // 控制按钮
        ctrlRow = new HBox(8);
        ctrlRow.setAlignment(Pos.CENTER);
        btnPrev.getStyleClass().add("icon-btn");
        btnNext.getStyleClass().add("icon-btn");
        btnStop.getStyleClass().add("icon-btn");
        btnPlay.getStyleClass().add("play-btn");
        btnPrev.setOnAction(e -> main.prevSong());
        btnPlay.setOnAction(e -> main.pauseOrResume());
        btnNext.setOnAction(e -> main.nextSong());
        btnStop.setOnAction(e -> main.stop());
        // 只用可见形状判定命中：这几个按钮的 bounds 把 dropshadow 也算进去了
        // （play-btn 的 blur 18 + 向下偏移 5 让它的 bounds 撑到 94×83，而 ⏮/⏭ 只有 43×33），
        // 而按钮默认 pickOnBounds=true 表示"整个 bounds 矩形都算命中" —— 于是播放键的阴影
        // 区域会各向左右多吃 10pt，真的压在上一首/下一首上面（点不中）。
        for (Button b : new Button[]{btnPrev, btnPlay, btnNext, btnStop}) {
            b.setPickOnBounds(false);
        }
        ctrlRow.getChildren().addAll(btnPrev, btnPlay, btnNext, btnStop);

        // 播放模式 + 桌面歌词
        modeRow = new HBox(8);
        modeRow.setAlignment(Pos.CENTER);
        modeCombo.getItems().addAll("循环播放", "列表播放", "单曲循环", "随机播放");
        modeCombo.setValue(MODE_MAP.getOrDefault(main.playMode, "循环播放"));
        modeCombo.setOnAction(e -> {
            if (!suppressMode) {
                main.setPlayMode(MODE_INTERNAL.getOrDefault(modeCombo.getValue(), "list_loop"));
            }
        });
        btnDesktopLyrics.getStyleClass().add("toggle-button");
        btnDesktopLyrics.setSelected(main.desktopLyricsShowing());
        btnDesktopLyrics.setOnAction(e -> main.setDesktopLyrics(btnDesktopLyrics.isSelected()));
        modeRow.getChildren().addAll(new Label("模式："), modeCombo, btnDesktopLyrics);

        bottomSpacer = new Region();
        VBox.setVgrow(bottomSpacer, Priority.ALWAYS);

        normalColumn.setAlignment(Pos.TOP_CENTER);
        normalColumn.setFillWidth(true);
        fillNormalColumn();
        getChildren().add(normalColumn);

        buildImmersive();
    }

    /** 常规布局：单列自上而下，底部留白。 */
    private void fillNormalColumn() {
        immersiveLeft.getChildren().clear();
        normalColumn.getChildren().setAll(coverBox, visualizer, titleLabel, artistLabel, durationLabel,
                progressSlider, timeLabel, lyricsBox, volRow, scoreRow, ctrlRow, modeRow, bottomSpacer);
    }

    /** 沉浸布局左半侧：除歌词外的全部播放控件，垂直居中。 */
    private void fillImmersiveLeft() {
        normalColumn.getChildren().clear();
        immersiveLeft.getChildren().setAll(coverBox, visualizer, titleLabel, artistLabel, durationLabel,
                progressSlider, timeLabel, volRow, scoreRow, ctrlRow, modeRow);
    }

    private void buildImmersive() {
        immersiveRow.setAlignment(Pos.CENTER);
        immersiveRow.setMaxWidth(Double.MAX_VALUE);
        immersiveRow.setMaxHeight(Double.MAX_VALUE);
        immersiveLeft.setAlignment(Pos.CENTER);
        immersiveLeft.setFillWidth(true);
        immersiveLeft.prefWidthProperty().bind(widthProperty().multiply(0.40));
        immersiveLeft.setMaxWidth(Region.USE_PREF_SIZE);

        immDivider.setMinWidth(1);
        immDivider.setPrefWidth(1);
        immDivider.setMaxWidth(1);
        immDivider.setMaxHeight(Double.MAX_VALUE);

        immersiveRight.setAlignment(Pos.CENTER);
        immersiveRight.setFillWidth(true);
        HBox.setHgrow(immersiveRight, Priority.ALWAYS);
        for (int i = 0; i < IMM_SLOTS; i++) {
            VBox slot = new VBox(3);      // 一句和它的翻译之间要留出行距（原来 1pt 太挤）
            slot.setAlignment(Pos.CENTER);
            Label line = new Label();
            Label trans = new Label();
            for (Label l : new Label[]{line, trans}) {
                l.setAlignment(Pos.CENTER);
                l.setTextAlignment(TextAlignment.CENTER);
                l.setMaxWidth(Double.MAX_VALUE);
                l.setWrapText(false);
            }
            slot.getChildren().addAll(line, trans);
            immSlot[i] = slot;
            immLine[i] = line;
            immTrans[i] = trans;
            immersiveRight.getChildren().add(slot);
        }
        applyImmersiveStyle();
    }

    /**
     * 切换沉浸布局（右半侧七行歌词）。
     *
     * <p>为了"看起来是一个连续动作"，这里做了三件事：</p>
     * <ol>
     *   <li>换完子树先 {@code applyCss()+layout()} <b>把布局一次做完</b>，再开始淡入 ——
     *       不然第一帧要边布局边画（面板重排 + 换尺寸），看着就是卡一下；</li>
     *   <li>淡入淡出期间给内容开<b>缓存位图</b>：每帧只搬纹理、调透明度，不再重画里面的
     *       封面 / 七行歌词 / 滑块；</li>
     *   <li>退出时先淡掉沉浸内容，再换回常规布局并让它淡入（两段都是纯透明度动画），
     *       不会像以前那样"淡出→啪地一跳换成常规内容"。</li>
     * </ol>
     */
    public void setImmersive(boolean on) {
        if (immersive == on) {
            return;
        }
        immersive = on;
        if (on) {
            fillImmersiveLeft();
            immersiveRow.getChildren().setAll(immersiveLeft, immDivider, immersiveRight);
            getChildren().setAll(immersiveRow);
            VBox.setVgrow(immersiveRow, Priority.ALWAYS);
            applyImmersiveStyle();
            updateImmersiveLyrics(SongInfo.lyricIndexAt(main.currentLyrics, main.currentPos));
            applyCss();
            layout();
            immersiveRow.setCache(true);
            immersiveRow.setCacheHint(CacheHint.SPEED);
            immersiveRow.setOpacity(0);
            FadeTransition ft = new FadeTransition(Duration.millis(IMM_FADE_MS), immersiveRow);
            ft.setFromValue(0);
            ft.setToValue(1);
            ft.setInterpolator(Interpolator.EASE_BOTH);
            ft.setOnFinished(e -> endCache(immersiveRow));
            ft.play();
            if (coverHint != null) {
                coverHint.setText("点击封面退出沉浸模式");
            }
        } else {
            immersiveRow.setCache(true);
            immersiveRow.setCacheHint(CacheHint.SPEED);
            FadeTransition out = new FadeTransition(Duration.millis(IMM_FADE_MS * 0.6), immersiveRow);
            out.setFromValue(immersiveRow.getOpacity());
            out.setToValue(0);
            out.setInterpolator(Interpolator.EASE_IN);
            out.setOnFinished(e -> {
                endCache(immersiveRow);
                fillNormalColumn();
                getChildren().setAll(normalColumn);
                applyCss();
                layout();
                normalColumn.setCache(true);
                normalColumn.setCacheHint(CacheHint.SPEED);
                normalColumn.setOpacity(0);
                FadeTransition in = new FadeTransition(Duration.millis(IMM_FADE_MS * 0.6), normalColumn);
                in.setFromValue(0);
                in.setToValue(1);
                in.setInterpolator(Interpolator.EASE_OUT);
                in.setOnFinished(e2 -> {
                    endCache(normalColumn);
                    normalColumn.setOpacity(1);
                    updateLyricsDisplay();
                });
                in.play();
            });
            out.play();
            if (coverHint != null) {
                coverHint.setText("点击封面进入沉浸模式");
            }
        }
    }

    /** 过渡结束后的收尾：把过渡期间被冻结的歌词刷新补一次。 */
    public void refreshAfterTransition() {
        paintProgressColors();
        if (immersive) {
            // 沉浸模式下是七行歌词，直接补
            updateLyricsDisplay();
        }
    }

    private static void endCache(javafx.scene.Node node) {
        node.setCache(false);
        node.setCacheHint(CacheHint.DEFAULT);
    }

    public boolean isImmersive() {
        return immersive;
    }

    /** 七行歌词的字号/配色（按与当前句的距离分层）。 */
    private void applyImmersiveStyle() {
        String key = main.themeName + "|" + main.c("ACCENT") + "|" + main.c("ACCENT_2") + "|"
                + main.c("TEXT_MUTED");
        if (key.equals(immersiveStyleKey)) {
            return;   // 配色没变：这 10 多次 setStyle 每次都要重新解析 CSS，切一次就白花一次
        }
        immersiveStyleKey = key;
        String accent = main.c("ACCENT");
        String accent2 = main.c("ACCENT_2");
        String muted = main.c("TEXT_MUTED");
        immDivider.setStyle("-fx-background-color: " + ThemeCss.rgba(main.c("TEXT"), 0.12) + ";");
        for (int i = 0; i < IMM_SLOTS; i++) {
            int d = Math.abs(i - IMM_CENTER);
            double mainSize = switch (d) {
                case 0 -> 30;
                case 1 -> 20;
                case 2 -> 17;
                default -> 15;
            };
            double transSize = switch (d) {
                case 0 -> 17;
                case 1 -> 13;
                case 2 -> 12;
                default -> 11;
            };
            double opacity = switch (d) {
                case 0 -> 1.0;
                case 1 -> 0.88;
                case 2 -> 0.62;
                default -> 0.40;
            };
            double minHeight = switch (d) {
                case 0 -> 74;
                case 1 -> 48;
                case 2 -> 42;
                default -> 38;
            };
            // 中间那句不加粗（理由同 applyLyricsStyle：系统字体的 Bold 字面看起来被横向压扁），
            // 靠 30px + 主题色 + 不透明度 1.0 与其余六行拉开层次
            immLine[i].setStyle("-fx-text-fill: " + (d == 0 ? accent : muted) + ";"
                    + "-fx-font-size: " + mainSize + "px;");
            immTrans[i].setStyle("-fx-text-fill: " + (d == 0 ? accent2 : muted) + ";"
                    + "-fx-font-size: " + transSize + "px;");
            immSlot[i].setOpacity(opacity);
            immSlot[i].setMinHeight(minHeight);
        }
    }

    /** 刷新七行歌词：当前句恒在第 4 行，前后各 3 行，布局不跳动。 */
    private void updateImmersiveLyrics(int idx) {
        if (!immersive) {
            return;
        }
        List<SongInfo.LrcLine> lyrics = main.currentLyrics;
        if (lyrics.isEmpty()) {
            for (int i = 0; i < IMM_SLOTS; i++) {
                setImmersiveSlot(i, i == IMM_CENTER ? noLyricsText() : "", "");
            }
            return;
        }
        for (int i = 0; i < IMM_SLOTS; i++) {
            int li = idx + (i - IMM_CENTER);
            if (li < 0 || li >= lyrics.size()) {
                setImmersiveSlot(i, "", "");
                continue;
            }
            SongInfo.LrcLine l = lyrics.get(li);
            setImmersiveSlot(i, l.text() == null ? "" : l.text(),
                    l.translation() == null ? "" : l.translation());
        }
    }

    private void setImmersiveSlot(int i, String text, String trans) {
        Label line = immLine[i];
        Label tr = immTrans[i];
        if (!text.equals(line.getText())) {
            line.setText(text);
        }
        if (!trans.equals(tr.getText())) {
            tr.setText(trans);
        }
        boolean show = !trans.isBlank();
        if (tr.isVisible() != show) {
            tr.setVisible(show);
            tr.setManaged(show);
        }
    }

    private String noLyricsText() {
        String path = main.currentSongPath();
        if (path == null) {
            return "♪ Potato Player";
        }
        String artist = main.getCachedArtist(path);
        String title = main.getCachedTitle(path);
        if (title == null || title.isBlank()) {
            title = new java.io.File(path).getName();
        }
        if (artist != null && !artist.isBlank() && !"未知歌手".equals(artist)) {
            return "♪ " + artist + " - " + title;
        }
        return "♪ " + title;
    }

    private void applyCoverClip() {
        if ("circle_rotate".equals(main.coverStyle)) {
            coverView.setClip(new Circle(100, 100, 100));
        } else {
            coverView.setClip(new Rectangle(0, 0, 200, 200));
        }
    }

    private void applyCoverGlow() {
        Color c = Color.web(main.c("ACCENT"));
        coverGlow.setColor(new Color(c.getRed(), c.getGreen(), c.getBlue(), 0.45));
        coverGlow.setRadius(28);
        coverGlow.setSpread(0.15);
    }

    private void onSliderReleased() {
        main.dragging = false;
        if (main.totalSeconds > 0) {
            double frac = progressSlider.getValue() / 1000.0;
            main.seek(frac * main.totalSeconds);
        }
    }

    private void saveScore() {
        String path = main.currentSongPath();
        if (path == null) {
            return;
        }
        double score = scoreSpinner.getValue();
        main.lib().ratings().computeIfAbsent(path, k -> new java.util.LinkedHashMap<>()).put("score", score);
        main.lib().saveRatings();
        main.libraryPanel.refresh();
    }

    // ── 刷新 ──
    public void refreshCurrentSong() {
        paintProgressColors();          // 颜色跟着当前歌曲走（没歌曲时用两个默认色）
        String path = main.currentSongPath();
        if (path == null) {
            titleLabel.setText("歌曲：...");
            artistLabel.setText("歌手：...");
            durationLabel.setText("时长：...");
            coverView.setImage(null);
            main.coverOriginalImage = null;
            coverPlaceholder.setVisible(true);
            scoreSpinner.getValueFactory().setValue(0.0);
            main.currentLyrics = new ArrayList<>();
            main.currentLyricIndex = -1;
            showLyricSlots(-1);
            return;
        }
        SongInfo info = main.loadSongInfo(path);
        titleLabel.setText("歌曲：" + info.title);
        artistLabel.setText("歌手：" + info.artist);
        main.totalSeconds = info.duration;
        main.durationStr = info.duration > 0
                ? (info.duration / 60 + ":" + String.format("%02d", info.duration % 60))
                : "未知时长";
        durationLabel.setText("时长：" + main.durationStr);
        scoreSpinner.getValueFactory().setValue(score(path));
        main.currentLyrics = info.lyrics;
        main.currentLyricIndex = -1;
        updateCover(info.cover);
    }

    private void updateCover(byte[] cover) {
        if (cover == null) {
            main.coverOriginalImage = null;
            coverView.setImage(null);
            coverView.setEffect(null);
            coverPlaceholder.setVisible(true);
            return;
        }
        try {
            Image img = new Image(new ByteArrayInputStream(cover));
            main.coverOriginalImage = img;
            coverView.setImage(img);
            coverView.setEffect(coverGlow);
            coverPlaceholder.setVisible(false);
        } catch (Exception e) {
            main.coverOriginalImage = null;
            coverView.setImage(null);
            coverView.setEffect(null);
            coverPlaceholder.setVisible(true);
        }
    }

    public void updateCoverRotation(double angle) {
        if (main.coverOriginalImage == null) {
            return;
        }
        coverView.setRotate(angle);
    }

    public void updatePlayButton() {
        btnPlay.setText(main.stopped || main.paused ? "▶" : "⏸");
        visualizer.setActive(!main.stopped && !main.paused);
        // 这里是播放状态 UI 的唯一收口：播放 / 暂停 / 停止 / 换曲都会经过，
        // 顺手把「暂停时还在空转」的那些周期刷新和悬浮窗计时器一起收掉。
        main.syncPlaybackTimers();
        main.refreshOverlayTimer();
    }

    /**
     * 给进度条上色：<b>走过的一段 = 当前歌曲的块标识色，没走过的一段 = 它的流派标识色</b>。
     *
     * <p>JavaFX 的 Slider 皮肤里"已播放"那一段本来不是单独画的（只有一条 {@code .track} 加一个滑块），
     * 所以这里直接给 track 节点上一道<b>硬切</b>的线性渐变：分界点放在滑块中心处，
     * 这样颜色切换的位置始终跟着滑块走。没有块/流派的歌用各自的默认色
     * （和左侧歌曲库行首那条标识带用色一致）。</p>
     */
    private void paintProgressColors() {
        Node track = progressSlider.lookup(".track");
        if (track == null) {
            return;                     // 皮肤还没建好（还没显示过），下一个刷新周期再试
        }
        String path = main.currentSongPath();
        String block = path == null ? "" : ratingStr(path, "block");
        String genre = path == null ? "" : ratingStr(path, "genre");
        String played = block.isEmpty() ? Theme.DEFAULT_BLOCK_COLOR : main.getBlockColor(block);
        String rest = genre.isEmpty() ? Theme.DEFAULT_GENRE_COLOR : main.getGenreColor(genre);
        double frac = main.totalSeconds == 0 ? 0 : Math.min(Math.max(main.currentPos / main.totalSeconds, 0), 1);
        // 滑块中心从「半个滑块」走到「轨道宽 − 半个滑块」，分界点按同一套换算才跟得上
        double tw = track.getBoundsInLocal().getWidth();
        double hw = PROGRESS_THUMB / 2;
        double pct = tw > 2 * hw ? (hw + frac * (tw - 2 * hw)) / tw * 100 : frac * 100;
        track.setStyle(ThemeCss.progressTrackStyle(played, rest, pct));
    }

    public void updateBar() {
        double frac = main.totalSeconds == 0 ? 0 : Math.min(main.currentPos / main.totalSeconds, 1.0);
        if (!main.dragging) {
            progressSlider.setValue(frac * 1000);
        }
        paintProgressColors();
        if (main.totalSeconds > 0) {
            int m = (int) main.currentPos / 60;
            int s = (int) main.currentPos % 60;
            timeLabel.setText(m + ":" + String.format("%02d", s) + " / " + main.durationStr);
        } else {
            timeLabel.setText("? / " + main.durationStr);
        }
    }

    public void updateVolumeLabel() {
        volumeLabel.setText("音量：" + main.currentVolume + "%");
    }

    /** 同步「桌面歌词」按钮的选中态（不触发事件）。 */
    public void syncDesktopLyrics(boolean on) {
        btnDesktopLyrics.setSelected(on);
    }

    public void updateModeDisplay() {
        suppressMode = true;
        modeCombo.setValue(MODE_MAP.getOrDefault(main.playMode, "循环播放"));
        suppressMode = false;
    }

    /**
     * 更新歌词显示：前一句（灰）/ 本句（主题色加粗）/ 后一句（灰），
     * 每句下方可带翻译行（本句翻译用主题副色）。对应原版 update_lyrics_display()。
     */
    public void updateLyricsDisplay() {
        java.util.List<SongInfo.LrcLine> lyrics = main.currentLyrics;
        if (lyrics.isEmpty()) {
            main.currentLyricIndex = -1;
            showLyricSlots(-1);
            updateImmersiveLyrics(-1);
            return;
        }
        int idx = SongInfo.lyricIndexAt(lyrics, main.currentPos);
        main.currentLyricIndex = idx;
        showLyricSlots(idx);
        updateImmersiveLyrics(idx);
    }

    /** 渲染前一句 / 本句 / 后一句（idx < 0 表示还没进入第一句，全部留空）。 */
    private void showLyricSlots(int idx) {
        java.util.List<SongInfo.LrcLine> lyrics = main.currentLyrics;
        boolean hasTrans = false;
        for (SongInfo.LrcLine l : lyrics) {
            if (l.translation() != null && !l.translation().isBlank()) {
                hasTrans = true;
                break;
            }
        }
        SongInfo.LrcLine prev = (idx > 0) ? lyrics.get(idx - 1) : null;
        SongInfo.LrcLine cur = (idx >= 0 && idx < lyrics.size()) ? lyrics.get(idx) : null;
        SongInfo.LrcLine next = (idx >= 0 && idx + 1 < lyrics.size()) ? lyrics.get(idx + 1) : null;
        fillLyricSlot(lyricPrev, lyricPrevTrans, prev);
        fillLyricSlot(lyricCur, lyricCurTrans, cur);
        fillLyricSlot(lyricNext, lyricNextTrans, next);
        // 整首歌都没有翻译时隐藏翻译行，避免留出空白（与原版 has_trans 判断一致）
        setVisibleManaged(lyricPrevTrans, hasTrans);
        setVisibleManaged(lyricCurTrans, hasTrans);
        setVisibleManaged(lyricNextTrans, hasTrans);
    }

    private void fillLyricSlot(Label lineLabel, Label transLabel, SongInfo.LrcLine line) {
        if (line == null) {
            lineLabel.setText("");
            transLabel.setText("");
            return;
        }
        lineLabel.setText(line.text() == null ? "" : line.text());
        String t = line.translation();
        transLabel.setText(t == null ? "" : t);
    }

    private Label[] lyricLabels() {
        return new Label[]{lyricPrev, lyricPrevTrans, lyricCur, lyricCurTrans, lyricNext, lyricNextTrans};
    }

    /**
     * 按当前主题刷新三行歌词的配色与字号。
     *
     * <p><b>本句不加粗</b>：这台机器上系统字体的 Bold 字面是"字距不变、笔画变粗"的那种，
     * 内白被笔画吃掉，整行看起来就是<b>横向被压扁</b>（实测同一句话 30px：常规墨迹 1036px、
     * 粗体 1039px —— 几乎同宽，但粗体的字缝小得多）。所以本句改用<b>字号 + 主题色</b>来强调，
     * 字面跟其它行完全一致，不会变形。翻译行是中文（PingFang 有自己的粗体字面）照旧加粗。</p>
     */
    private void applyLyricsStyle() {
        String muted = main.c("TEXT_MUTED");
        String accent = main.c("ACCENT");
        String accent2 = main.c("ACCENT_2");
        styleLyric(lyricPrev, muted, 12.5, false, 0.85);
        styleLyric(lyricPrevTrans, muted, 10.5, false, 0.7);
        styleLyric(lyricCur, accent, 15.5, false, 1.0);
        styleLyric(lyricCurTrans, accent2, 12, true, 1.0);
        styleLyric(lyricNext, muted, 12.5, false, 0.85);
        styleLyric(lyricNextTrans, muted, 10.5, false, 0.7);
    }

    private void styleLyric(Label l, String color, double size, boolean bold, double opacity) {
        l.setStyle("-fx-text-fill: " + color + "; -fx-font-size: " + size + "px;"
                + (bold ? " -fx-font-weight: bold;" : ""));
        l.setOpacity(opacity);
    }

    private static void setVisibleManaged(javafx.scene.Node node, boolean visible) {
        node.setVisible(visible);
        node.setManaged(visible);
    }

    public void refreshTheme() {
        applyLyricsStyle();
        applyImmersiveStyle();
        applyCoverClip();
        applyCoverGlow();
        visualizer.setColor(main.c("ACCENT"), main.c("ACCENT_2"));
        if (main.coverOriginalImage != null) {
            coverView.setEffect(coverGlow);
        }
    }

    /** 取一条评分的字符串字段（空 = 没有）。 */
    private String ratingStr(String path, String key) {
        Map<String, Object> r = main.lib().ratings().get(path);
        if (r == null) {
            return "";
        }
        Object v = r.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    private double score(String path) {
        Map<String, Object> r = main.lib().ratings().get(path);
        if (r == null) {
            return 0;
        }
        Object v = r.get("score");
        return v instanceof Number n ? n.doubleValue() : 0;
    }
}
