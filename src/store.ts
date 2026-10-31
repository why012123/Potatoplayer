import { create } from "zustand";
import type {
  Bootstrap,
  BulkAssignState,
  DownloadJob,
  LyricsPayload,
  OnlineSource,
  PlaybackState,
  Playlist,
  PlaylistImport,
  PromptState,
  ScanProgress,
  PlaybackEngineId,
  OutputMode,
  DownloadQuality,
  EngineAvailability,
  EngineCapabilities,
  Settings,
  Tag,
  DailyMix,
  TagKind,
  Toast,
  Theme,
  Track,
  TrackMenuState,
  View,
} from "@/types";
import { applyTheme, readTheme } from "@/lib/theme";
import {
  applyAppearance,
  loadAppearance,
  normalizeAppearance,
  presetFor,
  saveAppearance,
  type AppearancePreferences,
  type UiStyle,
} from "@/lib/appearance";
import type { Language, TextVars } from "@/lib/text";
import { pickText } from "@/lib/text";

export type SortMode = "title" | "artist" | "album" | "recent" | "plays" | "rating";
export type RightTab = "lyrics" | "queue";

interface EventEnvelope {
  event: string;
  data: unknown;
}

interface AppStore {
  initialized: boolean;
  loading: boolean;
  fatalError: string | null;
  version: string;
  dataDir: string;
  libraryRoot: string;
  tracks: Track[];
  favorites: string[];
  playlists: Playlist[];
  blocks: Tag[];
  genres: Tag[];
  settings: Settings | null;
  playbackEngine: PlaybackEngineId;
  outputMode: OutputMode;
  engines: Record<PlaybackEngineId, EngineAvailability> | null;
  engineCapabilities: EngineCapabilities | null;
  spatialEnabled: boolean;
  spatialX: number;
  spatialY: number;
  exclusive: boolean;
  crossfeedEnabled: boolean;
  crossfeedStrength: number;
  followSourceRate: boolean;
  vizBars: number[];
  dailyMix: DailyMix | null;
  playback: PlaybackState | null;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  viewHistory: View[];
  viewIndex: number;
  searchQuery: string;
  sortMode: SortMode;
  previewTrackId: string | null;
  lyrics: LyricsPayload | null;
  lyricsLoading: boolean;
  lyricsTrackId: string | null;
  rightPanelOpen: boolean;
  brief: boolean;
  immersive: boolean;
  eqOpen: boolean;
  mvTrackId: string | null;
  rightTab: RightTab;
  commandOpen: boolean;
  trackMenu: TrackMenuState | null;
  addToPlaylistTrackId: string | null;
  addToPlaylistTrackIds: string[];
  taxonomyManager: TagKind | null;
  bulkAssign: BulkAssignState | null;
  prompt: PromptState | null;
  reducedMotion: boolean;
  theme: Theme;
  appearance: AppearancePreferences;
  downloads: DownloadJob[];
  imports: PlaylistImport[];
  onlineSource: OnlineSource;
  downloadQuality: DownloadQuality;
  downloadPanelOpen: boolean;
  toasts: Toast[];

  initialize: () => Promise<void>;
  handleEvent: (envelope: EventEnvelope) => void;
  navigate: (view: View) => void;
  goBack: () => void;
  goForward: () => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setPreviewTrack: (id: string) => void;
  playTrack: (track: Track, queue?: string[], startAt?: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  cycleRepeat: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<void>;
  ensureLyrics: (trackId: string) => Promise<void>;
  rescan: () => Promise<void>;
  chooseLibrary: () => Promise<void>;
  createPlaylist: (name: string, trackId?: string) => Promise<Playlist | null>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  enqueue: (trackId: string, next: boolean) => Promise<void>;
  enqueueMany: (trackIds: string[], next: boolean) => Promise<void>;
  setRightPanelOpen: (open: boolean) => void;
  toggleBrief: () => void;
  setImmersive: (open: boolean) => void;
  setEqOpen: (open: boolean) => void;
  setMvTrackId: (id: string | null) => void;
  setRightTab: (tab: RightTab) => void;
  setCommandOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPlaybackEngine: (engine: PlaybackEngineId) => Promise<void>;
  setOutputMode: (mode: OutputMode) => Promise<void>;
  setSpatialEnabled: (enabled: boolean) => Promise<void>;
  setSpatialPosition: (x: number, y: number, persist: boolean) => void;
  setExclusiveOutput: (enabled: boolean) => Promise<void>;
  setCrossfeedEnabled: (enabled: boolean) => Promise<void>;
  setCrossfeedStrength: (strength: number, persist: boolean) => void;
  setFollowSourceRate: (enabled: boolean) => Promise<void>;
  setTrackMenu: (menu: TrackMenuState | null) => void;
  setAddToPlaylistTrackId: (id: string | null) => void;
  setAddToPlaylistTrackIds: (ids: string[]) => void;
  addManyToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  setTaxonomyManager: (kind: TagKind | null) => void;
  setBulkAssign: (value: BulkAssignState | null) => void;
  createTag: (kind: TagKind, name: string, color?: string) => Promise<void>;
  renameTag: (kind: TagKind, oldName: string, name: string) => Promise<void>;
  deleteTag: (kind: TagKind, name: string) => Promise<void>;
  setTagColor: (kind: TagKind, name: string, color: string) => Promise<void>;
  updateTrack: (
    trackId: string,
    patch: {
      block: string;
      genre: string;
      rating: number;
      note: string;
      neteaseId: string;
      qqId: string;
    },
  ) => Promise<boolean>;
  deleteTrack: (trackId: string) => Promise<boolean>;
  bulkUpdate: (trackIds: string[], field: TagKind, value: string) => Promise<void>;
  openPrompt: (prompt: PromptState) => void;
  closePrompt: () => void;
  setReducedMotion: (value: boolean) => void;
  refreshDailyMix: () => Promise<DailyMix | null>;
  setTheme: (value: Theme) => void;
  setAppearance: (patch: Partial<AppearancePreferences>) => void;
  setStylePreset: (style: UiStyle) => void;
  setLanguage: (language: Language) => void;
  resetAppearance: () => void;
  pushToast: (title: string, detail?: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  dismissDownload: (jobId: string) => void;
  setDownloadPanelOpen: (open: boolean) => void;
  setOnlineSource: (source: OnlineSource) => void;
  setDownloadQuality: (quality: DownloadQuality) => void;
  clearFinishedDownloads: () => void;
  retryDownload: (jobId: string) => Promise<void>;
  importNeteasePlaylist: (
    playlist: { name: string; tracks: Array<{ id: string; name: string; artists: string }> },
    quality?: string,
    block?: string,
    genre?: string,
  ) => Promise<void>;
  resolvePlaylistImports: () => Promise<void>;
  dismissImport: (id: string) => void;
}

const bridge = () => {
  if (!window.potato) throw new Error("The desktop bridge is not available.");
  return window.potato;
};

/** Localized strings for store-level toasts and status messages. */
function lx(en: string, zh: string, vars?: TextVars): string {
  return pickText(useAppStore.getState().appearance.language, en, zh, vars);
}

let subscribed = false;
let initializing = false;
let onlineWarmup: Promise<unknown> | null = null;

/**
 * Start both local online bridges once per launch. They are optional, so any
 * failure stays silent — the Discover page still offers a manual restart.
 */
function warmOnlineServices() {
  if (onlineWarmup) return onlineWarmup;
  onlineWarmup = Promise.allSettled([
    bridge().invoke("netease.startService"),
    bridge().invoke("qq.startService"),
  ]);
  return onlineWarmup;
}
let windowActive =
  typeof document === "undefined" ? true : document.visibilityState !== "hidden";
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    windowActive = true;
  });
  window.addEventListener("blur", () => {
    windowActive = false;
  });
  document.addEventListener("visibilitychange", () => {
    windowActive = document.visibilityState !== "hidden";
  });
  window.addEventListener("potato:window-focus", (event) => {
    windowActive = Boolean((event as CustomEvent<boolean>).detail);
  });
}
let toastSequence = 0;
let lyricsSequence = 0;
let volumeTimer: ReturnType<typeof setTimeout> | null = null;

