package com.potato.player.ui;

import com.potato.player.core.Library;
import com.potato.player.core.NeteaseClient;
import com.potato.player.core.Paths;
import javafx.application.Platform;
import javafx.beans.property.DoubleProperty;
import javafx.beans.property.ObjectProperty;
import javafx.beans.property.SimpleDoubleProperty;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.function.Consumer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 网易云下载管理器：维护下载队列，逐首下载并上报进度。
 */
public class DownloadManager {

    public enum Status { QUEUED, DOWNLOADING, DONE, FAILED }

    /** 下载任务（使用 JavaFX 属性，便于绑定到进度条）。 */
    public static final class Task {
        public final String id;
        public final String name;
        public final String artists;
        public final int bitrate;
        // 下载完成后的自动归属目标（可为空）
        public String block;
        public String genre;
        public boolean addToPlaylist;
        public final ObjectProperty<Status> status = new SimpleObjectProperty<>(Status.QUEUED);
        public final DoubleProperty progress = new SimpleDoubleProperty(0);
        public final StringProperty detail = new SimpleStringProperty("排队中");
        public final StringProperty error = new SimpleStringProperty("");

        public Task(String id, String name, String artists, int bitrate) {
            this.id = id;
            this.name = name;
            this.artists = artists;
            this.bitrate = bitrate;
        }

        public String label() {
            String n = (name == null || name.isBlank()) ? "未知歌曲" : name;
            return (artists == null || artists.isBlank()) ? n : n + " - " + artists;
        }
    }

    private final NeteaseClient nc;
    private final Library lib;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ObservableList<Task> tasks = FXCollections.observableArrayList();
    private final Runnable onTaskFinished;
    private Consumer<String> playlistSink;

    public DownloadManager(NeteaseClient nc, Library lib, Runnable onTaskFinished) {
        this.nc = nc;
        this.lib = lib;
        this.onTaskFinished = onTaskFinished;
    }

    public ObservableList<Task> tasks() {
        return tasks;
    }

    /** 设置“下载完成加入播放列表”的回调（在 FX 线程调用，参数为本地路径）。 */
    public void setPlaylistSink(Consumer<String> sink) {
        this.playlistSink = sink;
    }

    public void enqueue(String nid, String name, String artists, int bitrate) {
        enqueue(nid, name, artists, bitrate, null, null, false);
    }

    public void enqueue(String nid, String name, String artists, int bitrate,
                        String block, String genre, boolean addToPlaylist) {
        Task t = new Task(nid, name, artists, bitrate);
        t.block = block;
        t.genre = genre;
        t.addToPlaylist = addToPlaylist;
        set(() -> tasks.add(0, t));
        executor.submit(() -> run(t));
    }

    private void run(Task t) {
        set(() -> {
            t.status.set(Status.DOWNLOADING);
            t.detail.set("获取下载地址...");
        });

        long[] lastUpdate = {0};
        NeteaseClient.DownloadResult r = nc.downloadSong(t.id, Paths.MUSIC_DIR, t.bitrate, (dl, total) -> {
            long now = System.currentTimeMillis();
            if (now - lastUpdate[0] < 120) {
                return;
            }
            lastUpdate[0] = now;
            set(() -> {
                t.progress.set(total > 0 ? (double) dl / total : -1);
                t.detail.set("下载中  " + formatBytes(dl) + (total > 0 ? " / " + formatBytes(total) : ""));
            });
        });

        if (r.ok()) {
            String savedPath = new File(Paths.MUSIC_DIR, r.message()).getAbsolutePath();
            try {
                String[] lrc = nc.fetchLyrics(t.id);
                if (lrc != null) {
                    String art = r.info() != null ? r.info().artists() : t.artists;
                    String tit = r.info() != null ? r.info().name() : t.name;
                    lib.saveNeteaseLyrics(savedPath, lrc, art, tit);
                }
            } catch (Exception ignored) {
            }
            lib.neteaseBindings().put(savedPath, t.id);
            lib.setNeteaseBindings(lib.neteaseBindings());
            try {
                String coverPath = new File(Paths.COVERS_DIR, t.id + ".jpg").getAbsolutePath();
                if (nc.fetchCover(t.id, coverPath)) {
                    lib.ratings().computeIfAbsent(savedPath, k -> new LinkedHashMap<>()).put("cover", coverPath);
                    lib.saveRatings();
                }
            } catch (Exception ignored) {
            }
            // 下载完成后的自动归属（块 / 流派 / 播放列表）
            boolean needSaveRatings = false;
            if (t.block != null && !t.block.isBlank()) {
                lib.ratings().computeIfAbsent(savedPath, k -> new LinkedHashMap<>()).put("block", t.block);
                needSaveRatings = true;
            }
            if (t.genre != null && !t.genre.isBlank()) {
                lib.ratings().computeIfAbsent(savedPath, k -> new LinkedHashMap<>()).put("genre", t.genre);
                needSaveRatings = true;
            }
            if (needSaveRatings) {
                lib.saveRatings();
            }
            if (t.addToPlaylist && playlistSink != null) {
                Platform.runLater(() -> playlistSink.accept(savedPath));
            }
            set(() -> {
                t.progress.set(1.0);
                t.detail.set("✅ 完成");
                t.status.set(Status.DONE);
            });
        } else {
            set(() -> {
                t.error.set(r.message());
                t.detail.set("❌ 失败");
                t.status.set(Status.FAILED);
            });
        }
        if (onTaskFinished != null) {
            Platform.runLater(onTaskFinished);
        }
    }

    private void set(Runnable r) {
        if (Platform.isFxApplicationThread()) {
            r.run();
        } else {
            Platform.runLater(r);
        }
    }

    public static String formatBytes(long b) {
        if (b < 1024) {
            return b + " B";
        }
        double kb = b / 1024.0;
        if (kb < 1024) {
            return String.format("%.1f KB", kb);
        }
        double mb = kb / 1024.0;
        if (mb < 1024) {
            return String.format("%.1f MB", mb);
        }
        return String.format("%.2f GB", mb / 1024.0);
    }

    public void shutdown() {
        executor.shutdownNow();
    }
}
