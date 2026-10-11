package com.potato.player.ui;

import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.geometry.Pos;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.util.Duration;

import java.util.Random;

/**
 * 律动可视化条（播放时跳动，暂停/停止时塌缩）。
 */
public final class Visualizer extends HBox {

    private final Region[] bars = new Region[7];
    private final double[] targets = new double[7];
    private final double[] current = new double[7];
    private final Random random = new Random();
    private volatile boolean active = false;
    /** 只在需要动的时候跑：塌到底（暂停 / 停止）后自己停表。 */
    private final Timeline timer;

    public Visualizer() {
        setAlignment(Pos.CENTER);
        setSpacing(6);
        setPrefHeight(28);
        for (int i = 0; i < bars.length; i++) {
            bars[i] = new Region();
            bars[i].setPrefWidth(6);
            bars[i].setMinHeight(3);
            bars[i].setPrefHeight(4);
            getChildren().add(bars[i]);
        }
        timer = new Timeline(new KeyFrame(Duration.millis(110), e -> tick()));
        timer.setCycleCount(Animation.INDEFINITE);
        // 构造时不启动：开机没在放歌，柱子本来就是塌的，没必要每 110 ms 醒一次
    }

    public void setActive(boolean active) {
        this.active = active;
        // 变活跃要马上起表；变不活跃也得先跑两帧把柱子收回去，收完 tick 会自己停表
        if (timer.getStatus() != Animation.Status.RUNNING) {
            timer.play();
        }
    }

    /** 设置渐变配色（accent → accent2）。 */
    public void setColor(String accent, String accent2) {
        for (Region bar : bars) {
            bar.setStyle("-fx-background-color: linear-gradient(to top, " + accent + ", " + accent2 + ");"
                    + " -fx-background-radius: 3;");
        }
    }

    private void tick() {
        boolean changed = false;
        for (int i = 0; i < bars.length; i++) {
            double max = active ? 22 : 4;
            double min = 3;
            targets[i] = active ? min + random.nextDouble() * (max - min) : min;
            current[i] += (targets[i] - current[i]) * 0.4;
            // 量化到 0.5pt：值没变就不写属性，免得白白触发一次布局 + 主窗口重画
            double h = Math.max(3.0, Math.round(current[i] * 2) / 2.0);
            if (bars[i].getPrefHeight() != h) {
                bars[i].setPrefHeight(h);
                changed = true;
            }
        }
        if (!active && !changed) {
            // 已经塌到底了：停表，等 setActive(true) 再起来
            timer.stop();
        }
    }
}
