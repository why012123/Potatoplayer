import { create } from "zustand";
import type {
  Bootstrap,
  BulkAssignState,
  DownloadJob,
  LyricsPayload,
  PlaybackState,
  Playlist,
  PromptState,
  ScanProgress,
  Settings,
  Tag,
  TagKind,
  Toast,
  Track,
  TrackMenuState,
  View,
} from "@/types";

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
  rightTab: RightTab;
  commandOpen: boolean;
  settingsOpen: boolean;
  trackMenu: TrackMenuState | null;
  addToPlaylistTrackId: string | null;
  taxonomyManager: TagKind | null;
  bulkAssign: BulkAssignState | null;
  prompt: PromptState | null;
  reducedMotion: boolean;
  downloads: DownloadJob[];
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
  setRightPanelOpen: (open: boolean) => void;
  setRightTab: (tab: RightTab) => void;
  setCommandOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setTrackMenu: (menu: TrackMenuState | null) => void;
  setAddToPlaylistTrackId: (id: string | null) => void;
  setTaxonomyManager: (kind: TagKind | null) => void;
  setBulkAssign: (value: BulkAssignState | null) => void;
  createTag: (kind: TagKind, name: string, color?: string) => Promise<void>;
  renameTag: (kind: TagKind, oldName: string, name: string) => Promise<void>;
  deleteTag: (kind: TagKind, name: string) => Promise<void>;
  setTagColor: (kind: TagKind, name: string, color: string) => Promise<void>;
  updateTrack: (
    trackId: string,
    patch: { block: string; genre: string; rating: number; note: string },
  ) => Promise<boolean>;
  bulkUpdate: (trackIds: string[], field: TagKind, value: string) => Promise<void>;
  openPrompt: (prompt: PromptState) => void;
  closePrompt: () => void;
  setReducedMotion: (value: boolean) => void;
  pushToast: (title: string, detail?: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  dismissDownload: (jobId: string) => void;
}

const bridge = () => {
  if (!window.potato) throw new Error("The desktop bridge is not available.");
  return window.potato;
};

let subscribed = false;
let initializing = false;
let toastSequence = 0;
let lyricsSequence = 0;
let volumeTimer: ReturnType<typeof setTimeout> | null = null;

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

