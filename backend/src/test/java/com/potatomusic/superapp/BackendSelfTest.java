package com.potatomusic.superapp;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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
        testTaxonomyMerge();
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
        check(entry.duration == 289, "duration imported from csv");
        check(Math.abs(entry.rating - 8.8) < 0.001, "rating imported");
        check(entry.playCount == 9, "play count imported");
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

    private static void check(boolean condition, String message) {
        passed++;
        if (!condition) {
            throw new AssertionError("FAILED: " + message);
        }
    }

    private BackendSelfTest() {
    }
}
