package com.potato.player.core;

/**
 * 应用元信息（版本号等）。设置页版本显示与 pom.xml 保持一致。
 */
public final class AppInfo {

    /** 应用名称。 */
    public static final String NAME = "Potato Player";
    /**
     * 当前版本号。
     *
     * <p>版本规则（2026-10-07 起）：<b>每次改动递增最小版本号</b>
     * （2.0.10 → 2.0.10 → …），除非另行指定版本号。改动要同步记录到
     * {@code CHANGELOG.md} 与 {@code README.md}。</p>
     */
    public static final String VERSION = "2.1.15";
    /** 版本分支标识（与原 Python 版区分）。 */
    public static final String EDITION = "Java";
    /** 版本展示文本。 */
    public static final String DISPLAY = NAME + " " + VERSION + " (" + EDITION + ")";

    private AppInfo() {
    }
}
