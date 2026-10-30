import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Replace the Rhine Lab sample archive with the local music library.
 *
 * The original UI is built around 5 columns x 8 files. We keep that exact
 * geometry and fill the 40 slots with the five largest blocks, eight highest
 * rated tracks each. Search inside the archive still covers those 40 records;
 * the full library remains available in Potatoplayer Super.
 */
const libraryPath =
  process.env.POTATOMUSIC_LIBRARY ||
  path.join(os.homedir(), ".potatoplayer-super", "library.json");

const output = new URL("../content/archives.json", import.meta.url);
const sample = new URL("../content/archives.sample.json", import.meta.url);
const useSample = async (reason) => {
  console.warn(`[ultra] ${reason}; using the bundled sample archive.`);
  await fs.copyFile(sample, output);
  process.exit(0);
};

let library;
try {
  library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
} catch {
  await useSample(`no music library at ${libraryPath}`);
}

const tracks = Array.isArray(library?.tracks) ? library.tracks : [];
if (!tracks.length) await useSample("the music library is empty");

const groups = new Map();
for (const track of tracks) {
  const key = (track.block || "").trim() || "未分组";
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(track);
}

const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-Hans-CN"));
// Prefer real user blocks; "未分组" is a fallback, not a headline column.
const named = ranked.filter(([block]) => block !== "未分组" && block !== "Unfiled");
const chosen = (named.length >= 5 ? named : ranked).slice(0, 5);
while (chosen.length < 5) {
  const fallback = `精选 ${chosen.length + 1}`;
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
const categories = [];
const columns = [];
for (const [block, list] of chosen) {
  categories.push(block);
  columns.push(block);
  const picked = sortTracks(list).slice(0, 8);
  for (const track of picked) {
    const index = records.length + 1;
    const title = track.title || path.basename(track.path || "Untitled", path.extname(track.path || ""));
    const artist = track.artist || "Unknown artist";
    const album = track.album || "单曲";
    const genre = track.genre || "未分类";
    records.push({
      id: `X-${String(index).padStart(3, "0")}`,
      title,
      en: artist,
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

// The scene is calibrated for exactly five columns and eight rows.
const trimmed = records.slice(0, 40);
await fs.writeFile(
  output,
  JSON.stringify({ categories: chosen.map(([block]) => block), columns: chosen.map(([block]) => block), records: trimmed }, null, 2),
  "utf8",
);
console.log(`[ultra] wrote ${trimmed.length} music records across ${chosen.length} blocks (${chosen.map(([b]) => b).join(" / ")}).`);
