package com.potato.player.core;

import java.lang.management.ManagementFactory;

/**
 * 启动耗时打点（只在启动时打几行，用来回答"为什么启动慢"）。
 *
 * <p>打点位置覆盖：main 入口 → JavaFX 回调 → 读 JSON 缓存 → VLC 引擎 →
 * 三栏界面 → 主题样式 → 歌曲库列表 → 主窗口显示 → 悬浮窗/歌词恢复 → 启动完成。
 * 每行给出<b>本段耗时</b>和<b>JVM 已运行</b>的绝对时间（用
 * {@link ManagementFactory#getRuntimeMXBean()} 的 uptime，所以能看出"JVM 起来到
 * main 之间"以及"JavaFX 工具包初始化"分别在哪儿）。</p>
 *
 * <p>输出走 stdout：用 {@code ./run.sh > 日志 2>&1} 启动就能落盘。</p>
 */
public final class StartupTimer {

    private static long last = System.nanoTime();

    private StartupTimer() {
    }

    /** 打一个点：{@code 名字 +本段 ms (JVM 已运行 ms)}。 */
    public static void mark(String what) {
        long now = System.nanoTime();
        long delta = (now - last) / 1_000_000;
        last = now;
        long uptime;
        try {
            uptime = ManagementFactory.getRuntimeMXBean().getUptime();
        } catch (Throwable t) {
            uptime = -1;
        }
        System.out.printf("[启动] %-24s 本段 %5d ms   JVM 已运行 %5d ms%n", what, delta, uptime);
    }
}
