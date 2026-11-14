#!/usr/bin/env node
/**
 * Merge the AI edition data directory into the Super edition data directory so
 * both editions can share the same data folder (library, covers, stats, EQ,
 * NetEase bindings/aliases/cookie, playlist sync, AI chats and memory).
 *
 * Default is a dry-run; pass `--apply` to write. Before writing it clones the
 * destination directory next to itself (`.sync-backup-<timestamp>`) using APFS
 * clonefile when possible, so the original can be restored without copying.
 *
 * The script is designed for the one-time switch to a shared data directory; it
 * refuses to run twice unless `--force` is given (stats for the days recorded by
 * both editions are added, so a second run would double-count them).
 *
 * Usage:
 *   node scripts/sync-edition-data.cjs                 # dry-run plan
 *   node scripts/sync-edition-data.cjs --apply         # merge into ~/.potatoplayer-super
 *   node scripts/sync-edition-data.cjs --from DIR --to DIR [--apply] [--force]
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const apply = args.includes("--apply");
const force = args.includes("--force");
const home = os.homedir();
const from = path.resolve(argValue("--from", path.join(home, ".potatomusic-ai")));
const to = path.resolve(argValue("--to", path.join(home, ".potatoplayer-super")));
const repoRoot = path.resolve(__dirname, "..");
const reportFile = path.join(repoRoot, "tmp", "integration", "data-sync-report.md");
const markerFile = path.join(to, ".edition-sync.json");

const stats = { copiedCovers: 0, mergedTracks: 0, addedTracks: 0, mergedPlaylists: 0, addedPlaylists: 0, addedFavorites: 0, mergedDays: 0, mergedBindings: 0, addedBindings: 0, addedConversations: 0, mergedEquSongs: 0, copiedTrash: 0 };
const notes = [];
const isDefault = (value) => value === "" || value === 0 || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
};
const copyFile = (source, target) => {
  if (!fs.existsSync(source) || fs.existsSync(target)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    execFileSync("cp", ["-c", source, target], { stdio: "ignore" });
  } catch {
    fs.copyFileSync(source, target);
  }
  return true;
};
const backupDir = () => {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const target = `${to}.sync-backup-${stamp}`;
  try {
    execFileSync("cp", ["-Rc", to, target], { stdio: "ignore" });
  } catch {
    fs.cpSync(to, target, { recursive: true });
  }
  return target;
};

if (!fs.existsSync(path.join(from, "library.json"))) throw new Error(`No AI edition library at ${from}`);
if (!fs.existsSync(path.join(to, "library.json"))) throw new Error(`No Super edition library at ${to}`);
if (!apply) console.log(`[dry-run] ${from} -> ${to} (pass --apply to write)`);
if (fs.existsSync(markerFile) && !force) {
  console.log(`Already synced (${markerFile}); re-run with --force only if you know the stats merge is safe.`);
  process.exit(0);
}

/* ── covers ─────────────────────────────────────────────────────────────── */
const fromCovers = path.join(from, "covers");
const toCovers = path.join(to, "covers");
const rewriteCover = (coverPath) => {
  if (typeof coverPath !== "string" || !coverPath) return coverPath;
  if (!coverPath.startsWith(fromCovers + path.sep)) return coverPath;
  const target = path.join(toCovers, path.relative(fromCovers, coverPath));
  if (apply && copyFile(coverPath, target)) stats.copiedCovers += 1;
  return fs.existsSync(target) || apply ? target : coverPath;
};
if (apply) {
  fs.mkdirSync(toCovers, { recursive: true });
  for (const name of fs.readdirSync(fromCovers)) {
    const source = path.join(fromCovers, name);
    if (!fs.statSync(source).isFile()) continue;
    if (copyFile(source, path.join(toCovers, name))) stats.copiedCovers += 1;
  }
}

/* ── library ────────────────────────────────────────────────────────────── */
const aiLibrary = readJson(path.join(from, "library.json"));
const superLibrary = readJson(path.join(to, "library.json"));
const aiTracks = new Map((aiLibrary.tracks ?? []).map((track) => [track.id, track]));
const superTracks = new Map((superLibrary.tracks ?? []).map((track) => [track.id, track]));

