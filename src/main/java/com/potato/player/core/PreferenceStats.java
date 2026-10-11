package com.potato.player.core;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 「偏好」统计：按 块 / 流派 / 歌手 给歌曲分组，算每组的<b>平均评分</b>。
 *
 * <p>规则（按需求）：<b>0 分的歌不计入</b> —— 既不计进分子（总分），也不计进分母
 * （有评分的歌数）。所以「平均分」不会被一堆没听过的 0 分歌稀释；没打过分的歌
 * 只体现在「共 N 首」这个总数里。</p>
 *
 * <p>纯逻辑、不依赖 JavaFX：方便用探针直接验算（见 CHANGELOG 2.1.0 的验证表）。</p>
 */
public final class PreferenceStats {

    /** 统计维度。 */
    public enum Dimension {
        /** 按「块」分组。 */
        BLOCK("块", "未分组"),
        /** 按「流派」分组。 */
        GENRE("流派", "未分类"),
        /** 按「歌手」分组（歌手取自元数据缓存，未知歌手归到"未知歌手"）。 */
        ARTIST("歌手", "未知歌手");

        public final String label;
        public final String fallback;

        Dimension(String label, String fallback) {
            this.label = label;
            this.fallback = fallback;
        }

        public static Dimension ofLabel(String label) {
            for (Dimension d : values()) {
                if (d.label.equals(label)) {
                    return d;
                }
            }
            return BLOCK;
        }
    }

    /**
     * 一行的统计结果。
     *
     * @param name       分组名
     * @param ratedCount 打过分的歌数（{@code score > 0}）
     * @param totalCount 该组的全部歌数
     * @param average    平均评分（0~10）；{@code ratedCount == 0} 时为 0
     */
    public record Row(String name, int ratedCount, int totalCount, double average) {
    }

    private PreferenceStats() {
    }

    /**
     * 按维度排名。
     *
     * @param dim      统计维度
     * @param paths    要统计的歌曲（通常就是当前歌曲库）
     * @param ratings  评分表：路径 → 用户数据（含 {@code score / block / genre}）
     * @param artistOf 歌手查询（通常是「缓存歌手」，不读标签）
     * @return 平均分降序 → 打分人数降序 → 名字；<b>一首都没打分的组不返回</b>
     */
    public static List<Row> rank(Dimension dim,
                                 List<String> paths,
                                 Map<String, Map<String, Object>> ratings,
                                 Function<String, String> artistOf) {
        return rank(dim, paths, ratings, artistOf, 1);
    }

    /**
     * 同 {@link #rank(Dimension, List, Map, Function)}，但可以要求「至少打过 {@code minRated} 首」
     * 才上榜。
     *
     * <p>只按平均分排的话，<b>只有一首打分的歌手</b>会靠一首 9.5 分的歌霸榜；
     * 切到「至少 2 首」就能只看样本量稍微像样一点的。</p>
     *
     * @param minRated 最少打分歌曲数（&le;1 表示不限制）
     */
    public static List<Row> rank(Dimension dim,
                                 List<String> paths,
                                 Map<String, Map<String, Object>> ratings,
                                 Function<String, String> artistOf,
                                 int minRated) {
        Map<String, int[]> ratedTotal = new LinkedHashMap<>();   // name -> [rated, total]
        Map<String, Double> sum = new LinkedHashMap<>();          // name -> 总分
        if (paths == null) {
            return List.of();
        }
        for (String path : paths) {
            if (path == null) {
                continue;
            }
            Map<String, Object> ud = ratings == null ? null : ratings.get(path);
            double score = score(ud);
            String name = groupOf(dim, path, ud, artistOf);
            int[] rt = ratedTotal.computeIfAbsent(name, k -> new int[2]);
            rt[1]++;
            if (score > 0) {
                rt[0]++;
                sum.merge(name, score, Double::sum);
            }
        }
        List<Row> rows = new ArrayList<>();
        for (Map.Entry<String, int[]> e : ratedTotal.entrySet()) {
            int rated = e.getValue()[0];
            if (rated <= 0 || rated < Math.max(1, minRated)) {
                continue;   // 0 分的组不进榜；样本量不够的也先不上榜
            }
            rows.add(new Row(e.getKey(), rated, e.getValue()[1], sum.getOrDefault(e.getKey(), 0.0) / rated));
        }
        rows.sort(Comparator
                .comparingDouble(Row::average).reversed()
                .thenComparing(Comparator.comparingInt(Row::ratedCount).reversed())
                .thenComparing(Row::name));
        return rows;
    }

    /** 一首歌属于哪个分组。 */
    private static String groupOf(Dimension dim, String path, Map<String, Object> ud,
                                  Function<String, String> artistOf) {
        String raw;
        if (dim == Dimension.ARTIST) {
            raw = artistOf == null ? "" : artistOf.apply(path);
        } else {
            String key = dim == Dimension.GENRE ? "genre" : "block";
            raw = ud == null || ud.get(key) == null ? "" : String.valueOf(ud.get(key));
        }
        if (raw == null || raw.isBlank()) {
            return dim.fallback;
        }
        return raw.strip();
    }

    /** 用户数据里的评分（0~10，缺省 0）。 */
    private static double score(Map<String, Object> ud) {
        if (ud == null) {
            return 0;
        }
        Object v = ud.get("score");
        return v instanceof Number n ? n.doubleValue() : 0;
    }
}
