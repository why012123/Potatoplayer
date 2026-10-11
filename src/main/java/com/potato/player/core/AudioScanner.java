package com.potato.player.core;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 音频文件扫描（对应 backend.py 的 scan_audio_files）。
 */
public final class AudioScanner {

    private AudioScanner() {
    }

    public static List<String> scan(String directory) {
        File dir = new File(directory);
        List<String> result = new ArrayList<>();
        if (!dir.isDirectory()) {
            return result;
        }
        File[] files = dir.listFiles();
        if (files == null) {
            return result;
        }
        for (File f : files) {
            if (f.isFile() && isSupported(f.getName())) {
                result.add(f.getAbsolutePath());
            }
        }
        result.sort(String::compareTo);
        return result;
    }

    public static boolean isSupported(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        for (String ext : Paths.SUPPORTED_EXTS) {
            if (lower.endsWith(ext)) {
                return true;
            }
        }
        return false;
    }
}
