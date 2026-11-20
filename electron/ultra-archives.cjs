const fs = require("node:fs");
const path = require("node:path");

/**
 * Runtime Ultra archive generation.
 *
 * Ultra's 3D library is built from a static `content/archives.json` snapshot at
 * build time, which means a packaged app would forever show whatever was baked
 * in (the packaged build deliberately uses the bundled sample archive so a
 * public DMG never ships the developer's personal library). Instead we generate
 * the archive from the live `library.json` on every Ultra window open and cache
 * it under the app data directory, so the window always mirrors the real
 * library.
 *
 * Geometry notes from the original generator: the scene expects five columns ×
 * eight visible rows, but it is scrollable, so every block and every track is
 * included; categories/columns follow the library's blocks.
 */

const CATEGORY_FALLBACKS = ["精选 1", "精选 2", "精选 3", "精选 4", "精选 5"];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function archiveColumns(library) {
  return Array.isArray(library?.columns)
    ? library.columns
    : Array.isArray(library?.categories)
      ? library.categories
      : [];
}

function buildArchives(library) {
  if (!library) return null;
  const tracks = Array.isArray(library.tracks) ? library.tracks : [];
  if (!tracks.length) return null;

  // Match the library's editable genre palette rather than deriving colors from blocks.
  const genreColors = new Map(
    (Array.isArray(library.genres) ? library.genres : []).map((tag) => [String(tag.name || "").trim(), tag.color]),
  );
  const groups = new Map();
  for (const track of tracks) {
    const key = String(track.block || "").trim() || "未分组";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(track);
  }

  const ranked = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-Hans-CN"),
  );
  const chosen = [...ranked]
    .sort(
      (a, b) =>
        Number(a[0] === "未分组" || a[0] === "Unfiled") - Number(b[0] === "未分组" || b[0] === "Unfiled") ||
        b[1].length - a[1].length ||
        a[0].localeCompare(b[0], "zh-Hans-CN"),
    )
    .slice(0, 10);
  while (chosen.length < 5) {
    const fallback = CATEGORY_FALLBACKS[chosen.length] || `精选 ${chosen.length + 1}`;
    const rest = ranked
      .flatMap(([, list]) => list)
      .filter((track) => !chosen.some(([, list]) => list.includes(track)));
    if (!rest.length) break;
    chosen.push([fallback, rest]);
  }

  const sortTracks = (list) =>
    [...list].sort(
      (a, b) =>
        (b.rating || 0) - (a.rating || 0) ||
        (b.playCount || 0) - (a.playCount || 0) ||
        String(a.title).localeCompare(String(b.title), "zh-Hans-CN"),
    );

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };
  const formatDate = (value) => {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
  };
  const extension = (file) => (String(file).split(".").pop() || "audio").toUpperCase();

  const records = [];
  for (const [block, list] of chosen) {
    for (const track of sortTracks(list)) {
      const index = records.length + 1;
      const title = track.title || path.basename(track.path || "Untitled", path.extname(track.path || ""));
      const artist = track.artist || "Unknown artist";
      const album = track.album || "单曲";
      const genre = String(track.genre || "").trim() || "未分类";
      const rawColor = genreColors.get(genre);
      const genreColor = typeof rawColor === "string" && /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#87908b";
      records.push({
        id: `X-${String(index).padStart(3, "0")}`,
        coverPath: track.coverPath || "",
        title,
        en: artist,
        genre,
        genreColor,
        department: block,
        category: block,
        date: album,
        lead: `${artist}${track.year ? ` · ${track.year}` : ""}`,
        clearance: "AUDIO ARCHIVE",
        abstract:
          track.note?.trim() ||
          `《${title}》来自 ${artist} 的《${album}》，归入「${block}」区块与「${genre}」流派。评分 ${(track.rating || 0).toFixed(1)}，播放 ${track.playCount || 0} 次。`,
        findings: [
          `评分 ${(track.rating || 0).toFixed(1)} / 10 · 播放 ${track.playCount || 0} 次 · ${extension(track.path)}`,
          `时长 ${formatDuration(track.duration)} · 流派 ${genre} · 专辑 ${album}`,
          `入库 ${formatDate(track.addedAt)} · 文件 ${path.basename(track.path || "")}`,
        ],
        source: `https://music.163.com/#/search/m/?s=${encodeURIComponent(`${title} ${artist}`)}`,
        trackId: track.id,
      });
    }
  }

  return {
    categories: chosen.map(([block]) => block),
    columns: chosen.map(([block]) => block),
    records,
  };
}

function ultraArchivesPath(dataDir) {
  return path.join(dataDir, "ultra", "archives.json");
}

/**
 * Generate (or reuse) the runtime archive for the current library.
 * Returns null when there is no library yet so the renderer can fall back to
 * its bundled sample archive.
 */
function ensureUltraArchives({ dataDir, force = false } = {}) {
  if (!dataDir) return null;
  const libraryFile = path.join(dataDir, "library.json");
  const output = ultraArchivesPath(dataDir);
  let libraryStat = null;
  try {
    libraryStat = fs.statSync(libraryFile);
  } catch {
    return null;
  }
  if (!force) {
    try {
      if (fs.statSync(output).mtimeMs >= libraryStat.mtimeMs) {
        const cached = readJson(output);
        if (cached && Array.isArray(cached.records) && cached.records.length) return cached;
      }
    } catch {
      /* regenerate below */
    }
  }
  const library = readJson(libraryFile);
  const content = buildArchives(library);
  if (!content) return null;
  try {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(content), "utf8");
  } catch (error) {
    console.error("[ultra] unable to cache archives:", error.message);
  }
  return content;
}

module.exports = { buildArchives, ensureUltraArchives, ultraArchivesPath, archiveColumns };
