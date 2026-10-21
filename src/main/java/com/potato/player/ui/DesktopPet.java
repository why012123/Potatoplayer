package com.potato.player.ui;

import com.potato.player.core.Config;
import com.potato.player.core.PetAssets;
import javafx.animation.AnimationTimer;
import javafx.application.Platform;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.control.CheckMenuItem;
import javafx.scene.control.ContextMenu;
import javafx.scene.control.Menu;
import javafx.scene.control.MenuItem;
import javafx.scene.control.RadioMenuItem;
import javafx.scene.control.SeparatorMenuItem;
import javafx.scene.control.ToggleGroup;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.io.File;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 迷迭香桌宠（明日方舟 · 基建模型）。
 *
 * <p>行为：待机（Relax）→ 自己溜达（Move）→ 坐下（Sit）→ 睡觉（Sleep），
 * 点一下会回你一个 Interact；可以拖着走、滚轮缩放、右键菜单调大小/速度/穿透。</p>
 *
 * <p>为什么是「帧序列」而不是实时 Spine：Java 侧没有现成的 Spine 3.5 运行时，
 * 模型又大量用网格（40 个 Mesh 附件），区域贴图渲染会错。所以用官方 canvas 运行时
 * 离线烘焙成带 alpha 的 PNG 帧（{@code tools/bake-pet.mjs}），运行时只按帧率换图 ——
 * CPU 和内存都可控，也不需要额外依赖。</p>
 *
 * <p>素材版权归鹰角网络，不进公开仓库；见 {@link PetAssets}。</p>
 */
public final class DesktopPet {

    /** 角色 ID（对应 {@code pets/<charId>/}）。 */
    public static final String CHAR_ID = "rosmontis";

    /** 离屏幕底边多高（像素），别让脚正好卡在 Dock 边缘。 */
    private static final double GROUND_GAP = 6;

    private enum State { IDLE, WALK, SIT, SLEEP, INTERACT, DRAG }

    private final MainWindow main;
    private final Stage stage = new Stage(StageStyle.TRANSPARENT);
    private final ImageView view = new ImageView();
    private final StackPane root = new StackPane(view);
    private final Random random = new Random();

    /** 已加载的动作（后台线程写、FX 线程读）。 */
    private final Map<String, PetAssets.Clip> clips = new ConcurrentHashMap<>();
    private File assetDir;
    private volatile boolean loading;
    private volatile String loadError;
    private volatile boolean disposed;

    private volatile StringBuilder readyClip = new StringBuilder();

    /** 内容底边中点的屏幕坐标（「脚踩在哪」）。 */
    private double anchorX;
    private double anchorY;
    /** 烘焙像素 → 屏幕像素。 */
    private double scale = 1.0;
    /** 待机动作的烘焙宽度（缩放基准；素材加载好后会更新）。 */
    private double bakeWidth = 212;
    private double petWidth = 150;
    private double speed = 55;
    private boolean autoMove = true;
    private boolean clickThrough;

    private State state = State.IDLE;
    private PetAssets.Clip current;
    private boolean loopClip = true;
    private double clipPhaseMs;
    private double stateSinceMs;
    private double nextThinkAtMs;
    /** 上一次真的走起来的时间：太久没动就强制走两步（不然她可能连着坐下/发呆好几分钟）。 */
    private double lastWalkAtMs;
    private double walkToX;
    private int facing = 1;
    private double lastInteractionAtMs;
    private double sitHoldMs = 8000;
    private double sleepHoldMs = 30000;

    private AnimationTimer timer;
    private long lastTickNanos;
    private double lastPaintMs;
    private boolean dragging;
    private double pressScreenX;
    private double pressScreenY;
    private double pressAnchorX;
    private double pressAnchorY;
    private double lastClickAtMs;

    private ContextMenu menu;

