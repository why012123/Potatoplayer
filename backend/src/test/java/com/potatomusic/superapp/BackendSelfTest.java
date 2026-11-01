package com.potatomusic.superapp;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Dependency-free unit tests for the small, deterministic parts of the backend. */
public final class BackendSelfTest {
    private static int passed;

    public static void main(String[] args) throws Exception {
        testFileNameParsing();
        testStableIds();
        testLrcParsing();
        testLegacyImport();
        testNeteaseBindingMigration();
        testTaxonomyMerge();
        testEqMergeAndPreamp();
        testListeningStats();
        testBilibiliParsing();
        testPlaybackRepeat();
        System.out.println("BackendSelfTest: " + passed + " checks passed.");
    }

    private static void testFileNameParsing() {
        String[] pair = LibraryScanner.splitFileName("Aimer - 残響散歌.flac");
        check("Aimer".equals(pair[0]), "artist parsed from file name");
        check("残響散歌".equals(pair[1]), "title parsed from file name");

        String[] loose = LibraryScanner.splitFileName("untitled.mp3");
        check("Unknown Artist".equals(loose[0]), "missing artist falls back");
        check("untitled".equals(loose[1]), "missing title falls back");

        String[] doubleDash = LibraryScanner.splitFileName("Artist - Song - Live.flac");
        check("Artist".equals(doubleDash[0]), "only the first separator is used");
        check("Song - Live".equals(doubleDash[1]), "the rest of the title is preserved");
    }

    private static void testStableIds() {
        String one = LibraryScanner.stableId("/tmp/a b/曲.flac");
        String two = LibraryScanner.stableId("/tmp/a b/曲.flac");
        String other = LibraryScanner.stableId("/tmp/a b/别的.flac");
        check(one.equals(two), "track ids are stable");
        check(!one.equals(other), "different paths produce different ids");
        check(one.length() == 24, "ids are short enough for IPC");
    }

    private static void testLrcParsing() throws Exception {
        Path dir = Files.createTempDirectory("potato-lrc-test");
        Path main = dir.resolve("main.lrc");
        Path trans = dir.resolve("main.trans.lrc");
        Files.writeString(main, """
                [ti:Test]
                [00:01.00]Hello
                [00:05.50][00:10.00]Chorus
                [00:12.345]Last line
                """, StandardCharsets.UTF_8);
        Files.writeString(trans, """
                [00:01.00]你好
                [00:05.50]副歌
                [00:10.00]副歌
                """, StandardCharsets.UTF_8);
        LyricsService.Payload payload = LyricsService.parse(main, trans);
        check(payload.found, "lrc is found");
        check(payload.translated, "translation is detected");
        check(payload.lines.size() == 4, "each timestamp becomes a line");
        check("Hello".equals(payload.lines.get(0).text), "first line parsed");
        check("你好".equals(payload.lines.get(0).translation), "translation merged by timestamp");
        check(Math.abs(payload.lines.get(3).time - 12.345) < 0.0001, "centiseconds parsed");
    }

    private static void testLegacyImport() throws Exception {
        Path root = Files.createTempDirectory("potato-legacy-test");
        Path music = Files.createDirectories(root.resolve("source").resolve("music"));
        Path track = music.resolve("KAKO - 15cm.flac");
        Files.write(track, new byte[0]);

        Files.writeString(root.resolve("source").resolve("ratings.json"), """
                {
                  "%s": {
                    "title": "15cm",
                    "artist": "KAKO",
                    "cover": "/covers/123.jpg",
                    "genre": "Air",
                    "block": "iList Standard",
                    "note": "seen live",
                    "score": 8.8,
                    "play_count": 9
                  }
                }
                """.formatted(track.toAbsolutePath()),
                StandardCharsets.UTF_8);

        Files.writeString(root.resolve("source").resolve("metadata_cache.csv"), """
                filepath,title,artist,duration
                "%s",15cm,KAKO,289
                """.formatted(track.toAbsolutePath()),
                StandardCharsets.UTF_8);

        LegacyData data = LegacyData.load(music);
        check(data.isPresent(), "legacy library detected");
        LegacyData.Entry entry = data.find(track.toAbsolutePath().toString());
        check(entry != null, "legacy row matched by absolute path");
        check("KAKO".equals(entry.artist), "legacy artist imported");
        check("Air".equals(entry.genre), "legacy genre imported");
        check("iList Standard".equals(entry.block), "legacy block imported");
        check("seen live".equals(entry.note), "legacy note imported");
        check(entry.duration == 289, "duration imported from csv");
        check(Math.abs(entry.rating - 8.8) < 0.001, "rating imported");
        check(entry.playCount == 9, "play count imported");
    }

