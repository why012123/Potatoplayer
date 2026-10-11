package com.potato.player.ui;

import com.potato.player.core.Config;
import com.potato.player.core.FogField;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.image.ImageView;
import javafx.scene.image.PixelFormat;
import javafx.scene.image.WritableImage;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import javafx.util.Duration;

import java.util.Map;
import java.util.Random;

/**
 * 🌫 屏幕起雾（<b>测试功能，默认关</b>）。
 *
 * <p>放歌的时候屏幕会慢慢"起雾"，像冬天玻璃上凝的那层：想看清楚就得拿
 * <b>小动图</b>（动图悬浮窗）在雾上来回擦 —— 擦过的地方会露出来，
 * 但过一会儿又会重新雾上。</p>
 *
 * <p>实现要点：</p>
 * <ul>
 *   <li>一个<b>全屏透明 + 置顶 + 鼠标穿透</b>的窗口盖在最上层。穿透用
 *       {@link MacWindowClickThrough}（JNA 调 {@code setIgnoresMouseEvents:}），
 *       所以起雾时桌面和别的应用照样能点；拿不到穿透能力就 refusing 开启，
 *       免得整屏点不动。</li>
 *   <li>雾本身是一张 {@code 245×160} 的密度图（{@link FogField}，6 点一格），
 *       交给 {@link ImageView#setSmooth(boolean)} 双线性放大到全屏 ——
 *       每帧只写几万个像素（实测 step+打包 ≈ 0.4 ms），10fps 跑起来占用可以忽略。</li>
 *   <li>小动图移动（拖拽 / 滚轮缩放 / 重置位置）时由 {@link GifOverlay} 通知这里擦除，
 *       擦除半径 = 小动图宽度 × {@code fog_wipe_scale}。</li>
 * </ul>
 *
 * <p>所有参数都在 设置 → 🌫 屏幕起雾（测试） 里，可随时调、随时关。</p>
 */
public final class FogOverlay {

    private static final String WINDOW_TITLE = "PotatoFogOverlay";
    /** 密度格边长（点）：越小越细腻、越费 CPU；6 点在这台机器上 ≈ 0.4 ms/帧。 */
    private static final double CELL = 6.0;
    /** 雾的刷新率：起雾很慢，10fps 完全够，也省电。 */
    private static final double TICK_MS = 100;

    public static final double FILL_MIN_SEC = 10;
    public static final double FILL_MAX_SEC = 300;
    public static final double FILL_DEFAULT_SEC = 90;
    public static final double ALPHA_DEFAULT = 0.55;
    public static final double WIPE_DEFAULT = 0.55;
    public static final double WIPE_SCALE_DEFAULT = 1.0;

    private final MainWindow main;
    private final Random rnd = new Random();

    private Stage stage;
    private ImageView view;
    private WritableImage image;
    private FogField field;
    private int[] argb;
    private Timeline timer;
    private long lastNanos;

    private boolean on;
    private double fillSeconds;
    private double maxAlpha;
    private double wipeStrength;
    private double wipeScale;

    private double originX;
    private double originY;

    public FogOverlay(MainWindow main) {
        this.main = main;
        Map<String, Object> cfg = main.lib().config();
        this.on = Config.getBool(cfg, "fog_on", false);
        this.fillSeconds = clampFill(Config.getDouble(cfg, "fog_fill_seconds", FILL_DEFAULT_SEC));
        this.maxAlpha = clampAlpha(Config.getDouble(cfg, "fog_max_alpha", ALPHA_DEFAULT));
        this.wipeStrength = clampWipe(Config.getDouble(cfg, "fog_wipe_strength", WIPE_DEFAULT));
        this.wipeScale = clampWipeScale(Config.getDouble(cfg, "fog_wipe_scale", WIPE_SCALE_DEFAULT));
    }

    // ── 状态 ──

    public boolean isOn() {
        return on;
    }

    public double fillSeconds() {
        return fillSeconds;
    }

