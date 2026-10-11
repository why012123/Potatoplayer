package com.potato.player.core;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 歌曲库服务：整合扫描、元数据、评分、歌词等（对应 backend.py 的 load_song_info 及缓存函数）。
 */
public class Library {

    private final Map<String, Map<String, Object>> ratings;
    private final Map<String, Object> lyrics;
    private final Map<String, Map<String, String>> metadataCache;
    private List<Map<String, Object>> blocks;
    /** 流派：与 blocks 同构，颜色就存在每一项里（{@code {"name":…, "color":…}}）。 */
    private List<Map<String, Object>> genres;
    private Map<String, String> neteaseBindings;
    private Map<String, Object> config;

    /**
     * 播放引擎（<b>懒创建</b>）。
     *
     * <p>libvlc 的载入实测约 400ms（JNA 自举 + libvlc + 插件 + 播放器 + 均衡器），
     * 而启动时根本用不到它 —— 以前它挡在启动路径上，白白让窗口晚出来小半秒。
     * 现在第一次真正用到（播放 / 设音量 / 挂监听）才建，并且
     * {@link #warmUpPlayerAsync()} 会在窗口显示之后用后台低优先级线程提前热好。</p>
     */
    private volatile PlayerEngine player;
    private final Object playerLock = new Object();
    /** 还没建引擎时先记下来的监听器与音量，建的时候一起套上。 */
    private volatile PlayerEngine.Listener playerListener;
    private volatile int playerVolume = -1;
    private final Map<String, SongInfo> songInfoCache = new ConcurrentHashMap<>();

    public Library() {
        this.ratings = Store.loadRatings();
        this.lyrics = Store.loadLyrics();
        this.metadataCache = Store.loadMetadataCache();
        this.blocks = Store.loadBlocks();
        this.genres = Store.loadGenres();
        this.neteaseBindings = Store.loadNeteaseBindings();
        this.config = Config.load();
        StartupTimer.mark("读 JSON 缓存");
    }

    /** 取播放引擎：第一次调用时才载入 libvlc（约 400ms，所以别放在启动路径上）。 */
    public PlayerEngine player() {
        PlayerEngine p = player;
        if (p == null) {
            synchronized (playerLock) {
                if (player == null) {
                    int volume = playerVolume >= 0 ? playerVolume : Config.getInt(config, "volume", 70);
                    PlayerEngine created = new PlayerEngine(volume);
                    PlayerEngine.Listener l = playerListener;
                    if (l != null) {
                        created.setListener(l);
                    }
                    player = created;
                }
                p = player;
            }
        }
        return p;
    }

    /** 已经建过的引擎（没建过返回 null）：关闭时用它，免得"为了关掉而把它建出来"。 */
    public PlayerEngine playerIfAny() {
        return player;
    }

    /** 挂播放结束回调；引擎还没建就先记着（建的时候自动套上）。 */
    public void setPlayerListener(PlayerEngine.Listener listener) {
        playerListener = listener;
        PlayerEngine p = player;
        if (p != null) {
            p.setListener(listener);
        }
    }

    /** 设音量；引擎还没建就只记下来 —— 别为了设个音量把 libvlc 载进来。 */
    public void setPlayerVolume(int volume) {
        playerVolume = volume;
        PlayerEngine p = player;
        if (p != null) {
            p.setVolume(volume);
        }
    }

    /**
     * 后台预热播放引擎：窗口出来之后调它，用低优先级守护线程把 libvlc 载好，
     * 用户点播放时就不用等那 400ms 了。
     */
    public void warmUpPlayerAsync() {
        Thread t = new Thread(() -> {
            try {
                player();
            } catch (Throwable ignored) {
                // 预热失败不影响后面正常创建（真用到时会再试一次）
            }
        }, "vlc-warmup");
        t.setDaemon(true);
        t.setPriority(Thread.MIN_PRIORITY);
        t.start();
    }

    /** 释放播放引擎（只在真的建过时才做事）。 */
    public void releasePlayer() {
        PlayerEngine p = player;
        if (p != null) {
            p.release();
            player = null;
        }
    }

    public Map<String, Map<String, Object>> ratings() {
        return ratings;
    }

    public Map<String, Object> lyrics() {
        return lyrics;
    }