    public DesktopPet(MainWindow main) {
        this.main = main;
        this.assetDir = PetAssets.resolveDir(main.lib().config(), CHAR_ID);
        stage.initStyle(StageStyle.TRANSPARENT);
        stage.setTitle("迷迭香");
        stage.setResizable(false);
        stage.setAlwaysOnTop(true);
        root.setStyle("-fx-background-color: transparent;");
        view.setPreserveRatio(true);
        view.setSmooth(true);
        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        stage.setScene(scene);
        installHandlers();
        restorePreferences();
    }

    // ── 素材 ──

    public File assetDir() {
        return assetDir;
    }

    public boolean assetsAvailable() {
        return PetAssets.available(assetDir);
    }

    /** 已加载的动作名（给设置页显示）。 */
    public String loadedClips() {
        return readyClip.toString();
    }

    public String loadError() {
        return loadError;
    }

    /**
     * 换素材目录并重新加载（设置页「重新加载素材」）。
     *
     * @return false = 这个目录里没有可用素材
     */
    public boolean reloadAssets(File dir) {
        if (!PetAssets.available(dir)) {
            return false;
        }
        assetDir = dir;
        clips.clear();
        readyClip = new StringBuilder();
        loadError = null;
        startLoading();
        return true;
    }

    private void startLoading() {
        if (loading) {
            return;
        }
        loading = true;
        Thread worker = new Thread(() -> {
            try {
                PetAssets.load(assetDir, clip -> {
                    clips.put(clip.name(), clip);
                    if (PetAssets.CLIP_IDLE.equals(clip.name())) {
                        bakeWidth = Math.max(1, clip.width());
                        scale = petWidth / bakeWidth;
                    }
                    synchronized (readyClip) {
                        if (readyClip.length() > 0) {
                            readyClip.append('/');
                        }
                        readyClip.append(clip.name());
                    }
                    // 第一段（待机）好了就能出场，后面的慢慢加载
                    if (PetAssets.CLIP_IDLE.equals(clip.name())) {
                        Platform.runLater(() -> {
                            if (!disposed) {
                                play(PetAssets.CLIP_IDLE, true);
                                stage.show();
                                applyWindowBounds();
                                // 关键：定时器要在这里也启动 —— show() 时素材还没加载好，
                                // 早期返回了，动画/自己走动全靠这个 timer
                                ensureTimer();
                                System.out.println("[桌宠] 已出场：" + assetDir
                                        + "（先加载了待机动作，其余后台继续）");
                            }
                        });
                    }
                });
            } catch (Exception e) {
                loadError = e.getMessage() == null ? e.toString() : e.getMessage();
            } finally {
                loading = false;
            }
        }, "pet-assets");
        worker.setDaemon(true);
        worker.setPriority(Thread.MIN_PRIORITY + 1);
        worker.start();
    }

    // ── 显示 / 隐藏 ──

    /** 显示桌宠；素材不存在返回 false（调用方负责提示）。 */
    public boolean show() {
        if (!assetsAvailable()) {
            return false;
        }
        if (clips.isEmpty()) {
            startLoading();
            return true;
        }
        if (!stage.isShowing()) {
            stage.show();
        }
        applyWindowBounds();
        ensureTimer();
        return true;
    }

    public void hide() {
        stopTimer();
        stage.hide();
        savePreferences();
    }

    public boolean isShowing() {
        return stage.isShowing();
    }

    public void toggle() {
        if (isShowing()) {
            hide();
        } else {
            show();
        }
    }

    /** 退出程序时调用：停定时器、关窗口（位置已经存过）。 */
    public void dispose() {
        disposed = true;
        savePreferences();
        stopTimer();
        stage.close();
    }

    // ── 状态机 ──