type PendingImportEntry = {
  importId: string;
  playlistId: string;
  neteaseId: string;
  title: string;
  artist: string;
  path?: string;
};

let pendingImportEntries: PendingImportEntry[] = [];
let resolvingImports = false;

function normalizeImportText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(][^()（）]*[)）]/g, "")
    .replace(/\s+/g, "")
    .replace(/[·・\-—_/|,，.。'’"“”]/g, "")
    .trim();
}

function findImportedTrack(
  tracks: Track[],
  entry: { path?: string; title: string; artist: string },
  used: Set<string>,
): Track | undefined {
  if (entry.path) {
    const exact = tracks.find((track) => track.path === entry.path && !used.has(track.id));
    if (exact) return exact;
  }
  const title = normalizeImportText(entry.title);
  const artist = normalizeImportText(entry.artist);
  return tracks.find((track) => {
    if (used.has(track.id)) return false;
    if (normalizeImportText(track.title) !== title) return false;
    const localArtist = normalizeImportText(track.artist);
    return !artist || localArtist === artist || localArtist.includes(artist) || artist.includes(localArtist);
  });
}

function initialView(): View {
  const query = new URLSearchParams(window.location.search);
  const capture = query.get("view") ?? query.get("captureView");
  switch (capture) {
    case "songs":
      return { kind: "songs" };
    case "albums":
      return { kind: "albums" };
    case "artists":
      return { kind: "artists" };
    case "favorites":
      return { kind: "favorites" };
    case "collections":
      return { kind: "collections" };
    case "editor":
      return { kind: "editor" };
    case "discover":
      return { kind: "discover" };
    default:
      return { kind: "home" };
  }
}

function readOnlineSource(): OnlineSource {
  try {
    return localStorage.getItem("potato:online-source") === "qq" ? "qq" : "netease";
  } catch {
    return "netease";
  }
}

function readDownloadQuality(): DownloadQuality {
  try {
    const value = localStorage.getItem("potato:download-quality");
    return value === "standard" || value === "lossless" ? value : "high";
  } catch {
    return "high";
  }
}

function readReducedMotion(): boolean {
  try {
    return localStorage.getItem("potato:reduced-motion") === "1";
  } catch {
    return false;
  }
}

function readBrief(): boolean {
  try {
    return localStorage.getItem("potato:brief") === "1";
  } catch {
    return false;
  }
}

function readRightPanel(): boolean {
  try {
    return localStorage.getItem("potato:right-panel") !== "0";
  } catch {
    return true;
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "");
  }
  return String(error);
}

function pickPreview(
  tracks: Track[],
  favorites: string[],
  settings: Settings | null,
  playback: PlaybackState | null,
): string | null {
  if (playback?.trackId) return playback.trackId;
  if (settings?.lastTrackId && tracks.some((track) => track.id === settings.lastTrackId)) {
    return settings.lastTrackId;
  }
  const rated = [...tracks].sort((a, b) => b.rating - a.rating || b.playCount - a.playCount)[0];
  if (rated) return rated.id;
  return favorites[0] ?? tracks[0]?.id ?? null;
}

applyAppearance(loadAppearance());

const view = initialView();