    private static void testNeteaseBindingMigration() throws Exception {
        Path data = Files.createTempDirectory("potato-bindings-test");
        Path root = Files.createTempDirectory("potato-bindings-library");
        Path music = Files.createDirectories(root.resolve("source").resolve("music"));
        Path track = music.resolve("Artist - Song.flac");
        Files.write(track, new byte[0]);

        Path legacy = root.resolve("source").resolve("netease_bindings.json");
        Files.writeString(
                legacy,
                Json.stringify(Map.of(track.toAbsolutePath().toString(), "123456")),
                StandardCharsets.UTF_8);

        NeteaseBindings first = new NeteaseBindings(data, legacy);
        NeteaseBindings.Binding imported = first.find(track.toString());
        check(imported != null && "123456".equals(imported.neteaseId), "legacy NetEase binding is imported");

        first.remove(track.toString());
        NeteaseBindings second = new NeteaseBindings(data, legacy);
        check(second.find(track.toString()) == null, "legacy binding import runs only once");

        Path stringData = Files.createTempDirectory("potato-bindings-string");
        Files.writeString(
                stringData.resolve("netease_bindings.json"),
                Json.stringify(Map.of(track.toAbsolutePath().toString(), "654321")),
                StandardCharsets.UTF_8);
        NeteaseBindings strings = new NeteaseBindings(stringData);
        NeteaseBindings.Binding stringBinding = strings.find(track.toString());
        check(stringBinding != null && "654321".equals(stringBinding.neteaseId), "old string bindings load in place");
    }

    private static void testTaxonomyMerge() {
        List<Tag> current = List.of(new Tag("Mine", "#112233"));
        List<Tag> legacy = List.of(new Tag("Mine", "#aabbcc"), new Tag("Legacy", "#445566"));
        List<Tag> merged = Taxonomy.merge(current, legacy, List.of("Mine", "Fresh"));
        check(merged.size() == 3, "taxonomy merge removes duplicates");
        check("#112233".equals(Taxonomy.find(merged, "Mine").color), "existing colour wins");
        check(Taxonomy.find(merged, "Legacy") != null, "legacy names survive");
        check(Taxonomy.find(merged, "Fresh") != null, "used track values are added");
        check(Taxonomy.validColor(Taxonomy.find(merged, "Fresh").color), "generated colour is valid");
        check(!Taxonomy.validColor("red"), "invalid colours are rejected");
    }

