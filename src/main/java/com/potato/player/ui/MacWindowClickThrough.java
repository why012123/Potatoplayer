package com.potato.player.ui;

import com.sun.jna.Function;
import com.sun.jna.NativeLibrary;
import com.sun.jna.Pointer;
import javafx.stage.Stage;

/**
 * macOS 专用：让窗口真正忽略鼠标事件（点击穿透到桌面/下层应用）。
 *
 * <p>JavaFX 没有对应 API，只能通过 JNA 调用 Cocoa 的 {@code -[NSWindow setIgnoresMouseEvents:]}。
 * 非 macOS、JNA 不可用或调用失败时静默降级（此时仅由 JavaFX 侧 root.setMouseTransparent 兜底，
 * 窗口仍会挡住点击，但不会影响程序其余功能）。
 */
final class MacWindowClickThrough {

    private static final boolean IS_MAC =
            System.getProperty("os.name", "").toLowerCase().contains("mac");

    private static NativeLibrary objc;
    private static Function msgSend;
    private static boolean initTried;
    private static boolean ready;

    private MacWindowClickThrough() {
    }

    private static synchronized boolean init() {
        if (initTried) {
            return ready;
        }
        initTried = true;
        if (!IS_MAC) {
            return false;
        }
        try {
            objc = NativeLibrary.getInstance("objc");
            msgSend = objc.getFunction("objc_msgSend");
            ready = true;
        } catch (Throwable t) {
            ready = false;
        }
        return ready;
    }

    /** 是否可用（供界面提示用）。 */
    static boolean isAvailable() {
        return init();
    }

    /**
     * 设置窗口是否忽略鼠标事件。
     *
     * @param stage  目标窗口（按窗口标题定位对应的 NSWindow）
     * @param ignore true = 鼠标穿透
     * @return 真的调用到原生 {@code setIgnoresMouseEvents:} 了才返回 true
     *         （全屏雾层必须靠这个返回值兜底：没设上的话整屏都会点不动）
     */
    static boolean setIgnoreMouseEvents(Stage stage, boolean ignore) {
        if (stage == null || !init()) {
            return false;
        }
        try {
            Pointer win = findWindow(stage.getTitle());
            if (win == null) {
                return false;
            }
            msgSend.invoke(Pointer.class, new Object[]{
                    win, sel("setIgnoresMouseEvents:"), ignore ? 1 : 0});
            return true;
        } catch (Throwable ignored) {
            // 原生调用失败不影响程序运行
            return false;
        }
    }

    /** 在应用的所有 NSWindow 里按标题找到目标窗口。 */
    private static Pointer findWindow(String title) {
        if (title == null) {
            return null;
        }
        Pointer nsApp = (Pointer) msgSend.invoke(Pointer.class,
                new Object[]{cls("NSApplication"), sel("sharedApplication")});
        if (nsApp == null) {
            return null;
        }
        Pointer windows = (Pointer) msgSend.invoke(Pointer.class,
                new Object[]{nsApp, sel("windows")});
        if (windows == null) {
            return null;
        }
        long count = ((Number) msgSend.invoke(Long.class,
                new Object[]{windows, sel("count")})).longValue();
        for (long i = 0; i < count; i++) {
            Pointer win = (Pointer) msgSend.invoke(Pointer.class,
                    new Object[]{windows, sel("objectAtIndex:"), i});
            if (win == null || Pointer.nativeValue(win) == 0) {
                continue;
            }
            Pointer nsTitle = (Pointer) msgSend.invoke(Pointer.class,
                    new Object[]{win, sel("title")});
            if (nsTitle == null || Pointer.nativeValue(nsTitle) == 0) {
                continue;
            }
            Pointer utf8 = (Pointer) msgSend.invoke(Pointer.class,
                    new Object[]{nsTitle, sel("UTF8String")});
            if (utf8 == null || Pointer.nativeValue(utf8) == 0) {
                continue;
            }
            if (title.equals(utf8.getString(0))) {
                return win;
            }
        }
        return null;
    }

    private static Pointer sel(String name) {
        return (Pointer) objc.getFunction("sel_registerName")
                .invoke(Pointer.class, new Object[]{name});
    }

    private static Pointer cls(String name) {
        return (Pointer) objc.getFunction("objc_getClass")
                .invoke(Pointer.class, new Object[]{name});
    }
}