    private void ensureTimer() {
        if (timer != null) {
            return;
        }
        lastTickNanos = System.nanoTime();
        lastPaintMs = nowMs();
        lastInteractionAtMs = nowMs();
        lastWalkAtMs = nowMs();
        // 重新显示时把「状态」和「画面」一起拉回待机：
        // 隐藏前如果正在睡觉/坐着，只改 state 不改画面会卡在那段动作上
        enterIdle(2500 + random.nextInt(3000));
        timer = new AnimationTimer() {
            @Override
            public void handle(long now) {
                tick(now);
            }
        };
        timer.start();
    }

    private void stopTimer() {
        if (timer != null) {
            timer.stop();
            timer = null;
        }
    }

    private void tick(long nanos) {
        double now = nowMs();
        double dt = Math.min(0.12, (nanos - lastTickNanos) / 1e9);
        lastTickNanos = nanos;

        switch (state) {
            case IDLE -> {
                if (autoMove && now >= nextThinkAtMs) {
                    think(now);
                }
            }
            case WALK -> {
                double remain = walkToX - anchorX;
                double step = Math.max(1, speed) * dt;
                if (Math.abs(remain) <= step) {
                    anchorX = walkToX;
                    enterIdle(1800 + random.nextInt(3200));
                } else {
                    anchorX += Math.signum(remain) * step;
                    setFacing(remain < 0 ? -1 : 1);
                    applyWindowBounds();
                }
            }
            case INTERACT -> {
                if (now - stateSinceMs > clipDuration(current) + 120) {
                    enterIdle(1200 + random.nextInt(2000));
                }
            }
            case SIT -> {
                if (now - stateSinceMs > sitHoldMs) {
                    enterIdle(800);
                }
            }
            case SLEEP -> {
                if (now - stateSinceMs > sleepHoldMs) {
                    enterIdle(1000);
                }
            }
            case DRAG -> {
                // 拖着的时候不自己走，画面保持当前的待机动作
            }
            default -> {
            }
        }

        advanceFrame(dt);
        // 30fps 上限：桌宠不需要 60fps，省电
        if (now - lastPaintMs >= 1000.0 / 30) {
            lastPaintMs = now;
            Image frame = current == null ? null : frameForCurrent();
            if (frame != null && frame != view.getImage()) {
                view.setImage(frame);
            }
        }
    }

    private Image frameForCurrent() {
        if (current == null) {
            return null;
        }
        if (loopClip) {
            return current.frameAt(clipPhaseMs);
        }
        double duration = current.durationMs();
        if (clipPhaseMs >= duration) {
            return current.lastFrame();
        }
        return current.frameAt(clipPhaseMs);
    }

    private void advanceFrame(double dt) {
        if (current == null) {
            return;
        }
        if (state == State.DRAG) {
            return;
        }
        if (loopClip) {
            clipPhaseMs += dt * 1000.0;
            double duration = current.durationMs();
            if (duration > 0) {
                clipPhaseMs %= duration;
            }
        } else {
            clipPhaseMs = Math.min(current.durationMs(), clipPhaseMs + dt * 1000.0);
        }
    }

    private void think(double now) {
        boolean playing = main.isPlayingAudio();
        // 太久没动就强制走两步：只靠随机的话，可能连着坐/发呆好几分钟看不到她挪窝
        if (clips.containsKey(PetAssets.CLIP_MOVE) && now - lastWalkAtMs > 18_000) {
            startWalk();
            return;
        }
        double r = random.nextDouble();
        boolean idleLongEnough = now - lastInteractionAtMs > 180_000;
        if (!playing && idleLongEnough && clips.containsKey(PetAssets.CLIP_SLEEP) && r < 0.45) {
            play(PetAssets.CLIP_SLEEP, true);
            state = State.SLEEP;
            stateSinceMs = now;
            sleepHoldMs = 20_000 + random.nextInt(35_000);
            return;
        }
        if (clips.containsKey(PetAssets.CLIP_MOVE) && r < (playing ? 0.55 : 0.38)) {
            startWalk();
            return;
        }
        if (clips.containsKey(PetAssets.CLIP_SIT) && r < 0.62) {
            play(PetAssets.CLIP_SIT, false);
            state = State.SIT;
            stateSinceMs = now;
            sitHoldMs = 7000 + random.nextInt(11_000);
            return;
        }
        if (clips.containsKey(PetAssets.CLIP_INTERACT) && r < 0.72) {
            play(PetAssets.CLIP_INTERACT, false);
            state = State.INTERACT;
            stateSinceMs = now;
            return;
        }
        nextThinkAtMs = now + 3000 + random.nextInt(5000);
    }