    private static void testEqMergeAndPreamp() throws Exception {
        Path base = Files.createTempDirectory("potato-eq-test");
        Path music = Files.createDirectories(base.resolve("source").resolve("music"));
        Path current = base.resolve("app-eq.json");
        Path legacy = base.resolve("source").resolve("eq.json");
        Files.writeString(current, """
                {
                  "enabled": true,
                  "preamp": 12.0,
                  "bands": [-15.0, 4.0, 4.0, 4.5, 5.0, 4.0, 4.5, -4.5, -2.5, 0.0],
                  "presets": {
                    "1": {"name": "1", "preamp": 12.0, "bands": [-15.0, 4.0, 4.0, 4.5, 5.0, 4.0, 4.5, -4.5, -2.5, 0.0]}
                  }
                }
                """, StandardCharsets.UTF_8);
        Files.writeString(legacy, """
                {
                  "version": 2,
                  "on": true,
                  "global": {"preamp": 12.0, "bands": [0,0,0,0,0,0,0,0,0,0]},
                  "presets": {
                    "Dance改": {"preamp": 12.0, "bands": [1,2,3,4,5,6,7,8,9,10]}
                  },
                  "songs": {
                    "source/music/Mili - world.execute (me) ;.flac": {
                      "nid": "435278010",
                      "preamp": 12.0,
                      "bands": [-20.0, -9.5, 1.0, 1.5, 0.5, 4.5, 3.5, 3.5, -1.0, -20.0]
                    }
                  }
                }
                """, StandardCharsets.UTF_8);

        EqStore store = EqStore.load(current, legacy, music);
        check(store.on, "legacy eq enabled state imported");
        check(Math.abs(store.global.preamp - 12f) < 0.001f, "current flat-format preamp is not migrated twice");
        check(Math.abs(store.global.bands[0] + 15f) < 0.001f, "current global curve wins over legacy flat global");
        check(store.presets.containsKey("1"), "current named preset kept");
        check(store.presets.containsKey("Dance改"), "legacy named preset imported");
        check(store.songCount() == 1, "legacy per-song preset imported");
        check(store.legacyMerged, "legacy merge is remembered");

        String songPath = music.resolve("Mili - world.execute (me) ;.flac").toAbsolutePath().toString();
        EqPreset byPath = store.forSong(songPath, null);
        check(byPath != null && Math.abs(byPath.bands[0] + 20f) < 0.001f, "per-song preset matched by relative path");
        EqPreset byId = store.forSong(music.resolve("renamed.flac").toAbsolutePath().toString(), "435278010");
        check(byId != null && Math.abs(byId.bands[1] + 9.5f) < 0.001f, "per-song preset matched by cloud id fallback");
        check(store.effectiveFor(music.resolve("other.flac").toString(), null).sameAs(store.global), "unmatched song follows global");

        Path saved = base.resolve("saved.json");
        store.save(saved);
        EqStore reloaded = EqStore.load(saved, null, music);
        check(reloaded.songCount() == 1, "per-song presets survive save and reload");
        check(Math.abs(reloaded.global.preamp - 12f) < 0.001f, "preamp survives save and reload");
        check(reloaded.presets.containsKey("Dance改"), "named preset survives save and reload");

        reloaded.removePreset("Dance改");
        reloaded.save(saved);
        EqStore afterDelete = EqStore.load(saved, legacy, music);
        check(!afterDelete.presets.containsKey("Dance改"), "deleting an imported preset is not undone by the legacy merge");
    }

    private static void testListeningStats() throws Exception {
        Path file = Files.createTempDirectory("potato-stats-test").resolve("stats.json");
        Track track = new Track();
        track.id = "track-1";
        track.title = "Night Bus";
        track.artist = "Aimer";
        StatsStore store = StatsStore.load(file);
        store.recordPlay(track, LocalDateTime.of(2026, 10, 27, 23, 30));
        store.recordListening(track, 1.5, LocalDateTime.of(2026, 10, 27, 23, 30));
        store.recordListening(track, 2.0, LocalDateTime.of(2026, 10, 28, 0, 5));
        store.recordListening(track, 99.0, LocalDateTime.of(2026, 10, 28, 0, 6));
        store.save();

        StatsStore reloaded = StatsStore.load(file);
        Map<String, Object> summary = reloaded.summary();
        List<Map<String, Object>> days = (List<Map<String, Object>>) summary.get("days");
        check(days.size() == 2, "listening history keeps one bucket per day");
        Map<String, Object> first = days.get(0);
        Map<String, Object> second = days.get(1);
        check("2026-10-27".equals(first.get("date")), "day keys are ISO dates");
        check(Math.abs(((Number) first.get("seconds")).doubleValue() - 1.5) < 0.001, "short listening span recorded");
        check(Math.abs(((Number) second.get("seconds")).doubleValue() - 6.0) < 0.001, "a long gap is capped to one tick");
        List<Double> hours = (List<Double>) second.get("hours");
        check(hours.size() == 24, "hourly buckets always contain 24 entries");
        check(Math.abs(hours.get(0) - 6.0) < 0.001, "midnight bucket is updated");
        check(((Number) first.get("plays")).intValue() == 1, "play count is stored by day");
        List<Map<String, Object>> tracks = (List<Map<String, Object>>) summary.get("tracks");
        check(tracks.size() == 1, "per-track listening stats are stored");
        check("Night Bus".equals(tracks.get(0).get("title")), "track title survives a reload");
        check(((Number) tracks.get(0).get("plays")).intValue() == 1, "per-track play count is stored");
    }

