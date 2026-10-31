package com.potatomusic.superapp;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Owns playback state, the play queue and automatic advance.
 *
 * <p>All public methods are synchronized. VLC event callbacks are marshalled
 * onto a small executor so that the native thread is never blocked.</p>
 */
public final class PlaybackController {
    public interface Host {
        Track findTrack(String id);

        List<Track> tracks();

        Settings settings();

        EqStore eqStore();

        String neteaseIdFor(String path);

        void emit(String event, Object data);

        void markPlayed(Track track);

        void recordListening(Track track, double seconds);

        void scheduleSave();
    }

    private final Host host;
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "playback-ticker");
        t.setDaemon(true);
        return t;
    });
    private final ScheduledExecutorService events = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "playback-events");
        t.setDaemon(true);
        return t;
    });
    private final Random random = new Random();

    private volatile PlaybackEngine engine;
    private List<String> queue = new ArrayList<>();
    private int queueIndex = -1;
    private String currentId;
    private Track transientTrack;
    private boolean playing;
    private double time;
    private double duration;
    private String repeat;
    private boolean shuffle;
    private boolean muted;
    private boolean loaded;
    private double volumeBeforeMute;
    private long lastPersistedPositionAt;
    private long lastStatsAt;
    private double lastStatsTime;
    private String lastStatsTrackId;
    private boolean shuttingDown;

    public PlaybackController(Host host) {
        this.host = host;
        this.repeat = normalizeRepeat(host.settings().repeat);
        this.shuffle = host.settings().shuffle;
        this.volumeBeforeMute = host.settings().volume;
        restorePreview();
        ticker.scheduleAtFixedRate(this::tick, 0, 500, TimeUnit.MILLISECONDS);
    }

    public synchronized PlaybackEngine engine() {
        if (engine == null) {
            PlaybackEngine created = EngineFactory.create(host.settings().playbackEngine);
            String fallback = EngineFactory.lastFallbackReason();
            if (fallback != null) {
                host.emit("toast", Map.of("kind", "error", "message", fallback));
            }
            created.setListener(new PlaybackEngine.Listener() {
                @Override
                public void onFinished() {
                    events.execute(() -> handleFinished());
                }

                @Override
                public void onSpectrum(java.util.List<Double> bars) {
                    host.emit("engine.spectrum", Map.of("bars", bars));
                }

                @Override
                public void onAdvanced(String path) {
                    events.execute(() -> handleAdvanced(path));
                }

                @Override
                public void onError(String message) {
                    events.execute(() -> {
                        synchronized (PlaybackController.this) {
                            playing = false;
                            host.emit("toast", Map.of("kind", "error", "message", message));
                            emitState();
                        }
                    });
                }
            });
            created.applyEq(host.eqStore().global, host.eqStore().on);
            engine = created;
        }
        return engine;
    }

    /** Push the persisted virtual sound field to the active engine, live. */
    public synchronized void applyCrossfeed() {
        PlaybackEngine current = engine;
        if (current != null) {
            current.setCrossfeed(host.settings().crossfeedEnabled, host.settings().crossfeedStrength);
        }
    }

    public synchronized void applySpatial() {
        PlaybackEngine current = engine;
        if (current != null) {
            current.setSpatial(host.settings().spatialEnabled, host.settings().spatialX, host.settings().spatialY);
        }
    }

    public synchronized void applyEq() {
        PlaybackEngine current = engine;
        if (current == null) return;
        Track track = currentId == null ? null : host.findTrack(currentId);
        EqPreset preset = track == null
                ? host.eqStore().global
                : host.eqStore().effectiveFor(track.path, host.neteaseIdFor(track.path));
        current.applyEq(preset, host.eqStore().on);
    }

    /** Apply an unsaved EQ draft for live preview. */
    public synchronized void applyEqPreview(EqPreset preset, boolean on) {
        PlaybackEngine current = engine;
        if (current != null) current.applyEq(preset, on);
    }

    public void warmUpAsync() {
        Thread thread = new Thread(() -> {
            try {
                engine();
            } catch (Throwable e) {
                System.err.println("[vlc] " + e.getMessage());
            }
        }, "vlc-warmup");
        thread.setDaemon(true);
        thread.setPriority(Thread.MIN_PRIORITY);
        thread.start();
    }

    public synchronized Map<String, Object> state() {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("trackId", currentId);
        state.put("playing", playing);
        state.put("time", round(time));
        state.put("duration", round(duration));
        state.put("volume", round(host.settings().volume));
        state.put("muted", muted);
        state.put("repeat", repeat);
        state.put("shuffle", shuffle);
        state.put("queue", List.copyOf(queue));
        state.put("queueIndex", queueIndex);
        PlaybackEngine e = engine;
        state.put("engine", e == null ? null : e.id());
        state.put("available", e == null || e.available());
        state.put("error", e == null ? null : e.error());
        return state;
    }

    public synchronized Map<String, Object> play(String trackId, List<String> requestedQueue, double startAt) {
        transientTrack = null;
        Track track = host.findTrack(trackId);
        if (track == null) {
            throw new IllegalArgumentException("Unknown track: " + trackId);
        }
        List<String> nextQueue = cleanQueue(requestedQueue);
        if (nextQueue.isEmpty() || !nextQueue.contains(trackId)) {
            nextQueue = new ArrayList<>();
            nextQueue.add(trackId);
        }
        if (shuffle) {
            nextQueue = shuffledAround(nextQueue, trackId);
            queueIndex = 0;
        } else {
            queueIndex = nextQueue.indexOf(trackId);
        }
        if (queueIndex < 0) {
            queueIndex = 0;
        }
        queue = new ArrayList<>(nextQueue);
        persistQueue();
        beginCurrent(Math.max(0, startAt), true);
        return state();
    }

    /**
     * Play a file outside the scanned library. Used by Together for a track
     * downloaded into the room cache; the file is deliberately not indexed as
     * part of the user's library.
     */
    public synchronized Map<String, Object> playTemp(
            String path,
            String trackId,
            String title,
            String artist,
            String album,
            double duration,
            double startAt) {
        java.nio.file.Path file = java.nio.file.Path.of(path).toAbsolutePath().normalize();
        if (!java.nio.file.Files.isRegularFile(file)) {
            throw new IllegalArgumentException("Temporary track file is missing");
        }
        String id = trackId == null || trackId.isBlank() ? "together:" + file.getFileName() : trackId;
        Track track = new Track();
        track.id = id;
        track.path = file.toString();
        track.title = title == null || title.isBlank() ? file.getFileName().toString() : title;
        track.artist = artist == null ? "" : artist;
        track.album = album == null ? "" : album;
        track.duration = (int) Math.max(0, Math.round(duration));
        track.addedAt = System.currentTimeMillis();
        try {
            track.fileSize = java.nio.file.Files.size(file);
        } catch (java.io.IOException ignored) {
            track.fileSize = 0;
        }
        transientTrack = track;
        currentId = id;
        queue = new ArrayList<>();
        queue.add(id);
        queueIndex = 0;
        beginCurrent(Math.max(0, startAt), false);
        return state();
    }

    public synchronized Map<String, Object> toggle() {
        if (currentId == null) {
            List<Track> all = host.tracks();
            if (all.isEmpty()) {
                return state();
            }
            List<String> ids = all.stream().map(t -> t.id).toList();
            return play(ids.get(0), ids, 0);
        }
        if (!loaded) {
            beginCurrent(time >= duration - 1 ? 0 : time, true);
            return state();
        }
        if (playing) {
            engine().pause();
            playing = false;
            persistPosition();
            emitState();
        } else {
            if (duration > 0 && time >= duration - 0.6) {
                engine().seek(0);
                time = 0;
            }
            engine().resume();
            playing = true;
            emitState();
        }
        return state();
    }

    public synchronized Map<String, Object> next(boolean automatic) {
        syncTime();
        if (automatic && "one".equals(repeat) && currentId != null) {
            engine().seek(0);
            engine().resume();
            time = 0;
            playing = true;
            emitState();
            return state();
        }
        if (queue.isEmpty()) {
            return state();
        }
        if (!loaded) {
            queueIndex = Math.min(queueIndex + 1, queue.size() - 1);
            beginCurrent(0, true);
            return state();
        }
        int next = queueIndex + 1;
        if (next >= queue.size()) {
            if ("all".equals(repeat)) {
                next = 0;
            } else {
                stopAtEnd();
                return state();
            }
        }
        queueIndex = next;
        persistQueue();
        beginCurrent(0, true);
        return state();
    }

    public synchronized Map<String, Object> previous() {
        syncTime();
        if (!loaded) {
            beginCurrent(0, true);
            return state();
        }
        if (time > 3.5) {
            engine().seek(0);
            time = 0;
            emitState();
            return state();
        }
        if (queue.isEmpty()) {
            return state();
        }
        int prev = queueIndex - 1;
        if (prev < 0) {
            prev = "all".equals(repeat) ? queue.size() - 1 : 0;
        }
        queueIndex = prev;
        persistQueue();
        beginCurrent(0, true);
        return state();
    }

    public synchronized Map<String, Object> seek(double seconds) {
        if (currentId == null) {
            return state();
        }
        double target = Math.max(0, Math.min(duration > 0 ? duration : seconds, seconds));
        if (!loaded) {
            beginCurrent(target, true);
            return state();
        }
        engine().seek(target);
        time = target;
        host.settings().lastPosition = target;
        host.scheduleSave();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> setVolume(double value) {
        double next = Math.max(0, Math.min(1, value));
        host.settings().volume = next;
        if (muted && next > 0) {
            muted = false;
        }
        PlaybackEngine e = engine;
        if (e != null) {
            e.setVolume(muted ? 0 : next);
        }
        host.scheduleSave();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> setMuted(boolean value) {
        if (muted && !value) {
            host.settings().volume = volumeBeforeMute;
        } else if (!muted && value) {
            volumeBeforeMute = host.settings().volume;
        }
        muted = value;
        PlaybackEngine e = engine;
        if (e != null) {
            e.setDsdMode(dsdMultFromSettings());
        e.setExclusive(host.settings().exclusive);
        e.setSpatial(host.settings().spatialEnabled, host.settings().spatialX, host.settings().spatialY);
        e.setFollowSourceRate(host.settings().followSourceRate);
        e.setCrossfeed(host.settings().crossfeedEnabled, host.settings().crossfeedStrength);
        e.setVisualization(true);
        e.setVolume(muted ? 0 : host.settings().volume);
        }
        host.scheduleSave();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> setRepeat(String mode) {
        repeat = normalizeRepeat(mode);
        host.settings().repeat = repeat;
        host.scheduleSave();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> setShuffle(boolean enabled) {
        shuffle = enabled;
        host.settings().shuffle = enabled;
        if (enabled && currentId != null && !queue.isEmpty()) {
            queue = shuffledAround(queue, currentId);
            queueIndex = 0;
        }
        persistQueue();
        host.scheduleSave();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> enqueue(String trackId, boolean playNext) {
        if (host.findTrack(trackId) == null) {
            throw new IllegalArgumentException("Unknown track: " + trackId);
        }
        if (currentId == null) {
            queue.add(trackId);
            if (queueIndex < 0) {
                queueIndex = 0;
            }
        } else if (playNext) {
            queue.add(Math.min(queueIndex + 1, queue.size()), trackId);
        } else {
            queue.add(trackId);
        }
        persistQueue();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> enqueueMany(List<String> trackIds, boolean playNext) {
        List<String> ids = cleanQueue(trackIds);
        if (ids.isEmpty()) return state();
        if (currentId == null) {
            for (String id : ids) if (!queue.contains(id)) queue.add(id);
            if (queueIndex < 0) queueIndex = 0;
        } else if (playNext) {
            int at = Math.min(queueIndex + 1, queue.size());
            for (String id : ids) {
                queue.add(at++, id);
            }
        } else {
            queue.addAll(ids);
        }
        persistQueue();
        emitState();
        return state();
    }

    public synchronized Map<String, Object> setQueue(List<String> ids) {
        queue = cleanQueue(ids);
        if (currentId != null) {
            queueIndex = queue.indexOf(currentId);
            if (queueIndex < 0) {
                queue.add(0, currentId);
                queueIndex = 0;
            }
        }
        persistQueue();
        emitState();
        return state();
    }

    public synchronized void savePositionNow() {
        if (currentId != null) {
            syncTime();
            host.settings().lastTrackId = currentId;
            host.settings().lastPosition = time;
        }
        persistQueue();
    }

    public synchronized void shutdown() {
        shuttingDown = true;
        savePositionNow();
        ticker.shutdownNow();
        events.shutdownNow();
        PlaybackEngine e = engine;
        if (e != null) {
            e.release();
        }
    }

    private void beginCurrent(double startAt, boolean countPlay) {
        String id = queueIndex >= 0 && queueIndex < queue.size() ? queue.get(queueIndex) : currentId;
        Track track = transientTrack != null && transientTrack.id.equals(id) ? transientTrack : host.findTrack(id);
        if (track == null) {
            stopAtEnd();
            return;
        }
        currentId = track.id;
        duration = Math.max(0, track.duration);
        time = Math.max(0, startAt);
        PlaybackEngine e = engine();
        if (!e.available()) {
            playing = false;
            host.emit("toast", Map.of("kind", "error", "message", e.error()));
            emitState();
            return;
        }
        e.setDsdMode(dsdMultFromSettings());
        e.setExclusive(host.settings().exclusive);
        e.setSpatial(host.settings().spatialEnabled, host.settings().spatialX, host.settings().spatialY);
        e.setFollowSourceRate(host.settings().followSourceRate);
        e.setCrossfeed(host.settings().crossfeedEnabled, host.settings().crossfeedStrength);
        e.setVisualization(true);
        e.setVolume(muted ? 0 : host.settings().volume);
        // Apply the saved per-song preset before play(), matching the legacy player:
        // the new VLC output inherits the equalizer without a filter rebuild.
        EqPreset preset = host.eqStore().effectiveFor(track.path, host.neteaseIdFor(track.path));
        e.applyEq(preset, host.eqStore().on);
        e.play(track.path);
        loaded = true;
        playing = true;
        if (startAt > 0.5) {
            e.seek(startAt);
        }
        host.settings().lastTrackId = track.id;
        host.settings().lastPosition = startAt;
        resetStatsClock(track.id, startAt);
        host.scheduleSave();
        if (countPlay) {
            host.markPlayed(track);
        }
        Map<String, Object> changed = new LinkedHashMap<>();
        changed.put("trackId", track.id);
        changed.put("state", state());
        host.emit("playback.track", changed);
        emitState();
        schedulePreload();
    }

    private int dsdMultFromSettings() {
        String mode = host.settings().outputMode;
        if ("dop64".equals(mode)) return 64;
        if ("dop128".equals(mode)) return 128;
        if ("dop256".equals(mode)) return 256;
        return 0;
    }

    /** The queue entry that follows the current one, honouring repeat/shuffle. */
    private String nextTrackIdForGapless() {
        if (queue.isEmpty() || currentId == null || shuffle) return null;
        if ("one".equals(repeat)) return currentId;
        int index = queue.indexOf(currentId);
        if (index < 0) return null;
        int following = index + 1;
        if (following >= queue.size()) {
            return "all".equals(repeat) ? queue.get(0) : null;
        }
        return queue.get(following);
    }

    private void schedulePreload() {
        PlaybackEngine e = engine;
        if (e == null || !e.supportsGapless()) return;
        String nextId = nextTrackIdForGapless();
        Track track = nextId == null ? null : host.findTrack(nextId);
        e.setNext(track == null ? "" : track.path);
    }

    /** The engine handed off to the next file without stopping the device. */
    private void handleAdvanced(String path) {
        synchronized (this) {
            if (shuttingDown || path == null || path.isBlank()) return;
            Track track = null;
            for (Track candidate : host.tracks()) {
                if (path.equals(candidate.path)) {
                    track = candidate;
                    break;
                }
            }
            if (track == null) return;
            currentId = track.id;
            int index = queue.indexOf(track.id);
            if (index >= 0) queueIndex = index;
            duration = Math.max(0, track.duration);
            time = 0;
            playing = true;
            loaded = true;
            host.settings().lastTrackId = track.id;
            host.settings().lastPosition = 0;
            resetStatsClock(track.id, 0);
            host.markPlayed(track);
            host.scheduleSave();
            Map<String, Object> changed = new LinkedHashMap<>();
            changed.put("trackId", track.id);
            changed.put("state", state());
            host.emit("playback.track", changed);
            emitState();
            schedulePreload();
        }
    }

    private void handleFinished() {
        synchronized (this) {
            if (shuttingDown) {
                return;
            }
            playing = false;
            next(true);
        }
    }

    private void stopAtEnd() {
        PlaybackEngine e = engine;
        if (e != null) {
            e.setVisualization(false);
            e.stop();
        }
        playing = false;
        loaded = false;
        time = 0;
        host.settings().lastPosition = 0;
        host.scheduleSave();
        emitState();
    }

    private void restorePreview() {
        String lastId = host.settings().lastTrackId;
        Track track = host.findTrack(lastId);
        if (track == null) {
            return;
        }
        List<String> all = cleanQueue(host.settings().lastQueue);
        if (all.isEmpty()) {
            for (Track item : host.tracks()) {
                all.add(item.id);
            }
        }
        if (!all.contains(track.id)) {
            all.add(0, track.id);
        }
        queue = all;
        queueIndex = Math.max(0, all.indexOf(track.id));
        host.settings().lastQueue = new ArrayList<>(queue);
        host.settings().lastQueueIndex = queueIndex;
        currentId = track.id;
        duration = Math.max(0, track.duration);
        time = Math.max(0, Math.min(host.settings().lastPosition, duration > 0 ? duration - 1 : 0));
        loaded = false;
        playing = false;
    }

    private void resetStatsClock(String trackId, double time) {
        lastStatsTrackId = trackId;
        lastStatsTime = time;
        lastStatsAt = System.currentTimeMillis();
    }

    /**
     * Converts the observed clock movement into listening time. Seeking and
     * pause/resume gaps are ignored instead of being counted as listening.
     */
    private void recordListeningDelta() {
        long now = System.currentTimeMillis();
        Track track = currentId == null ? null : host.findTrack(currentId);
        if (track == null) {
            lastStatsTrackId = null;
            lastStatsTime = 0;
            lastStatsAt = now;
            return;
        }
        boolean same = track.id.equals(lastStatsTrackId);
        double delta = same ? time - lastStatsTime : 0;
        long wall = now - lastStatsAt;
        if (playing && same && delta > 0 && delta <= 3.0 && wall <= 3500) {
            host.recordListening(track, delta);
        }
        lastStatsTrackId = track.id;
        lastStatsTime = time;
        lastStatsAt = now;
    }

    private void tick() {
        if (shuttingDown) {
            return;
        }
        synchronized (this) {
            if (currentId == null) {
                return;
            }
            syncTime();
            recordListeningDelta();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("trackId", currentId);
            data.put("time", round(time));
            data.put("duration", round(duration));
            data.put("playing", playing);
            host.emit("playback.time", data);
            long now = System.currentTimeMillis();
            if (now - lastPersistedPositionAt > 10_000) {
                lastPersistedPositionAt = now;
                host.settings().lastTrackId = currentId;
                host.settings().lastPosition = time;
                host.scheduleSave();
            }
        }
    }

    private void syncTime() {
        PlaybackEngine e = engine;
        if (e == null || currentId == null) {
            return;
        }
        double engineTime = e.time();
        if (engineTime >= 0) {
            time = engineTime;
        }
        double engineLength = e.length();
        if (engineLength > 1) {
            duration = engineLength;
        }
        // Do not infer pause from isPlaying() here: VLC can report false for a
        // few hundred milliseconds while it opens the output device. Explicit
        // commands, errors and the finished callback are the source of truth.
    }

    private void persistPosition() {
        host.settings().lastPosition = time;
        host.settings().lastTrackId = currentId;
        persistQueue();
        host.scheduleSave();
    }

    private void persistQueue() {
        host.settings().lastQueue = new ArrayList<>(queue);
        host.settings().lastQueueIndex = queueIndex;
        host.scheduleSave();
    }

    public synchronized void removeTrack(String trackId) {
        if (trackId == null) {
            return;
        }
        boolean wasCurrent = trackId.equals(currentId);
        queue.removeIf(trackId::equals);
        if (wasCurrent) {
            PlaybackEngine e = engine;
            if (e != null) {
                e.stop();
            }
            currentId = null;
            playing = false;
            loaded = false;
            time = 0;
            duration = 0;
            queueIndex = -1;
            host.settings().lastTrackId = null;
            host.settings().lastPosition = 0;
        } else if (currentId != null) {
            queueIndex = queue.indexOf(currentId);
        }
        persistQueue();
        host.scheduleSave();
        emitState();
    }

    private void emitState() {
        host.emit("playback.state", state());
    }

    private List<String> cleanQueue(List<String> ids) {
        List<String> clean = new ArrayList<>();
        if (ids == null) {
            return clean;
        }
        for (String id : ids) {
            if (id != null && host.findTrack(id) != null && !clean.contains(id)) {
                clean.add(id);
            }
        }
        return clean;
    }

    private List<String> shuffledAround(List<String> ids, String firstId) {
        List<String> rest = new ArrayList<>(ids);
        rest.remove(firstId);
        Collections.shuffle(rest, random);
        List<String> result = new ArrayList<>();
        result.add(firstId);
        result.addAll(rest);
        return result;
    }

    private static String normalizeRepeat(String value) {
        return "all".equals(value) || "one".equals(value) ? value : "off";
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
