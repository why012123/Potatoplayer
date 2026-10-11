package com.potato.player.core;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * LRC 歌词解析（对应 backend.py 的 _parse_lrc_lines / parse_lrc_file）。
 */
public final class LrcParser {

    private LrcParser() {
    }

    /** 解析单个 LRC 文件，返回 {秒数: 文本}。 */
    public static Map<Double, String> parseLines(String lrcPath) {
        TreeMap<Double, String> result = new TreeMap<>();
        File f = new File(lrcPath);
        if (!f.exists()) {
            return result;
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("{")) {
                    continue;
                }
                if (line.startsWith("[") && line.contains("]")) {
                    int bracketEnd = line.indexOf(']');
                    String timeStr = line.substring(1, bracketEnd);
                    String text = line.substring(bracketEnd + 1).trim();
                    if (text.isEmpty()) {
                        continue;
                    }
                    try {
                        String[] parts = timeStr.split(":");
                        int minutes = Integer.parseInt(parts[0].trim());
                        double seconds = Double.parseDouble(parts[1].trim());
                        double total = minutes * 60 + seconds;
                        result.put(total, text);
                    } catch (Exception ignored) {
                        // 跳过无法解析的时间标签
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return result;
    }

    /** 解析 LRC 文件（含双语合并），返回 [(秒, 原文, 翻译), ...]。 */
    public static List<SongInfo.LrcLine> parseLrcFile(String lrcPath, String transLrcPath) {
        Map<Double, String> main = parseLines(lrcPath);
        Map<Double, String> trans = transLrcPath == null ? Map.of() : parseLines(transLrcPath);
        List<SongInfo.LrcLine> result = new ArrayList<>();
        for (Map.Entry<Double, String> e : main.entrySet()) {
            result.add(new SongInfo.LrcLine(e.getKey(), e.getValue(), trans.getOrDefault(e.getKey(), "")));
        }
        return result;
    }
}
