import "./ultra.css";
import type { Bootstrap, PlaybackState, Track } from "@/types";
import { coverGradient, coverUrl } from "@/lib/covers";
import { formatDuration, buildColumns, fileNumber, type UltraColumn } from "./columns";
import { ArchiveScene, ARCHIVE_ROWS, type SceneSelection } from "./scene";

declare global {
  interface Window {
    __ultra?: { open: () => void; close: () => void };
  }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing Ultra element: ${id}`);
  return node as T;
};

const sceneHost = $<HTMLDivElement>("scene-host");
const loading = $<HTMLDivElement>("loading");
const loadingDetail = $<HTMLSpanElement>("loading-detail");
const boot = $<HTMLDivElement>("boot");
const bootLog = $<HTMLDivElement>("boot-log");
const detail = $<HTMLElement>("detail");
const detailCover = $<HTMLDivElement>("detail-cover");
const detailEyebrow = $<HTMLDivElement>("detail-eyebrow");
const detailTitle = $<HTMLHeadingElement>("detail-title");
const detailArtist = $<HTMLParagraphElement>("detail-artist");
const detailMeta = $<HTMLDivElement>("detail-meta");
const detailNote = $<HTMLParagraphElement>("detail-note");
const detailFoot = $<HTMLDivElement>("detail-foot");
const playButton = $<HTMLButtonElement>("detail-play");
const nextButton = $<HTMLButtonElement>("detail-next");
const favoriteButton = $<HTMLButtonElement>("detail-fav");
const closeButton = $<HTMLButtonElement>("detail-close");
const fileCount = $<HTMLSpanElement>("file-count");
const blockCount = $<HTMLSpanElement>("block-count");
const currentBlock = $<HTMLElement>("current-block");
const position = $<HTMLDivElement>("position");
const hoverLabel = $<HTMLDivElement>("hover-label");
const toastEl = $<HTMLDivElement>("toast");
const search = $<HTMLInputElement>("search");

let data: Bootstrap;
let tracks: Track[] = [];
let columns: UltraColumn[] = [];
let starts: number[] = [];
let rowMemory: number[] = [];
let selection: SceneSelection = { col: 0, row: 0 };
let favorites = new Set<string>();
let playingId: string | null = null;
let playing = false;
let detailTrack: Track | null = null;
let detailOpen = false;
let scene: ArchiveScene | null = null;
let bootVisible = true;
let query = "";
let searchTimer: number | undefined;
let toastTimer: number | undefined;

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const skipBoot = new URLSearchParams(location.search).has("skipBoot") || reducedMotion;

function selectedColumn(): UltraColumn | undefined {
  return columns[selection.col];
}

function selectedTrack(): Track | undefined {
  const column = selectedColumn();
  return column?.tracks[selection.row];
}

function selectedAbsoluteIndex(): number {
  const column = selectedColumn();
  return column ? selection.row : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureStarts() {
  starts = columns.map((column, index) => {
    const remembered = index === selection.col ? selection.row : rowMemory[index] ?? 0;
    const maxStart = Math.max(0, column.tracks.length - ARCHIVE_ROWS);
    return clamp(remembered - Math.floor(ARCHIVE_ROWS / 2), 0, maxStart);
  });
}

function refreshScene() {
  if (!scene) return;
  ensureStarts();
  scene.update(columns, starts, selection, playingId, favorites);
}

function refreshHud() {
  const column = selectedColumn();
  const track = selectedTrack();
  const count = columns.reduce((total, item) => total + item.tracks.length, 0);
  fileCount.textContent = `${count} FILES`;
  blockCount.textContent = `${columns.length} BLOCKS`;
  currentBlock.textContent = column ? column.label : "NO FILES";
  if (column && track) {
    const index = selectedAbsoluteIndex();
    position.textContent = `FILE ${fileNumber(index)} / ${String(column.tracks.length).padStart(3, "0")} · ${formatDuration(track.duration)}`;
  } else {
    position.textContent = "—";
  }
}

function refreshDetail() {
  const track = detailTrack;
  if (!track) return;
  const column = columns.find((item) => item.tracks.includes(track));
  const index = column ? column.tracks.indexOf(track) : 0;
  detailEyebrow.textContent = `FILE ${fileNumber(index)} / ${(column?.label ?? track.block ?? "ARCHIVE").toUpperCase()}`;
  detailTitle.textContent = track.title || "Untitled";
  detailArtist.textContent = track.artist || "Unknown artist";
  detailNote.textContent = track.note || "";
  if (track.coverPath) {
    detailCover.style.backgroundImage = `url("${coverUrl(track.coverPath)}")`;
    detailCover.style.backgroundColor = "#d9d0c5";
  } else {
    detailCover.style.backgroundImage = coverGradient(track.id);
    detailCover.style.backgroundColor = "#d9d0c5";
  }

  const meta: Array<[string, string]> = [
    ["BLOCK", track.block || "UNFILED"],
    ["GENRE", track.genre || "—"],
    ["RATING", track.rating ? track.rating.toFixed(1) : "—"],
    ["PLAYS", String(track.playCount || 0)],
    ["LENGTH", formatDuration(track.duration)],
    ["FORMAT", (track.path.split(".").pop() || "—").toUpperCase()],
  ];
  detailMeta.replaceChildren(
    ...meta.flatMap(([label, value]) => {
      const row = document.createElement("div");
      const key = document.createElement("span");
      key.textContent = label;
      const strong = document.createElement("strong");
      strong.textContent = value;
      row.append(key, strong);
      return [row];
    }),
  );

  detailFoot.textContent = `${track.neteaseId ? `NETEASE ${track.neteaseId}` : track.qqId ? `QQ ${track.qqId}` : "LOCAL FILE"} · ${track.path}`;
  updatePlayButton();
  favoriteButton.classList.toggle("is-active", favorites.has(track.id));
  favoriteButton.textContent = favorites.has(track.id) ? "SAVED" : "SAVE";
}

function updatePlayButton() {
  const track = detailTrack;
  if (!track) return;
  if (playingId === track.id) playButton.textContent = playing ? "PAUSE FILE" : "RESUME FILE";
  else playButton.textContent = "PLAY FILE";
}

function openDetail(track: Track, autoplay: boolean) {
  detailTrack = track;
  detailOpen = true;
  detail.classList.add("is-open");
  detail.setAttribute("aria-hidden", "false");
  refreshDetail();
  if (autoplay) {
    if (playingId === track.id) {
      if (!playing) void togglePlayback();
    } else {
      void playTrack(track);
    }
  }
}

function closeDetail() {
  detailOpen = false;
  detail.classList.remove("is-open");
  detail.setAttribute("aria-hidden", "true");
}

async function playTrack(track: Track) {
  const column = selectedColumn();
  const queue = column?.tracks.map((item) => item.id) ?? [track.id];
  playingId = track.id;
  playing = true;
  updatePlayButton();
  refreshScene();
  try {
    await window.potato.invoke("playback.play", { trackId: track.id, queue, startAt: 0 });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function togglePlayback() {
  try {
    await window.potato.invoke("playback.toggle");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function playNext() {
  if (!detailTrack) return;
  try {
    await window.potato.invoke("playback.enqueue", { trackId: detailTrack.id, next: true });
    toast(`QUEUED NEXT · ${detailTrack.title}`);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function toggleFavorite() {
  if (!detailTrack) return;
  const track = detailTrack;
  const exists = favorites.has(track.id);
  if (exists) favorites.delete(track.id);
  else favorites.add(track.id);
  favoriteButton.classList.toggle("is-active", !exists);
  favoriteButton.textContent = exists ? "SAVE" : "SAVED";
  refreshScene();
  try {
    await window.potato.invoke("library.toggleFavorite", { trackId: track.id });
  } catch (error) {
    if (exists) favorites.add(track.id);
    else favorites.delete(track.id);
    refreshScene();
    toast(error instanceof Error ? error.message : String(error));
  }
}

function select(col: number, row: number) {
  if (!columns.length) return;
  const nextCol = clamp(col, 0, columns.length - 1);
  const column = columns[nextCol];
  if (!column.tracks.length) return;
  selection = { col: nextCol, row: clamp(row, 0, column.tracks.length - 1) };
  rowMemory[nextCol] = selection.row;
  refreshScene();
  refreshHud();
  if (detailOpen) {
    const track = selectedTrack();
    if (track) {
      detailTrack = track;
      refreshDetail();
    }
  }
}

function applyFilter(nextQuery: string) {
  query = nextQuery;
  const previousId = selectedTrack()?.id;
  const nextColumns = buildColumns(tracks, data.blocks, query);
  columns = nextColumns.slice(0, 12);
  rowMemory = columns.map(() => 0);
  selection = { col: 0, row: 0 };
  if (previousId) {
    for (let col = 0; col < columns.length; col += 1) {
      const row = columns[col].tracks.findIndex((track) => track.id === previousId);
      if (row >= 0) {
        selection = { col, row };
        break;
      }
    }
  }
  refreshScene();
  refreshHud();
  if (detailOpen) {
    const track = selectedTrack();
    if (track) {
      detailTrack = track;
      refreshDetail();
    } else {
      closeDetail();
    }
  }
  if (!columns.length) toast("NO MATCHING FILES");
}

function startBoot() {
  if (skipBoot) {
    bootVisible = false;
    boot.classList.add("is-done");
    return;
  }
  const lines = [
    "ARCHIVE LINK ........ <b>OK</b>",
    `${tracks.length} FILES / ${data.blocks.length} BLOCKS`,
    "OPTICAL ARRAY ....... <b>READY</b>",
    "WELCOME, ARCHIVIST.",
  ];
  lines.forEach((line, index) => {
    window.setTimeout(() => {
      if (!bootVisible) return;
      const row = document.createElement("div");
      row.innerHTML = line;
      bootLog.appendChild(row);
    }, 160 + index * 330);
  });
  window.setTimeout(() => dismissBoot(), 2600);
}

function dismissBoot() {
  if (!bootVisible) return;
  bootVisible = false;
  boot.classList.add("is-done");
}

function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), 2400);
}

function loadCover(path: string): Promise<HTMLImageElement | null> {
  return window.potato.coverData(path).then(
    (url) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        if (!url) return resolve(null);
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
      }),
  );
}

async function init() {
  try {
    data = await window.potato.invoke<Bootstrap>("bootstrap");
    tracks = data.tracks;
    favorites = new Set(data.favorites);
    playingId = data.playback?.trackId ?? null;
    playing = Boolean(data.playback?.playing);
    columns = buildColumns(tracks, data.blocks ?? [], "").slice(0, 12);
    refreshHud();

    scene = new ArchiveScene(
      sceneHost,
      {
        onHover: (track, x, y) => {
          if (!track) {
            hoverLabel.classList.remove("is-visible");
            return;
          }
          hoverLabel.textContent = `${track.title} — ${track.artist}`;
          const rect = sceneHost.getBoundingClientRect();
          hoverLabel.style.left = `${clamp(x + 14, 8, window.innerWidth - 300)}px`;
          hoverLabel.style.top = `${clamp(y - rect.top, 12, rect.height - 12)}px`;
          hoverLabel.classList.add("is-visible");
        },
        onSelect: (next) => select(next.col, next.row),
        onOpen: (next) => {
          select(next.col, next.row);
          const track = selectedTrack();
          if (track) openDetail(track, true);
        },
      },
      loadCover,
    );
    refreshScene();
    loading.classList.add("is-done");

    startBoot();
    refreshHud();

    window.potato.onEvent((event) => {
      if (event.event === "playback.state") {
        const state = event.data as PlaybackState;
        playingId = state.trackId ?? null;
        playing = Boolean(state.playing);
        updatePlayButton();
        refreshScene();
      }
      if (event.event === "backend.fatal") {
        toast(String((event.data as { message?: string })?.message ?? "BACKEND STOPPED"));
      }
    });
  } catch (error) {
    loadingDetail.textContent = error instanceof Error ? error.message : String(error);
    loading.querySelector("strong")!.textContent = "ARCHIVE OFFLINE";
  }
}

// ── Input ─────────────────────────────────────────────────────────────────

window.addEventListener("keydown", (event) => {
  if (bootVisible) {
    if (event.key === "Enter" || event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      dismissBoot();
    }
    return;
  }

  const target = event.target as HTMLElement | null;
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;

  if (event.key === "Escape") {
    if (typing) {
      search.blur();
      search.value = "";
      applyFilter("");
      return;
    }
    if (detailOpen) closeDetail();
    return;
  }

  if (typing) {
    if (event.key === "Enter" && event.target === search) {
      event.preventDefault();
      search.blur();
      const track = selectedTrack();
      if (track) openDetail(track, true);
    }
    return;
  }

  if (event.key === "/") {
    event.preventDefault();
    search.focus();
    search.select();
    return;
  }

  if (!columns.length) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const col = (selection.col + direction + columns.length) % columns.length;
    select(col, rowMemory[col] ?? 0);
    return;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const column = selectedColumn();
    if (!column) return;
    const row = clamp(selection.row + direction, 0, column.tracks.length - 1);
    select(selection.col, row);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const track = selectedTrack();
    if (track) openDetail(track, true);
  }
});

boot.addEventListener("click", dismissBoot);

search.addEventListener("input", () => {
  const value = search.value;
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => applyFilter(value), 130);
});

playButton.addEventListener("click", () => {
  if (!detailTrack) return;
  if (playingId === detailTrack.id) void togglePlayback();
  else void playTrack(detailTrack);
});
nextButton.addEventListener("click", () => void playNext());
favoriteButton.addEventListener("click", () => void toggleFavorite());
closeButton.addEventListener("click", closeDetail);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hoverLabel.classList.remove("is-visible");
});

// Kept for the UI smoke test and for inspecting a real library without audio.
window.__ultra = {
  open: () => {
    const track = selectedTrack();
    if (track) openDetail(track, false);
  },
  close: closeDetail,
};

void init();
