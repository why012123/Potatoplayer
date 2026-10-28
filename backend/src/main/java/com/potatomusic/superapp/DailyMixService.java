package com.potatomusic.superapp;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * A deterministic, local-only daily recommendation set.
 *
 * <p>It blends ratings, favorites, lifetime play counts and recent listening
 * with a small seeded jitter, then greedily penalises repeated artists,
 * blocks, genres and albums. The result is cached per calendar day so the
 * playlist does not reshuffle while the user is listening.</p>
 */
public final class DailyMixService {
    public static final int TARGET_SIZE = 30;
    private static final long DAY_MS = 24L * 60L * 60L * 1000L;

    public static final class Cached {
        public String date;
        public long generatedAt;
        public int revision;
        public List<String> trackIds = new ArrayList<>();
    }

    private final Path file;
    private Cached cached;

    public DailyMixService(Path dataDir) {
        this.file = dataDir == null ? null : dataDir.resolve("daily_mix.json");
        this.cached = load();
    }

    public synchronized Map<String, Object> get(List<Track> tracks,
                                                Set<String> favorites,
                                                Map<String, StatsStore.TrackStat> stats) {
        LocalDate today = LocalDate.now();
        String key = today.toString();
        if (cached == null || !key.equals(cached.date) || !valid(cached.trackIds, tracks)) {
            int revision = cached == null || !key.equals(cached.date) ? 0 : cached.revision;
            cached = generate(tracks, favorites, stats, today, revision);
            save();
        }
        return payload();
    }

    public synchronized Map<String, Object> refresh(List<Track> tracks,
                                                    Set<String> favorites,
                                                    Map<String, StatsStore.TrackStat> stats) {
        int revision = cached == null ? 1 : cached.revision + 1;
        cached = generate(tracks, favorites, stats, LocalDate.now(), revision);
        save();
        return payload();
    }

    private Cached generate(List<Track> tracks,
                            Set<String> favorites,
                            Map<String, StatsStore.TrackStat> stats,
                            LocalDate date,
                            int revision) {
        Cached out = new Cached();
        out.date = date.toString();
        out.generatedAt = System.currentTimeMillis();
        out.revision = revision;
        if (tracks == null || tracks.isEmpty()) return out;

        long now = out.generatedAt;
        Random random = new Random(date.toEpochDay() * 0x9E3779B97F4A7C15L + tracks.size() + revision * 7919L);
        Map<String, Double> scores = new HashMap<>();
        Map<String, Track> byId = new HashMap<>();
        for (Track track : tracks) {
            if (track == null || track.id == null) continue;
            byId.put(track.id, track);
            scores.put(track.id, score(track, stats == null ? null : stats.get(track.id),
                    favorites != null && favorites.contains(track.id), now, random));
        }

        int target = Math.min(TARGET_SIZE, byId.size());
        List<Track> chosen = new ArrayList<>();
        Set<String> ids = new LinkedHashSet<>();
        Map<String, Integer> artists = new HashMap<>();
        Map<String, Integer> blocks = new HashMap<>();
        Map<String, Integer> genres = new HashMap<>();
        Map<String, Integer> albums = new HashMap<>();

        while (chosen.size() < target) {
            Track best = null;
            double bestAdjusted = Double.NEGATIVE_INFINITY;
            for (Track track : byId.values()) {
                if (ids.contains(track.id)) continue;
                double adjusted = scores.getOrDefault(track.id, 1.0);
                adjusted -= artists.getOrDefault(track.artist, 0) * 1.15;
                adjusted -= blocks.getOrDefault(track.block, 0) * 0.22;
                adjusted -= genres.getOrDefault(track.genre, 0) * 0.18;
                adjusted -= albums.getOrDefault(track.album, 0) * 0.12;
                if (adjusted > bestAdjusted) {
                    bestAdjusted = adjusted;
                    best = track;
                }
            }
            if (best == null) break;
            chosen.add(best);
            ids.add(best.id);
            artists.merge(best.artist, 1, Integer::sum);
            blocks.merge(best.block, 1, Integer::sum);
            genres.merge(best.genre, 1, Integer::sum);
            albums.merge(best.album, 1, Integer::sum);
        }
        for (Track track : chosen) out.trackIds.add(track.id);
        return out;
    }

    private static double score(Track track,
                                StatsStore.TrackStat stat,
                                boolean favorite,
                                long now,
                                Random random) {
        double score = 1.0;
        if (track.rating > 0) score += (track.rating - 5.0) * 0.85;
        score += Math.log1p(Math.max(0, track.playCount)) * 0.35;
        if (stat != null) {
            score += Math.log1p(Math.max(0, stat.seconds) / 60.0) * 0.6;
            score += Math.log1p(Math.max(0, stat.plays)) * 0.4;
        }
        if (favorite) score += 1.6;

        long last = stat == null ? 0 : stat.lastPlayedAt;
        if (last <= 0) {
            score += 0.65;
        } else {
            double days = (now - last) / (double) DAY_MS;
            if (days > 45) score += 0.55;
            else if (days > 14) score += 0.2;
            else if (days < 1) score -= 1.4;
            else if (days < 3) score -= 0.75;
        }
        if (track.addedAt > 0 && now - track.addedAt < 14 * DAY_MS) score += 0.25;
        score += random.nextDouble() * 0.9;
        return score;
    }

    private static boolean valid(List<String> ids, List<Track> tracks) {
        if (ids == null || ids.isEmpty()) return tracks == null || tracks.isEmpty();
        Set<String> available = new HashSet<>();
        if (tracks != null) {
            for (Track track : tracks) {
                if (track != null && track.id != null) available.add(track.id);
            }
        }
        for (String id : ids) {
            if (!available.contains(id)) return false;
        }
        return true;
    }

    private Map<String, Object> payload() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", cached.date);
        out.put("generatedAt", cached.generatedAt);
        out.put("trackIds", List.copyOf(cached.trackIds));
        return out;
    }

    private Cached load() {
        if (file == null || !Files.isRegularFile(file)) return null;
        try {
            Cached value = Json.read(Files.readString(file), Cached.class);
            if (value != null && value.trackIds == null) value.trackIds = new ArrayList<>();
            return value;
        } catch (Exception e) {
            System.err.println("[daily-mix] unable to read cache: " + e.getMessage());
            return null;
        }
    }

    private void save() {
        if (file == null) return;
        try {
            Files.createDirectories(file.getParent());
            Json.writeAtomic(file, cached);
        } catch (IOException e) {
            System.err.println("[daily-mix] unable to save cache: " + e.getMessage());
        }
    }
}
