package com.potato.player.ui;

/**
 * 歌曲列表中的分组索引条。
 */
public final class Header {
    public final String text;
    public final String color;
    /** 这个分组里有多少首歌（索引条上显示；<0 = 不显示数量）。 */
    public final int count;

    public Header(String text, String color) {
        this(text, color, -1);
    }

    public Header(String text, String color, int count) {
        this.text = text;
        this.color = color;
        this.count = count;
    }
}
