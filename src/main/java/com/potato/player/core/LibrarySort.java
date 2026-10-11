package com.potato.player.core;

import java.util.Comparator;
import java.util.List;
import java.util.function.Function;

/**
 * 歌曲库排序（音乐库左栏与「搜索与筛选」共用同一套规则）。
 *
 * <p><b>叠加排序（多级）：</b>点过哪些排序模式会攒成一个<b>排序栈</b>，
 * <b>后点的是主键、之前点的依次降为次级键</b>。例如依次点过 A → B → C，
 * 结果就是「先按 C 分组、C 相同看 B、B 也相同再看 A」，最后才用路径兜底。
 * 这正是"每点一次就再稳定排序一遍"叠加出来的效果（Python 原版就是这样），
 * 只是这里把它写成了<b>显式的、可复现的</b>多级比较器：
 * 不依赖输入列表当时是什么顺序，也不会因为中途走了「搜索与筛选」把
 * {@code audioPaths} 写成了别的顺序就变味。</p>
 *
 * <p>比 Python 原版多出来的一点：栈是<b>持久化</b>的，界面上也把当前排序链写出来，
 * 同一个模式再点一次会被提到主键位（栈内去重）。</p>
 *
 * <p>纯逻辑、不依赖 JavaFX：探针可以直接验算（见 CHANGELOG 2.1.1 的验证表）。</p>
 */
public final class LibrarySort {

    /** 排序模式（内部键与配置里的 {@code sort_mode} 一致）。 */
    public enum Mode {
        TITLE("title"),
        ARTIST("artist"),
        RATING("rating"),
        BLOCK("block"),
        GENRE("genre"),
        PLAY_COUNT("play_count");

        public final String key;

        Mode(String key) {
            this.key = key;
        }

        /** 按内部键取模式；未知键退回「标题」（与旧行为一致）。 */
        public static Mode of(String key) {
            for (Mode m : values()) {
                if (m.key.equals(key)) {
                    return m;
                }
            }
            return TITLE;
        }
    }

    /**
     * 取键函数（由调用方提供：音乐库走内存缓存 + ratings，筛选面板也走同一套）。
     */
    public record Accessors(Function<String, String> title,
                            Function<String, String> artist,
                            Function<String, Double> score,
                            Function<String, String> block,
                            Function<String, String> genre,
                            Function<String, Integer> playCount) {
    }

    /**
     * 所有键都相等时的最后一招：<b>路径升序</b>（= 曲库扫描出来的自然顺序）。
     *
     * <p>有了它，多级排序的结果就是<b>全序</b>：同一个曲库 + 同一个排序栈，
     * 结果永远一模一样，跟输入顺序无关。</p>
     */
    private static final Comparator<String> TIE_BREAKER = Comparator.naturalOrder();

    private LibrarySort() {
    }

    /** 单个模式的比较器（只有这一级，最后用路径兜底）。 */
    public static Comparator<String> comparator(Mode mode, Accessors a) {
        return keyComparator(mode, a).thenComparing(TIE_BREAKER);
    }

    /**
     * 多级比较器：{@code modes} <b>从旧到新</b>（最后一个是主键），逐级比较，
     * 所有级都相等才用路径兜底。
     *
     * <p>这就是"叠加排序"：依次点过 A → B → C 时传 {@code [A, B, C]}，
     * 得到「C → B → A → 路径」。</p>
     */
    public static Comparator<String> comparator(List<Mode> modes, Accessors a) {
        Comparator<String> cmp = null;
        if (modes != null) {
            // 倒着来：最后点的是主键，所以最先比
            for (int i = modes.size() - 1; i >= 0; i--) {
                Mode m = modes.get(i);
                if (m == null) {
                    continue;
                }
                Comparator<String> key = keyComparator(m, a);
                cmp = cmp == null ? key : cmp.thenComparing(key);
            }
        }
        return (cmp == null ? Comparator.<String>naturalOrder() : cmp).thenComparing(TIE_BREAKER);
    }

    /** 单个模式的"键"比较器（不含路径兜底，供多级串联用）。 */
    private static Comparator<String> keyComparator(Mode mode, Accessors a) {
        return switch (mode) {
            case TITLE -> Comparator.comparing((String p) -> lower(a.title().apply(p)));
            case ARTIST -> Comparator.comparing((String p) -> lower(a.artist().apply(p)));
            case RATING -> Comparator.comparingDouble((String p) -> -score(a, p));
            case BLOCK -> Comparator
                    // 先按"有没有块"（有名的排前面），再按块名
                    .comparing((String p) -> blankToEmpty(a.block().apply(p)).isEmpty())
                    .thenComparing(p -> blankToEmpty(a.block().apply(p)));
            case GENRE -> Comparator
                    .comparing((String p) -> blankToEmpty(a.genre().apply(p)).isEmpty())
                    .thenComparing(p -> blankToEmpty(a.genre().apply(p)));
            case PLAY_COUNT -> Comparator.comparingInt((String p) -> -playCount(a, p));
        };
    }

    /** 就地排序（单级；调用方自己给列表副本）。 */
    public static void sort(List<String> paths, Mode mode, Accessors a) {
        sort(paths, mode == null ? List.of() : List.of(mode), a);
    }

    /** 就地排序（多级叠加：{@code modes} 从旧到新，最后一个是主键）。 */
    public static void sort(List<String> paths, List<Mode> modes, Accessors a) {
        if (paths == null || paths.isEmpty()) {
            return;
        }
        paths.sort(comparator(modes, a));
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase();
    }

    private static String blankToEmpty(String s) {
        return s == null ? "" : s.strip();
    }

    private static double score(Accessors a, String path) {
        Double v = a.score().apply(path);
        return v == null ? 0 : v;
    }

    private static int playCount(Accessors a, String path) {
        Integer v = a.playCount().apply(path);
        return v == null ? 0 : v;
    }
}