function readReducedMotion(): boolean {
  try {
    return localStorage.getItem("potato:reduced-motion") === "1";
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

const view = initialView();

export const useAppStore = create<AppStore>((set, get) => ({
  initialized: false,
  loading: true,
  fatalError: null,
  version: "1.0.0",
  dataDir: "",
  libraryRoot: "",
  tracks: [],
  favorites: [],
  playlists: [],
  blocks: [],
  genres: [],
  settings: null,
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
  rightTab: "lyrics",
  commandOpen: false,
  settingsOpen: false,
  trackMenu: null,
  addToPlaylistTrackId: null,
  taxonomyManager: null,
  bulkAssign: null,
  prompt: null,
  reducedMotion: readReducedMotion(),
  downloads: [],
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
        libraryRoot: data.libraryRoot ?? "",
        tracks: data.tracks,
        favorites: data.favorites,
        playlists: data.playlists,
        blocks: data.blocks ?? [],
        genres: data.genres ?? [],
        settings: data.settings,
        playback: data.playback,
        previewTrackId: preview,
        scanning: Boolean(data.scanNeeded),
        scanProgress: data.scanNeeded ? { done: 0, total: data.tracks.length, phase: "preparing" } : null,
      });
      if (preview) void get().ensureLyrics(preview);
      if (data.scanNeeded) {
        set({ scanning: true });
        try {
          await bridge().invoke("library.scan");
        } catch (error) {
          set({ scanning: false });
          get().pushToast("Could not scan your library", friendlyError(error), "error");
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
        if (payload.legacyImport) {
          get().pushToast("Library imported", `${payload.tracks.length} songs, covers and ratings from Potato Player.`, "success");
        } else {
          get().pushToast("Library is ready", `${payload.tracks.length} songs indexed.`, "success");
        }
        break;
      }
      case "scan.error": {
        const message = (data as { message?: string }).message ?? "Scan failed.";
        set({ scanning: false, scanProgress: null });
        get().pushToast("Scan failed", message, "error");
        break;
      }
      case "playback.state": {
        const playback = data as PlaybackState;
        const previous = get().playback;
        set({ playback });
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
          payload.title ?? (payload.kind === "error" ? "Something went wrong" : "Potatoplayer Super"),
          payload.message,
          payload.kind,
        );
        break;
      }
      case "download.progress": {
        const job = data as Partial<DownloadJob> & { jobId: string; downloaded: number; total: number; phase: string };
        const current = get().downloads.find((item) => item.jobId === job.jobId);
        const next: DownloadJob = {
          jobId: job.jobId,
          neteaseId: job.neteaseId ?? current?.neteaseId ?? "",
          title: job.title ?? current?.title ?? "NetEase song",
          downloaded: job.downloaded,
          total: job.total,
          phase: job.phase,
          status: "running",
        };
        set({
          downloads: current
            ? get().downloads.map((item) => (item.jobId === job.jobId ? next : item))
            : [...get().downloads, next],
        });
        break;
      }
      case "download.done": {
        const payload = data as { jobId: string; title?: string; artist?: string; duplicate?: boolean };
        const current = get().downloads.find((item) => item.jobId === payload.jobId);
        const next: DownloadJob = {
          jobId: payload.jobId,
          neteaseId: current?.neteaseId ?? "",
          title: `${payload.artist ?? ""}${payload.artist ? " — " : ""}${payload.title ?? "Song"}`,
          downloaded: current?.downloaded ?? 0,
          total: current?.total ?? 0,
          phase: "done",
          status: "done",
        };
        set({
          downloads: current
            ? get().downloads.map((item) => (item.jobId === payload.jobId ? next : item))
            : [...get().downloads, next],
        });
        get().pushToast(
          payload.duplicate ? "Already in your library" : "Downloaded to your library",
          payload.duplicate ? payload.title : `${payload.artist ?? ""}${payload.artist ? " — " : ""}${payload.title ?? ""}`,
          "success",
        );
        setTimeout(() => get().dismissDownload(payload.jobId), 5000);
        break;
      }
      case "download.error": {
        const payload = data as { jobId: string; message: string };
        set({
          downloads: get().downloads.map((item) =>
            item.jobId === payload.jobId ? { ...item, status: "error", phase: "error", message: payload.message } : item,
          ),
        });
        get().pushToast("Download failed", payload.message, "error");
        setTimeout(() => get().dismissDownload(payload.jobId), 8000);
        break;
      }
      case "backend.fatal": {
        set({ fatalError: (data as { message: string }).message });
        break;
      }
      case "backend.error": {
        get().pushToast("Backend error", (data as { message: string }).message, "error");
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
      get().pushToast("Could not play this track", friendlyError(error), "error");
    }
  },

  togglePlay: async () => {
    const { playback, previewTrackId, tracks } = get();
    if (playback?.trackId) {
      try {
        await bridge().invoke("playback.toggle");
      } catch (error) {
        get().pushToast("Playback unavailable", friendlyError(error), "error");
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
      get().pushToast("Could not skip", friendlyError(error), "error");
    }
  },

  previous: async () => {
    try {
      await bridge().invoke("playback.previous");
    } catch (error) {
      get().pushToast("Could not go back", friendlyError(error), "error");
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
      get().pushToast("Could not change repeat", friendlyError(error), "error");
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
      get().pushToast("Could not change shuffle", friendlyError(error), "error");
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
      get().pushToast("Could not update favorite", friendlyError(error), "error");
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
      get().pushToast("Scan failed", friendlyError(error), "error");
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
      get().pushToast("Could not open that folder", friendlyError(error), "error");
    }
  },

  createPlaylist: async (name, trackId) => {
    try {
      const result = await bridge().invoke<{ playlist: Playlist }>("playlist.create", { name });
      if (trackId) {
        await bridge().invoke("playlist.addTrack", { playlistId: result.playlist.id, trackId });
      }
      get().pushToast("Playlist created", result.playlist.name, "success");
      return result.playlist;
    } catch (error) {
      get().pushToast("Could not create playlist", friendlyError(error), "error");
      return null;
    }
  },

  renamePlaylist: async (playlistId, name) => {
    try {
      await bridge().invoke("playlist.rename", { playlistId, name });
    } catch (error) {
      get().pushToast("Could not rename playlist", friendlyError(error), "error");
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
      get().pushToast("Could not delete playlist", friendlyError(error), "error");
    }
  },

  addToPlaylist: async (playlistId, trackId) => {
    try {
      await bridge().invoke("playlist.addTrack", { playlistId, trackId });
      const playlist = get().playlists.find((item) => item.id === playlistId);
      get().pushToast("Added to playlist", playlist?.name, "success");
    } catch (error) {
      get().pushToast("Could not add to playlist", friendlyError(error), "error");
    }
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    try {
      await bridge().invoke("playlist.removeTrack", { playlistId, trackId });
    } catch (error) {
      get().pushToast("Could not remove song", friendlyError(error), "error");
    }
  },

  enqueue: async (trackId, next) => {
    try {
      await bridge().invoke("playback.enqueue", { trackId, next });
      get().pushToast(next ? "Playing next" : "Added to queue", undefined, "success");
    } catch (error) {
      get().pushToast("Could not update queue", friendlyError(error), "error");
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

  setRightTab: (tab) => set({ rightTab: tab }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setTrackMenu: (menu) => set({ trackMenu: menu }),
  setAddToPlaylistTrackId: (id) => set({ addToPlaylistTrackId: id }),
  setTaxonomyManager: (kind) => set({ taxonomyManager: kind }),
  setBulkAssign: (value) => set({ bulkAssign: value }),
  createTag: async (kind, name, color) => {
    try {
      await bridge().invoke("taxonomy.create", { kind, name, color: color ?? "" });
      get().pushToast("Collection updated", `${name} added.`, "success");
    } catch (error) {
      get().pushToast("Could not create", friendlyError(error), "error");
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
      get().pushToast("Could not rename", friendlyError(error), "error");
    }
  },
  deleteTag: async (kind, name) => {
    try {
      await bridge().invoke("taxonomy.delete", { kind, name });
      get().pushToast("Collection removed", name, "success");
      const state = get();
      const current = state.viewHistory[state.viewIndex];
      if ((current.kind === "block" || current.kind === "genre") && current.kind === kind && current.name === name) {
        state.navigate({ kind: "collections" });
      }
    } catch (error) {
      get().pushToast("Could not remove", friendlyError(error), "error");
    }
  },
  setTagColor: async (kind, name, color) => {
    try {
      await bridge().invoke("taxonomy.color", { kind, name, color });
    } catch (error) {
      get().pushToast("Could not update colour", friendlyError(error), "error");
    }
  },
  updateTrack: async (trackId, patch) => {
    try {
      await bridge().invoke("library.updateTrack", { trackId, ...patch });
      return true;
    } catch (error) {
      get().pushToast("Could not update song", friendlyError(error), "error");
      return false;
    }
  },
  bulkUpdate: async (trackIds, field, value) => {
    try {
      await bridge().invoke("library.bulkUpdate", { trackIds, field, value });
      get().pushToast("Songs updated", `${trackIds.length} songs moved.`, "success");
    } catch (error) {
      get().pushToast("Could not update songs", friendlyError(error), "error");
    }
  },
  openPrompt: (prompt) => set({ prompt }),
  closePrompt: () => set({ prompt: null }),

  setReducedMotion: (value) => {
    set({ reducedMotion: value });
    try {
      localStorage.setItem("potato:reduced-motion", value ? "1" : "0");
    } catch {
      // Storage is optional.
    }
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
