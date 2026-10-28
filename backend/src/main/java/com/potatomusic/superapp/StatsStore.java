package com.potatomusic.superapp;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Durable listening history: per-day time-of-day buckets and per-track totals.
 *
 * <p>The store is deliberately independent from the library index so deleting
 * a file does not erase the fact that it was listened to. It is updated from
 * the playback ticker (small deltas) and checkpointed with the rest of the app
 * state. A corrupt or missing file simply starts a fresh history.</p>
 */
public final class StatsStore {
    public static final int SCHEMA_VERSION = 1;
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final double MAX_TICK_SECONDS = 4.0;

    public static final class DayStat {
        public double seconds;
        public int plays;
        public double[] hours = new double[24];

        public DayStat() {
        }

        void ensureShape() {
            if (hours == null || hours.length != 24) {
                double[] resized = new double[24];
                if (hours != null) {
                    System.arraycopy(hours, 0, resized, 0, Math.min(hours.length, resized.length));
                }
                hours = resized;
            }
            if (!Double.isFinite(seconds) || seconds < 0) seconds = 0;
            if (plays < 0) plays = 0;
            for (int i = 0; i < hours.length; i++) {
                if (!Double.isFinite(hours[i]) || hours[i] < 0) hours[i] = 0;
            }
        }
    }

    public static final class TrackStat {
        public String title = "";
        public String artist = "";
        public double seconds;
        public int plays;
        public long lastPlayedAt;

        public TrackStat() {
        }
    }

    public static final class State {
        public int schemaVersion = SCHEMA_VERSION;
        public Map<String, DayStat> days = new LinkedHashMap<>();
        public Map<String, TrackStat> tracks = new LinkedHashMap<>();
    }

    private final Path file;
    private final Object lock = new Object();
    private State state;

    private StatsStore(Path file, State state) {
        this.file = file;
        this.state = state;
        normalize();
    }

    public static StatsStore load(Path file) {
        State state = null;
        try {
            if (file != null && Files.isRegularFile(file)) {
                state = Json.read(Files.readString(file), State.class);
            }
        } catch (Exception e) {
            System.err.println("[stats] unable to read history: " + e.getMessage());
        }
        return new StatsStore(file, state == null ? new State() : state);
    }

    /** Adds a measured span of playback to the current day and hour. */
    public void recordListening(Track track, double seconds, LocalDateTime at) {
        if (track == null || track.id == null || !Double.isFinite(seconds) || seconds <= 0) return;
        double delta = Math.min(seconds, MAX_TICK_SECONDS);
        if (delta <= 0) return;
        LocalDateTime when = at == null ? LocalDateTime.now() : at;
        synchronized (lock) {
            DayStat day = day(when.toLocalDate());
            day.seconds += delta;
            day.hours[when.getHour()] += delta;
            TrackStat entry = trackStat(track);
            entry.seconds += delta;
            entry.lastPlayedAt = Math.max(entry.lastPlayedAt, System.currentTimeMillis());
        }
    }

    /** Records a new playback start (the same event the library calls a play). */
    public void recordPlay(Track track, LocalDateTime at) {
        if (track == null || track.id == null) return;
        LocalDateTime when = at == null ? LocalDateTime.now() : at;
        synchronized (lock) {
            day(when.toLocalDate()).plays++;
            trackStat(track).plays++;
        }
    }

    public Map<String, Object> summary() {
        synchronized (lock) {
            double total = 0;
            List<Map<String, Object>> days = new ArrayList<>(state.days.size());
            List<Map.Entry<String, DayStat>> sortedDays = new ArrayList<>(state.days.entrySet());
            sortedDays.sort(Map.Entry.comparingByKey());
            for (Map.Entry<String, DayStat> entry : sortedDays) {
                DayStat day = entry.getValue();
                if (day == null) continue;
                day.ensureShape();
                total += day.seconds;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("date", entry.getKey());
                item.put("seconds", round(day.seconds));
                item.put("plays", day.plays);
                item.put("hours", hours(day.hours));
                days.add(item);
            }

            List<Map<String, Object>> tracks = new ArrayList<>();
            for (Map.Entry<String, TrackStat> entry : state.tracks.entrySet()) {
                TrackStat item = entry.getValue();
                if (item == null) continue;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("trackId", entry.getKey());
                row.put("title", item.title == null ? "" : item.title);
                row.put("artist", item.artist == null ? "" : item.artist);
                row.put("seconds", round(item.seconds));
                row.put("plays", item.plays);
                row.put("lastPlayedAt", item.lastPlayedAt);
                tracks.add(row);
            }
            tracks.sort(Comparator
                    .comparingDouble((Map<String, Object> row) -> ((Number) row.get("seconds")).doubleValue())
                    .reversed()
                    .thenComparing((Map<String, Object> row) -> ((Number) row.get("plays")).intValue(), Comparator.reverseOrder()));

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("version", SCHEMA_VERSION);
            out.put("generatedAt", System.currentTimeMillis());
            out.put("totalSeconds", round(total));
            out.put("days", days);
            out.put("tracks", tracks);
            return out;
        }
    }

    /** A copy of per-track totals for recommendation scoring. */
    public Map<String, TrackStat> trackSnapshot() {
        synchronized (lock) {
            return new LinkedHashMap<>(state.tracks);
        }
    }

    public void save() throws IOException {
        synchronized (lock) {
            if (file == null) return;
            state.schemaVersion = SCHEMA_VERSION;
            Json.writeAtomic(file, state);
        }
    }

    private DayStat day(LocalDate date) {
        String key = DAY_FORMAT.format(date);
        DayStat day = state.days.computeIfAbsent(key, ignored -> new DayStat());
        day.ensureShape();
        return day;
    }

    private TrackStat trackStat(Track track) {
        TrackStat entry = state.tracks.computeIfAbsent(track.id, ignored -> new TrackStat());
        if (track.title != null && !track.title.isBlank()) entry.title = track.title;
        if (track.artist != null && !track.artist.isBlank()) entry.artist = track.artist;
        return entry;
    }

    private void normalize() {
        if (state == null) state = new State();
        if (state.days == null) state.days = new LinkedHashMap<>();
        if (state.tracks == null) state.tracks = new LinkedHashMap<>();
        state.schemaVersion = SCHEMA_VERSION;
        for (DayStat day : state.days.values()) {
            if (day != null) day.ensureShape();
        }
    }

    private static List<Double> hours(double[] values) {
        List<Double> result = new ArrayList<>(24);
        for (double value : values) result.add(round(value));
        return result;
    }

    private static double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