    public double maxAlpha() {
        return maxAlpha;
    }

    public double wipeStrength() {
        return wipeStrength;
    }

    public double wipeScale() {
        return wipeScale;
    }

    /**
     * 开启 / 关闭起雾。开启失败（系统不支持鼠标穿透）返回 false，界面负责提示。
     */
    public boolean setOn(boolean value) {
        if (value) {
            // 拿不到鼠标穿透就宁可不给自己开：全屏雾层没穿透会把整台机器点死
            if (!MacWindowClickThrough.isAvailable()) {
                on = false;
                return false;
            }
            ensureStage();
            if (stage == null) {
                on = false;
                return false;
            }
            stage.show();
            if (!MacWindowClickThrough.setIgnoreMouseEvents(stage, true)) {
                stage.hide();
                on = false;
                return false;
            }
            on = true;
            // 小动图要压在雾上面才看得见（两个都是置顶窗，后到前的在上面）；
            // 一开就先把小动图当前位置擦出来，不然它自己就埋在雾里
            if (main.gifOverlayShowing()) {
                main.gifOverlay().toFront();
                wipeAtSticker();
            }
            startTimer();
        } else {
            on = false;
            hide();
        }
        main.lib().config().put("fog_on", on);
        main.lib().saveConfig();
        return on == value;
    }

    public boolean toggle() {
        return setOn(!on);
    }

    private void hide() {
        stopTimer();
        if (stage != null) {
            stage.hide();
        }
    }

    public void dispose() {
        stopTimer();
        if (stage != null) {
            MacWindowClickThrough.setIgnoreMouseEvents(stage, false);
            stage.hide();
        }
    }

    // ── 擦除 / 调试 ──

    /**
     * 小动图划到某处：在那儿擦掉一块雾。
     *
     * @param screenX       小动图中心（屏幕坐标）
     * @param screenY       小动图中心（屏幕坐标）
     * @param stickerWidth  小动图宽度（点）：擦除半径按它乘系数
     */
    public void wipeFromSticker(double screenX, double screenY, double stickerWidth) {
        if (!on || field == null) {
            return;
        }
        double radius = Math.max(24, stickerWidth * wipeScale * 0.5);
        // 屏幕坐标 → 窗口内局部坐标（密度场的原点）
        field.wipe(screenX - originX, screenY - originY, radius, wipeStrength);
    }

    /** 用当前悬浮窗的位置擦一下（没有悬浮窗就什么都不做）。 */
    public void wipeAtSticker() {
        if (!on || field == null || !main.gifOverlayShowing()) {
            return;
        }
        GifOverlay gif = main.gifOverlay();
        double[] c = gif.centerOnScreen();
        wipeFromSticker(c[0], c[1], gif.currentWidth());
    }

    /** 调试键：立刻铺满。 */
    public void fogNow() {
        if (field != null) {
            field.fillToCap();
            render();
        }
    }

    /** 调试键：一键清雾。 */
    public void clearFog() {
        if (field != null) {
            field.clear();
            render();
        }
    }

    // ── 参数 ──

    public void setFillSeconds(double value) {
        fillSeconds = clampFill(value);
        main.lib().config().put("fog_fill_seconds", fillSeconds);
        main.lib().saveConfig();
    }

    public void setMaxAlpha(double value) {
        maxAlpha = clampAlpha(value);
        main.lib().config().put("fog_max_alpha", maxAlpha);
        main.lib().saveConfig();
        render();
    }

    public void setWipeStrength(double value) {
        wipeStrength = clampWipe(value);
        main.lib().config().put("fog_wipe_strength", wipeStrength);
        main.lib().saveConfig();
    }

    public void setWipeScale(double value) {
        wipeScale = clampWipeScale(value);
        main.lib().config().put("fog_wipe_scale", wipeScale);
        main.lib().saveConfig();
    }

    // ── 窗口 ──