    private void startWalk() {
        Rectangle2D bounds = screenBounds();
        double margin = 40;
        double left = bounds.getMinX() + margin;
        double right = bounds.getMaxX() - margin - windowWidth();
        double target = left + random.nextDouble() * Math.max(1, right - left);
        // 太近就换一头走，免得原地踏步
        if (Math.abs(target - anchorX) < 70) {
            target = anchorX < (left + right) / 2 ? right : left;
        }
        walkToX = Math.max(left, Math.min(right, target));
        lastWalkAtMs = nowMs();
        setFacing(walkToX < anchorX ? -1 : 1);
        play(PetAssets.CLIP_MOVE, true);
        state = State.WALK;
    }

    private void enterIdle(long delayMs) {
        play(PetAssets.CLIP_IDLE, true);
        state = State.IDLE;
        stateSinceMs = nowMs();
        nextThinkAtMs = nowMs() + Math.max(600, delayMs);
    }

    private void play(String clipName, boolean loop) {
        PetAssets.Clip clip = clips.get(clipName);
        if (clip == null) {
            clip = clips.get(PetAssets.CLIP_IDLE);
        }
        if (clip == null) {
            return;
        }
        boolean changed = clip != current;
        current = clip;
        loopClip = loop;
        clipPhaseMs = 0;
        view.setImage(clip.frameAt(0));
        if (changed) {
            applyWindowBounds();
        }
    }

    private void wake() {
        lastInteractionAtMs = nowMs();
        if (state == State.SLEEP || state == State.SIT) {
            enterIdle(400);
        } else {
            play(PetAssets.CLIP_INTERACT, false);
            state = State.INTERACT;
            stateSinceMs = nowMs();
        }
    }

    // ── 窗口几何 ──

    private double windowWidth() {
        return current == null ? petWidth : current.width() * scale;
    }

    private double windowHeight() {
        return current == null ? petWidth : current.height() * scale;
    }

    /** 把窗口摆到「内容底边中点 = (anchorX, anchorY)」的位置。 */
    private void applyWindowBounds() {
        if (current == null) {
            return;
        }
        double w = windowWidth();
        double h = windowHeight();
        double centerFraction = current.contentCenterX();
        if (facing < 0) {
            centerFraction = 1 - centerFraction;
        }
        double x = anchorX - centerFraction * w;
        double y = anchorY - current.contentBottom() * h;
        if (Math.abs(stage.getWidth() - w) > 0.5) {
            stage.setWidth(w);
        }
        if (Math.abs(stage.getHeight() - h) > 0.5) {
            stage.setHeight(h);
        }
        view.setFitWidth(w);
        view.setFitHeight(h);
        view.setScaleX(facing < 0 ? -1 : 1);
        if (Math.abs(stage.getX() - x) > 0.4) {
            stage.setX(x);
        }
        if (Math.abs(stage.getY() - y) > 0.4) {
            stage.setY(y);
        }
    }

    private void setFacing(int dir) {
        if (dir == 0 || dir == facing) {
            return;
        }
        facing = dir;
        applyWindowBounds();
    }

    private Rectangle2D screenBounds() {
        try {
            Screen screen = screenFor(anchorX, anchorY);
            return screen.getVisualBounds();
        } catch (Exception e) {
            return Screen.getPrimary().getVisualBounds();
        }
    }