    public Map<String, Map<String, String>> metadataCache() {
        return metadataCache;
    }

    public List<Map<String, Object>> blocks() {
        return blocks;
    }

    public void setBlocks(List<Map<String, Object>> blocks) {
        this.blocks = blocks;
        Store.saveBlocks(blocks);
    }

    public List<Map<String, Object>> genres() {
        return genres;
    }

    public void setGenres(List<Map<String, Object>> genres) {
        this.genres = genres;
        Store.saveGenres(genres);
    }

    /** 只要名字（下拉框、筛选、批量导入等处用；对应 refreshBlocks() 里那段手工取名字）。 */
    public List<String> genreNames() {
        List<String> names = new ArrayList<>();
        for (Map<String, Object> g : genres) {
            names.add(String.valueOf(g.get("name")));
        }
        return names;
    }

    public String getGenreColor(String genreName) {
        return Store.getGenreColor(genres, genreName);
    }

    public void setGenreColor(String genreName, String color) {
        Store.setGenreColor(genres, genreName, color);
    }

    public Map<String, String> neteaseBindings() {
        return neteaseBindings;
    }

    public void setNeteaseBindings(Map<String, String> b) {
        this.neteaseBindings = b;
        Store.saveNeteaseBindings(b);
    }

    public Map<String, Object> config() {
        return config;
    }

    public void saveConfig() {
        Config.save(config);
    }

    public void saveRatings() {
        Store.saveRatings(ratings);
    }

    public void saveLyrics() {
        Store.saveLyrics(lyrics);
    }

    public void saveMetadataCache() {
        Store.saveMetadataCache(metadataCache);
    }

    /** 保存网易云歌词到 LRC 文件并绑定到歌曲。lrc = [原文, 翻译?]。 */
    public void saveNeteaseLyrics(String savedPath, String[] lrc, String artist, String title) {
        if (lrc == null || lrc.length == 0) {
            return;
        }
        String orig = lrc[0];
        String trans = lrc.length > 1 ? lrc[1] : null;
        String lfn = (!artist.isEmpty() ? artist + " - " + title : title) + ".lrc";
        lfn = lfn.replaceAll("[\\\\/*?:\"<>|]", "");
        File dest = new File(Paths.LYRICS_DIR, lfn);
        try {
            Files.writeString(dest.toPath(), orig);
            lyrics.put(savedPath, dest.getAbsolutePath());
            if (trans != null && !trans.isBlank()) {
                String transFn = lfn.replace(".lrc", ".trans.lrc");
                Files.writeString(new File(Paths.LYRICS_DIR, transFn).toPath(), trans);
            }
            Store.saveLyrics(lyrics);
        } catch (IOException ignored) {
        }
    }

    /** 扫描音乐库，返回文件路径列表。 */
    public List<String> scanMusic() {
        return AudioScanner.scan(Paths.MUSIC_DIR);
    }

    /** 加载歌曲信息（带缓存）。 */
    public SongInfo loadSongInfo(String filepath) {
        SongInfo cached = songInfoCache.get(filepath);
        if (cached != null) {
            return cached;
        }
        SongInfo info = buildSongInfo(filepath);
        songInfoCache.put(filepath, info);
        return info;
    }

    /** 清空歌曲信息缓存（歌词显示模式等会影响解析结果的设置变更后调用）。 */
    public void clearSongInfoCache() {
        songInfoCache.clear();
    }

    public void invalidateSongInfo(String filepath) {
        songInfoCache.remove(filepath);
    }

