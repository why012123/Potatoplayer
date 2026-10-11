package com.potato.player.core;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

/**
 * 路径常量（对应 core/backend.py 顶部常量）。
 *
 * <p>资源库（数据目录）按下面的顺序决定，先命中先用：</p>
 * <ol>
 *   <li>系统属性 {@code -Dpotato.baseDir=/path/to/library}；</li>
 *   <li>工程同级的 {@code ../PotatoLibrary}，且里面已经有 {@code source/}
 *       （原来的工作区布局，老用户路径不变）；</li>
 *   <li>否则退回用户主目录的 {@code ~/PotatoLibrary}（首次运行自动创建）。
 *       所以直接 clone 下来就能跑，不用迁就开发者的目录结构。</li>
 * </ol>
 */
public final class Paths {

    /** 资源库根目录（数据文件所在）。 */
    public static final String BASE_DIR = resolveBaseDir();

    public static final String MUSIC_DIR = join(BASE_DIR, "source", "music");
    public static final String PLAYLIST_DIR = join(BASE_DIR, "source", "playlists");
    public static final String LYRICS_DIR = join(BASE_DIR, "source", "lyrics");
    public static final String COVERS_DIR = join(BASE_DIR, "source", "covers");
    public static final String RATINGS_FILE = join(BASE_DIR, "source", "ratings.json");
    public static final String BLOCKS_FILE = join(BASE_DIR, "source", "blocks.json");
    public static final String GENRES_FILE = join(BASE_DIR, "source", "genres.json");
    /**
     * 上次退出时的「当前播放列表 + 正在听哪一首」。
     * 启动时同步回来（只恢复列表，不自动播放），见 {@code MainWindow#restoreSessionPlaylist}。
     */
    public static final String SESSION_FILE = join(BASE_DIR, "source", "session.json");
    /**
     * 2.1.6 / 2.1.7 曾把流派色单独存在这里（{@code {"流派名": "#rrggbb"}}）。
     * 2.1.8 起颜色跟块一样存进 {@code genres.json} 同一项，启动时把旧文件里的颜色
     * 搬过去并删掉它（见 {@code Store#applyLegacyGenreColors}）。
     */
    public static final String LEGACY_GENRE_COLORS_FILE = join(BASE_DIR, "source", "genre_colors.json");
    public static final String LYRICS_FILE = join(BASE_DIR, "source", "lyrics.json");
    public static final String METADATA_CACHE_FILE = join(BASE_DIR, "source", "metadata_cache.csv");
    public static final String CONFIG_FILE = join(BASE_DIR, "source", "config.json");
    public static final String NETEASE_BINDINGS_FILE = join(BASE_DIR, "source", "netease_bindings.json");
    public static final String EQ_FILE = join(BASE_DIR, "source", "eq.json");
    public static final String BPM_FILE = join(BASE_DIR, "source", "bpm.json");

    /**
     * 网易云本地 API 服务目录（可选功能，没有这个服务时在线功能静默不可用）。
     *
     * <p>顺序：{@code -Dpotato.apiDir=...} → 数据目录同级的
     * {@code ../api/api-enhanced-4.35.0}（老的工作区布局）→
     * {@code <数据目录>/api/api-enhanced-4.35.0}。</p>
     */
    public static final String API_DIR = resolveApiDir();
    /** 本地 API 服务地址，可用 {@code -Dpotato.apiBase=http://host:port} 覆盖。 */
    public static final String API_BASE = resolveApiBase();
    public static final String COOKIE_PATH = join(BASE_DIR, "source", ".cookie");

    public static final List<String> SUPPORTED_EXTS = List.of(".mp3", ".flac");

    private Paths() {
    }

    public static void ensureDirs() {
        for (String d : List.of(PLAYLIST_DIR, LYRICS_DIR, COVERS_DIR, MUSIC_DIR)) {
            File f = new File(d);
            if (!f.exists()) {
                // noinspection ResultOfMethodCallIgnored
                f.mkdirs();
            }
        }
    }

    private static String join(String... parts) {
        return String.join(File.separator, parts);
    }

    private static String resolveBaseDir() {
        String override = System.getProperty("potato.baseDir");
        if (override != null && !override.isBlank()) {
            return new File(override).getAbsolutePath();
        }
        File cwd = new File(System.getProperty("user.dir"));
        // 老的工作区布局：与工程同级的 PotatoLibrary（已经建过库才认，免得误创）
        File sibling = new File(cwd.getParentFile(), "PotatoLibrary");
        if (new File(sibling, "source").isDirectory()) {
            return sibling.getAbsolutePath();
        }
        // 独立 clone：用户主目录下的 PotatoLibrary（Path#ensureDirs 会建出来）
        return new File(System.getProperty("user.home"), "PotatoLibrary").getAbsolutePath();
    }

    private static String resolveApiDir() {
        String override = System.getProperty("potato.apiDir");
        if (override != null && !override.isBlank()) {
            return new File(override).getAbsolutePath();
        }
        File legacy = new File(new File(BASE_DIR).getParentFile(), "api/api-enhanced-4.35.0");
        if (legacy.isDirectory()) {
            return legacy.getAbsolutePath();
        }
        return join(BASE_DIR, "api", "api-enhanced-4.35.0");
    }

    private static String resolveApiBase() {
        String override = System.getProperty("potato.apiBase");
        if (override != null && !override.isBlank()) {
            return override.trim();
        }
        return "http://localhost:3000";
    }

    /** 返回规范化的绝对路径（用于文件读取，便于统一比较）。 */
    public static Path canonical(String path) {
        try {
            return new File(path).getCanonicalFile().toPath();
        } catch (IOException e) {
            return new File(path).getAbsoluteFile().toPath();
        }
    }
}