    private static Screen screenFor(double x, double y) {
        for (Screen screen : Screen.getScreens()) {
            if (screen.getVisualBounds().contains(x, y)) {
                return screen;
            }
        }
        return Screen.getPrimary();
    }

    private void clampToScreen() {
        Rectangle2D bounds = screenBounds();
        double w = windowWidth();
        double h = windowHeight();
        double minX = bounds.getMinX() + 3;
        double maxX = bounds.getMaxX() - 3;
        anchorX = Math.max(minX + w * 0.1, Math.min(maxX - w * 0.1, anchorX));
        double top = bounds.getMinY() + h * 0.55;
        double bottom = bounds.getMaxY() - GROUND_GAP;
        anchorY = Math.max(top, Math.min(bottom, anchorY));
    }

    // ── 交互 ──

    private void installHandlers() {
        root.setOnMousePressed(e -> {
            lastInteractionAtMs = nowMs();
            if (e.getButton() == javafx.scene.input.MouseButton.PRIMARY) {
                dragging = false;
                pressScreenX = e.getScreenX();
                pressScreenY = e.getScreenY();
                pressAnchorX = anchorX;
                pressAnchorY = anchorY;
                stopWalkForDrag();
            }
        });

        root.setOnMouseDragged(e -> {
            if (!e.isPrimaryButtonDown()) {
                return;
            }
            double dx = e.getScreenX() - pressScreenX;
            double dy = e.getScreenY() - pressScreenY;
            if (!dragging && Math.abs(dx) + Math.abs(dy) > 4) {
                dragging = true;
                state = State.DRAG;
            }
            if (dragging) {
                anchorX = pressAnchorX + dx;
                anchorY = pressAnchorY + dy;
                clampToScreen();
                applyWindowBounds();
            }
        });

        root.setOnMouseReleased(e -> {
            if (dragging) {
                dragging = false;
                clampToScreen();
                savePreferences();
                enterIdle(700 + random.nextInt(900));
            }
        });

        root.setOnMouseClicked(e -> {
            if (e.getButton() != javafx.scene.input.MouseButton.PRIMARY) {
                return;
            }
            double now = nowMs();
            if (now - lastClickAtMs < 340) {
                // 双击：把播放器叫出来
                main.showPlayerWindow();
                lastClickAtMs = 0;
                return;
            }
            lastClickAtMs = now;
            if (!dragging) {
                wake();
            }
        });

        root.setOnScroll(e -> {
            double factor = e.getDeltaY() > 0 ? 1.08 : 1 / 1.08;
            setPetWidth(petWidth * factor);
            e.consume();
        });

        root.setOnContextMenuRequested(e -> {
            if (clickThrough) {
                return;
            }
            showMenu(e.getScreenX(), e.getScreenY());
        });
    }

    private void stopWalkForDrag() {
        if (state == State.WALK) {
            play(PetAssets.CLIP_IDLE, true);
            state = State.IDLE;
        }
    }

    private void showMenu(double screenX, double screenY) {
        if (menu == null) {
            menu = buildMenu();
        }
        menu.show(stage, screenX, screenY);
    }

