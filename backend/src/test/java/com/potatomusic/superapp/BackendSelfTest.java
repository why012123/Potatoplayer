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
        testAudioQuality();
        testFileNameParsing();
        testScannerMetadataNeed();
        testStableIds();
        testLrcParsing();
        testCustomCoverValidation();
        testTitleNormalisation();
        testLegacyImport();
        testNeteaseBindingMigration();
        testTaxonomyMerge();
        testEqMergeAndPreamp();
        testEqCurve();
        testListeningStats();
        testBilibiliParsing();
        testBilibiliAudio();
        testPlaybackRepeat();
        testDownloadQueue();
        testPlaylistSync();
        System.out.println("BackendSelfTest: " + passed + " checks passed.");
    }

    private static void testAudioQuality() throws Exception {
        Path folder = Files.createTempDirectory("quality-test-");
        try {
            Path cd = folder.resolve("cd.wav"), hires = folder.resolve("hires.wav");
            Files.write(cd, pcmWave(44100, 16));
            Files.write(hires, pcmWave(96000, 24));
            check(AudioQuality.rankOfFile(cd.toString()) == 2, "44.1 kHz/16 bit is lossless");
            check(AudioQuality.rankOfFile(hires.toString()) == 3, "96 kHz/24 bit is Hi-Res");
            check(AudioQuality.improves("hires", "lossless", cd.toString()), "lossless can upgrade to Hi-Res");
            check(AudioQuality.improves("hires", "hires", cd.toString()), "legacy requested tier cannot mask CD audio");
            check(!AudioQuality.improves("lossless", "lossless", hires.toString()), "actual Hi-Res cannot be downgraded");
            check(AudioQuality.existingLabel(null, hires.toString()).equals("hires"), "unlabelled Hi-Res detected");
            check(AudioQuality.existingLabel("hires", cd.toString()).equals("lossless"), "stale Hi-Res label corrected");
            check(AudioQuality.rankOf("unknown", "missing.flac") == 2, "unknown labels fall back to container");
            check(!AudioQuality.known("sky") && !AudioQuality.known(""), "unknown tiers cannot justify skipping a transfer");
            Path staged = folder.resolve("download.wav.part");
            Files.write(staged, pcmWave(96000, 24));
            check(AudioQuality.measuredRank(staged.toString()) == 3, "staged audio is inspected before replacement");
            check(AudioQuality.existingLabel("jymaster", hires.toString()).equals("jymaster"), "provider master identity retained");
            check(AudioQuality.existingLabel("jymaster", cd.toString()).equals("lossless"), "CD fallback cannot be labelled master");
            check(AudioQuality.direction("jymaster", "lossless", cd.toString()).equals(AudioQuality.UPGRADE), "higher tier is an upgrade");
            check(AudioQuality.direction("high", "lossless", cd.toString()).equals(AudioQuality.DOWNGRADE), "lower tier is a downgrade");
            check(AudioQuality.direction("lossless", "hires", cd.toString()).equals(AudioQuality.SAME), "same physical tier is not a change");
            check(AudioQuality.replacementAccepted(AudioQuality.UPGRADE, "hires", "lossless"), "upgrade accepts better served tier");
            check(!AudioQuality.replacementAccepted(AudioQuality.UPGRADE, "lossless", "lossless"), "upgrade rejects equal served tier");
            check(AudioQuality.replacementAccepted(AudioQuality.DOWNGRADE, "high", "hires"), "downgrade accepts lower served tier");
            check(!AudioQuality.replacementAccepted(AudioQuality.DOWNGRADE, "hires", "hires"), "downgrade rejects equal served tier");
            check(!AudioQuality.replacementAccepted(AudioQuality.DOWNGRADE, "jymaster", "hires"), "downgrade rejects an accidental upgrade");
            check(AudioQuality.wouldDowngrade("standard", "hires", cd.toString()), "explicit lower tier helper agrees with direction");
        } finally {
            try (var files = Files.list(folder)) { for (Path file : files.toList()) Files.delete(file); }
            Files.delete(folder);
        }
    }

    private static byte[] pcmWave(int rate, int bits) {
        int bytes = rate * 2 * bits / 8;
        var out = java.nio.ByteBuffer.allocate(44 + bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        out.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + bytes);
        out.put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16);
        out.putShort((short) 1).putShort((short) 2).putInt(rate).putInt(bytes);
        out.putShort((short) (2 * bits / 8)).putShort((short) bits);
        out.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(bytes);
        return out.array();
    }

    private static void testPlaylistSync() {
        List<String> local = List.of("1", "2"), cloud = List.of("2", "3");
        check(PlaylistSync.plan("push", "replace", false, List.of(), local, cloud).cloud().equals(local), "push replaces destination");
        check(PlaylistSync.plan("pull", "replace", false, List.of(), local, cloud).local().equals(cloud), "pull replaces destination");
        var push = PlaylistSync.plan("push", "add", false, List.of(), local, cloud);
        check(push.cloud().equals(List.of("2", "3", "1")) && push.local().equals(local), "push add keeps remote order and local unchanged");
        var pull = PlaylistSync.plan("pull", "add", false, List.of(), local, cloud);
        check(pull.local().equals(List.of("1", "2", "3")) && pull.cloud().equals(cloud), "pull add retains local order and cloud unchanged");
        var both = PlaylistSync.plan("both", "add", true, List.of("1", "2", "3"), local, cloud);
        check(both.local().equals(List.of("1", "2", "3")) && both.cloud().equals(List.of("2", "3", "1")), "bidirectional additive never propagates deletion");
        var first = PlaylistSync.plan("both", "replace", false, List.of(), local, cloud);
        check(first.local().equals(List.of("1", "2", "3")) && first.local().equals(first.cloud()), "initial two-way replace merges");
        var subsequent = PlaylistSync.plan("both", "replace", true, List.of("1", "2", "3"), local, cloud);
        check(subsequent.local().equals(List.of("2")) && subsequent.local().equals(subsequent.cloud()), "deletions on either side propagate");
        check(PlaylistSync.plan("push", "replace", true, local, List.of(), cloud).cloud().isEmpty(), "empty local can clear remote membership");
        check(PlaylistSync.plan("pull", "replace", true, cloud, local, List.of()).local().isEmpty(), "empty cloud can clear local membership");
        check(PlaylistSync.plan("both", "replace", true, local, local, List.of("2", "1")).local().equals(List.of("2", "1")), "cloud reorder propagates when local unchanged");
        check(PlaylistSync.plan("both", "replace", true, local, List.of("2", "1"), local).cloud().equals(List.of("2", "1")), "local reorder propagates");
        var checkpoint = new PlaylistSync.Checkpoint(List.of("1"), List.of("2"), List.of("1", "2"));
        check(PlaylistSync.resume(checkpoint, List.of(), List.of("1", "2")).local().equals(List.of("2")), "local deletion during first remote write is not resurrected");
        var removal = new PlaylistSync.Checkpoint(List.of("1"), List.of(), List.of());
        check(PlaylistSync.resume(removal, List.of("1"), List.of()).local().isEmpty(), "unfinished local removal survives retry");
        check(PlaylistSync.resume(checkpoint, List.of("1", "3"), List.of("1", "2")).local().containsAll(List.of("1", "2", "3")), "concurrent additions survive partial merge");
        for (int baseMask = 0; baseMask < 8; baseMask++) for (int localMask = 0; localMask < 8; localMask++) for (int cloudMask = 0; cloudMask < 8; cloudMask++) {
            List<String> base = syncSubset(baseMask), a = syncSubset(localMask), b = syncSubset(cloudMask);
            var plan = PlaylistSync.plan("both", "replace", true, base, a, b);
            for (String id : List.of("1", "2", "3")) {
                boolean expected = base.contains(id) ? a.contains(id) && b.contains(id) : a.contains(id) || b.contains(id);
                check(plan.local().contains(id) == expected && plan.cloud().contains(id) == expected, "three-way membership truth table");
            }
            var repeat = PlaylistSync.plan("both", "replace", true, plan.cloud(), plan.local(), plan.cloud());
            check(repeat.equals(plan), "merge is idempotent");
        }
    }

    private static List<String> syncSubset(int mask) {
        var ids = new java.util.ArrayList<String>();
        for (int i = 0; i < 3; i++) if ((mask & (1 << i)) != 0) ids.add(String.valueOf(i + 1));
        return ids;
    }

    private static void testDownloadQueue() throws Exception {
        DownloadQueue queue = new DownloadQueue();
        java.util.List<String> events = new java.util.concurrent.CopyOnWriteArrayList<>();
        var started = new java.util.concurrent.CountDownLatch(1);
        var closed = new java.util.concurrent.CountDownLatch(1);
        var ended = new java.util.concurrent.CountDownLatch(1);
        var next = new java.util.concurrent.CountDownLatch(1);
        queue.submit("first", () -> events.add("queued-first"), () -> {
            try {
                queue.attach(() -> closed.countDown());
                started.countDown();
                try { new java.util.concurrent.CountDownLatch(1).await(); }
                catch (InterruptedException ignored) { }
                queue.emit(() -> events.add("late-progress"));
                try { queue.commit(); events.add("bad-commit"); }
                catch (java.util.concurrent.CancellationException expected) { }
            } catch (Exception e) { throw new RuntimeException(e); }
            finally { ended.countDown(); }
        }, () -> events.add("cancel-first"));
        check(started.await(2, java.util.concurrent.TimeUnit.SECONDS), "first download starts");
        queue.submit("second", () -> events.add("queued-second"), () -> events.add("bad-second"), () -> events.add("cancel-second"));
        queue.submit("third", () -> events.add("queued-third"), () -> { events.add("third"); next.countDown(); }, () -> {});
        check(events.contains("queued-second") && events.contains("queued-third") && !events.contains("third"), "waiting downloads visible before execution");
        check(queue.cancel("second"), "cancel waiting download");
        check(queue.cancel("first"), "cancel active download");
        check(closed.await(2, java.util.concurrent.TimeUnit.SECONDS), "cancel closes response stream");
        check(ended.await(2, java.util.concurrent.TimeUnit.SECONDS) && next.await(2, java.util.concurrent.TimeUnit.SECONDS), "cancellation releases next queue slot");
        check(!events.contains("late-progress") && !events.contains("bad-commit") && !events.contains("bad-second"), "cancelled work cannot publish progress, commit or run");
        check(!queue.cancel("first"), "repeat cancellation is idempotent");
        var committed = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        queue.submit("commit", () -> {}, () -> {
            queue.commit(); committed.countDown();
            try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, () -> events.add("bad-cancel-commit"));
        check(committed.await(2, java.util.concurrent.TimeUnit.SECONDS), "commit boundary reached");
        check(!queue.cancel("commit"), "completed transfer commit wins cancellation race");
        release.countDown();
        queue.shutdownNow();
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

    private static void testScannerMetadataNeed() {
        Track legacy = new Track();
        legacy.title = "A";
        legacy.artist = "B";
        legacy.duration = 120;
        legacy.year = 0;
        check(LibraryScanner.needsMetadata(legacy), "unknown year reads tags even with legacy metadata");
        legacy.year = 2007;
        check(LibraryScanner.needsMetadata(legacy), "missing audio specs still read tags");
        legacy.sampleRate = 44100;
        check(!LibraryScanner.needsMetadata(legacy), "known year and specs can use the metadata fast path");
        Track missingDuration = new Track();
        missingDuration.title = "A";
        missingDuration.artist = "B";
        missingDuration.year = 2007;
        missingDuration.sampleRate = 44100;
        check(LibraryScanner.needsMetadata(missingDuration), "missing duration still reads tags");
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

    /** Custom cover imports only accept real image bytes and a sane file size. */
    private static void testCustomCoverValidation() throws Exception {
        Path dir = Files.createTempDirectory("potato-cover-test");
        try {
            byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
            byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0, 0, 0, 0, 0};
            byte[] webp = {'R', 'I', 'F', 'F', 36, 0, 0, 0, 'W', 'E', 'B', 'P'};
            Path pngFile = dir.resolve("art.png");
            Path jpgFile = dir.resolve("art.JPG");
            Path webpFile = dir.resolve("art.webp");
            Path disguised = dir.resolve("photo.png");
            Path gifFile = dir.resolve("art.gif");
            Path badFile = dir.resolve("broken.png");
            Path emptyFile = dir.resolve("empty.jpg");
            Path hugeFile = dir.resolve("huge.jpg");
            Files.write(pngFile, png);
            Files.write(jpgFile, jpeg);
            Files.write(webpFile, webp);
            Files.write(disguised, jpeg);
            Files.write(gifFile, new byte[]{'G', 'I', 'F', '8', '9', 'a', 0, 0});
            Files.write(badFile, "not an image at all".getBytes(StandardCharsets.US_ASCII));
            Files.write(emptyFile, new byte[0]);
            try (var channel = java.nio.channels.FileChannel.open(hugeFile,
                    java.nio.file.StandardOpenOption.CREATE_NEW, java.nio.file.StandardOpenOption.WRITE)) {
                channel.write(java.nio.ByteBuffer.wrap(jpeg));
                // Writing one byte past the cap grows the (sparse) file to 20 MB + 1.
                channel.position(20L * 1024 * 1024);
                channel.write(java.nio.ByteBuffer.wrap(new byte[]{0}));
            }
            check("png".equals(Backend.coverImageExtension(pngFile)), "PNG magic accepted");
            check("jpg".equals(Backend.coverImageExtension(jpgFile)), "JPEG magic accepted with uppercase extension");
            check("webp".equals(Backend.coverImageExtension(webpFile)), "WebP magic accepted");
            check("jpg".equals(Backend.coverImageExtension(disguised)), "content magic wins over the file name");
            checkThrows(() -> Backend.coverImageExtension(gifFile), "JPG", "GIF covers are rejected");
            checkThrows(() -> Backend.coverImageExtension(badFile), "valid JPG", "fake image bytes are rejected");
            checkThrows(() -> Backend.coverImageExtension(emptyFile), "empty", "empty covers are rejected");
            checkThrows(() -> Backend.coverImageExtension(hugeFile), "20 MB", "covers above 20 MB are rejected");
            checkThrows(() -> Backend.coverImageExtension(dir.resolve("missing.png")), "no longer exists", "missing covers are rejected");
            // The restore pointer must survive the copy() used by patchMetadata.
            Track track = new Track();
            track.coverPath = "/tmp/custom.png";
            track.coverBeforeCustom = "/tmp/folder-cover.png";
            track.metadataOverrides.add("coverPath");
            Track copied = track.copy();
            check("/tmp/folder-cover.png".equals(copied.coverBeforeCustom), "copy keeps the pre-custom cover");
            check(copied.metadataOverrides.contains("coverPath"), "copy keeps metadata overrides");
        } finally {
            try (var files = Files.list(dir)) { for (Path file : files.toList()) Files.deleteIfExists(file); }
            Files.deleteIfExists(dir);
        }
    }

    /** Editable titles are trimmed, required and capped; null leaves them untouched. */
    private static void testTitleNormalisation() {
        check(Backend.cleanTitleOrNull(null) == null, "null title is left untouched");
        check("Song".equals(Backend.cleanTitleOrNull("  Song  ")), "title is trimmed");
        check("标题".equals(Backend.cleanTitleOrNull("标题")), "unicode titles survive");
        checkThrows(() -> Backend.cleanTitleOrNull("   "), "Title cannot be empty", "blank title is rejected");
        checkThrows(() -> Backend.cleanTitleOrNull(""), "Title cannot be empty", "empty title is rejected");
        String longTitle = "x".repeat(1200);
        String capped = Backend.cleanTitleOrNull(longTitle);
        check(capped != null && capped.length() == 1000, "long titles are capped at 1000 characters");
        check(longTitle.startsWith(capped), "capping only truncates, never rewrites");
    }

    private static void checkThrows(java.util.concurrent.Callable<?> action, String fragment, String message) {
        try {
            action.call();
        } catch (IllegalArgumentException e) {
            check(e.getMessage() != null && e.getMessage().contains(fragment), message + " (clear message)");
            return;
        } catch (Exception e) {
            throw new AssertionError("FAILED: " + message + " (unexpected " + e + ")");
        }
        throw new AssertionError("FAILED: " + message);
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

    private static void testEqCurve() throws Exception {
        EqCurve curve = EqCurve.of(List.of(
                new EqCurve.Point(60f, 6f),
                new EqCurve.Point(300f, -8f),
                new EqCurve.Point(6000f, 4f)));
        check(Math.abs(curve.gainAt(60f) - 6f) < 0.01f, "curve passes through its control points");
        check(Math.abs(curve.gainAt(300f) + 8f) < 0.01f, "curve honours negative points");

        boolean inRange = true;
        for (int i = 0; i <= 400; i++) {
            float freq = (float) (20 * Math.pow(1000, i / 400.0));
            float gain = curve.gainAt(freq);
            if (gain > 6.2f || gain < -8.2f) inRange = false;
        }
        check(inRange, "monotone interpolation never overshoots the drawn curve");

        float[] legacy = {-15f, 4f, 4f, 4.5f, 5f, 4f, 4.5f, -4.5f, -2.5f, 0f};
        EqPreset preset = new EqPreset(12f, legacy);
        float[] round = preset.curve().sample(EqPreset.DEFAULT_FREQS);
        boolean identical = true;
        for (int i = 0; i < legacy.length; i++) {
            if (Math.abs(round[i] - legacy[i]) > 0.01f) identical = false;
        }
        check(identical, "legacy ten bands round-trip through the curve");
        check(Math.abs(preset.bands[0] + 15f) < 0.01f, "legacy band view follows the curve");

        check(EqCurve.HQ_FREQS.length == 31, "potatoHQ renders the curve with 31 bands");
        float[] hq = preset.curve().sample(EqCurve.HQ_FREQS);
        check(Math.abs(hq[0] + 15f) < 0.6f, "HQ bands follow the drawn curve at the low end");
        check(Math.abs(hq[hq.length - 1]) < 0.01f, "HQ bands follow the drawn curve at the top end");

        float[] vlc = curve.sample(List.of(60f, 170f, 310f, 600f, 1000f, 3000f, 6000f, 12000f, 14000f, 16000f));
        check(Math.abs(vlc[0] - 6f) < 1.5f, "VLC ten-slot resample follows the curve at 60 Hz");

        Path base = Files.createTempDirectory("potato-eq-curve");
        Path music = Files.createDirectories(base.resolve("source").resolve("music"));
        Path file = base.resolve("eq.json");
        EqStore store = new EqStore();
        store.global = new EqPreset(10f, curve);
        store.save(file);
        EqStore reloaded = EqStore.load(file, null, music);
        check(reloaded.global.curve().points().size() == 3, "curve points survive save and reload");
        check(Math.abs(reloaded.global.curve().gainAt(300f) + 8f) < 0.01f, "reloaded curve keeps its shape");
        check(Math.abs(reloaded.global.preamp - 10f) < 0.01f, "curve preamp survives save and reload");
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

    private static void testBilibiliAudio() throws Exception {
        var link = BilibiliService.parseVideoRef("https://www.bilibili.com/video/BV1B7411m7LV/?p=2");
        check(link != null && link.page() == 2 && link.bvid().equals("BV1B7411m7LV"), "Bilibili link preserves the requested part");
        check("170001".equals(BilibiliService.parseVideoRef("av170001").aid()), "Bilibili av links are accepted");
        check(BilibiliService.parseVideoRef("https://bilibili.com.example.test/video/BV1B7411m7LV") == null,
                "unrelated URLs are rejected");
        var audio = Json.MAPPER.readTree("""
                {"data":{"dash":{
                  "video":[{"baseUrl":"https://v.bilivideo.com/video"}],
                  "audio":[
                    {"bandwidth":100,"mime_type":"audio/mp4","codecs":"mp4a.40.2","base_url":"https://a.bilivideo.com/low"},
                    {"bandwidth":300,"mimeType":"audio/mp4","codecs":"mp4a.40.2","baseUrl":"https://b.bilivideo.com/high",
                      "backupUrl":["https://c.bilivideo.cn/high","https://b.bilivideo.com.example.test/invalid"]},
                    {"bandwidth":400,"mimeType":"video/mp4","codecs":"avc1","baseUrl":"https://v.bilivideo.com/not-audio"}
                  ]}}}
                """);
        check(BilibiliService.audioUrls(audio).stream().map(Object::toString).toList().equals(List.of(
                "https://b.bilivideo.com/high", "https://c.bilivideo.cn/high", "https://a.bilivideo.com/low")),
                "only trusted audio-only URLs are selected, with higher bitrate first");
        check(BilibiliService.completeRangeLength("bytes 0-99/100", 100) == 100,
                "a CDN may deliver the entire track as a 206 response");
        try {
            BilibiliService.completeRangeLength("bytes 0-49/100", 50);
            throw new AssertionError("partial CDN response must not be imported");
        } catch (java.io.IOException expected) {
            check(true, "a truncated CDN range is rejected");
        }
        check(BilibiliAudioExport.Format.parse("") == BilibiliAudioExport.Format.M4A
                && BilibiliAudioExport.Format.parse("FLAC") == BilibiliAudioExport.Format.FLAC,
                "export formats are explicit and old download requests keep their M4A default");
        Path staged = Files.createTempFile("bili-audio-test", ".part");
        try {
            byte[] container = {0, 0, 0, 12, 'f', 't', 'y', 'p', 'M', '4', 'A', ' ', 1, 2, 3};
            BilibiliService.copyAudio(new java.io.ByteArrayInputStream(container), staged, container.length, () -> {}, count -> {});
            check(java.util.Arrays.equals(container, Files.readAllBytes(staged)), "source audio bytes are not re-encoded");
            try {
                BilibiliService.copyAudio(new java.io.ByteArrayInputStream(container), staged, container.length + 1, () -> {}, count -> {});
                throw new AssertionError("incomplete Bilibili transfer must be rejected");
            } catch (java.io.IOException expected) {
                check(true, "incomplete transfer is rejected before publishing");
            }
        } finally {
            Files.deleteIfExists(staged);
        }
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
                synchronized (player) {
                    engine.listener.onFinished(); // queued EOF for b, delivered after manual selection of c
                    player.play("c", List.of("a", "b", "c"), 0);
                }
                player.setRepeat("all");
                if (gapless) check(a.path.equals(engine.next), "repeat-all preloads queue head at end");
                player.setRepeat("off");
                // A later error on the current stream acts as an executor barrier.
                engine.listener.onError("decoder closed");
                awaitPlayback(() -> Boolean.FALSE.equals(player.state().get("playing")));
                int starts = engine.plays;
                player.toggle();
                check(engine.plays == starts + 1 && "c".equals(player.state().get("trackId")),
                        "retry reopens selected track after decoder error and stale EOF");
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
        public FactoryEq eqFactoryPreset(String name) { return null; }
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