const mergeTrack = (superTrack, aiTrack) => {
  const merged = { ...superTrack };
  // The AI edition kept the edited metadata (titles, years, ratings, blocks,
  // NetEase ids, covers); when it has a real value it wins over Super's default.
  for (const field of ["title", "artist", "album", "genre", "block", "note", "rating", "year", "neteaseId", "qqId", "lyricsOverride", "coverPath", "sampleRate", "bitDepth", "channels", "codec"]) {
    if (!isDefault(aiTrack[field])) merged[field] = aiTrack[field];
  }
  merged.coverPath = rewriteCover(merged.coverPath);
  merged.playCount = Math.max(superTrack.playCount ?? 0, aiTrack.playCount ?? 0);
  const added = [superTrack.addedAt, aiTrack.addedAt].filter((value) => typeof value === "number" && value > 0);
  merged.addedAt = added.length ? Math.min(...added) : (superTrack.addedAt ?? 0);
  const overrides = new Set([...(superTrack.metadataOverrides ?? []), ...(aiTrack.metadataOverrides ?? [])]);
  if (overrides.size) merged.metadataOverrides = [...overrides];
  if (isDefault(merged.duration) && !isDefault(aiTrack.duration)) merged.duration = aiTrack.duration;
  if (isDefault(merged.fileSize) && !isDefault(aiTrack.fileSize)) merged.fileSize = aiTrack.fileSize;
  return merged;
};

const mergedTracks = [];
for (const track of superLibrary.tracks ?? []) {
  const aiTrack = aiTracks.get(track.id);
  if (aiTrack) {
    mergedTracks.push(mergeTrack(track, aiTrack));
    stats.mergedTracks += 1;
  } else {
    mergedTracks.push(track);
  }
}
for (const aiTrack of aiLibrary.tracks ?? []) {
  if (!superTracks.has(aiTrack.id)) {
    const copy = { ...aiTrack, coverPath: rewriteCover(aiTrack.coverPath) };
    mergedTracks.push(copy);
    stats.addedTracks += 1;
  }
}

const trackIds = new Set(mergedTracks.map((track) => track.id));
const favorites = [...(superLibrary.favorites ?? [])];
const favoriteSeen = new Set(favorites);
for (const id of aiLibrary.favorites ?? []) {
  if (trackIds.has(id) && !favoriteSeen.has(id)) {
    favorites.push(id);
    favoriteSeen.add(id);
    stats.addedFavorites += 1;
  }
}