    private SongInfo buildSongInfo(String filepath) {
        String rawName = new File(filepath).getName();
        int dot = rawName.lastIndexOf('.');
        if (dot > 0) {
            rawName = rawName.substring(0, dot);
        }
        String title = rawName;
        String artist = "未知歌手";
        if (rawName.contains(" - ")) {
            int idx = rawName.indexOf(" - ");
            artist = rawName.substring(0, idx).trim();
            title = rawName.substring(idx + 3).trim();
        }

        int durationSec = 0;
        byte[] cover = null;

        MetadataReader.Result meta = MetadataReader.read(filepath);
        if (!meta.title().isEmpty()) {
            title = meta.title();
        }
        if (!meta.artist().isEmpty()) {
            artist = meta.artist();
        }
        if (meta.duration() > 0) {
            durationSec = meta.duration();
        }
        if (meta.cover() != null) {
            cover = meta.cover();
        }

        if (durationSec == 0) {
            durationSec = player.getDuration(filepath);
        }

        Map<String, Object> userData = ratings.get(filepath);
        if (userData == null) {
            userData = new LinkedHashMap<>();
        }
        if (userData.get("title") != null && !String.valueOf(userData.get("title")).isEmpty()) {
            title = String.valueOf(userData.get("title"));
        }
        if (userData.get("artist") != null && !String.valueOf(userData.get("artist")).isEmpty()) {
            artist = String.valueOf(userData.get("artist"));
        }
        String coverPath = userData.get("cover") == null ? "" : String.valueOf(userData.get("cover"));
        if (!coverPath.isEmpty() && new File(coverPath).exists()) {
            try {
                cover = Files.readAllBytes(new File(coverPath).toPath());
            } catch (IOException ignored) {
            }
        }

        List<SongInfo.LrcLine> lyricsData = resolveLyrics(filepath);
        // 歌词显示模式：双语（原文+翻译）/ 仅中文 / 仅原文
        String lyricsMode = Config.lyricsDisplayMode(config);
        if (!Config.LYRICS_MODE_BILINGUAL.equals(lyricsMode) && !lyricsData.isEmpty()) {
            boolean hasTrans = lyricsData.stream().anyMatch(l -> !l.translation().isEmpty());
            if (hasTrans) {
                boolean preferTranslation = Config.LYRICS_MODE_TRANSLATION.equals(lyricsMode);
                List<SongInfo.LrcLine> adjusted = new ArrayList<>();
                for (SongInfo.LrcLine l : lyricsData) {
                    if (preferTranslation) {
                        // 仅中文：没有翻译的行回退原文
                        adjusted.add(new SongInfo.LrcLine(l.time(),
                                l.translation().isEmpty() ? l.text() : l.translation(), ""));
                    } else {
                        adjusted.add(new SongInfo.LrcLine(l.time(), l.text(), ""));
                    }
                }
                lyricsData = adjusted;
            }
        }

        SongInfo info = new SongInfo();
        info.title = title;
        info.artist = artist;
        info.duration = durationSec;
        info.cover = cover;
        info.score = asDouble(userData.get("score"), 0.0);
        info.note = userData.get("note") == null ? "" : String.valueOf(userData.get("note"));
        info.genre = userData.get("genre") == null ? "" : String.valueOf(userData.get("genre"));
        info.block = userData.get("block") == null ? "" : String.valueOf(userData.get("block"));
        info.comment = userData.get("comment") == null ? "" : String.valueOf(userData.get("comment"));
        info.playCount = asInt(userData.get("play_count"), 0);
        info.lyrics = lyricsData;

        metadataCache.put(filepath, Map.of("title", title, "artist", artist, "duration", String.valueOf(durationSec)));
        return info;
    }

    private List<SongInfo.LrcLine> resolveLyrics(String filepath) {
        Object raw = lyrics.get(filepath);
        if (raw instanceof String s) {
            if (new File(s).exists()) {
                String transPath = s.replace(".lrc", ".trans.lrc");
                String trans = new File(transPath).exists() ? transPath : null;
                List<SongInfo.LrcLine> parsed = LrcParser.parseLrcFile(s, trans);
                if (!parsed.isEmpty()) {
                    lyrics.put(filepath, parsed);
                }
                return parsed;
            }
            return new ArrayList<>();
        }
        return toLrcLines(raw);
    }

