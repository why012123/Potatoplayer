package com.potato.player.core;

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;

import java.io.File;

/**
 * 音频元数据读取（Jaudiotagger，对应 mutagen 的功能）。
 */
public final class MetadataReader {

    /** 读取结果（字段可能为空）。 */
    public record Result(String title, String artist, int duration, byte[] cover) {
    }

    private MetadataReader() {
    }

    public static Result read(String filepath) {
        String title = "";
        String artist = "";
        int duration = 0;
        byte[] cover = null;
        try {
            AudioFile af = AudioFileIO.read(new File(filepath));
            int len = af.getAudioHeader().getTrackLength();
            if (len > 0) {
                duration = len;
            }
            Tag tag = af.getTag();
            if (tag != null) {
                String t = tag.getFirst(FieldKey.TITLE);
                if (t != null && !t.isBlank()) {
                    title = t;
                }
                String a = tag.getFirst(FieldKey.ARTIST);
                if (a != null && !a.isBlank()) {
                    artist = a;
                }
                Artwork art = tag.getFirstArtwork();
                if (art != null && art.getBinaryData() != null && art.getBinaryData().length > 0) {
                    cover = art.getBinaryData();
                }
            }
        } catch (Exception ignored) {
        }
        return new Result(title, artist, duration, cover);
    }
}
