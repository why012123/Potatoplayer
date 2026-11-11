package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** One-time, journalled import of Super's index. Runs before any stores or workers open. */
public final class SuperMigration {
    private static final String JOURNAL = "migration-super-v1";
    private static final List<String> FILES = List.of("library.json", "settings.json", "stats.json", "eq.json", "netease_bindings.json", "netease_aliases.json", "daily_mix.json");
    private static final List<String> FIELDS = List.of("title", "artist", "album", "genre", "block", "note", "rating", "year", "trackNo", "addedAt", "neteaseId", "qqId", "coverPath", "lyricsOverride");
    private SuperMigration() {}

    public static void run(DataStore store) throws IOException {
        if ("0".equals(System.getenv("POTATOMUSIC_IMPORT_SUPER"))) return;
        Path dest = store.dataDir().toAbsolutePath().normalize();
        String override = System.getProperty("potatomusic.importHome", System.getenv("POTATOMUSIC_IMPORT_HOME"));
        Path normal = Path.of(System.getProperty("user.home"), ".potatomusic-ai").toAbsolutePath().normalize();
        // Temporary/test homes must never silently import the real user's library.
        if ((override == null || override.isBlank()) && !dest.equals(normal)) return;
        Path source = override == null || override.isBlank()
                ? Path.of(System.getProperty("user.home"), ".potatoplayer-super") : Path.of(override);
        source = source.toAbsolutePath().normalize();
        Path journal = dest.resolve(JOURNAL);
        if (source.equals(dest) || Files.exists(journal.resolve("completed.json"))) return;
        if (Files.exists(journal.resolve("manifest.json"))) { commit(dest, journal); return; }
        if (!Files.isRegularFile(source.resolve("library.json"))) return;

        Map<String, JsonNode> old = snapshot(source), current = snapshot(dest);
        ObjectNode original = object(old.get("library.json"));
        if (!original.path("tracks").isArray()) throw new IOException("Original library has no track list; import stopped.");
        ObjectNode local = object(current.get("library.json"));
        if (current.containsKey("library.json") && !local.path("tracks").isArray()) throw new IOException("AI library is invalid; import stopped.");
        String oldRoot = original.path("libraryRoot").asText("");
        String newRoot = local.path("libraryRoot").asText(object(current.get("settings.json")).path("libraryRoot").asText(oldRoot));
        if (!newRoot.isBlank() && !oldRoot.isBlank() && !samePath(oldRoot, newRoot)) return;
        Path root = oldRoot.isBlank() ? null : Path.of(oldRoot);
        ObjectNode report = Json.MAPPER.createObjectNode();
        report.put("source", source.toString()); report.put("startedAt", System.currentTimeMillis());
        ObjectNode changed = report.putObject("updatedFields");
        ArrayNode conflicts = report.putArray("preservedLocalChanges");

        // Reconstruct the old scan-only starting point, rather than treating every
        // nonzero legacy rating as an edit made in the AI edition.
        Map<String, JsonNode> baseline = new HashMap<>();
        if (local.path("tracks").size() > 0 && root != null && Files.isDirectory(root)) {
            NeteaseBindings bindings = new NeteaseBindings(dest); // read-only load: no legacy source
            LibraryScanner scanner = new LibraryScanner(store.coversDir(), bindings);
            for (Track track : scanner.scan(root, ignored -> {}).tracks()) baseline.put(track.id, Json.MAPPER.valueToTree(track));
        }
        Map<String, JsonNode> sourceTracks = index(original.path("tracks"), "id");
        Map<String, JsonNode> sourcePaths = index(original.path("tracks"), "path");
        ObjectNode merged = local.deepCopy();
        if (!merged.has("libraryRoot")) merged.put("libraryRoot", oldRoot);
        if (!merged.has("schemaVersion")) merged.put("schemaVersion", 2);
        if (!merged.has("scannedAt")) merged.set("scannedAt", original.path("scannedAt"));
        ArrayNode tracks = merged.putArray("tracks");
        Set<String> present = new HashSet<>();
        Map<String, String> ids = new HashMap<>();
        ObjectNode aiStats = object(current.get("stats.json"));
        boolean sameStats = Objects.equals(old.get("stats.json"), current.get("stats.json"));
        int restored = 0, protectedFields = 0;
        for (JsonNode existing : local.path("tracks")) {
            ObjectNode t = object(existing).deepCopy();
            JsonNode from = sourceTracks.get(t.path("id").asText());
            if (from == null || !samePath(from.path("path").asText(), t.path("path").asText())) from = sourcePaths.get(t.path("path").asText());
            if (from == null) { tracks.add(t); continue; }
            String id = t.path("id").asText(); present.add(from.path("id").asText()); ids.put(from.path("id").asText(), id);
            Set<String> edits = strings(t.path("metadataOverrides"));
            JsonNode base = baseline.get(id);
            for (String field : FIELDS) {
                if (edits.contains(field)) { protectedFields++; continue; }
                JsonNode previous = from.get(field), value = t.get(field);
                if (equivalent(value, previous)) continue;
                boolean untouched = base != null ? equivalent(value, base.get(field)) : empty(value);
                if (untouched) {
                    if (previous == null || previous.isNull()) t.remove(field); else t.set(field, previous.deepCopy());
                    edits.add(field); increment(changed, field);
                } else {
                    ObjectNode conflict = conflicts.addObject(); conflict.put("trackId", id); conflict.put("title", t.path("title").asText()); conflict.put("field", field);
                }
            }
            if (!edits.contains("playCount")) {
                int plays = sameStats ? 0 : aiStats.path("tracks").path(id).path("plays").asInt(0);
                t.put("playCount", Math.max(t.path("playCount").asInt(), from.path("playCount").asInt() + plays));
            }
            ArrayNode overrides = t.putArray("metadataOverrides"); edits.forEach(overrides::add);
            tracks.add(t);
        }
        for (JsonNode from : original.path("tracks")) {
            if (present.contains(from.path("id").asText())) continue;
            // Only import files still present in the selected library.
            String audio = from.path("path").asText();
            if (audio.isBlank() || !Files.isRegularFile(Path.of(audio))) continue;
            ObjectNode t = object(from).deepCopy();
            ArrayNode overrides = t.putArray("metadataOverrides"); FIELDS.forEach(overrides::add);
            tracks.add(t); ids.put(from.path("id").asText(), t.path("id").asText()); restored++;
        }
        Set<String> validIds = new HashSet<>(); for (JsonNode t : tracks) validIds.add(t.path("id").asText());
        Set<String> favorites = strings(local.path("favorites"));
        for (String id : strings(original.path("favorites"))) { String mapped = ids.getOrDefault(id, id); if (validIds.contains(mapped)) favorites.add(mapped); }
        ArrayNode fav = merged.putArray("favorites"); favorites.forEach(fav::add);
        merged.set("playlists", mergeNamed(local.path("playlists"), original.path("playlists"), "id", ids, validIds));
        merged.set("blocks", mergeNamed(local.path("blocks"), original.path("blocks"), "name", null, null));
        merged.set("genres", mergeNamed(local.path("genres"), original.path("genres"), "name", null, null));
        Map<String, JsonNode> output = new LinkedHashMap<>(); output.put("library.json", merged);
        output.put("settings.json", fillMissing(object(current.get("settings.json")), object(old.get("settings.json"))));
        output.put("stats.json", mergeStats(object(old.get("stats.json")), aiStats, ids));
        output.put("eq.json", mergeEq(object(old.get("eq.json")), object(current.get("eq.json"))));
        ObjectNode bindings = fillMissing(object(current.get("netease_bindings.json")), object(old.get("netease_bindings.json")));
        // Make bindings agree with the resolved metadata, including intentionally cleared IDs.
        for (JsonNode t : tracks) {
            String audio = t.path("path").asText(); String nid = t.path("neteaseId").asText(""); String qq = t.path("qqId").asText("");
            if (nid.isBlank() && qq.isBlank()) { bindings.remove(audio); continue; }
            ObjectNode binding = object(bindings.get(audio)).deepCopy();
            binding.put("path", audio); binding.put("neteaseId", nid.isBlank() ? "qq:" + qq : nid);
            for (String f : List.of("title", "artist", "album", "year", "coverPath", "block", "genre")) if (t.has(f)) binding.set(f, t.get(f));
            bindings.set(audio, binding);
        }
        output.put("netease_bindings.json", bindings);
        output.put("netease_aliases.json", fillMissing(object(current.get("netease_aliases.json")), object(old.get("netease_aliases.json"))));
        if (current.containsKey("daily_mix.json") || old.containsKey("daily_mix.json")) output.put("daily_mix.json", current.getOrDefault("daily_mix.json", old.get("daily_mix.json")));

        // Only detached artwork needs copying. Shared library covers are already allowed.
        Map<String, String> covers = new HashMap<>();
        for (JsonNode t : tracks) remapCover(object(t), dest, root, covers);
        for (JsonNode binding : bindings) if (binding.isObject()) remapCover((ObjectNode) binding, dest, root, covers);
        report.put("coversCopied", covers.size()); report.put("tracksAdded", restored); report.put("protectedFields", protectedFields);
        report.put("favoritesAdded", fav.size() - local.path("favorites").size());
        report.put("playlistsAdded", merged.path("playlists").size() - local.path("playlists").size());
        report.put("tracks", tracks.size());
        // Backups and fully prepared outputs precede the commit journal. If interrupted,
        // replaying these exact outputs cannot double-count listening history.
        Files.createDirectories(journal.resolve("before")); Files.createDirectories(journal.resolve("prepared"));
        for (String name : FILES) if (current.containsKey(name)) Json.writeAtomic(journal.resolve("before").resolve(name), current.get(name));
        if (Files.isRegularFile(source.resolve("playlist_sync.json"))) {
            Files.copy(source.resolve("playlist_sync.json"), journal.resolve("original-playlist-sync.json"), StandardCopyOption.REPLACE_EXISTING);
            report.put("cloudSync", "Original bindings backed up; active cloud sync is not enabled by data import.");
        }
        ArrayNode files = Json.MAPPER.createArrayNode();
        for (var entry : output.entrySet()) { Json.writeAtomic(journal.resolve("prepared").resolve(entry.getKey()), entry.getValue()); files.add(entry.getKey()); }
        Json.writeAtomic(journal.resolve("report.json"), report);
        ObjectNode manifest = Json.MAPPER.createObjectNode(); manifest.set("files", files); Json.writeAtomic(journal.resolve("manifest.json"), manifest);
        commit(dest, journal);
        System.err.println("[migration] Original player data imported; " + report.path("favoritesAdded").asInt() + " favorites, " + report.path("playlistsAdded").asInt() + " playlists, " + covers.size() + " cover paths.");
    }

