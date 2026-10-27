package com.potatomusic.superapp;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves sidecar lyrics and turns every supported format into one word-aware
 * payload. Line-level LRC stays the fallback; enhanced LRC, TTML, QRC, YRC and
 * WebVTT can additionally provide sub-line timing.
 */
public final class LyricsService {
    public static final class Word {
        public double time;
        public double end;
        public String text;

        public Word() {
        }

        public Word(double time, double end, String text) {
            this.time = time;
            this.end = end;
            this.text = text;
        }
    }

    public static final class Line {
        public double time;
        public double end;
        public String text;
        public String translation;
        public List<Word> words = new ArrayList<>();

        public Line() {
        }

        public Line(double time, String text, String translation) {
            this.time = time;
            this.text = text;
            this.translation = translation;
        }
    }

    public static final class Payload {
        public boolean found;
        public boolean translated;
        public String source;
        public String format;
        public List<Line> lines = new ArrayList<>();

        public static Payload missing() {
            Payload payload = new Payload();
            payload.found = false;
            return payload;
        }
    }

    private static final Pattern LRC_TIME = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
    private static final Pattern LRC_WORD = Pattern.compile("<(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?>");
    private static final Pattern LRC_TRAILING_TIME = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]\\s*$");
    private static final Pattern LRC_OFFSET = Pattern.compile("^\\[offset:([+-]?\\d+)\\]$", Pattern.CASE_INSENSITIVE);
    private static final Pattern QRC_LINE = Pattern.compile("^\\[(\\d+),(\\d+)\\](.*)$");
    private static final Pattern QRC_WORD = Pattern.compile("\\((\\d+),(\\d+)\\)");
    private static final Pattern YRC_LINE = Pattern.compile("^\\[(\\d+),(\\d+)\\](.*)$");
    private static final Pattern YRC_WORD = Pattern.compile("\\((\\d+),(\\d+),(-?\\d+)\\)([^()]*)");
    private static final Pattern VTT_CUE = Pattern.compile("^\\s*[\\d:.]+\\s*-->\\s*[\\d:.]+.*$");

    private static final List<String> LYRIC_EXTENSIONS = List.of(
            ".lrc", ".LRC", ".ttml", ".TTML", ".qrc", ".QRC", ".yrc", ".YRC", ".vtt", ".VTT");

    private volatile Path libraryRoot;
    private final Path dataDir;

    public LyricsService(Path libraryRoot, Path dataDir) {
        this.libraryRoot = libraryRoot;
        this.dataDir = dataDir;
    }

    public void setLibraryRoot(Path root) {
        this.libraryRoot = root;
    }

    public Payload load(Track track) {
        if (track == null || track.path == null) {
            return Payload.missing();
        }
        return find(track);
    }

    private Payload find(Track track) {
        Path audio = Path.of(track.path);
        String base = audio.getFileName().toString();
        int dot = base.lastIndexOf('.');
        if (dot > 0) {
            base = base.substring(0, dot);
        }

        Payload best = null;
        int bestScore = Integer.MIN_VALUE;
        for (Path folder : searchFolders(audio)) {
            for (String extension : LYRIC_EXTENSIONS) {
                Path candidate = folder.resolve(base + extension);
                if (!Files.isRegularFile(candidate)) {
                    continue;
                }
                try {
                    Payload payload = parse(candidate, translationFor(candidate, base));
                    if (!payload.found) {
                        continue;
                    }
                    payload.source = candidate.toString();
                    payload.format = formatFor(candidate).toUpperCase(Locale.ROOT);
                    int score = score(payload, formatPriority(extension));
                    if (score > bestScore) {
                        best = payload;
                        bestScore = score;
                    }
                } catch (Exception e) {
                    System.err.println("[lyrics] " + candidate + ": " + e.getMessage());
                }
            }
        }
        return best == null ? Payload.missing() : best;
    }

    private static int score(Payload payload, int formatPriority) {
        int wordLines = 0;
        int words = 0;
        for (Line line : payload.lines) {
            if (line.words != null && !line.words.isEmpty()) {
                wordLines++;
                words += line.words.size();
            }
        }
        // A timed word layer always beats a plain line file. When both are timed,
        // prefer the richer file, then the format that usually carries more detail.
        return wordLines * 10_000 + Math.min(words, 9_000) + formatPriority;
    }

    private static int formatPriority(String extension) {
        return switch (extension.toLowerCase(Locale.ROOT)) {
            case ".ttml" -> 5;
            case ".lrc" -> 4;
            case ".qrc" -> 3;
            case ".yrc" -> 2;
            case ".vtt" -> 1;
            default -> 0;
        };
    }

    private Path translationFor(Path main, String base) {
        Path folder = main.getParent();
        if (folder == null) {
            return null;
        }
        return firstExisting(
                folder.resolve(base + ".trans.lrc"),
                folder.resolve(base + ".zh.lrc"),
                folder.resolve(base + ".zh-CN.lrc"),
                folder.resolve(base + ".translation.lrc"));
    }

    private List<Path> searchFolders(Path audio) {
        List<Path> folders = new ArrayList<>();
        if (audio.getParent() != null) {
            folders.add(audio.getParent());
        }
        if (audio.getParent() != null && audio.getParent().getParent() != null) {
            // Legacy/current layout: <library>/source/music/<song> + <library>/source/lyrics/
            folders.add(audio.getParent().getParent().resolve("lyrics"));
        }
        if (libraryRoot != null) {
            folders.add(libraryRoot.resolveSibling("lyrics"));
            folders.add(libraryRoot.resolve("lyrics"));
        }
        if (dataDir != null) {
            folders.add(dataDir.resolve("lyrics"));
        }
        return folders.stream().distinct().filter(Files::isDirectory).toList();
    }

    public static Payload parse(Path main, Path translation) throws IOException {
        if (main == null || !Files.isRegularFile(main)) {
            return Payload.missing();
        }
        Payload payload = switch (formatFor(main)) {
            case "ttml" -> parseTtml(main);
            case "qrc" -> parseQrc(main);
            case "yrc" -> parseYrc(main);
            case "vtt" -> parseVtt(main);
            default -> parseLrc(main);
        };
        if (!payload.found) {
            return payload;
        }
        if (translation != null) {
            applyTranslation(payload, parseLines(translation));
        }
        payload.translated = payload.lines.stream()
                .anyMatch(line -> line.translation != null && !line.translation.isBlank());
        return payload;
    }

    public static Map<Double, String> parseLines(Path file) throws IOException {
        TreeMap<Double, String> result = new TreeMap<>();
        if (file == null || !Files.isRegularFile(file)) {
            return result;
        }
        String text = readText(file);
        List<Line> lines = parseA2Lines(text);
        for (Line line : lines) {
            result.merge(line.time, line.text, (a, b) -> a.equals(b) ? a : a + " / " + b);
        }
        return result;
    }

    private static Payload parseLrc(Path file) throws IOException {
        Payload payload = new Payload();
        payload.lines = parseA2Lines(readText(file));
        payload.found = !payload.lines.isEmpty();
        if (payload.found) {
            finalizeLines(payload.lines);
        }
        return payload;
    }

    private static List<Line> parseA2Lines(String text) {
        List<Line> lines = new ArrayList<>();
        double offset = 0;
        String normalized = text.replace("\uFEFF", "");
        for (String raw : normalized.split("\\r?\\n")) {
            String line = raw.strip();
            if (line.isEmpty()) {
                continue;
            }
            Matcher offsetMatcher = LRC_OFFSET.matcher(line);
            if (offsetMatcher.matches()) {
                try {
                    offset = Long.parseLong(offsetMatcher.group(1)) / 1000.0;
                } catch (NumberFormatException ignored) {
                    offset = 0;
                }
                continue;
            }
            if (line.startsWith("[ti:") || line.startsWith("[ar:") || line.startsWith("[al:")
                    || line.startsWith("[by:") || line.startsWith("[re:") || line.startsWith("[ve:")) {
                continue;
            }

            Matcher leading = LRC_TIME.matcher(line);
            List<Double> stamps = new ArrayList<>();
            int cursor = 0;
            while (cursor < line.length()) {
                leading.region(cursor, line.length());
                if (!leading.lookingAt()) {
                    break;
                }
                stamps.add(lrcTime(leading));
                cursor = leading.end();
            }
            if (stamps.isEmpty()) {
                continue;
            }

            String body = line.substring(cursor).strip();
            double explicitEnd = 0;
            Matcher trailing = LRC_TRAILING_TIME.matcher(body);
            if (trailing.find()) {
                explicitEnd = lrcTime(trailing);
                body = body.substring(0, trailing.start()).strip();
            }
            List<Word> words = parseA2Words(body);
            String plain = plainText(body);
            for (double stamp : stamps) {
                Line parsed = new Line(stamp + offset, plain, "");
                parsed.end = explicitEnd > 0 ? explicitEnd + offset : 0;
                for (Word word : words) {
                    parsed.words.add(new Word(word.time + offset, word.end + offset, word.text));
                }
                lines.add(parsed);
            }
        }
        return lines;
    }

    private static List<Word> parseA2Words(String body) {
        List<Word> words = new ArrayList<>();
        Matcher matcher = LRC_WORD.matcher(body);
        if (!matcher.find()) {
            return words;
        }
        double pendingStart = lrcTime(matcher);
        String prefix = body.substring(0, matcher.start()).strip();
        if (!prefix.isEmpty()) {
            words.add(new Word(pendingStart, pendingStart, prefix));
        }
        int cursor = matcher.end();
        while (matcher.find()) {
            double start = lrcTime(matcher);
            String text = body.substring(cursor, matcher.start());
            if (!text.isEmpty()) {
                words.add(new Word(pendingStart, start, text));
            }
            pendingStart = start;
            cursor = matcher.end();
        }
        String tail = body.substring(cursor);
        if (!tail.isEmpty()) {
            words.add(new Word(pendingStart, 0, tail));
        }
        return words;
    }

    private static String plainText(String body) {
        String plain = LRC_WORD.matcher(body).replaceAll("");
        plain = LRC_TRAILING_TIME.matcher(plain).replaceAll("");
        return plain.strip();
    }

    private static Payload parseTtml(Path file) throws IOException {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            try {
                factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
                factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
                factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            } catch (Exception ignored) {
                // Older parsers may not expose every hardening flag.
            }
            Document document = factory.newDocumentBuilder().parse(file.toFile());
            NodeList paragraphs = document.getElementsByTagNameNS("*", "p");
            List<Line> lines = new ArrayList<>();
            for (int i = 0; i < paragraphs.getLength(); i++) {
                Element paragraph = (Element) paragraphs.item(i);
                Double begin = parseClock(attribute(paragraph, "begin"));
                Double end = parseClock(attribute(paragraph, "end"));
                if (begin == null) {
                    continue;
                }
                List<Word> words = new ArrayList<>();
                StringBuilder translationBuffer = new StringBuilder();
                collectTtml(paragraph, words, translationBuffer);
                String translation = translationBuffer.toString().replaceAll("\\s+", " ").strip();
                String text;
                if (!words.isEmpty()) {
                    StringBuilder joined = new StringBuilder();
                    for (Word word : words) {
                        joined.append(word.text);
                    }
                    text = joined.toString().strip();
                    if (text.isEmpty()) {
                        text = collectText(paragraph, true).strip();
                    }
                } else {
                    text = collectText(paragraph, true).replaceAll("\\s+", " ").strip();
                }
                if (text.isEmpty()) {
                    continue;
                }
                Line line = new Line(begin, text, translation);
                line.end = end == null ? 0 : end;
                line.words.addAll(words);
                lines.add(line);
            }
            lines.sort(Comparator.comparingDouble(line -> line.time));
            Payload payload = new Payload();
            payload.lines = lines;
            payload.found = !lines.isEmpty();
            if (payload.found) {
                finalizeLines(lines);
            }
            return payload;
        } catch (Exception e) {
            throw new IOException("invalid TTML: " + e.getMessage(), e);
        }
    }

    private static void collectTtml(Node node, List<Word> words, StringBuilder translation) {
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child.getNodeType() == Node.TEXT_NODE) {
                continue;
            }
            if (child.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            Element element = (Element) child;
            String name = localName(element);
            if ("span".equals(name) && isTranslation(element)) {
                translation.append(' ').append(element.getTextContent());
                continue;
            }
            Double begin = parseClock(attribute(element, "begin"));
            Double end = parseClock(attribute(element, "end"));
            if ("span".equals(name) && begin != null) {
                String text = element.getTextContent();
                if (text != null && !text.isBlank()) {
                    words.add(new Word(begin, end == null ? 0 : end, text));
                }
                continue;
            }
            if ("br".equals(name)) {
                continue;
            }
            collectTtml(child, words, translation);
        }
    }

    private static String collectText(Node node, boolean skipTranslation) {
        StringBuilder result = new StringBuilder();
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child.getNodeType() == Node.TEXT_NODE) {
                result.append(child.getTextContent());
            } else if (child.getNodeType() == Node.ELEMENT_NODE) {
                Element element = (Element) child;
                if (skipTranslation && isTranslation(element)) {
                    continue;
                }
                if ("br".equals(localName(element))) {
                    result.append(' ');
                } else {
                    result.append(collectText(child, skipTranslation));
                }
            }
        }
        return result.toString();
    }

    private static boolean isTranslation(Element element) {
        String role = attribute(element, "role").toLowerCase(Locale.ROOT);
        return role.contains("translation") || role.contains("roman");
    }

    private static Payload parseQrc(Path file) throws IOException {
        List<Line> lines = new ArrayList<>();
        for (String raw : readText(file).replace("\uFEFF", "").split("\\r?\\n")) {
            String line = raw.strip();
            Matcher matcher = QRC_LINE.matcher(line);
            if (!matcher.matches()) {
                continue;
            }
            double start = Long.parseLong(matcher.group(1)) / 1000.0;
            double duration = Long.parseLong(matcher.group(2)) / 1000.0;
            Line parsed = parseQrcLine(start, duration, matcher.group(3));
            if (parsed != null) {
                lines.add(parsed);
            }
        }
        Payload payload = new Payload();
        payload.lines = lines;
        payload.found = !lines.isEmpty();
        if (payload.found) {
            finalizeLines(lines);
        }
        return payload;
    }

    private static Line parseQrcLine(double start, double duration, String body) {
        List<Word> words = new ArrayList<>();
        Matcher matcher = QRC_WORD.matcher(body);
        int cursor = 0;
        double lastEnd = start;
        while (matcher.find()) {
            String text = body.substring(cursor, matcher.start());
            double wordStart = start + Long.parseLong(matcher.group(1)) / 1000.0;
            double wordEnd = wordStart + Long.parseLong(matcher.group(2)) / 1000.0;
            if (!text.isEmpty()) {
                words.add(new Word(wordStart, wordEnd, text));
            }
            cursor = matcher.end();
            lastEnd = wordEnd;
        }
        String tail = body.substring(cursor);
        if (!tail.isEmpty()) {
            words.add(new Word(lastEnd, start + duration, tail));
        }
        String text = words.isEmpty() ? body.strip() : joinWords(words);
        if (text.isEmpty()) {
            return null;
        }
        Line line = new Line(start, text, "");
        line.end = start + duration;
        line.words.addAll(words);
        return line;
    }

    private static Payload parseYrc(Path file) throws IOException {
        List<Line> lines = new ArrayList<>();
        for (String raw : readText(file).replace("\uFEFF", "").split("\\r?\\n")) {
            String line = raw.strip();
            Matcher matcher = YRC_LINE.matcher(line);
            if (!matcher.matches()) {
                continue;
            }
            long lineStartMs = Long.parseLong(matcher.group(1));
            double start = lineStartMs / 1000.0;
            double duration = Long.parseLong(matcher.group(2)) / 1000.0;
            Line parsed = parseYrcLine(start, lineStartMs, duration, matcher.group(3));
            if (parsed != null) {
                lines.add(parsed);
            }
        }
        Payload payload = new Payload();
        payload.lines = lines;
        payload.found = !lines.isEmpty();
        if (payload.found) {
            finalizeLines(lines);
        }
        return payload;
    }

    private static Line parseYrcLine(double start, long lineStartMs, double duration, String body) {
        List<Word> words = new ArrayList<>();
        Matcher matcher = YRC_WORD.matcher(body);
        int cursor = 0;
        double firstStart = start;
        while (matcher.find()) {
            long rawStartMs = Long.parseLong(matcher.group(1));
            long wordStartMs = rawStartMs >= lineStartMs - 50 ? rawStartMs : lineStartMs + rawStartMs;
            double wordStart = wordStartMs / 1000.0;
            double wordEnd = wordStart + Long.parseLong(matcher.group(2)) / 1000.0;
            String prefix = body.substring(cursor, matcher.start());
            if (!prefix.isEmpty()) {
                words.add(new Word(firstStart, wordStart, prefix));
            }
            String text = matcher.group(4);
            if (!text.isEmpty()) {
                words.add(new Word(wordStart, wordEnd, text));
            }
            cursor = matcher.end();
            firstStart = wordEnd;
        }
        String tail = body.substring(cursor);
        if (!tail.isEmpty()) {
            words.add(new Word(firstStart, start + duration, tail));
        }
        String text = words.isEmpty() ? body.strip() : joinWords(words);
        if (text.isEmpty()) {
            return null;
        }
        Line line = new Line(start, text, "");
        line.end = start + duration;
        line.words.addAll(words);
        return line;
    }

    private static Payload parseVtt(Path file) throws IOException {
        List<Line> lines = new ArrayList<>();
        String text = readText(file).replace("\uFEFF", "").replace("\r\n", "\n").replace('\r', '\n');
        for (String block : text.split("\\n\\s*\\n")) {
            String[] rows = block.split("\\n");
            int cueIndex = -1;
            for (int i = 0; i < rows.length; i++) {
                if (VTT_CUE.matcher(rows[i]).matches()) {
                    cueIndex = i;
                    break;
                }
            }
            if (cueIndex < 0) {
                continue;
            }
            String[] times = rows[cueIndex].split("-->");
            if (times.length != 2) {
                continue;
            }
            Double start = parseClock(times[0].strip().split("\\s+")[0]);
            Double end = parseClock(times[1].strip().split("\\s+")[0]);
            if (start == null) {
                continue;
            }
            StringBuilder body = new StringBuilder();
            for (int i = cueIndex + 1; i < rows.length; i++) {
                if (!body.isEmpty()) {
                    body.append(' ');
                }
                body.append(rows[i].replaceAll("<[^>]+>", ""));
            }
            String lineText = body.toString().replaceAll("\\s+", " ").strip();
            if (!lineText.isEmpty()) {
                Line line = new Line(start, lineText, "");
                line.end = end == null ? 0 : end;
                lines.add(line);
            }
        }
        Payload payload = new Payload();
        payload.lines = lines;
        payload.found = !lines.isEmpty();
        if (payload.found) {
            finalizeLines(lines);
        }
        return payload;
    }

    private static void finalizeLines(List<Line> lines) {
        lines.sort(Comparator.comparingDouble(line -> line.time));
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            double next = i + 1 < lines.size() ? lines.get(i + 1).time : 0;
            if (line.end <= line.time) {
                line.end = next > line.time ? next : line.time + 5.0;
            }
            if (line.words != null) {
                for (int j = 0; j < line.words.size(); j++) {
                    Word word = line.words.get(j);
                    double wordNext = j + 1 < line.words.size() ? line.words.get(j + 1).time : line.end;
                    if (word.end <= word.time) {
                        word.end = wordNext > word.time ? wordNext : line.end;
                    }
                    if (word.end <= word.time) {
                        word.end = word.time + 0.2;
                    }
                }
                if (!line.words.isEmpty()) {
                    String joined = joinWords(line.words);
                    if (!joined.isBlank()) {
                        line.text = joined;
                    }
                }
            }
            if (line.translation == null) {
                line.translation = "";
            }
            if (line.end <= line.time) {
                line.end = line.time + 5.0;
            }
        }
    }

    private static void applyTranslation(Payload payload, Map<Double, String> translation) {
        if (translation.isEmpty()) {
            return;
        }
        for (Line line : payload.lines) {
            if (line.translation != null && !line.translation.isBlank()) {
                continue;
            }
            String closest = null;
            double distance = 0.35;
            for (Map.Entry<Double, String> entry : translation.entrySet()) {
                double delta = Math.abs(entry.getKey() - line.time);
                if (delta <= distance) {
                    distance = delta;
                    closest = entry.getValue();
                }
            }
            if (closest != null) {
                line.translation = closest;
            }
        }
    }

    private static String joinWords(List<Word> words) {
        StringBuilder result = new StringBuilder();
        for (Word word : words) {
            result.append(word.text);
        }
        return result.toString().strip();
    }

    private static double lrcTime(Matcher matcher) {
        int minutes = Integer.parseInt(matcher.group(1));
        int seconds = Integer.parseInt(matcher.group(2));
        String fraction = matcher.group(3);
        double sub = 0;
        if (fraction != null) {
            sub = Integer.parseInt(fraction) / Math.pow(10, fraction.length());
        }
        return minutes * 60.0 + seconds + sub;
    }

    private static Double parseClock(String value) {
        if (value == null) {
            return null;
        }
        String text = value.strip().replace(',', '.');
        if (text.isEmpty()) {
            return null;
        }
        try {
            if (text.endsWith("ms")) {
                return Double.parseDouble(text.substring(0, text.length() - 2)) / 1000.0;
            }
            if (text.endsWith("s")) {
                return Double.parseDouble(text.substring(0, text.length() - 1));
            }
            if (text.endsWith("m")) {
                return Double.parseDouble(text.substring(0, text.length() - 1)) * 60.0;
            }
            if (text.endsWith("h")) {
                return Double.parseDouble(text.substring(0, text.length() - 1)) * 3600.0;
            }
            String[] parts = text.split(":");
            if (parts.length == 1) {
                return Double.parseDouble(parts[0]);
            }
            double seconds = Double.parseDouble(parts[parts.length - 1]);
            double minutes = Double.parseDouble(parts[parts.length - 2]);
            double hours = parts.length > 2 ? Double.parseDouble(parts[parts.length - 3]) : 0;
            return hours * 3600.0 + minutes * 60.0 + seconds;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String attribute(Element element, String localName) {
        if (element.hasAttribute(localName)) {
            return element.getAttribute(localName);
        }
        for (int i = 0; i < element.getAttributes().getLength(); i++) {
            Node attribute = element.getAttributes().item(i);
            if (localName.equals(attribute.getLocalName()) || localName.equals(attribute.getNodeName())) {
                return attribute.getNodeValue();
            }
        }
        return "";
    }

    private static String localName(Element element) {
        String local = element.getLocalName();
        if (local != null && !local.isBlank()) {
            return local;
        }
        String name = element.getNodeName();
        int colon = name.indexOf(':');
        return colon >= 0 ? name.substring(colon + 1) : name;
    }

    private static String formatFor(Path file) {
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "lrc" : name.substring(dot + 1);
    }

    private static String readText(Path file) throws IOException {
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    private static Path firstExisting(Path... candidates) {
        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        return null;
    }
}