    private ContextMenu buildMenu() {
        ContextMenu m = new ContextMenu();

        MenuItem hello = new MenuItem("👋 打个招呼");
        hello.setOnAction(e -> greet());
        MenuItem sit = new MenuItem("🪑 坐下");
        sit.setOnAction(e -> {
            if (clips.containsKey(PetAssets.CLIP_SIT)) {
                play(PetAssets.CLIP_SIT, false);
                state = State.SIT;
                stateSinceMs = nowMs();
                sitHoldMs = 12_000;
            }
        });
        MenuItem sleep = new MenuItem("😴 睡觉");
        sleep.setOnAction(e -> {
            if (clips.containsKey(PetAssets.CLIP_SLEEP)) {
                play(PetAssets.CLIP_SLEEP, true);
                state = State.SLEEP;
                stateSinceMs = nowMs();
                sleepHoldMs = 30_000;
            }
        });
        MenuItem wake = new MenuItem("☀️ 醒一醒");
        wake.setOnAction(e -> enterIdle(500));
        m.getItems().addAll(hello, sit, sleep, wake);
        m.getItems().add(new SeparatorMenuItem());

        Menu sizeMenu = new Menu("📏 大小");
        ToggleGroup sizeGroup = new ToggleGroup();
        String[] sizeNames = {"小", "中", "大", "特大"};
        double[] sizePx = {110, 150, 200, 260};
        for (int i = 0; i < sizeNames.length; i++) {
            double px = sizePx[i];
            RadioMenuItem item = new RadioMenuItem(sizeNames[i] + "（" + (int) px + "px）");
            item.setToggleGroup(sizeGroup);
            item.setSelected(Math.abs(petWidth - px) < 1);
            item.setOnAction(e -> setPetWidth(px));
            sizeMenu.getItems().add(item);
        }
        m.getItems().add(sizeMenu);

        Menu speedMenu = new Menu("🏃 走动速度");
        ToggleGroup speedGroup = new ToggleGroup();
        String[] speedNames = {"慢", "中", "快", "飞起"};
        double[] speedPx = {35, 55, 85, 130};
        for (int i = 0; i < speedNames.length; i++) {
            double px = speedPx[i];
            RadioMenuItem item = new RadioMenuItem(speedNames[i]);
            item.setToggleGroup(speedGroup);
            item.setSelected(Math.abs(speed - px) < 1);
            item.setOnAction(e -> setSpeed(px));
            speedMenu.getItems().add(item);
        }
        m.getItems().add(speedMenu);

        CheckMenuItem auto = new CheckMenuItem("🚶 自己走动");
        auto.setSelected(autoMove);
        auto.setOnAction(e -> setAutoMove(auto.isSelected()));
        m.getItems().add(auto);

        CheckMenuItem through = new CheckMenuItem("🖱 鼠标穿透（点不到她）");
        through.setSelected(clickThrough);
        through.setDisable(!MacWindowClickThrough.isAvailable());
        through.setOnAction(e -> setClickThrough(through.isSelected()));
        m.getItems().add(through);

        m.getItems().add(new SeparatorMenuItem());
        MenuItem ground = new MenuItem("⬇️ 回到地面");
        ground.setOnAction(e -> {
            Rectangle2D bounds = screenBounds();
            anchorY = bounds.getMaxY() - GROUND_GAP;
            clampToScreen();
            applyWindowBounds();
            savePreferences();
        });
        MenuItem center = new MenuItem("🎯 回到屏幕中间");
        center.setOnAction(e -> {
            Rectangle2D bounds = screenBounds();
            anchorX = bounds.getMinX() + bounds.getWidth() / 2;
            anchorY = bounds.getMaxY() - GROUND_GAP;
            clampToScreen();
            applyWindowBounds();
            savePreferences();
        });
        MenuItem hide = new MenuItem("🙈 隐藏桌宠");
        hide.setOnAction(e -> {
            hide();
            main.syncPetUi();
        });
        m.getItems().addAll(ground, center, hide);
        return m;
    }

    /** 回到当前屏幕的底边（设置页/菜单共用）。 */
    public void resetToGround() {
        Rectangle2D bounds = screenBounds();
        anchorY = bounds.getMaxY() - GROUND_GAP;
        clampToScreen();
        applyWindowBounds();
        savePreferences();
    }

    /** 点一下/菜单「打个招呼」：播一段 Interact。 */
    public void greet() {
        lastInteractionAtMs = nowMs();
        if (!clips.containsKey(PetAssets.CLIP_INTERACT)) {
            return;
        }
        play(PetAssets.CLIP_INTERACT, false);
        state = State.INTERACT;
        stateSinceMs = nowMs();
    }

    // ── 参数（菜单 / 设置页共用）──

    public double petWidth() {
        return petWidth;
    }

