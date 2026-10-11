package com.potato.player;

import com.potato.player.ui.MainWindow;
import javafx.application.Application;
import javafx.stage.Stage;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Potato Player（Java 版）入口。
 */
public class App extends Application {

    @Override
    public void start(Stage stage) {
        com.potato.player.core.StartupTimer.mark("JavaFX 回调 start");
        new MainWindow(stage);
    }

    public static void main(String[] args) {
        com.potato.player.core.StartupTimer.mark("main 入口");
        // jaudiotagger 把每个 FLAC 的每个 block 都按 INFO 打到控制台
        // （一次启动几千行，既是屏幕垃圾也是磁盘写入），这里统一压到 WARNING。
        Logger.getLogger("org.jaudiotagger").setLevel(Level.WARNING);

        // 注意：不要指望 -Djavafx.animation.pulse=30 省电。
        // 实测（macOS + JavaFX 21.0.12）：设了它之后 JavaFX 只会打印一句
        // 「Setting PULSE_DURATION to 30 hz」，但 AnimationTimer 依然被 CVDisplayLink
        // 按屏幕刷新率叫醒 60 次/秒 —— 真正的限流放在 GifOverlay 里自己做（anim_low_fps）。
        launch(args);
    }
}