const aiPlaylists = new Map((aiLibrary.playlists ?? []).map((playlist) => [playlist.id, playlist]));
const playlists = (superLibrary.playlists ?? []).map((playlist) => {
  const aiPlaylist = aiPlaylists.get(playlist.id);
  if (!aiPlaylist) return playlist;
  stats.mergedPlaylists += 1;
  const ids = [...(playlist.trackIds ?? [])];
  const seen = new Set(ids);
  for (const id of aiPlaylist.trackIds ?? []) {
    if (!seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }
  return { ...playlist, name: playlist.name || aiPlaylist.name, trackIds: ids };
});
const playlistIds = new Set(playlists.map((playlist) => playlist.id));
for (const aiPlaylist of aiLibrary.playlists ?? []) {
  if (!playlistIds.has(aiPlaylist.id)) {
    playlists.push(aiPlaylist);
    stats.addedPlaylists += 1;
  }
}

const mergeTags = (superTags, aiTags) => {
  const merged = [];
  const seen = new Set();
  for (const tag of superTags ?? []) {
    merged.push(tag);
    seen.add(tag.name);
  }
  for (const tag of aiTags ?? []) {
    if (seen.has(tag.name)) continue;
    merged.push(tag);
    seen.add(tag.name);
  }
  return merged;
};

const mergedLibrary = {
  ...superLibrary,
  tracks: mergedTracks,
  favorites,
  playlists,
  blocks: mergeTags(superLibrary.blocks, aiLibrary.blocks),
  genres: mergeTags(superLibrary.genres, aiLibrary.genres),
  schemaVersion: Math.max(superLibrary.schemaVersion ?? 0, aiLibrary.schemaVersion ?? 0),
};

/* ── stats ──────────────────────────────────────────────────────────────── */
// Days up to the AI-edition migration (2026-11-12) are the same imported
// history in both files, so take the max there. Later days were recorded by
// each edition separately (the user listened in both), so sum them.
const aiStats = readJson(path.join(from, "stats.json"), null);
const superStats = readJson(path.join(to, "stats.json"), null);
const mergeStats = () => {
  if (!aiStats || !superStats) return superStats;
  const days = { ...(superStats.days ?? {}) };
  for (const [date, aiDay] of Object.entries(aiStats.days ?? {})) {
    const superDay = days[date];
    if (!superDay) {
      days[date] = aiDay;
      continue;
    }
    stats.mergedDays += 1;
    const sum = date >= "2026-11-13";
    const hours = Array.from({ length: 24 }, (_, index) => {
      const a = aiDay.hours?.[index] ?? 0;
      const s = superDay.hours?.[index] ?? 0;
      return sum ? a + s : Math.max(a, s);
    });
    days[date] = {
      seconds: sum ? (aiDay.seconds ?? 0) + (superDay.seconds ?? 0) : Math.max(aiDay.seconds ?? 0, superDay.seconds ?? 0),
      plays: sum ? (aiDay.plays ?? 0) + (superDay.plays ?? 0) : Math.max(aiDay.plays ?? 0, superDay.plays ?? 0),
      hours,
    };
  }
  const tracks = { ...(superStats.tracks ?? {}) };
  for (const [id, aiTrack] of Object.entries(aiStats.tracks ?? {})) {
    const superTrack = tracks[id];
    tracks[id] = superTrack
      ? {
          ...superTrack,
          title: superTrack.title || aiTrack.title,
          artist: superTrack.artist || aiTrack.artist,
          seconds: Math.max(superTrack.seconds ?? 0, aiTrack.seconds ?? 0),
          plays: Math.max(superTrack.plays ?? 0, aiTrack.plays ?? 0),
          lastPlayedAt: Math.max(superTrack.lastPlayedAt ?? 0, aiTrack.lastPlayedAt ?? 0),
        }
      : aiTrack;
  }
  return { ...superStats, days, tracks };
};

/* ── NetEase bindings ───────────────────────────────────────────────────── */
const aiBindings = readJson(path.join(from, "netease_bindings.json"), {}) ?? {};
const superBindings = readJson(path.join(to, "netease_bindings.json"), {}) ?? {};
const mergedBindings = { ...superBindings };
for (const [key, aiBinding] of Object.entries(aiBindings)) {
  const superBinding = mergedBindings[key];
  if (!superBinding) {
    mergedBindings[key] = { ...aiBinding, ...(aiBinding.coverPath ? { coverPath: rewriteCover(aiBinding.coverPath) } : {}) };
    stats.addedBindings += 1;
    continue;
  }
  stats.mergedBindings += 1;
  const merged = { ...superBinding };
  for (const [field, value] of Object.entries(aiBinding)) {
    if (isDefault(value)) continue;
    if (field === "coverPath") merged.coverPath = rewriteCover(value);
    else if (isDefault(merged[field]) || field === "neteaseId" || field === "album" || field === "year") merged[field] = value;
  }
  mergedBindings[key] = merged;
}

/* ── aliases ────────────────────────────────────────────────────────────── */
const aiAliases = readJson(path.join(from, "netease_aliases.json"), null);
const superAliases = readJson(path.join(to, "netease_aliases.json"), null);
const mergedAliases = aiAliases || superAliases
  ? {
      syncedAt: Math.max(aiAliases?.syncedAt ?? 0, superAliases?.syncedAt ?? 0),
      aliases: { ...(superAliases?.aliases ?? {}), ...(aiAliases?.aliases ?? {}) },
    }
  : null;

/* ── EQ: union per-song presets, keep Super's global state ──────────────── */
const aiEq = readJson(path.join(from, "eq.json"), null);
const superEq = readJson(path.join(to, "eq.json"), null);
const mergeEq = () => {
  if (!aiEq || !superEq) return superEq;
  const songs = { ...(superEq.songs ?? {}) };
  for (const [id, preset] of Object.entries(aiEq.songs ?? {})) {
    if (!songs[id]) {
      songs[id] = preset;
      stats.mergedEquSongs += 1;
    }
  }
  return { ...superEq, songs };
};

/* ── AI conversations / memory / settings ───────────────────────────────── */
const aiConversations = readJson(path.join(from, "ai-conversations.json"), null);
const superConversations = readJson(path.join(to, "ai-conversations.json"), null);
const mergeConversations = () => {
  const aiList = aiConversations?.conversations ?? [];
  const superList = superConversations?.conversations ?? [];
  const byId = new Map();
  for (const conversation of superList) byId.set(conversation.id, conversation);
  for (const conversation of aiList) {
    const existing = byId.get(conversation.id);
    if (!existing) {
      byId.set(conversation.id, conversation);
      stats.addedConversations += 1;
    } else if ((conversation.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      byId.set(conversation.id, conversation);
    }
  }
  const conversations = [...byId.values()].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
  return { version: Math.max(aiConversations?.version ?? 1, superConversations?.version ?? 1), conversations };
};
const aiMemory = readJson(path.join(from, "ai-memory.json"), null);
const superMemory = readJson(path.join(to, "ai-memory.json"), null);
const mergeMemory = () => {
  if (!aiMemory) return superMemory;
  if (!superMemory) return aiMemory;
  return {
    ...superMemory,
    songs: { ...(aiMemory.songs ?? {}), ...(superMemory.songs ?? {}) },
    profile: { ...(aiMemory.profile ?? {}), ...(superMemory.profile ?? {}) },
  };
};
const aiSettings = readJson(path.join(from, "ai-settings.json"), null);
const superSettings = readJson(path.join(to, "ai-settings.json"), null);

/* ── playlist sync: keep Super's bindings, add AI-only ones ─────────────── */
const aiSync = readJson(path.join(from, "playlist_sync.json"), null);
const superSync = readJson(path.join(to, "playlist_sync.json"), null);
const mergePlaylistSync = () => {
  if (!Array.isArray(superSync)) return aiSync;
  if (!Array.isArray(aiSync)) return superSync;
  const key = (binding) => `${binding.accountId ?? ""}|${binding.cloudId ?? ""}|${binding.kind ?? ""}|${binding.target ?? ""}`;
  const seen = new Set(superSync.map(key));
  const merged = [...superSync];
  for (const binding of aiSync) {
    if (!seen.has(key(binding))) {
      merged.push(binding);
      seen.add(key(binding));
    }
  }
  return merged;
};

/* ── trash: copy AI-only files ──────────────────────────────────────────── */
const copyTrash = () => {
  const source = path.join(from, "trash");
  const target = path.join(to, "trash");
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    if (copyFile(path.join(source, name), path.join(target, name))) stats.copiedTrash += 1;
  }
};

/* ── cookie: newer wins ─────────────────────────────────────────────────── */
const copyCookie = () => {
  const source = path.join(from, "netease_cookie.txt");
  const target = path.join(to, "netease_cookie.txt");
  if (!fs.existsSync(source)) return false;
  const sourceTime = fs.statSync(source).mtimeMs;
  const targetTime = fs.existsSync(target) ? fs.statSync(target).mtimeMs : 0;
  if (sourceTime <= targetTime) return false;
  if (apply) fs.copyFileSync(source, target);
  return true;
};

/* ── apply ──────────────────────────────────────────────────────────────── */
const plan = {
  library: { mergedTracks: stats.mergedTracks, addedTracks: stats.addedTracks, favorites: [superLibrary.favorites?.length ?? 0, favorites.length], playlists: [superLibrary.playlists?.length ?? 0, playlists.length], blocks: [superLibrary.blocks?.length ?? 0, mergedLibrary.blocks.length], genres: [superLibrary.genres?.length ?? 0, mergedLibrary.genres.length] },
  stats: aiStats ? "merged (max before 2026-11-13, sum after)" : "kept Super",
  bindings: [Object.keys(superBindings).length, Object.keys(mergedBindings).length],
  aliases: mergedAliases ? Object.keys(mergedAliases.aliases).length : null,
  ai: { conversations: aiConversations ? [superConversations?.conversations?.length ?? 0, mergeConversations().conversations.length] : "kept Super", memory: aiMemory ? "merged" : "kept Super", settings: aiSettings ? (superSettings ? "kept Super (already exists)" : "copied AI") : "none" },
  eq: aiEq ? "union of per-song presets" : "kept Super",
  cookie: copyCookie() ? "updated from AI edition" : "kept Super",
  covers: stats.copiedCovers,
};

console.log(JSON.stringify(plan, null, 2));
if (!apply) {
  console.log("\n[dry-run] nothing written. Re-run with --apply to merge.");
  process.exit(0);
}

const backup = backupDir();
notes.push(`backup: ${backup}`);

writeJson(path.join(to, "library.json"), mergedLibrary);
if (aiStats) writeJson(path.join(to, "stats.json"), mergeStats());
writeJson(path.join(to, "netease_bindings.json"), mergedBindings);
if (mergedAliases) writeJson(path.join(to, "netease_aliases.json"), mergedAliases);
if (aiEq) writeJson(path.join(to, "eq.json"), mergeEq());
writeJson(path.join(to, "ai-conversations.json"), mergeConversations());
if (mergeMemory()) writeJson(path.join(to, "ai-memory.json"), mergeMemory());
if (aiSettings && !superSettings) fs.copyFileSync(path.join(from, "ai-settings.json"), path.join(to, "ai-settings.json"));
const mergedSync = mergePlaylistSync();
if (mergedSync) writeJson(path.join(to, "playlist_sync.json"), mergedSync);
copyTrash();

writeJson(markerFile, {
  version: 1,
  at: Date.now(),
  from,
  to,
  backup,
  report: "tmp/integration/data-sync-report.md",
});

const report = [
  "# 数据同步报告（AI 版 → 共用数据目录）",
  "",
  `- 时间: ${new Date().toISOString()}`,
  `- 来源目录: \`${from}\``,
  `- 目标目录（共用）: \`${to}\``,
  `- 备份: \`${backup}\``,
  "",
  "## 结果",
  "",
  `- 曲目: ${mergedTracks.length} 首（AI 侧逐字段补齐 ${stats.mergedTracks} 首，新增 ${stats.addedTracks} 首）`,
  `- 收藏: ${favorites.length} 首（新增 ${stats.addedFavorites}）`,
  `- 歌单: ${playlists.length} 个（合并 ${stats.mergedPlaylists}，新增 ${stats.addedPlaylists}）`,
  `- 统计: 合并 ${stats.mergedDays} 天；2026-11-13 起为两边相加，之前取较大值`,
  `- 网易云绑定: ${Object.keys(mergedBindings).length} 条（合并 ${stats.mergedBindings}，新增 ${stats.addedBindings}）`,
  `- 封面: 复制 ${stats.copiedCovers} 个；回收站文件 ${stats.copiedTrash} 个`,
  `- AI 会话: ${mergeConversations().conversations.length} 段；AI 记忆: ${mergeMemory() ? "已合并" : "无"}`,
  `- EQ 单曲预设: 合并 ${stats.mergedEquSongs} 条`,
  "",
  "## 说明",
  "",
  "- 曲目元数据以 AI 版为准（AI 版保留了更多年份 / 专辑 / 网易云 ID / 评分 / 封面与编辑记录），Super 版非空的字段保留。",
  "- 之后两个版本默认读取同一个数据目录；不要再同时运行两个版本。",
  "- DeepSeek API Key 仍由各自 Electron profile 的 safeStorage 加密，切换版本后可能需要重新输入一次。",
  "",
].join("\n");
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, report);
console.log(`\nMerged. Backup: ${backup}\nReport: ${reportFile}`);