    public void setPetWidth(double width) {
        petWidth = Math.max(70, Math.min(420, width));
        scale = petWidth / Math.max(1, bakeWidth);
        applyWindowBounds();
        clampToScreen();
        applyWindowBounds();
        savePreferences();
    }

    public double speed() {
        return speed;
    }

    public void setSpeed(double pxPerSecond) {
        speed = Math.max(10, Math.min(220, pxPerSecond));
        savePreferences();
    }

    public boolean isAutoMove() {
        return autoMove;
    }

    public void setAutoMove(boolean on) {
        autoMove = on;
        if (!on && state == State.WALK) {
            enterIdle(600);
        }
        savePreferences();
    }

    public boolean isClickThrough() {
        return clickThrough;
    }

    public void setClickThrough(boolean on) {
        if (on && !MacWindowClickThrough.isAvailable()) {
            return;
        }
        clickThrough = on;
        MacWindowClickThrough.setIgnoreMouseEvents(stage, on);
        savePreferences();
    }

    public boolean hasClip(String name) {
        return clips.containsKey(name);
    }

    public double anchorX() {
        return anchorX;
    }

    public double anchorY() {
        return anchorY;
    }

    // ── 持久化 ──

    private void restorePreferences() {
        Map<String, Object> cfg = main.lib().config();
        petWidth = Math.max(70, Math.min(420, Config.getDouble(cfg, "pet_width", 150)));
        scale = petWidth / Math.max(1, bakeWidth);
        speed = Math.max(10, Math.min(220, Config.getDouble(cfg, "pet_speed", 55)));
        autoMove = Config.getBool(cfg, "pet_auto", true);
        clickThrough = Config.getBool(cfg, "pet_click_through", false);
        Rectangle2D bounds = Screen.getPrimary().getVisualBounds();
        anchorX = Config.getDouble(cfg, "pet_x", bounds.getMaxX() - 240);
        anchorY = Config.getDouble(cfg, "pet_y", bounds.getMaxY() - GROUND_GAP);
        if (anchorX < bounds.getMinX() || anchorX > bounds.getMaxX()
                || anchorY < bounds.getMinY() || anchorY > bounds.getMaxY() + 40) {
            anchorX = bounds.getMaxX() - 240;
            anchorY = bounds.getMaxY() - GROUND_GAP;
        }
        if (clickThrough) {
            Platform.runLater(() -> MacWindowClickThrough.setIgnoreMouseEvents(stage, true));
        }
    }

    /** 位置 / 大小 / 开关写回配置（真正落盘由 lib.saveConfig 负责）。 */
    public void savePreferences() {
        Map<String, Object> cfg = main.lib().config();
        cfg.put("pet_width", petWidth);
        cfg.put("pet_speed", speed);
        cfg.put("pet_auto", autoMove);
        cfg.put("pet_click_through", clickThrough);
        cfg.put("pet_x", anchorX);
        cfg.put("pet_y", anchorY);
        // 立刻落盘：主窗口 close() 不会统一 saveConfig，不存的话拖完/缩放完就丢
        main.lib().saveConfig();
        // 刻意不写 pet_dir：那是「用户显式指定」才该存在的键，
        // 自动写进去会把素材目录钉死成本机绝对路径，换机器就判成没素材
    }

    // ── 小工具 ──

    private static double nowMs() {
        return System.nanoTime() / 1e6;
    }

    private static double clipDuration(PetAssets.Clip clip) {
        return clip == null ? 0 : clip.durationMs();
    }

    /** 正在睡觉（给设置页显示状态）。 */
    public boolean isSleeping() {
        return state == State.SLEEP;
    }

    public String stateName() {
        return switch (state) {
            case IDLE -> "待机";
            case WALK -> "散步中";
            case SIT -> "坐着";
            case SLEEP -> "睡着";
            case INTERACT -> "打招呼";
            case DRAG -> "被拎着";
        };
    }
}