    private static void testBilibiliParsing() throws Exception {
        var root = Json.MAPPER.readTree("""
                {
                  "code": 0,
                  "data": {
                    "numResults": 321,
                    "result": [
                      {
                        "type": "video",
                        "bvid": "BV1xx411c7mD",
                        "aid": 123,
                        "title": "【MV】<em class=keyword>影二つ</em> &amp; more",
                        "author": "riya &amp; friends",
                        "mid": 456,
                        "pic": "//i0.hdslb.com/bfs/archive/a.jpg",
                        "duration": "1:02",
                        "play": 1234,
                        "danmaku": 9,
                        "pubdate": 123,
                        "description": "A &lt;test&gt; description",
                        "typename": "MV",
                        "arcurl": "http://www.bilibili.com/video/av123"
                      },
                      {"type": "live", "title": "ignored"}
                    ]
                  }
                }
                """);
        Map<String, Object> parsed = BilibiliService.parse(root, "影二つ", 10);
        check(((Number) parsed.get("total")).longValue() == 321L, "bilibili total is parsed");
        check(parsed.get("searchUrl").toString().contains("search.bilibili.com"), "bilibili search url is built");
        List<Map<String, Object>> items = (List<Map<String, Object>>) parsed.get("results");
        check(items.size() == 1, "non-video bilibili entries are ignored");
        Map<String, Object> item = items.get(0);
        check("BV1xx411c7mD".equals(item.get("bvid")), "bilibili bvid is parsed");
        check("【MV】影二つ & more".equals(item.get("title")), "bilibili title markup and entities are cleaned");
        check("riya & friends".equals(item.get("author")), "bilibili author is cleaned");
        check("https://i0.hdslb.com/bfs/archive/a.jpg".equals(item.get("coverUrl")), "bilibili cover is normalized");
        check(((Number) item.get("durationSeconds")).intValue() == 62, "bilibili duration is parsed");
        check("https://www.bilibili.com/video/BV1xx411c7mD".equals(item.get("url")), "bilibili video url is built");
    }