export const useAppStore = create<AppStore>((set, get) => ({
  initialized: false,
  loading: true,
  fatalError: null,
  version: "s1.4.12",
  dataDir: "",
  libraryRoot: "",
  tracks: [],
  favorites: [],
  playlists: [],
  blocks: [],
  genres: [],
  settings: null,
  playbackEngine: "vlc",
  outputMode: "pcm",
  engines: null,
  engineCapabilities: null,
  spatialEnabled: false,
  spatialX: 0,
  spatialY: 0,
  exclusive: false,
  crossfeedEnabled: false,
  crossfeedStrength: 0.5,
  followSourceRate: true,
  vizBars: [],
  dailyMix: null,
  playback: null,
  scanning: false,
  scanProgress: null,
  viewHistory: [view],
  viewIndex: 0,
  searchQuery: "",
  sortMode: "title",
  previewTrackId: null,
  lyrics: null,
  lyricsLoading: false,
  lyricsTrackId: null,
  rightPanelOpen: readRightPanel(),
  brief: readBrief(),
  immersive: false,
  eqOpen: false,
  mvTrackId: null,
  rightTab: "lyrics",
  commandOpen: false,
  trackMenu: null,
  addToPlaylistTrackId: null,
  addToPlaylistTrackIds: [],
  taxonomyManager: null,
  bulkAssign: null,
  prompt: null,
  reducedMotion: readReducedMotion(),
  theme: readTheme(),
  appearance: loadAppearance(),
  downloads: [],
  imports: [],
  downloadPanelOpen: false,
  onlineSource: readOnlineSource(),
  downloadQuality: readDownloadQuality(),
  toasts: [],

  initialize: async () => {
    if (get().initialized || initializing) return;
    initializing = true;
    try {
      if (!subscribed && window.potato) {
        subscribed = true;
        window.potato.onEvent((event) => useAppStore.getState().handleEvent(event));
      }
      const data = await bridge().invoke<Bootstrap>("bootstrap");
      const preview = pickPreview(data.tracks, data.favorites, data.settings, data.playback);
      set({
        initialized: true,
        loading: false,
        fatalError: null,
        version: data.version,
        dataDir: data.dataDir,
        dailyMix: data.dailyMix ?? null,
        libraryRoot: data.libraryRoot ?? "",
        tracks: data.tracks,
        favorites: data.favorites,
        playlists: data.playlists,
        blocks: data.blocks ?? [],
        genres: data.genres ?? [],
        settings: data.settings,
        playbackEngine: data.settings?.playbackEngine ?? "vlc",
        outputMode: data.settings?.outputMode ?? "pcm",
        engines: data.engines ?? null,
        engineCapabilities: data.engineCapabilities ?? null,
        spatialEnabled: data.settings?.spatialEnabled ?? false,
        spatialX: data.settings?.spatialX ?? 0,
        spatialY: data.settings?.spatialY ?? 0,
        exclusive: data.settings?.exclusive ?? false,
        crossfeedEnabled: data.settings?.crossfeedEnabled ?? false,
        crossfeedStrength: data.settings?.crossfeedStrength ?? 0.5,
        followSourceRate: data.settings?.followSourceRate ?? true,
        playback: data.playback,
        previewTrackId: preview,
        scanning: Boolean(data.scanNeeded),
        scanProgress: data.scanNeeded ? { done: 0, total: data.tracks.length, phase: "preparing" } : null,
      });
      if (preview) void get().ensureLyrics(preview);
      void warmOnlineServices();
      if (data.scanNeeded) {
        set({ scanning: true });
        try {
          await bridge().invoke("library.scan");
        } catch (error) {
          set({ scanning: false });
          get().pushToast(lx("Could not scan your library", "无法扫描你的资料库"), friendlyError(error), "error");
        }
      }
    } catch (error) {
      initializing = false;
      set({
        initialized: true,
        loading: false,
        fatalError: friendlyError(error),
      });
    }
  },

  handleEvent: ({ event, data }) => {
    switch (event) {
      case "scan.started": {
        set({ scanning: true, scanProgress: { done: 0, total: get().tracks.length, phase: "preparing" } });
        break;
      }
      case "scan.progress": {
        set({ scanning: true, scanProgress: data as ScanProgress });
        break;
      }
      case "scan.done": {
        const payload = data as {
          tracks: Track[];
          favorites: string[];
          playlists: Playlist[];
          blocks?: Tag[];
          genres?: Tag[];
          scannedAt: number;
          legacyImport?: boolean;
        };
        const state = get();
        const preview = pickPreview(payload.tracks, payload.favorites, state.settings, state.playback);
        set({
          tracks: payload.tracks,
          favorites: payload.favorites,
          playlists: payload.playlists,
          blocks: payload.blocks ?? state.blocks,
          genres: payload.genres ?? state.genres,
          scanning: false,
          scanProgress: null,
          previewTrackId: payload.tracks.some((track) => track.id === state.previewTrackId)
            ? state.previewTrackId
            : preview,
        });
        if (state.previewTrackId) void get().ensureLyrics(state.previewTrackId);
        void get().refreshDailyMix();
        if (payload.legacyImport) {
          get().pushToast(lx("Library imported", "资料库已导入"), lx("{count} songs, covers and ratings from Potato Player.", "已从 Potato Player 导入 {count} 首歌曲、封面与评分。", { count: payload.tracks.length }), "success");
        } else {
          get().pushToast(lx("Library is ready", "资料库已就绪"), lx("{count} songs indexed.", "已索引 {count} 首歌曲。", { count: payload.tracks.length }), "success");
        }
        break;
      }
      case "scan.error": {
        const message = (data as { message?: string }).message ?? "Scan failed.";
        set({ scanning: false, scanProgress: null });
        get().pushToast(lx("Scan failed", "扫描失败"), message, "error");
        break;
      }
      case "engine.spectrum": {
        // A hidden player still receives 20 Hz spectrum packets. Drop them
        // instead of re-rendering the panel behind another app; the next
        // packet after focus restores the bars.
        if (!windowActive) break;
        const bars = (data as { bars?: number[] })?.bars;
        if (Array.isArray(bars)) set({ vizBars: bars });
        break;
      }
      case "playback.state": {
        const playback = data as PlaybackState;
        const previous = get().playback;
        set({ playback, ...(playback.playing ? {} : { vizBars: [] }) });
        if (playback.trackId && playback.trackId !== previous?.trackId) {
          set({ previewTrackId: playback.trackId });
          void get().ensureLyrics(playback.trackId);
        }
        break;
      }
      case "playback.time": {
        const patch = data as Pick<PlaybackState, "trackId" | "time" | "duration" | "playing">;
        const current = get().playback;
        if (!current) break;
        set({ playback: { ...current, ...patch } });
        break;
      }
      case "playback.track": {
        const payload = data as { trackId: string; state: PlaybackState };
        set({ playback: payload.state, previewTrackId: payload.trackId });
        void get().ensureLyrics(payload.trackId);
        break;
      }
      case "library.favorites": {
        set({ favorites: (data as { favorites: string[] }).favorites });
        break;
      }
      case "library.playlists": {
        set({ playlists: (data as { playlists: Playlist[] }).playlists });
        break;
      }
      case "taxonomy.updated": {
        const payload = data as { blocks: Tag[]; genres: Tag[] };
        set({ blocks: payload.blocks, genres: payload.genres });
        break;
      }
      case "library.tracks": {
        set({ tracks: (data as { tracks: Track[] }).tracks });
        void get().resolvePlaylistImports();
        break;
      }
      case "track.updated": {
        const updated = data as Track;
        set({ tracks: get().tracks.map((track) => (track.id === updated.id ? updated : track)) });
        break;
      }
      case "track.played": {
        const { trackId, playCount } = data as { trackId: string; playCount: number };
        set({ tracks: get().tracks.map((track) => (track.id === trackId ? { ...track, playCount } : track)) });
        break;
      }
      case "library.root": {
        const root = (data as { root: string }).root;
        set({
          libraryRoot: root,
          settings: get().settings ? { ...get().settings!, libraryRoot: root } : get().settings,
        });
        break;
      }
      case "toast": {
        const payload = data as { kind?: Toast["tone"]; title?: string; message: string };
        get().pushToast(
          payload.title ?? (payload.kind === "error" ? lx("Something went wrong", "出了点问题") : "Potatoplayer Super"),
          payload.message,
          payload.kind,
        );
        break;
      }
      case "download.progress": {
        const job = data as Partial<DownloadJob> & { jobId: string; downloaded: number; total: number; phase: string; source?: OnlineSource };
        const current = get().downloads.find((item) => item.jobId === job.jobId);
        const neteaseId = job.neteaseId ?? current?.neteaseId ?? "";
        const pendingImport = pendingImportEntries.find((entry) => entry.neteaseId === neteaseId);
        const next: DownloadJob = {
          jobId: job.jobId,
          neteaseId,
          title: job.title ?? current?.title ?? "NetEase song",
          artist: job.artist ?? current?.artist,
          path: job.path ?? current?.path,
          downloaded: job.downloaded,
          total: job.total,
          phase: job.phase,
          status: "running",
          importId: pendingImport?.importId ?? current?.importId,
          source: job.source ?? current?.source ?? get().onlineSource,
          createdAt: current?.createdAt ?? Date.now(),
        };
        set({
          downloads: current
            ? get().downloads.map((item) => (item.jobId === job.jobId ? next : item))
            : [...get().downloads, next],
        });
        break;
      }
      case "download.done": {
        const payload = data as {
          jobId: string;
          neteaseId?: string;
          title?: string;
          artist?: string;
          path?: string;
          duplicate?: boolean;
          updated?: boolean;
          block?: string;
          genre?: string;
          source?: OnlineSource;
        };
        const current = get().downloads.find((item) => item.jobId === payload.jobId);
        const neteaseId = payload.neteaseId ?? current?.neteaseId ?? "";
        const title = `${payload.artist ?? ""}${payload.artist ? " — " : ""}${payload.title ?? "Song"}`;
        const pendingImport = pendingImportEntries.find((entry) => entry.neteaseId === neteaseId);
        const next: DownloadJob = {
          jobId: payload.jobId,
          neteaseId,
          title,
          artist: payload.artist,
          path: payload.path,
          downloaded: current?.downloaded ?? 0,
          total: current?.total ?? 0,
          phase: "done",
          status: "done",
          importId: pendingImport?.importId ?? current?.importId,
          source: payload.source ?? current?.source ?? get().onlineSource,
          duplicate: payload.duplicate ?? current?.duplicate,
          updated: payload.updated ?? current?.updated,
          block: payload.block ?? current?.block,
          genre: payload.genre ?? current?.genre,
          createdAt: current?.createdAt ?? Date.now(),
        };
        set({
          downloads: current
            ? get().downloads.map((item) => (item.jobId === payload.jobId ? next : item))
            : [...get().downloads, next],
        });
        if (neteaseId) {
          for (const entry of pendingImportEntries) {
            if (entry.neteaseId === neteaseId && payload.path) entry.path = payload.path;
          }
        }
        if (!next.importId) {
          const label = `${payload.artist ?? ""}${payload.artist ? " — " : ""}${payload.title ?? ""}`;
          if (payload.duplicate) {
            get().pushToast(
              payload.updated ? lx("Song info updated", "歌曲信息已更新") : lx("Already in your library", "已存在于资料库"),
              payload.updated
                ? [label, [payload.block, payload.genre].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")
                : label,
              "success",
            );
          } else {
            get().pushToast(lx("Downloaded to your library", "已下载到资料库"), label, "success");
          }
        }
        void get().resolvePlaylistImports();
        break;
      }
      case "download.error": {
        const payload = data as { jobId: string; neteaseId?: string; message: string; source?: OnlineSource };
        const current = get().downloads.find((item) => item.jobId === payload.jobId);
        const neteaseId = payload.neteaseId ?? current?.neteaseId ?? "";
        const failedJob: DownloadJob = {
          jobId: payload.jobId,
          neteaseId,
          title: current?.title ?? "NetEase song",
          artist: current?.artist,
          path: current?.path,
          downloaded: current?.downloaded ?? 0,
          total: current?.total ?? 0,
          phase: "error",
          status: "error",
          message: payload.message,
          importId: current?.importId,
          source: payload.source ?? current?.source ?? get().onlineSource,
          createdAt: current?.createdAt ?? Date.now(),
        };
        set({
          downloads: current
            ? get().downloads.map((item) => (item.jobId === payload.jobId ? failedJob : item))
            : [...get().downloads, failedJob],
        });
        if (neteaseId) {
          const failedIds = new Set(
            pendingImportEntries.filter((entry) => entry.neteaseId === neteaseId).map((entry) => entry.importId),
          );
          pendingImportEntries = pendingImportEntries.filter((entry) => entry.neteaseId !== neteaseId);
          if (failedIds.size) {
            set({
              imports: get().imports.map((item) =>
                failedIds.has(item.id)
                  ? {
                      ...item,
                      failed: item.failed + 1,
                      queued: Math.max(0, item.queued - 1),
                      active: pendingImportEntries.some((entry) => entry.importId === item.id),
                    }
                  : item,
              ),
            });
          }
        }
        if (!current?.importId) get().pushToast(lx("Download failed", "下载失败"), payload.message, "error");
        break;
      }
      case "backend.fatal": {
        set({ fatalError: (data as { message: string }).message });
        break;
      }
      case "backend.error": {
        get().pushToast(lx("Backend error", "后台服务错误"), (data as { message: string }).message, "error");
        break;
      }
      default:
        break;
    }
  },

  navigate: (next) => {
    const { viewHistory, viewIndex } = get();
    const current = viewHistory[viewIndex];
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    const history = viewHistory.slice(0, viewIndex + 1);
    history.push(next);
    set({ viewHistory: history, viewIndex: history.length - 1, searchQuery: "" });
  },

  goBack: () => {
    const { viewIndex } = get();
    if (viewIndex > 0) set({ viewIndex: viewIndex - 1, searchQuery: "" });
  },

  goForward: () => {
    const { viewIndex, viewHistory } = get();
    if (viewIndex < viewHistory.length - 1) set({ viewIndex: viewIndex + 1, searchQuery: "" });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setPreviewTrack: (id) => {
    set({ previewTrackId: id });
    void get().ensureLyrics(id);
  },

  playTrack: async (track, queue, startAt = 0) => {
    set({ previewTrackId: track.id });
    void get().ensureLyrics(track.id);
    try {
      await bridge().invoke("playback.play", {
        trackId: track.id,
        queue: queue ?? [track.id],
        startAt,
      });
    } catch (error) {
      get().pushToast(lx("Could not play this track", "无法播放这首歌曲"), friendlyError(error), "error");
    }
  },

  togglePlay: async () => {
    const { playback, previewTrackId, tracks } = get();
    if (playback?.trackId) {
      try {
        await bridge().invoke("playback.toggle");
      } catch (error) {
        get().pushToast(lx("Playback unavailable", "播放暂不可用"), friendlyError(error), "error");
      }
      return;
    }
    const track = tracks.find((item) => item.id === previewTrackId) ?? tracks[0];
    if (!track) return;
    await get().playTrack(track, tracks.map((item) => item.id));
  },

  next: async () => {
    try {
      await bridge().invoke("playback.next");
    } catch (error) {
      get().pushToast(lx("Could not skip", "无法切歌"), friendlyError(error), "error");
    }
  },

  previous: async () => {
    try {
      await bridge().invoke("playback.previous");
    } catch (error) {
      get().pushToast(lx("Could not go back", "无法返回上一首"), friendlyError(error), "error");
    }
  },

  seek: (seconds) => {
    const current = get().playback;
    if (!current) return;
    set({ playback: { ...current, time: seconds } });
    void bridge().invoke("playback.seek", { seconds }).catch(() => undefined);
  },

  setVolume: (volume) => {
    const current = get().playback;
    if (!current) return;
    set({ playback: { ...current, volume, muted: volume === 0 ? current.muted : false } });
    if (volumeTimer) clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => {
      void bridge().invoke("playback.volume", { volume }).catch(() => undefined);
    }, 45);
  },

  setMuted: (muted) => {
    const current = get().playback;
    if (!current) return;
    set({ playback: { ...current, muted } });
    void bridge().invoke("playback.mute", { muted }).catch(() => undefined);
  },

  cycleRepeat: async () => {
    const current = get().playback;
    if (!current) return;
    const next = current.repeat === "off" ? "all" : current.repeat === "all" ? "one" : "off";
    set({ playback: { ...current, repeat: next } });
    try {
      await bridge().invoke("playback.repeat", { mode: next });
    } catch (error) {
      get().pushToast(lx("Could not change repeat", "无法更改循环模式"), friendlyError(error), "error");
    }
  },

  toggleShuffle: async () => {
    const current = get().playback;
    if (!current) return;
    const enabled = !current.shuffle;
    set({ playback: { ...current, shuffle: enabled } });
    try {
      await bridge().invoke("playback.shuffle", { enabled });
    } catch (error) {
      get().pushToast(lx("Could not change shuffle", "无法更改随机播放"), friendlyError(error), "error");
    }
  },

  toggleFavorite: async (trackId) => {
    const before = get().favorites;
    const exists = before.includes(trackId);
    set({ favorites: exists ? before.filter((id) => id !== trackId) : [...before, trackId] });
    try {
      await bridge().invoke("library.toggleFavorite", { trackId });
    } catch (error) {
      set({ favorites: before });
      get().pushToast(lx("Could not update favorite", "无法更新收藏"), friendlyError(error), "error");
    }
  },

  ensureLyrics: async (trackId) => {
    if (!trackId) return;
    if (get().lyricsTrackId === trackId && get().lyrics) return;
    const sequence = ++lyricsSequence;
    set({ lyricsLoading: true, lyricsTrackId: trackId, lyrics: null });
    try {
      const payload = await bridge().invoke<LyricsPayload>("lyrics.get", { trackId });
      if (sequence === lyricsSequence) set({ lyrics: payload, lyricsLoading: false });
    } catch {
      if (sequence === lyricsSequence) {
        set({ lyrics: { found: false, translated: false, lines: [] }, lyricsLoading: false });
      }
    }
  },

  rescan: async () => {
    if (get().scanning) return;
    set({ scanning: true, scanProgress: { done: 0, total: get().tracks.length, phase: "preparing" } });
    try {
      await bridge().invoke("library.scan");
    } catch (error) {
      set({ scanning: false, scanProgress: null });
      get().pushToast(lx("Scan failed", "扫描失败"), friendlyError(error), "error");
    }
  },

  chooseLibrary: async () => {
    try {
      const folder = await bridge().pickFolder();
      if (!folder) return;
      set({ scanning: true, scanProgress: { done: 0, total: 0, phase: "preparing" } });
      await bridge().invoke("library.setRoot", { path: folder });
    } catch (error) {
      set({ scanning: false, scanProgress: null });
      get().pushToast(lx("Could not open that folder", "无法打开该文件夹"), friendlyError(error), "error");
    }
  },

  createPlaylist: async (name, trackId) => {
    try {
      const result = await bridge().invoke<{ playlist: Playlist }>("playlist.create", { name });
      if (trackId) {
        await bridge().invoke("playlist.addTrack", { playlistId: result.playlist.id, trackId });
      }
      get().pushToast(lx("Playlist created", "歌单已创建"), result.playlist.name, "success");
      return result.playlist;
    } catch (error) {
      get().pushToast(lx("Could not create playlist", "无法创建歌单"), friendlyError(error), "error");
      return null;
    }
  },

  renamePlaylist: async (playlistId, name) => {
    try {
      await bridge().invoke("playlist.rename", { playlistId, name });
    } catch (error) {
      get().pushToast(lx("Could not rename playlist", "无法重命名歌单"), friendlyError(error), "error");
    }
  },

  deletePlaylist: async (playlistId) => {
    try {
      await bridge().invoke("playlist.delete", { playlistId });
      const { viewHistory, viewIndex } = get();
      const current = viewHistory[viewIndex];
      if (current.kind === "playlist" && current.id === playlistId) {
        get().navigate({ kind: "home" });
      }
    } catch (error) {
      get().pushToast(lx("Could not delete playlist", "无法删除歌单"), friendlyError(error), "error");
    }
  },

  enqueueMany: async (trackIds, next) => {
    const ids = [...new Set(trackIds.filter(Boolean))];
    if (!ids.length) return;
    try {
      await bridge().invoke("playback.enqueueMany", { trackIds: ids, next });
      get().pushToast(next ? lx("Playing next", "接下来播放") : lx("Added to queue", "已加入队列"), lx("{count} songs", "{count} 首歌曲", { count: ids.length }), "success");
    } catch (error) {
      get().pushToast(lx("Could not update queue", "无法更新播放队列"), friendlyError(error), "error");
    }
  },

  addToPlaylist: async (playlistId, trackId) => {
    try {
      await bridge().invoke("playlist.addTrack", { playlistId, trackId });
      const playlist = get().playlists.find((item) => item.id === playlistId);
      get().pushToast(lx("Added to playlist", "已加入歌单"), playlist?.name, "success");
    } catch (error) {
      get().pushToast(lx("Could not add to playlist", "无法加入歌单"), friendlyError(error), "error");
    }
  },

  addManyToPlaylist: async (playlistId, trackIds) => {
    const ids = [...new Set(trackIds.filter(Boolean))];
    if (!ids.length) return;
    try {
      await bridge().invoke("playlist.addTracks", { playlistId, trackIds: ids });
      const playlist = get().playlists.find((item) => item.id === playlistId);
      get().pushToast(lx("Added to playlist", "已加入歌单"), lx("{count} songs · {name}", "{count} 首歌曲 · {name}", { count: ids.length, name: playlist?.name ?? "" }), "success");
    } catch (error) {
      get().pushToast(lx("Could not add to playlist", "无法加入歌单"), friendlyError(error), "error");
    }
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    try {
      await bridge().invoke("playlist.removeTrack", { playlistId, trackId });
    } catch (error) {
      get().pushToast(lx("Could not remove song", "无法移除歌曲"), friendlyError(error), "error");
    }
  },

  enqueue: async (trackId, next) => {
    try {
      await bridge().invoke("playback.enqueue", { trackId, next });
      get().pushToast(next ? lx("Playing next", "接下来播放") : lx("Added to queue", "已加入队列"), undefined, "success");
    } catch (error) {
      get().pushToast(lx("Could not update queue", "无法更新播放队列"), friendlyError(error), "error");
    }
  },

  toggleBrief: () => {
    const next = !get().brief;
    set({ brief: next });
    try {
      localStorage.setItem("potato:brief", next ? "1" : "0");
    } catch {
      // Storage is optional.
    }
  },

  setRightPanelOpen: (open) => {
    set({ rightPanelOpen: open });
    try {
      localStorage.setItem("potato:right-panel", open ? "1" : "0");
    } catch {
      // Storage is optional.
    }
  },
  setImmersive: (open) => set({ immersive: open }),
  setEqOpen: (open) => set({ eqOpen: open }),
  setMvTrackId: (id) => set({ mvTrackId: id }),

  setRightTab: (tab) => set({ rightTab: tab }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setSettingsOpen: (open) => {
    if (open) { set({ searchQuery: "" }); get().navigate({ kind: "settings" }); }
    else if (get().viewHistory[get().viewIndex]?.kind === "settings") get().goBack();
  },

  setSpatialEnabled: async (enabled) => {
    const previous = get().spatialEnabled;
    set({ spatialEnabled: enabled });
    try {
      await bridge().invoke("settings.setSpatial", {
        enabled,
        x: get().spatialX,
        y: get().spatialY,
        persist: true,
      });
      set((state) => ({
        settings: state.settings ? { ...state.settings, spatialEnabled: enabled } : state.settings,
      }));
    } catch (error) {
      set({ spatialEnabled: previous });
      get().pushToast(lx("Could not change the sound field", "无法切换空间声场"), friendlyError(error), "error");
    }
  },

  setSpatialPosition: (x, y, persist) => {
    set({ spatialX: x, spatialY: y });
    void bridge()
      .invoke("settings.setSpatial", { enabled: get().spatialEnabled, x, y, persist })
      .then(() => {
        if (!persist) return;
        const state = get();
        if (state.settings) {
          set({ settings: { ...state.settings, spatialX: x, spatialY: y } });
        }
      })
      .catch(() => undefined);
  },

  setFollowSourceRate: async (enabled) => {
    const previous = get().followSourceRate;
    set({ followSourceRate: enabled });
    try {
      await bridge().invoke("settings.setFollowRate", { enabled });
      set((state) => ({
        settings: state.settings ? { ...state.settings, followSourceRate: enabled } : state.settings,
      }));
    } catch (error) {
      set({ followSourceRate: previous });
      get().pushToast(lx("Could not change rate following", "无法切换采样率跟随"), friendlyError(error), "error");
    }
  },

  setCrossfeedEnabled: async (enabled) => {
    const previous = get().crossfeedEnabled;
    set({ crossfeedEnabled: enabled });
    try {
      await bridge().invoke("settings.setCrossfeed", {
        enabled,
        strength: get().crossfeedStrength,
        persist: true,
      });
      set((state) => ({
        settings: state.settings ? { ...state.settings, crossfeedEnabled: enabled } : state.settings,
      }));
    } catch (error) {
      set({ crossfeedEnabled: previous });
      get().pushToast(lx("Could not change crossfeed", "无法切换交叉馈电"), friendlyError(error), "error");
    }
  },

  setCrossfeedStrength: (strength, persist) => {
    set({ crossfeedStrength: strength });
    void bridge()
      .invoke("settings.setCrossfeed", { enabled: get().crossfeedEnabled, strength, persist })
      .then(() => {
        if (!persist) return;
        const state = get();
        if (state.settings) set({ settings: { ...state.settings, crossfeedStrength: strength } });
      })
      .catch(() => undefined);
  },

  setExclusiveOutput: async (enabled) => {
    const previous = get().exclusive;
    set({ exclusive: enabled });
    try {
      await bridge().invoke("settings.setExclusive", { enabled });
      set((state) => ({ settings: state.settings ? { ...state.settings, exclusive: enabled } : state.settings }));
    } catch (error) {
      set({ exclusive: previous });
      get().pushToast(lx("Could not change exclusive mode", "无法切换独占模式"), friendlyError(error), "error");
    }
  },

  setOutputMode: async (mode) => {
    const previous = get().outputMode;
    set({ outputMode: mode });
    try {
      const result = await bridge().invoke<{ outputMode: OutputMode }>("settings.setOutputMode", { mode });
      const saved = result?.outputMode ?? mode;
      set((state) => ({
        outputMode: saved,
        settings: state.settings ? { ...state.settings, outputMode: saved } : state.settings,
      }));
      get().pushToast(
        lx("Output mode saved", "输出模式已保存"),
        lx("Applies on the next playback.", "下一次播放生效。"),
        "success",
      );
    } catch (error) {
      set({ outputMode: previous });
      get().pushToast(lx("Could not change output mode", "无法切换输出模式"), friendlyError(error), "error");
    }
  },

  setPlaybackEngine: async (engine) => {
    const previous = get().playbackEngine;
    set({ playbackEngine: engine });
    try {
      const result = await bridge().invoke<{ playbackEngine: PlaybackEngineId }>("settings.setEngine", { engine });
      const saved = result?.playbackEngine ?? engine;
      set((state) => ({
        playbackEngine: saved,
        settings: state.settings ? { ...state.settings, playbackEngine: saved } : state.settings,
      }));
      get().pushToast(
        lx("Playback engine saved", "播放引擎已保存"),
        lx("Restart Potatoplayer to apply.", "重启 Potatoplayer 后生效。"),
        "success",
      );
    } catch (error) {
      set({ playbackEngine: previous });
      get().pushToast(lx("Could not change engine", "无法切换引擎"), friendlyError(error), "error");
    }
  },
  setTrackMenu: (menu) => set({ trackMenu: menu }),
  setAddToPlaylistTrackId: (id) => set({ addToPlaylistTrackId: id, addToPlaylistTrackIds: [] }),
  setAddToPlaylistTrackIds: (ids) => set({ addToPlaylistTrackId: null, addToPlaylistTrackIds: ids }),
  setTaxonomyManager: (kind) => set({ taxonomyManager: kind }),
  setBulkAssign: (value) => set({ bulkAssign: value }),
  createTag: async (kind, name, color) => {
    try {
      await bridge().invoke("taxonomy.create", { kind, name, color: color ?? "" });
      get().pushToast(lx("Collection updated", "分类已更新"), lx("{name} added.", "已添加 {name}。", { name }), "success");
    } catch (error) {
      get().pushToast(lx("Could not create", "无法创建"), friendlyError(error), "error");
    }
  },
  renameTag: async (kind, oldName, name) => {
    try {
      await bridge().invoke("taxonomy.rename", { kind, oldName, name });
      const state = get();
      const current = state.viewHistory[state.viewIndex];
      if ((current.kind === "block" || current.kind === "genre") && current.kind === kind && current.name === oldName) {
        const history = [...state.viewHistory];
        history[state.viewIndex] = { kind, name } as View;
        set({ viewHistory: history });
      }
    } catch (error) {
      get().pushToast(lx("Could not rename", "无法重命名"), friendlyError(error), "error");
    }
  },
  deleteTag: async (kind, name) => {
    try {
      await bridge().invoke("taxonomy.delete", { kind, name });
      get().pushToast(lx("Collection removed", "分类已删除"), name, "success");
      const state = get();
      const current = state.viewHistory[state.viewIndex];
      if ((current.kind === "block" || current.kind === "genre") && current.kind === kind && current.name === name) {
        state.navigate({ kind: "collections" });
      }
    } catch (error) {
      get().pushToast(lx("Could not remove", "无法删除"), friendlyError(error), "error");
    }
  },
  setTagColor: async (kind, name, color) => {
    try {
      await bridge().invoke("taxonomy.color", { kind, name, color });
    } catch (error) {
      get().pushToast(lx("Could not update colour", "无法更新颜色"), friendlyError(error), "error");
    }
  },
  updateTrack: async (trackId, patch) => {
    try {
      await bridge().invoke("library.updateTrack", { trackId, ...patch });
      return true;
    } catch (error) {
      get().pushToast(lx("Could not update song", "无法更新歌曲"), friendlyError(error), "error");
      return false;
    }
  },

  deleteTrack: async (trackId) => {
    try {
      await bridge().invoke("library.deleteTrack", { trackId });
      const remaining = get().tracks.filter((track) => track.id !== trackId);
      set({
        tracks: remaining,
        favorites: get().favorites.filter((id) => id !== trackId),
        previewTrackId: get().previewTrackId === trackId ? remaining[0]?.id ?? null : get().previewTrackId,
      });
      get().pushToast(lx("Song deleted", "歌曲已删除"), lx("Removed from your library, playlists and queue.", "已从资料库、歌单与队列中移除。"), "success");
      return true;
    } catch (error) {
      get().pushToast(lx("Could not delete song", "无法删除歌曲"), friendlyError(error), "error");
      return false;
    }
  },
  bulkUpdate: async (trackIds, field, value) => {
    try {
      await bridge().invoke("library.bulkUpdate", { trackIds, field, value });
      get().pushToast(lx("Songs updated", "歌曲已更新"), lx("{count} songs moved.", "已移动 {count} 首歌曲。", { count: trackIds.length }), "success");
    } catch (error) {
      get().pushToast(lx("Could not update songs", "无法更新歌曲"), friendlyError(error), "error");
    }
  },
  openPrompt: (prompt) => set({ prompt }),
  closePrompt: () => set({ prompt: null }),

  refreshDailyMix: async () => {
    try {
      const mix = await bridge().invoke<DailyMix>("recommendations.refresh");
      set({ dailyMix: mix });
      return mix;
    } catch (error) {
      get().pushToast(lx("Could not refresh today’s mix", "无法刷新今日推荐"), friendlyError(error), "error");
      return null;
    }
  },

  setReducedMotion: (value) => {
    set({ reducedMotion: value });
    try {
      localStorage.setItem("potato:reduced-motion", value ? "1" : "0");
    } catch {
      // Storage is optional.
    }
  },

  setTheme: (value) => {
    set({ theme: value });
    applyTheme(value, true);
  },

  setAppearance: (patch) => {
    const next = normalizeAppearance({ ...get().appearance, ...patch });
    applyAppearance(next);
    saveAppearance(next);
    set({ appearance: next });
  },

  setStylePreset: (style) => {
    const preset = presetFor(style);
    get().setAppearance({ ...preset });
  },

  setLanguage: (language) => {
    get().setAppearance({ language });
  },

  resetAppearance: () => {
    const current = get().appearance;
    get().setAppearance({ ...presetFor("classic"), accent: "cover", language: current.language });
  },

  pushToast: (title, detail, tone = "default") => {
    const id = ++toastSequence;
    set({ toasts: [...get().toasts.slice(-2), { id, title, detail, tone }] });
    setTimeout(() => {
      set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
    }, 4200);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  dismissDownload: (jobId) => set({ downloads: get().downloads.filter((job) => job.jobId !== jobId) }),

  setDownloadPanelOpen: (open) => set({ downloadPanelOpen: open }),

  setOnlineSource: (source) => {
    set({ onlineSource: source });
    try {
      localStorage.setItem("potato:online-source", source);
    } catch {
      // Storage is optional.
    }
  },

  setDownloadQuality: (quality) => {
    set({ downloadQuality: quality });
    try {
      localStorage.setItem("potato:download-quality", quality);
    } catch {
      // Storage is optional.
    }
  },

  clearFinishedDownloads: () =>
    set({
      downloads: get().downloads.filter((job) => job.status === "running"),
      imports: get().imports.filter((item) => item.active),
    }),

  retryDownload: async (jobId) => {
    const job = get().downloads.find((item) => item.jobId === jobId);
    if (!job?.neteaseId) return;
    try {
      const source = job.source ?? "netease";
      const preferred = get().downloadQuality;
      const quality =
        source === "qq"
          ? preferred === "standard"
            ? "128"
            : preferred === "lossless"
              ? "flac"
              : "320"
          : preferred;
      const result = await bridge().invoke<{ jobId: string }>(`${source}.download`, {
        id: job.neteaseId,
        quality,
      });
      const refreshed: DownloadJob = {
        ...job,
        jobId: result.jobId,
        downloaded: 0,
        total: 0,
        status: "running",
        phase: "queued",
        message: undefined,
        path: undefined,
        createdAt: Date.now(),
      };
      set({
        downloads: [...get().downloads.filter((item) => item.jobId !== jobId), refreshed],
      });
      get().pushToast(lx("Retry queued", "已重新排队"), job.title);
    } catch (error) {
      get().pushToast(lx("Could not retry download", "无法重试下载"), friendlyError(error), "error");
    }
  },

  importNeteasePlaylist: async (source, quality = "high", block = "", genre = "") => {
    const songs = source.tracks.filter((song) => song?.id);
    if (!songs.length) {
      get().pushToast(lx("Nothing to import", "没有可导入的内容"), lx("This NetEase playlist is empty.", "这个网易云歌单是空的。"), "error");
      return;
    }
    const onlineSource = get().onlineSource;
    const playlist = await get().createPlaylist((source.name || "Online playlist").trim() || "Online playlist");
    if (!playlist) return;

    const importId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: PlaylistImport = {
      id: importId,
      playlistId: playlist.id,
      playlistName: playlist.name,
      total: songs.length,
      resolved: 0,
      queued: 0,
      failed: 0,
      active: true,
    };
    set({ imports: [record, ...get().imports.filter((item) => item.active)] });

    const bump = (patch: Partial<PlaylistImport>) =>
      set({
        imports: get().imports.map((item) => (item.id === importId ? { ...item, ...patch } : item)),
      });
    const currentRecord = () => get().imports.find((item) => item.id === importId);
    const used = new Set<string>();

    for (const song of songs) {
      const existing = findImportedTrack(get().tracks, { title: song.name, artist: song.artists }, used);
      if (existing) {
        used.add(existing.id);
        try {
          if (block || genre) {
            await bridge().invoke("library.updateTrack", {
              trackId: existing.id,
              block: block || existing.block,
              genre: genre || existing.genre,
              rating: existing.rating,
              note: existing.note,
              neteaseId: existing.neteaseId ?? "",
              qqId: existing.qqId ?? "",
            });
          }
          await bridge().invoke("playlist.addTrack", { playlistId: playlist.id, trackId: existing.id });
          bump({ resolved: (currentRecord()?.resolved ?? 0) + 1 });
        } catch {
          bump({ failed: (currentRecord()?.failed ?? 0) + 1 });
        }
        continue;
      }

      const entry: PendingImportEntry = {
        importId,
        playlistId: playlist.id,
        neteaseId: song.id,
        title: song.name,
        artist: song.artists,
      };
      pendingImportEntries.push(entry);
      try {
        const result = await bridge().invoke<{ jobId: string }>(`${onlineSource}.download`, {
          id: song.id,
          quality,
          block,
          genre,
        });
        if (!result?.jobId) {
          pendingImportEntries = pendingImportEntries.filter((item) => item !== entry);
          bump({ failed: (currentRecord()?.failed ?? 0) + 1 });
        } else {
          bump({ queued: (currentRecord()?.queued ?? 0) + 1 });
        }
      } catch {
        pendingImportEntries = pendingImportEntries.filter((item) => item !== entry);
        bump({ failed: (currentRecord()?.failed ?? 0) + 1 });
      }
    }

    const active = pendingImportEntries.some((entry) => entry.importId === importId);
    set({
      imports: get().imports.map((item) =>
        item.id === importId ? { ...item, active } : item,
      ),
    });
    const recordAfter = currentRecord() ?? record;
    get().pushToast(
      lx("NetEase playlist imported", "网易云歌单已导入"),
      active
        ? lx("{ready} ready · {queued} downloading · {failed} failed", "{ready} 首就绪 · {queued} 首下载中 · {failed} 首失败", {
            ready: recordAfter.resolved,
            queued: recordAfter.queued,
            failed: recordAfter.failed,
          })
        : lx("{ready} matched · {failed} failed", "{ready} 首已匹配 · {failed} 首失败", {
            ready: recordAfter.resolved,
            failed: recordAfter.failed,
          }),
      active || recordAfter.resolved ? "success" : "error",
    );
    if (active) void get().resolvePlaylistImports();
  },

  resolvePlaylistImports: async () => {
    if (resolvingImports || !pendingImportEntries.length) return;
    resolvingImports = true;
    const activeBefore = new Set(get().imports.filter((item) => item.active).map((item) => item.id));
    try {
      const entries = [...pendingImportEntries];
      for (const entry of entries) {
        const track = findImportedTrack(get().tracks, entry, new Set());
        if (!track) continue;
        pendingImportEntries = pendingImportEntries.filter((item) => item !== entry);
        let ok = true;
        try {
          await bridge().invoke("playlist.addTrack", { playlistId: entry.playlistId, trackId: track.id });
        } catch {
          ok = false;
        }
        set({
          imports: get().imports.map((item) =>
            item.id === entry.importId
              ? {
                  ...item,
                  resolved: item.resolved + (ok ? 1 : 0),
                  queued: Math.max(0, item.queued - 1),
                  failed: item.failed + (ok ? 0 : 1),
                  active: pendingImportEntries.some((other) => other.importId === item.id),
                }
              : item,
          ),
        });
      }
    } finally {
      resolvingImports = false;
      const activeIds = new Set(pendingImportEntries.map((entry) => entry.importId));
      if (get().imports.some((item) => item.active && !activeIds.has(item.id))) {
        set({
          imports: get().imports.map((item) => ({ ...item, active: activeIds.has(item.id) })),
        });
      }
      const finished = get().imports.filter((item) => activeBefore.has(item.id) && !item.active);
      for (const item of finished) {
        get().pushToast(
          lx("Playlist import complete", "歌单导入完成"),
          item.failed
            ? lx("{name} · {ready} songs ready · {failed} failed", "{name} · {ready} 首歌曲就绪 · {failed} 首失败", {
                name: item.playlistName,
                ready: item.resolved,
                failed: item.failed,
              })
            : lx("{name} · {ready} songs ready", "{name} · {ready} 首歌曲就绪", {
                name: item.playlistName,
                ready: item.resolved,
              }),
          item.failed ? "default" : "success",
        );
      }
    }
  },

  dismissImport: (id) => {
    const removed = get().imports.find((item) => item.id === id);
    if (removed) pendingImportEntries = pendingImportEntries.filter((entry) => entry.importId !== id);
    set({ imports: get().imports.filter((item) => item.id !== id) });
  },
}));

export function currentView(): View {
  const { viewHistory, viewIndex } = useAppStore.getState();
  return viewHistory[viewIndex] ?? { kind: "home" };
}

export function displayTrack(): Track | undefined {
  const state = useAppStore.getState();
  const id = state.playback?.trackId ?? state.previewTrackId;
  return state.tracks.find((track) => track.id === id);
}

export function viewKey(view: View): string {
  switch (view.kind) {
    case "playlist":
      return `playlist:${view.id}`;
    case "album":
      return `album:${view.key}`;
    case "artist":
      return `artist:${view.name}`;
    case "editor":
      return `editor:${view.trackId ?? ""}`;
    case "block":
      return `block:${view.name}`;
    case "genre":
      return `genre:${view.name}`;
    default:
      return view.kind;
  }
}

export function useFavoriteSet(): Set<string> {
  return new Set(useAppStore((state) => state.favorites));
}
