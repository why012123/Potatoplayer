package com.potato.player.core;

import java.util.ArrayList;
import java.util.List;

/**
 * 歌曲信息模型（对应 backend.py 中 load_song_info 返回的 dict）。
 */
public class SongInfo {

    /** 歌词行（时间秒，原文，翻译）。 */
    public record LrcLine(double time, String text, String translation) {
    }

    public String title = "";
    public String artist = "未知歌手";
    public int duration = 0;          // 秒
    public byte[] cover = null;       // 原始图片字节
    public double score = 0.0;
    public String note = "";
    public String genre = "";
    public String block = "";
    public String comment = "";
    public int playCount = 0;
    public List<LrcLine> lyrics = new ArrayList<>();

    /** 找到当前播放位置对应的歌词行索引（-1 表示还没到第一句）。 */
    public static int lyricIndexAt(List<LrcLine> lyrics, double pos) {
        int idx = -1;
        if (lyrics == null) {
            return -1;
        }
        for (int i = 0; i < lyrics.size(); i++) {
            if (pos >= lyrics.get(i).time()) {
                idx = i;
            } else {
                break;
            }
        }
        return idx;
    }

    /** 展示用标题 "歌手 - 歌名"。 */
    public String displayName() {
        if (artist != null && !artist.isBlank() && !"未知歌手".equals(artist) && !title.isBlank()) {
            return artist + " - " + title;
        }
        return title;
    }
}