    private void ensureStage() {
        if (stage != null) {
            return;
        }
        Rectangle2D vb;
        try {
            vb = Screen.getPrimary().getVisualBounds();
        } catch (Throwable t) {
            return;
        }
        originX = vb.getMinX();
        originY = vb.getMinY();
        // 注意：密度场按「窗口内局部坐标」建（原点 0,0），所有调用点自己减 origin。
        // 屏幕上这个窗口是从 visualBounds 的 min 开始摆的（主屏 minY = 菜单栏 33），
        // 如果这里也传 origin，就会被减两次、擦除位置整体偏上去。
        field = new FogField(vb.getWidth(), vb.getHeight(), CELL, 0, 0, System.nanoTime());
        argb = new int[field.cols() * field.rows()];
        image = new WritableImage(field.cols(), field.rows());

        view = new ImageView(image);
        view.setFitWidth(vb.getWidth());
        view.setFitHeight(vb.getHeight());
        view.setPreserveRatio(false);
        view.setSmooth(true);

        StackPane root = new StackPane(view);
        root.setStyle("-fx-background-color: transparent;");

        stage = new Stage();
        stage.initStyle(StageStyle.TRANSPARENT);
        stage.setTitle(WINDOW_TITLE);
        stage.setAlwaysOnTop(true);
        stage.setResizable(false);
        Scene scene = new Scene(root, vb.getWidth(), vb.getHeight());
        scene.setFill(Color.TRANSPARENT);
        stage.setScene(scene);
        stage.setX(originX);
        stage.setY(originY);
        stage.setOnHidden(e -> stopTimer());
    }

    // ── 计时器（同样按需：关掉就一帧都不跑）──

    private void startTimer() {
        if (timer != null) {
            return;
        }
        lastNanos = 0;
        timer = new Timeline(new KeyFrame(Duration.millis(TICK_MS), e -> {
            tick();
        }));
        timer.setCycleCount(Animation.INDEFINITE);
        timer.play();
    }

    private void stopTimer() {
        if (timer != null) {
            timer.stop();
            timer = null;
        }
    }

    private void tick() {
        if (field == null) {
            return;
        }
        long now = System.nanoTime();
        double dt = lastNanos == 0 ? 0 : (now - lastNanos) / 1e9;
        lastNanos = now;
        if (dt <= 0 || dt > 2) {
            dt = TICK_MS / 1000.0;
        }
        double rate = 1.0 / Math.max(1.0, fillSeconds);
        field.step(dt, rate);
        // 雾是一团团来的：时不时补一小团，免得整屏像匀速刷白
        if (rnd.nextDouble() < 0.35) {
            // stage 的宽高就是窗口内局部坐标的范围
            field.addBlob(rnd.nextDouble() * stage.getWidth(),
                    rnd.nextDouble() * stage.getHeight(),
                    150 + rnd.nextDouble() * 150, 0.05f);
        }
        render();
    }

    private void render() {
        if (field == null || image == null) {
            return;
        }
        field.toArgbPre((int) Math.round(maxAlpha * 255), argb);
        image.getPixelWriter().setPixels(0, 0, field.cols(), field.rows(),
                PixelFormat.getIntArgbPreInstance(), argb, 0, field.cols());
    }

    // ── 参数夹取 ──

    private static double clampFill(double v) {
        if (Double.isNaN(v)) {
            return FILL_DEFAULT_SEC;
        }
        return Math.max(FILL_MIN_SEC, Math.min(FILL_MAX_SEC, v));
    }

    private static double clampAlpha(double v) {
        if (Double.isNaN(v)) {
            return ALPHA_DEFAULT;
        }
        return Math.max(0.05, Math.min(0.95, v));
    }

    private static double clampWipe(double v) {
        if (Double.isNaN(v)) {
            return WIPE_DEFAULT;
        }
        return Math.max(0.05, Math.min(1.0, v));
    }

    private static double clampWipeScale(double v) {
        if (Double.isNaN(v)) {
            return WIPE_SCALE_DEFAULT;
        }
        return Math.max(0.2, Math.min(2.5, v));
    }
}
