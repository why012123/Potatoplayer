package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.function.BiConsumer;
import java.util.function.LongConsumer;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import com.potatomusic.superapp.BilibiliAudioExport.Format;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Search and import public Bilibili video audio, using the same queue as online music. */
public final class BilibiliService {
    private static final String UA =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    private static final String API = "https://api.bilibili.com";
    private static final String REFERER = "https://www.bilibili.com/";
    private static final Pattern BVID = Pattern.compile("BV[0-9A-Za-z]{10}");
    private static final Pattern AVID = Pattern.compile("(?i:av)([0-9]{1,18})");
    private static final String IMPORT_DIRECTORY = "Bilibili Audio";
    private static final String IMPORT_METADATA = ".potato-bilibili.json";
    private static final long MAX_AUDIO_BYTES = 512L * 1024 * 1024;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final DownloadQueue downloader = new DownloadQueue();
    private final Supplier<Path> libraryRoot;
    private final BiConsumer<String, Object> emitter;
    private final Runnable rescan;

    public BilibiliService(Supplier<Path> libraryRoot, BiConsumer<String, Object> emitter, Runnable rescan) {
        this.libraryRoot = libraryRoot;
        this.emitter = emitter;
        this.rescan = rescan;
    }

    private final Map<String, CacheEntry> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
            return size() > 40;
        }
    };

    public Map<String, Object> search(String keyword, int limit) {
        return search(keyword, limit, 1);
    }

    public Map<String, Object> search(String keyword, int limit, int page) {
        String query = keyword == null ? "" : keyword.trim().replaceAll("\\s+", " ");
        int count = Math.max(1, Math.min(20, limit));
        int requestedPage = Math.max(1, Math.min(50, page));
        if (query.isBlank()) return empty(query);
        if (query.length() > 160) throw new IllegalArgumentException("Search terms are too long.");
        String key = query + "|" + count + "|" + requestedPage;
        synchronized (cache) {
            CacheEntry hit = cache.get(key);
            if (hit != null && hit.expiresAt > System.currentTimeMillis()) return hit.value;
        }
        JsonNode root = api("/x/web-interface/search/type?search_type=video&keyword="
                + encode(query) + "&page=" + requestedPage + "&order=totalrank");
        Map<String, Object> result = parse(root, query, count);
        result.put("page", requestedPage);
        long total = ((Number) result.get("total")).longValue();
        int pages = root.path("data").path("numPages").asInt((int) Math.min(50, Math.ceil(total / 20.0)));
        result.put("pages", Math.max(1, Math.min(50, pages)));
        synchronized (cache) {
            cache.put(key, new CacheEntry(result, System.currentTimeMillis() + 3 * 60_000L));
        }
        return result;
    }

    public Map<String, Object> video(String input) {
        VideoRef ref = resolve(input);
        Video video = fetchVideo(ref);
        Part part = video.parts().stream().filter(item -> item.page() == ref.page()).findFirst()
                .orElse(video.parts().get(0));
        return Map.of("bvid", video.bvid(), "title", video.title(), "author", video.author(),
                "coverUrl", video.coverUrl(), "description", video.description(), "parts", video.parts(),
                "selectedPage", part.page(), "url", video.url());
    }

    public Map<String, Object> download(String bvid, long cid, String title, String requestedFormat) {
        if (bvid == null || !BVID.matcher(bvid).matches() || cid <= 0) {
            throw new IllegalArgumentException("Choose a Bilibili video and part first.");
        }
        Format format = Format.parse(requestedFormat);
        Path root = libraryRoot.get();
        if (root == null || !Files.isDirectory(root)) throw new IllegalStateException("Choose a music folder first.");
        Path destination = LibraryScanner.normalizeLibraryRoot(root);
        Job job = new Job("bilibili-" + UUID.randomUUID(), bvid, cid, format);
        downloader.submit(job.id(),
                () -> progress(job, title.isBlank() ? bvid : truncate(title, 180), "queued", 0, -1),
                () -> downloadAudio(job, destination),
                () -> emitter.accept("download.cancelled", jobData(job)));
        return Map.of("jobId", job.id(), "exportFormat", format.extension());
    }

    public Map<String, Object> cancelDownload(String jobId) {
        return Map.of("cancelled", downloader.cancel(jobId));
    }

    public void shutdown() {
        downloader.shutdownNow();
    }

    private void downloadAudio(Job job, Path root) {
        Path input = null;
        Path output = null;
        String label = job.bvid();
        String stage = "video details";
        try {
            Video video = fetchVideo(new VideoRef(job.bvid(), "", 1));
            Part part = video.parts().stream().filter(item -> item.cid() == job.cid()).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("This part no longer belongs to the video."));
            String title = video.parts().size() == 1 ? video.title()
                    : video.title() + " · P" + part.page() + " " + part.title();
            label = title;
            progress(job, title, "resolving", 0, -1);
            stage = "prepare library folder";
            Path parent = childDirectory(root.toAbsolutePath().normalize(), IMPORT_DIRECTORY);
            Path folder = childDirectory(parent, job.bvid() + "-P" + part.page());
            Path target = findExport(folder, job.format());
            boolean duplicate = target != null;
            if (!duplicate) {
                Path ffmpeg = null;
                if (job.format() != Format.M4A) {
                    ffmpeg = BilibiliAudioExport.findFfmpeg();
                    if (ffmpeg == null) throw new IOException("FLAC and MP3 require FFmpeg. Install FFmpeg or use M4A.");
                }
                target = folder.resolve(safeName(video.author(), 45) + " - " + safeName(title, 130) + "." + job.format().extension());
                Path source = job.format() == Format.M4A ? null : findExport(folder, Format.M4A);
                if (source == null) {
                    stage = "download audio";
                    input = Files.createTempFile(folder, ".bilibili-", ".m4a.part");
                    downloadOriginal(job, title, input);
                    source = input;
                }
                if (job.format() != Format.M4A) {
                    stage = "convert to " + job.format();
                    progress(job, title, "converting", 0, -1);
                    output = Files.createTempFile(folder, ".bilibili-convert-", ".part");
                    BilibiliAudioExport.convert(ffmpeg, source, output, job.format(), downloader);
                } else {
                    output = input;
                }
                saveCover(folder, video.coverUrl());
            }
            stage = "save to library";
            downloader.commit();
            saveImportMetadata(folder, job.format(),
                    new ImportedAudio(target.getFileName().toString(), title, video.author(), part.duration()));
            // Staging and publishing are on the same volume. Never replace a user file.
            if (!duplicate) Files.move(output, target);
            Map<String, Object> done = jobData(job);
            done.put("title", title);
            done.put("artist", video.author());
            done.put("path", target.toString());
            done.put("trackId", LibraryScanner.stableId(target.toString()));
            done.put("duplicate", duplicate);
            downloader.emit(() -> emitter.accept("download.done", done));
            rescan.run();
        } catch (CancellationException ignored) {
            // The queue has already emitted download.cancelled.
        } catch (Exception error) {
            Map<String, Object> failed = jobData(job);
            failed.put("title", label);
            failed.put("message", stage + ": " + describe(error));
            downloader.emit(() -> emitter.accept("download.error", failed));
        } finally {
            deleteTemp(input);
            if (output != input) deleteTemp(output);
        }
    }

    private static Path findExport(Path folder, Format format) throws IOException {
        String suffix = "." + format.extension();
        try (var files = Files.list(folder)) {
            return files.filter(file -> !file.getFileName().toString().startsWith(".") &&
                            file.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(suffix))
                    .filter(file -> Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS))
                    .sorted().findFirst().orElse(null);
        }
    }

    private static void deleteTemp(Path path) {
        if (path != null) try { Files.deleteIfExists(path); } catch (IOException ignored) { }
    }

    private static String describe(Throwable error) {
        String message = error.getMessage();
        if (message != null && !message.isBlank()) return message;
        return error.getCause() == null ? error.getClass().getSimpleName() : describe(error.getCause());
    }

    private void downloadOriginal(Job job, String title, Path target) throws Exception {
        IOException failure = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            downloader.check();
            JsonNode playback = api("/x/player/playurl?bvid=" + job.bvid() + "&cid=" + job.cid() + "&fnval=16&qn=16");
            List<URI> sources = audioUrls(playback);
            if (sources.isEmpty()) throw new IllegalStateException(
                    "Bilibili did not provide a public AAC track for this part.");
            try {
                downloadStream(sources, target, (bytes, total) -> progress(job, title, "downloading", bytes, total));
                return;
            } catch (IOException error) {
                downloader.check();
                failure = error;
            }
        }
        throw failure;
    }

    private static String metadataName(Format format) {
        return format == Format.M4A ? IMPORT_METADATA : ".potato-bilibili." + format.extension() + ".json";
    }

    private static void saveImportMetadata(Path folder, Format format, ImportedAudio metadata) throws IOException {
        Path stage = Files.createTempFile(folder, ".audio-info-", ".part");
        try {
            Files.writeString(stage, Json.stringify(metadata), StandardCharsets.UTF_8);
            Files.move(stage, folder.resolve(metadataName(format)), StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(stage);
        }
    }

    /** Fragmented M4A streams may report zero duration in their initial media header. */
    static ImportedAudio importedAudio(Path root, Path audio) {
        Path folder = audio.getParent();
        if (folder == null || folder.getParent() == null ||
                !folder.getParent().equals(root.toAbsolutePath().normalize().resolve(IMPORT_DIRECTORY)) ||
                !folder.getFileName().toString().matches("BV[0-9A-Za-z]{10}-P[0-9]+")) return null;
        String name = audio.getFileName().toString();
        int dot = name.lastIndexOf('.');
        if (dot < 0) return null;
        try {
            Path metadata = folder.resolve(metadataName(Format.parse(name.substring(dot + 1))));
            if (!Files.isRegularFile(metadata, LinkOption.NOFOLLOW_LINKS) || Files.size(metadata) > 8192) return null;
            ImportedAudio importInfo = Json.read(Files.readString(metadata), ImportedAudio.class);
            return importInfo != null && name.equals(importInfo.fileName()) ? importInfo : null;
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
    }

    public record ImportedAudio(String fileName, String title, String artist, int duration) {}

    private static Path childDirectory(Path parent, String name) throws IOException {
        Path child = parent.resolve(name);
        try { Files.createDirectory(child); } catch (FileAlreadyExistsException ignored) { }
        if (!Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("The Bilibili import folder is not a regular directory.");
        }
        return child;
    }

    private static String safeName(String value, int limit) {
        String clean = value.replaceAll("[\\p{Cntrl}/\\\\:<>|?*\"]", "_").trim().replaceAll("^\\.+|[ .]+$", "");
        if (clean.isBlank()) return "Bilibili";
        // Limit UTF-8 filename bytes, not just Java characters.
        StringBuilder name = new StringBuilder();
        int bytes = 0;
        for (int codePoint : clean.codePoints().toArray()) {
            String ch = new String(Character.toChars(codePoint));
            bytes += ch.getBytes(StandardCharsets.UTF_8).length;
            if (bytes > limit) break;
            name.append(ch);
        }
        return name.toString().trim();
    }

    private static Map<String, Object> jobData(Job job) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("jobId", job.id());
        event.put("source", "bilibili");
        event.put("bvid", job.bvid());
        event.put("cid", job.cid());
        event.put("exportFormat", job.format().extension());
        return event;
    }

    private void progress(Job job, String title, String phase, long downloaded, long total) {
        Map<String, Object> event = jobData(job);
        event.put("title", title);
        event.put("phase", phase);
        event.put("downloaded", downloaded);
        event.put("total", total);
        downloader.emit(() -> emitter.accept("download.progress", event));
    }

    @FunctionalInterface
    private interface TransferProgress { void update(long bytes, long total); }

    private void downloadStream(List<URI> sources, Path target, TransferProgress progress) throws IOException, InterruptedException {
        IOException failure = null;
        for (URI source : sources) {
            downloader.check();
            try {
                HttpResponse<InputStream> response = openAudio(source);
                try (InputStream body = response.body()) {
                    downloader.attach(body);
                    long length = audioLength(response);
                    copyAudio(body, target, length, downloader::check, count -> progress.update(count, length));
                }
                return;
            } catch (IOException error) {
                downloader.check();
                failure = new IOException(describe(error) + " [" + source.getHost() + "]", error);
            }
        }
        throw failure == null ? new IOException("No usable Bilibili audio host.") : failure;
    }

    private HttpResponse<InputStream> openAudio(URI first) throws IOException, InterruptedException {
        URI uri = first;
        for (int redirects = 0; redirects <= 3; redirects++) {
            downloader.check();
            HttpResponse<InputStream> response = http.send(request(uri), HttpResponse.BodyHandlers.ofInputStream());
            int status = response.statusCode();
            if (status < 300 || status >= 400) return response;
            response.body().close();
            String location = response.headers().firstValue("location").orElse("");
            try {
                uri = uri.resolve(location);
            } catch (IllegalArgumentException error) {
                throw new IOException("Invalid audio redirect.", error);
            }
            if (location.isBlank() || !trustedAudio(uri)) throw new IOException("Bilibili returned an unsupported audio redirect.");
        }
        throw new IOException("Bilibili audio redirected too many times.");
    }

    private static long audioLength(HttpResponse<?> response) throws IOException {
        long length = response.headers().firstValueAsLong("Content-Length").orElse(-1);
        if (response.statusCode() == 200) return length;
        if (response.statusCode() == 206) return completeRangeLength(response.headers().firstValue("Content-Range").orElse(""), length);
        throw new IOException("Bilibili audio returned HTTP " + response.statusCode() + ".");
    }

    static long completeRangeLength(String header, long length) throws IOException {
        var range = Pattern.compile("bytes 0-([0-9]{1,12})/([0-9]{1,12})").matcher(header);
        if (range.matches()) {
            long total = Long.parseLong(range.group(2));
            if (total > 0 && Long.parseLong(range.group(1)) == total - 1 && (length < 0 || length == total)) return total;
        }
        throw new IOException("Bilibili returned only part of the audio stream.");
    }

    static void copyAudio(InputStream input, Path target, long length, Runnable check, LongConsumer progress) throws IOException {
        if (length > MAX_AUDIO_BYTES) throw new IOException("This audio stream is too large to import.");
        byte[] header = input.readNBytes(12);
        if (header.length != 12 || !"ftyp".equals(new String(header, 4, 4, StandardCharsets.US_ASCII))) {
            throw new IOException("Bilibili did not return an MPEG-4 audio file.");
        }
        long count = header.length;
        long lastUpdate = 0;
        try (var out = Files.newOutputStream(target)) {
            out.write(header);
            byte[] buffer = new byte[64 * 1024];
            for (int bytes; (bytes = input.read(buffer)) != -1;) {
                check.run();
                count += bytes;
                if (count > MAX_AUDIO_BYTES) throw new IOException("This audio stream is too large to import.");
                out.write(buffer, 0, bytes);
                long now = System.nanoTime();
                if (now - lastUpdate > 150_000_000) {
                    progress.accept(count);
                    lastUpdate = now;
                }
            }
        }
        if (count <= header.length || (length >= 0 && count != length)) throw new IOException("The audio transfer was incomplete.");
        check.run();
        progress.accept(count);
    }

    private void saveCover(Path folder, String url) {
        Path temp = null;
        try {
            URI cover = URI.create(url);
            if (!trusted(cover, "hdslb.com") || Files.exists(folder.resolve("cover.jpg"))) return;
            HttpResponse<InputStream> response = http.send(request(cover), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                downloader.attach(body);
                if (response.statusCode() != 200) return;
                byte[] bytes = body.readNBytes(4 * 1024 * 1024 + 1);
                if (bytes.length < 12 || bytes.length > 4 * 1024 * 1024 ||
                        (bytes[0] & 0xff) != 0xff || (bytes[1] & 0xff) != 0xd8) return;
                temp = Files.createTempFile(folder, ".cover-", ".part");
                Files.write(temp, bytes);
                Files.move(temp, folder.resolve("cover.jpg"));
            }
        } catch (Exception ignored) {
            // Artwork is optional and never prevents saving the audio.
        } finally {
            if (temp != null) try { Files.deleteIfExists(temp); } catch (IOException ignored) { }
        }
    }

    static List<URI> audioUrls(JsonNode root) {
        List<JsonNode> candidates = new ArrayList<>();
        for (JsonNode audio : root.path("data").path("dash").path("audio")) {
            String mime = audio.path("mimeType").asText(audio.path("mime_type").asText(""));
            if ("audio/mp4".equals(mime) && audio.path("codecs").asText("").startsWith("mp4a")) {
                candidates.add(audio);
            }
        }
        candidates.sort(Comparator.comparingLong((JsonNode item) -> item.path("bandwidth").asLong()).reversed());
        List<URI> sources = new ArrayList<>();
        for (JsonNode candidate : candidates) {
            addAudioUrl(sources, candidate.path("baseUrl").asText(candidate.path("base_url").asText("")));
            JsonNode backup = candidate.has("backupUrl") ? candidate.path("backupUrl") : candidate.path("backup_url");
            for (JsonNode url : backup) addAudioUrl(sources, url.asText(""));
        }
        return sources.stream().distinct().toList();
    }

    private static void addAudioUrl(List<URI> list, String value) {
        try {
            URI uri = URI.create(value);
            if (trustedAudio(uri)) list.add(uri);
        } catch (IllegalArgumentException ignored) { }
    }

    private static boolean trustedAudio(URI uri) {
        return trusted(uri, "bilivideo.com") || trusted(uri, "bilivideo.cn");
    }

    private static boolean trusted(URI uri, String domain) {
        String host = uri.getHost();
        if (host == null || uri.getUserInfo() != null || !"https".equalsIgnoreCase(uri.getScheme())
                || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.equals(domain) || lower.endsWith("." + domain);
    }

    private VideoRef resolve(String input) {
        String value = input == null ? "" : input.trim();
        VideoRef direct = parseVideoRef(value);
        if (direct != null) return direct;
        try {
            URI uri = httpsUri(value);
            if (uri == null || !trusted(uri, "b23.tv")) throw new IllegalArgumentException("Enter a Bilibili video link or BV/av number.");
            for (int i = 0; i < 4; i++) {
                HttpResponse<Void> response = http.send(request(uri), HttpResponse.BodyHandlers.discarding());
                if (response.statusCode() < 300 || response.statusCode() >= 400) break;
                String location = response.headers().firstValue("location").orElse("");
                if (location.isBlank()) break;
                uri = uri.resolve(location);
                VideoRef target = parseVideoRef(uri.toString());
                if (target != null) {
                    int page = selectedPage(httpsUri(value));
                    return page > 1 && target.page() == 1 ? new VideoRef(target.bvid(), target.aid(), page) : target;
                }
                if (!trusted(uri, "b23.tv")) break;
            }
            throw new IllegalArgumentException("This short link did not resolve to a Bilibili video.");
        } catch (IOException error) {
            throw new IllegalStateException("Could not resolve the Bilibili short link.", error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new CancellationException("Request cancelled.");
        }
    }

    static VideoRef parseVideoRef(String input) {
        if (input == null || input.length() > 2000) return null;
        String value = input.trim();
        if (value.startsWith("bv")) value = "BV" + value.substring(2);
        VideoRef id = videoId(value, 1);
        if (id != null) return id;
        URI uri = httpsUri(value);
        if (uri == null || !trusted(uri, "bilibili.com")) return null;
        String path = uri.getPath();
        if (path == null || !path.matches("/video/[^/]+/?")) return null;
        return videoId(path.substring("/video/".length()).replaceFirst("/$", ""), selectedPage(uri));
    }

    private static URI httpsUri(String value) {
        try {
            if (value.matches("(?i)^(?:(?:(?:www|m)\\.)?bilibili\\.com|b23\\.tv)/.*")) value = "https://" + value;
            if (value.regionMatches(true, 0, "http://", 0, 7)) value = "https://" + value.substring(7);
            return URI.create(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static int selectedPage(URI uri) {
        String query = uri.getRawQuery();
        if (query != null) for (String param : query.split("&")) {
            if (param.matches("p=[0-9]{1,5}")) return Math.max(1, Integer.parseInt(param.substring(2)));
        }
        return 1;
    }

    private static VideoRef videoId(String id, int page) {
        if (BVID.matcher(id).matches()) return new VideoRef(id, "", page);
        var match = AVID.matcher(id);
        return match.matches() ? new VideoRef("", match.group(1), page) : null;
    }

    private Video fetchVideo(VideoRef ref) {
        return parseVideo(api("/x/web-interface/view?" + (ref.bvid().isBlank() ? "aid=" + ref.aid() : "bvid=" + ref.bvid())));
    }

    static Video parseVideo(JsonNode root) {
        JsonNode data = root.path("data");
        String bvid = data.path("bvid").asText("");
        if (!BVID.matcher(bvid).matches()) throw new IllegalStateException("Video unavailable.");
        List<Part> parts = new ArrayList<>();
        for (JsonNode item : data.path("pages")) {
            long cid = item.path("cid").asLong();
            int page = item.path("page").asInt();
            if (cid > 0 && page > 0) parts.add(new Part(cid, page, clean(item.path("part").asText()), item.path("duration").asInt()));
        }
        if (parts.isEmpty() && data.path("cid").asLong() > 0) {
            parts.add(new Part(data.path("cid").asLong(), 1, "", data.path("duration").asInt()));
        }
        if (parts.isEmpty()) throw new IllegalStateException("No playable parts were returned.");
        return new Video(bvid, clean(data.path("title").asText(bvid)),
                clean(data.path("owner").path("name").asText("Bilibili")),
                cover(data.path("pic").asText("")), truncate(clean(data.path("desc").asText("")), 1800), List.copyOf(parts));
    }

    private JsonNode api(String path) {
        try {
            HttpResponse<String> response = http.send(request(URI.create(API + path)), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() == 412 || response.statusCode() == 429) {
                throw new IllegalStateException("Bilibili is limiting requests from this network. Try again later.");
            }
            if (response.statusCode() != 200) throw new IllegalStateException("Bilibili returned HTTP " + response.statusCode() + ".");
            JsonNode root = Json.MAPPER.readTree(response.body());
            int code = root.path("code").asInt(-1);
            if (code == -352 || code == -412) throw new IllegalStateException("Bilibili is limiting requests from this network. Try again later.");
            if (code != 0) throw new IllegalStateException(root.path("message").asText("Bilibili request failed."));
            return root;
        } catch (IOException error) {
            throw new IllegalStateException("Could not reach Bilibili.", error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new CancellationException("Request cancelled.");
        }
    }

    private static HttpRequest request(URI uri) {
        return HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(18))
                .header("User-Agent", UA).header("Referer", REFERER).header("Accept", "*/*").GET().build();
    }

    private record Job(String id, String bvid, long cid, Format format) {}

    record VideoRef(String bvid, String aid, int page) {}
    record Part(long cid, int page, String title, int duration) {}
    record Video(String bvid, String title, String author, String coverUrl, String description, List<Part> parts) {
        String url() { return REFERER + "video/" + bvid; }
    }

    static Map<String, Object> parse(JsonNode root, String query, int limit) {
        JsonNode data = root.path("data");
        JsonNode items = data.path("result");
        List<Map<String, Object>> results = new ArrayList<>();
        if (items != null && items.isArray()) {
            for (JsonNode item : items) {
                if (results.size() >= limit) break;
                if (!"video".equals(item.path("type").asText("video"))) continue;
                String bvid = item.path("bvid").asText("");
                long aid = item.path("aid").asLong(0);
                if (!BVID.matcher(bvid).matches()) bvid = "";
                if (bvid.isBlank() && aid <= 0) continue;
                String url = REFERER + "video/" + (bvid.isBlank() ? "av" + aid : bvid);
                String duration = item.path("duration").asText("");
                Map<String, Object> video = new LinkedHashMap<>();
                video.put("bvid", bvid);
                video.put("aid", aid);
                video.put("title", clean(item.path("title").asText("")));
                video.put("author", clean(item.path("author").asText("")));
                video.put("authorId", item.path("mid").asLong(0));
                video.put("coverUrl", cover(item.path("pic").asText("")));
                video.put("duration", duration);
                video.put("durationSeconds", durationSeconds(duration));
                video.put("playCount", item.path("play").asLong(0));
                video.put("danmakuCount", item.path("danmaku").asLong(0));
                video.put("publishedAt", item.path("pubdate").asLong(0) * 1000L);
                video.put("description", truncate(clean(item.path("description").asText("")), 180));
                video.put("typeName", clean(item.path("typename").asText("")));
                video.put("url", url);
                results.add(video);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", query);
        out.put("total", data.path("numResults").asLong(results.size()));
        out.put("results", results);
        out.put("searchUrl", "https://search.bilibili.com/all?keyword=" + encode(query));
        return out;
    }

    private static Map<String, Object> empty(String query) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", query);
        out.put("total", 0);
        out.put("page", 1);
        out.put("pages", 1);
        out.put("results", List.of());
        out.put("searchUrl", "https://search.bilibili.com/all?keyword=" + encode(query));
        return out;
    }

    private static String cover(String value) {
        if (value == null || value.isBlank()) return "";
        return value.startsWith("//") ? "https:" + value : value;
    }

    private static int durationSeconds(String value) {
        if (value == null || value.isBlank()) return 0;
        int total = 0;
        for (String part : value.split(":")) {
            try {
                total = total * 60 + Integer.parseInt(part.trim());
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return total;
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }

    private static String clean(String value) {
        if (value == null) return "";
        String text = value.replaceAll("(?s)<[^>]*>", "");
        text = text.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&#x27;", "'")
                .replace("&nbsp;", " ")
                .replace("&mdash;", "—");
        return text.replaceAll("\\s+", " ").trim();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private record CacheEntry(Map<String, Object> value, long expiresAt) {
    }
}