    private static void testPlaybackRepeat() throws Exception {
        Track a = new Track(); a.id = "a"; a.path = "/music/a.flac"; a.duration = 10;
        Track b = new Track(); b.id = "b"; b.path = "/music/b.flac"; b.duration = 10;
        Track c = new Track(); c.id = "c"; c.path = "/music/c.flac"; c.duration = 10;
        Settings settings = new Settings();
        List<Track> tracks = List.of(a, b, c);
        PlaybackController.Host host = new PlaybackController.Host() {
            private final EqStore eq = new EqStore();
            public Track findTrack(String id) { return tracks.stream().filter(t -> t.id.equals(id)).findFirst().orElse(null); }
            public List<Track> tracks() { return tracks; }
            public Settings settings() { return settings; }
            public EqStore eqStore() { return eq; }
            public String neteaseIdFor(String path) { return null; }
            public void emit(String event, Object data) { }
            public void markPlayed(Track track) { track.playCount++; }
            public void recordListening(Track track, double seconds) { }
            public void scheduleSave() { }
        };
        // An EOF closes this decoder: seek/resume cannot reopen it. Both gapless
        // and non-gapless engines must restart indefinitely and keep queue semantics.
        for (boolean gapless : List.of(false, true)) {
            settings.repeat = "off"; settings.shuffle = false;
            FakePlayback engine = new FakePlayback(gapless);
            PlaybackController player = new PlaybackController(host, () -> engine);
            try {
                player.play("a", List.of("a", "b", "c"), 0);
                if (gapless) check(b.path.equals(engine.next), "initial next file preloaded");
                player.setRepeat("one");
                if (gapless) check(a.path.equals(engine.next), "enabling repeat replaces old preload immediately");
                for (int loop = 0; loop < 3; loop++) {
                    int count = engine.plays;
                    engine.open = false;
                    engine.listener.onFinished();
                    awaitPlayback(() -> engine.plays > count && Boolean.TRUE.equals(player.state().get("playing")));
                    check("a".equals(player.state().get("trackId")) && engine.open, "EOF reopens the same track");
                    check(((Number) player.state().get("time")).doubleValue() == 0, "repeat restarts at zero");
                }
                player.setShuffle(true);
                if (gapless) check(a.path.equals(engine.next), "repeat-one takes precedence over shuffle");
                player.setShuffle(false);
                player.setQueue(List.of("a", "b", "c"));
                if (gapless) {
                    int count = engine.plays;
                    engine.listener.onAdvanced(b.path);
                    awaitPlayback(() -> engine.plays > count);
                    check("a".equals(player.state().get("trackId")), "late old preload cannot escape repeat-one");
                    int playCount = a.playCount;
                    engine.listener.onAdvanced(a.path);
                    awaitPlayback(() -> { player.state(); return a.playCount > playCount; });
                    player.setRepeat("off");
                    check(b.path.equals(engine.next), "disabling repeat updates preload");
                    player.setQueue(List.of("a", "c", "b"));
                    check(c.path.equals(engine.next), "queue edits refresh preload");
                }
                player.setRepeat("one");
                player.setQueue(List.of("a", "b", "c"));
                player.next(false);
                check("b".equals(player.state().get("trackId")), "manual next still skips under repeat-one");
                player.play("c", List.of("a", "b", "c"), 0);
                player.setRepeat("all");
                if (gapless) check(a.path.equals(engine.next), "repeat-all preloads queue head at end");
                player.setRepeat("off");
                if (gapless) check(engine.next.isEmpty(), "repeat-off clears final preload");
                engine.listener.onFinished();
                awaitPlayback(() -> Boolean.FALSE.equals(player.state().get("playing")));
                check(!engine.open, "repeat-off stops at queue end");
            } finally { player.shutdown(); }
        }
    }

    private static void awaitPlayback(java.util.function.BooleanSupplier done) throws Exception {
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(3);
        while (!done.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(5);
        check(done.getAsBoolean(), "playback callback completed");
    }

    private static final class FakePlayback implements PlaybackEngine {
        final boolean gapless;
        volatile int plays;
        volatile boolean open;
        volatile String next = "";
        Listener listener;
        FakePlayback(boolean gapless) { this.gapless = gapless; }
        public String id() { return "test"; }
        public void setListener(Listener value) { listener = value; }
        public boolean available() { return true; }
        public String error() { return null; }
        public void play(String path) { open = true; plays++; }
        public void pause() { }
        public void resume() { }
        public void stop() { open = false; }
        public void seek(double seconds) { }
        public double time() { return 0; }
        public double length() { return 10; }
        public boolean isPlaying() { return open; }
        public void setVolume(double volume) { }
        public boolean eqAvailable() { return false; }
        public void applyEq(EqPreset preset, boolean on) { }
        public List<Float> eqFrequencies() { return List.of(); }
        public List<String> eqFactoryPresetNames() { return List.of(); }
        public EqCurve eqFactoryPreset(String name) { return null; }
        public void release() { open = false; }
        public boolean supportsGapless() { return gapless; }
        public void setNext(String path) { next = path; }
    }

    private static void check(boolean condition, String message) {
        passed++;
        if (!condition) {
            throw new AssertionError("FAILED: " + message);
        }
    }

    private BackendSelfTest() {
    }
}