    /**
     * 解析 lyrics.json 中的歌词数组，兼容两种历史格式：
     * <ul>
     *   <li>Python 版 / 早期格式：{@code [[time, text, translation], ...]}</li>
     *   <li>Java 版当前格式（Jackson 序列化 LrcLine 记录）：{@code [{time, text, translation}, ...]}</li>
     * </ul>
     */
    @SuppressWarnings("unchecked")
    private List<SongInfo.LrcLine> toLrcLines(Object raw) {
        List<SongInfo.LrcLine> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return out;
        }
        for (Object o : list) {
            if (o instanceof List<?> row && row.size() >= 2) {
                // 旧格式：[time, text, translation]
                String trans = (row.size() > 2 && row.get(2) != null) ? String.valueOf(row.get(2)) : "";
                out.add(new SongInfo.LrcLine(toSeconds(row.get(0)),
                        row.get(1) == null ? "" : String.valueOf(row.get(1)), trans));
            } else if (o instanceof Map<?, ?> row) {
                // 现格式：{"time": .., "text": .., "translation": ..}
                Object text = row.get("text");
                Object trans = row.get("translation");
                out.add(new SongInfo.LrcLine(toSeconds(row.get("time")),
                        text == null ? "" : String.valueOf(text),
                        trans == null ? "" : String.valueOf(trans)));
            }
        }
        return out;
    }

    /** 宽松解析时间字段（Number / 数字字符串 / 缺失都安全）。 */
    private static double toSeconds(Object v) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v == null) {
            return 0.0;
        }
        try {
            return Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    // ── 缓存标题/歌手 ──

    /**
     * 只取标题，且<b>完全不读音频标签</b>（不碰 jaudiotagger、不读文件）：
     * metadata_cache.csv → 用户数据 → 文件名。
     *
     * <p>歌曲列表的「隐藏歌手」模式以前是每行都调 {@link #loadSongInfo} 取 tag 标题，
     * 于是每次启动都要把整个音乐库的标签（连内嵌封面一起）读一遍 —— 300 首就是
     * 半分钟满负荷。列表渲染只要标题，走缓存就够，启动瞬间完成。</p>
     */
    public String getCachedSongTitle(String filepath) {
        Map<String, String> mc = metadataCache.get(filepath);
        if (mc != null) {
            String t = mc.getOrDefault("title", "");
            if (!t.isEmpty()) {
                return t;
            }
        }
        Map<String, Object> ud = ratings.get(filepath);
        if (ud != null && ud.get("title") != null && !String.valueOf(ud.get("title")).isEmpty()) {
            return String.valueOf(ud.get("title"));
        }
        String raw = new File(filepath).getName();
        int dot = raw.lastIndexOf('.');
        if (dot > 0) {
            raw = raw.substring(0, dot);
        }
        int sep = raw.indexOf(" - ");
        return sep > 0 ? raw.substring(sep + 3).trim() : raw;
    }

    public String getCachedTitle(String filepath) {
        String title = null;
        String artist = null;
        Map<String, String> mc = metadataCache.get(filepath);
        if (mc != null) {
            title = mc.getOrDefault("title", "");
            artist = mc.getOrDefault("artist", "");
        }
        if (title == null || title.isEmpty()) {
            Map<String, Object> ud = ratings.get(filepath);
            if (ud != null) {
                title = ud.get("title") == null ? "" : String.valueOf(ud.get("title"));
                if (artist == null || artist.isEmpty()) {
                    artist = ud.get("artist") == null ? "" : String.valueOf(ud.get("artist"));
                }
            }
        }
        if (title == null || title.isEmpty()) {
            String raw = new File(filepath).getName();
            int dot = raw.lastIndexOf('.');
            if (dot > 0) {
                raw = raw.substring(0, dot);
            }
            title = raw;
        }
        if (artist != null && !artist.isEmpty() && !"未知歌手".equals(artist) && !title.isEmpty()) {
            return artist + " - " + title;
        }
        return title;
    }

    public String getCachedArtist(String filepath) {
        Map<String, String> mc = metadataCache.get(filepath);
        if (mc != null && mc.get("artist") != null && !mc.get("artist").isEmpty()) {
            return mc.get("artist");
        }
        Map<String, Object> ud = ratings.get(filepath);
        if (ud != null && ud.get("artist") != null && !String.valueOf(ud.get("artist")).isEmpty()) {
            return String.valueOf(ud.get("artist"));
        }
        return "未知歌手";
    }

    public String getBlockColor(String blockName) {
        return Store.getBlockColor(blocks, blockName);
    }

    // ── 工具 ──
    private static double asDouble(Object v, double def) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return v == null ? def : Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private static int asInt(Object v, int def) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return v == null ? def : Integer.parseInt(String.valueOf(v));
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