    private static void commit(Path dest, Path journal) throws IOException {
        JsonNode manifest = Json.MAPPER.readTree(Files.readString(journal.resolve("manifest.json")));
        for (JsonNode name : manifest.path("files")) {
            if (!FILES.contains(name.asText())) throw new IOException("Invalid migration manifest");
            JsonNode prepared = Json.MAPPER.readTree(Files.readString(journal.resolve("prepared").resolve(name.asText())));
            Json.writeAtomic(dest.resolve(name.asText()), prepared);
        }
        Json.writeAtomic(journal.resolve("completed.json"), Map.of("completedAt", System.currentTimeMillis()));
    }
    private static Map<String, JsonNode> snapshot(Path dir) throws IOException {
        Map<String, JsonNode> result = new LinkedHashMap<>();
        for (String name : FILES) if (Files.isRegularFile(dir.resolve(name))) {
            JsonNode node = Json.MAPPER.readTree(Files.readString(dir.resolve(name)));
            if (node == null || !node.isObject()) throw new IOException("Invalid migration input: " + name);
            result.put(name, node);
        }
        return result;
    }
    private static ObjectNode object(JsonNode value) { return value != null && value.isObject() ? (ObjectNode) value : Json.MAPPER.createObjectNode(); }
    private static Set<String> strings(JsonNode value) { Set<String> result = new LinkedHashSet<>(); for (JsonNode item : value) if (item.isTextual()) result.add(item.asText()); return result; }
    private static Map<String, JsonNode> index(JsonNode value, String field) { Map<String, JsonNode> result = new LinkedHashMap<>(); for (JsonNode t : value) if (!t.path(field).asText().isBlank()) result.put(t.path(field).asText(), t); return result; }
    private static boolean samePath(String a, String b) { return !a.isBlank() && !b.isBlank() && Path.of(a).toAbsolutePath().normalize().equals(Path.of(b).toAbsolutePath().normalize()); }
    private static boolean empty(JsonNode v) { return v == null || v.isNull() || (v.isTextual() && v.asText().isBlank()) || (v.isNumber() && v.asDouble() == 0); }
    private static boolean equivalent(JsonNode a, JsonNode b) { return (empty(a) && empty(b)) || Objects.equals(a, b) || (a != null && b != null && a.isNumber() && b.isNumber() && a.asDouble() == b.asDouble()); }
    private static void increment(ObjectNode counts, String name) { counts.put(name, counts.path(name).asInt() + 1); }
    private static ObjectNode fillMissing(ObjectNode local, ObjectNode source) { ObjectNode result = source.deepCopy(); local.fields().forEachRemaining(e -> result.set(e.getKey(), e.getValue().deepCopy())); return result; }
    private static ArrayNode mergeNamed(JsonNode local, JsonNode source, String key, Map<String, String> ids, Set<String> valid) {
        ArrayNode result = Json.MAPPER.createArrayNode(); Set<String> seen = new HashSet<>();
        for (JsonNode v : local) { result.add(v.deepCopy()); seen.add(v.path(key).asText()); }
        for (JsonNode v : source) {
            if (!seen.add(v.path(key).asText())) continue; // Existing playlist order/name and tag colors win.
            ObjectNode next = object(v).deepCopy();
            if (ids != null) { ArrayNode members = next.putArray("trackIds"); for (String id : strings(v.path("trackIds"))) { String mapped = ids.getOrDefault(id,id); if (valid.contains(mapped)) members.add(mapped); } }
            result.add(next);
        }
        return result;
    }
    private static ObjectNode mergeEq(ObjectNode source, ObjectNode local) {
        ObjectNode out = fillMissing(local, source);
        for (String field : List.of("presets", "songs")) out.set(field, fillMissing(object(local.get(field)), object(source.get(field))));
        return out;
    }
    private static ObjectNode mergeStats(ObjectNode source, ObjectNode local, Map<String, String> ids) {
        if (source.equals(local)) return local.deepCopy();
        ObjectNode out = source.deepCopy(); out.put("schemaVersion", 1);
        for (String section : List.of("days", "tracks")) {
            ObjectNode target = object(out.get(section)); out.set(section, target);
            if (section.equals("tracks")) for (var entry : ids.entrySet()) if (!entry.getKey().equals(entry.getValue()) && target.has(entry.getKey())) target.set(entry.getValue(), target.remove(entry.getKey()));
            local.path(section).fields().forEachRemaining(entry -> {
                JsonNode added = entry.getValue(); ObjectNode current = object(target.get(entry.getKey())).deepCopy();
                current.put("seconds", current.path("seconds").asDouble() + added.path("seconds").asDouble());
                current.put("plays", current.path("plays").asInt() + added.path("plays").asInt());
                if (section.equals("days")) { JsonNode oldHours = current.path("hours"); ArrayNode hours = current.putArray("hours"); for (int i = 0; i < 24; i++) hours.add(oldHours.path(i).asDouble() + added.path("hours").path(i).asDouble()); }
                else { if (added.path("lastPlayedAt").asLong() >= current.path("lastPlayedAt").asLong()) for (String f : List.of("title", "artist")) if (added.has(f)) current.set(f, added.get(f)); current.put("lastPlayedAt", Math.max(current.path("lastPlayedAt").asLong(), added.path("lastPlayedAt").asLong())); }
                target.set(entry.getKey(), current);
            });
        }
        return out;
    }
    private static void remapCover(ObjectNode record, Path dest, Path root, Map<String, String> covers) throws IOException {
        String text = record.path("coverPath").asText(""); if (text.isBlank()) return;
        Path file = Path.of(text).toAbsolutePath().normalize();
        if (file.startsWith(dest) || (root != null && root.getParent() != null && file.startsWith(root.getParent().toAbsolutePath().normalize()))) return;
        if (!Files.isRegularFile(file)) return;
        String cached = covers.get(text);
        if (cached == null) {
            if (Files.size(file) > 32 * 1024 * 1024) throw new IOException("Artwork too large: " + file.getFileName());
            String filename = file.getFileName().toString(); int dot = filename.lastIndexOf('.'); String ext = dot < 0 ? "" : filename.substring(dot).toLowerCase(Locale.ROOT);
            if (!Set.of(".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff").contains(ext)) return;
            try {
                byte[] bytes = Files.readAllBytes(file); String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                Path copied = dest.resolve("covers").resolve("super-" + hash + ext); Files.createDirectories(copied.getParent());
                if (!Files.exists(copied)) Files.write(copied, bytes); cached = copied.toString(); covers.put(text, cached);
            } catch (java.security.NoSuchAlgorithmException e) { throw new IOException(e); }
        }
        record.put("coverPath", cached);
    }
}
