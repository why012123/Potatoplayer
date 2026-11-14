export type RepeatMode = "off" | "all" | "one";
export type Theme = "light" | "dark";

export interface Track {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  block: string;
  note: string;
  lyricsOverride?: string;
  coverPath: string | null;
  duration: number;
  /** Measured from the audio file; missing or zero means not available. */
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  codec?: string;
  year: number;
  trackNo: number;
  playCount: number;
  rating: number;
  neteaseId?: string;
  qqId?: string;
  /** NetEase aliases/translated names, search-only and not persisted in the library. */
  aliases?: string[];
  addedAt: number;
  fileSize: number;
}

export interface Tag {
  name: string;
  color: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export type PlaybackEngineId = "vlc" | "potatohq" | "mpv";
export type OutputMode = "pcm" | "dop64" | "dop128";
export type DownloadQuality = "standard" | "high" | "lossless" | "hires" | "jymaster";
/** Which way an explicit quality change moved the library file. */
export type DownloadDirection = "upgrade" | "downgrade";

export interface EngineCapabilities {
  id: PlaybackEngineId;
  eqLive: boolean;
  spatial: boolean;
  crossfeed: boolean;
  visualizer: boolean;
  dsd: boolean;
  exclusive: boolean;
  followSourceRate: boolean;
  gapless: boolean;
}

export interface EngineAvailability {
  available: boolean;
  path: string;
  detail: string;
}

export interface Settings {
  libraryRoot: string | null;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  lastTrackId?: string | null;
  lastPosition: number;
  reducedMotion: boolean;
  playbackEngine?: PlaybackEngineId;
  outputMode?: OutputMode;
  spatialEnabled?: boolean;
  spatialX?: number;
  spatialY?: number;
  exclusive?: boolean;
  crossfeedEnabled?: boolean;
  crossfeedStrength?: number;
  followSourceRate?: boolean;
}

export interface PlaybackState {
  trackId: string | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  queue: string[];
  queueIndex: number;
  available: boolean;
  error: string | null;
}

export interface DailyMix {
  date: string;
  generatedAt: number;
  trackIds: string[];
}

export interface Bootstrap {
  version: string;
  libraryRoot: string;
  tracks: Track[];
  favorites: string[];
  playlists: Playlist[];
  blocks: Tag[];
  genres: Tag[];
  settings: Settings;
  engines?: Record<PlaybackEngineId, EngineAvailability>;
  engineCapabilities?: EngineCapabilities;
  playback: PlaybackState;
  scanNeeded: boolean;
  scannedAt: number;
  coverRoots: string[];
  dataDir: string;
  neteaseAliases?: Record<string, string[]>;
  dailyMix?: DailyMix | null;
}

export interface LyricsLine {
  time: number;
  text: string;
  translation: string;
}

export interface LyricsPayload {
  found: boolean;
  translated: boolean;
  source?: string;
  lines: LyricsLine[];
}

export interface ScanProgress {
  done: number;
  total: number;
  phase: string;
}

export type Collection = {
  key: string;
  title: string;
  artist: string;
  subtitle: string;
  coverPath: string | null;
  tracks: Track[];
  kind: "album" | "artist";
};

export type ArtistSummary = {
  name: string;
  coverPath: string | null;
  tracks: Track[];
};

export type View =
  | { kind: "settings" }
  | { kind: "home" }
  | { kind: "songs" }
  | { kind: "albums" }
  | { kind: "artists" }
  | { kind: "favorites" }
  | { kind: "daily" }
  | { kind: "dive" }
  | { kind: "comments" }
  | { kind: "stats" }
  | { kind: "collections" }
  | { kind: "editor"; trackId?: string }
  | { kind: "block"; name: string }
  | { kind: "genre"; name: string }
  | { kind: "discover" }
  | { kind: "sync" }
  | { kind: "playlist"; id: string }
  | { kind: "album"; key: string }
  | { kind: "artist"; name: string };

export interface ListeningDay {
  date: string;
  seconds: number;
  plays: number;
  hours: number[];
}

export interface ListeningTrackStat {
  trackId: string;
  title: string;
  artist: string;
  seconds: number;
  plays: number;
  lastPlayedAt: number;
}

export interface ListeningStats {
  version: number;
  generatedAt: number;
  totalSeconds: number;
  days: ListeningDay[];
  tracks: ListeningTrackStat[];
}

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone?: "default" | "error" | "success";
}

export type TagKind = "block" | "genre";

export type OnlineSource = "netease" | "qq";

export interface NeteaseStatus {
  source?: OnlineSource;
  service: boolean;
  loggedIn: boolean;
  canStart: boolean;
  apiBase: string;
  apiDir: string | null;
  nickname?: string;
  avatarUrl?: string;
  userId?: number;
  vipType?: number;
  message?: string;
}

export interface NeteaseSong {
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string;
  durationMs: number;
  fee: number;
  alias?: string;
}

export interface NeteaseComment {
  id: string;
  user: string;
  avatarUrl: string;
  content: string;
  time: number;
  liked: number;
  location?: string;
  replyTo?: string;
}

export interface NeteaseCommentPage {
  total: number;
  more: boolean;
  hot: NeteaseComment[];
  comments: NeteaseComment[];
}

export interface TrackCommentsPage extends NeteaseCommentPage {
  source: "netease" | "qq" | "";
  bound: boolean;
  sourceId?: string;
}

export interface NeteasePlaylist {
  owned?: boolean;
  id: string;
  name: string;
  coverUrl: string;
  trackCount: number;
  creator: string;
}

export interface BilibiliVideo {
  bvid: string;
  aid: number;
  title: string;
  author: string;
  authorId: number;
  coverUrl: string;
  duration: string;
  durationSeconds: number;
  playCount: number;
  danmakuCount: number;
  publishedAt: number;
  description: string;
  typeName: string;
  url: string;
}

export interface BilibiliSearchResult {
  query: string;
  total: number;
  results: BilibiliVideo[];
  searchUrl: string;
}

export interface EqPresetData {
  name: string;
  preamp: number;
  bands: number[];
}

export interface EqCurrentTrack {
  id: string;
  title: string;
  artist: string;
  path: string;
  hasSongPreset: boolean;
}

export interface EqState {
  enabled: boolean;
  on?: boolean;
  version?: number;
  available: boolean;
  error: string | null;
  preamp: number;
  neutralPreamp: number;
  bands: number[];
  global?: EqPresetData;
  frequencies: number[];
  labels: string[];
  presets: EqPresetData[];
  factoryPresets: EqPresetData[];
  currentTrack?: EqCurrentTrack | null;
  songPreset?: EqPresetData | null;
  songCount?: number;
}

export interface DownloadJob {
  jobId: string;
  neteaseId: string;
  title: string;
  artist?: string;
  path?: string;
  downloaded: number;
  total: number;
  phase: string;
  status: "running" | "done" | "error" | "cancelled";
  message?: string;
  importId?: string;
  source?: OnlineSource;
  duplicate?: boolean;
  updated?: boolean;
  /** True when an existing copy was replaced by a better-quality download. */
  replaced?: boolean;
  /** Direction of a replacement: a higher tier (upgrade) or an explicit lower tier (downgrade). */
  direction?: DownloadDirection;
  /** The provider had nothing better for this song, so the old copy was kept. */
  upgradeUnavailable?: boolean;
  /** An explicit downgrade could not be honored, so the higher-quality copy was kept. */
  downgradeUnavailable?: boolean;
  /** Quality level actually served (standard/high/lossless/hires/jymaster). */
  quality?: DownloadQuality;
  requestedQuality?: DownloadQuality;
  /** Quality of the copy that was replaced. */
  previousQuality?: DownloadQuality;
  block?: string;
  genre?: string;
  createdAt: number;
}

/**
 * Payload of a `download.done` event.
 *
 * `replaced` means the previous file was swapped for the freshly downloaded one;
 * `direction` then says whether that was a higher tier (upgrade) or an explicit
 * lower tier (downgrade). `upgradeUnavailable` / `downgradeUnavailable` mean the
 * requested direction was not possible and the existing copy was kept.
 */
export interface DownloadDone {
  jobId: string;
  neteaseId?: string;
  /** Library id of the resulting track, present when the file was indexed. */
  trackId?: string;
  title?: string;
  artist?: string;
  path?: string;
  duplicate?: boolean;
  updated?: boolean;
  replaced?: boolean;
  direction?: DownloadDirection;
  upgradeUnavailable?: boolean;
  downgradeUnavailable?: boolean;
  quality?: DownloadQuality;
  requestedQuality?: DownloadQuality;
  previousQuality?: DownloadQuality;
  block?: string;
  genre?: string;
  source?: OnlineSource;
}

export interface PlaylistImport {
  id: string;
  playlistId: string;
  playlistName: string;
  total: number;
  resolved: number;
  queued: number;
  failed: number;
  active: boolean;
}

export interface BulkAssignState {
  trackIds: string[];
  field: "block" | "genre";
}

export interface TrackMenuState {
  trackId: string;
  x: number;
  y: number;
}

export interface PromptState {
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  input?: boolean;
  destructive?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
}

export type SyncDirection = "push" | "pull" | "both";
export type SyncStrategy = "replace" | "add";
export interface PlaylistSyncBinding {
  skipped?: { id: string; title: string; artist: string }[];
  id: string;
  accountId: string;
  cloudId: string;
  cloudName: string;
  kind: "playlist" | "block" | "genre";
  target: string;
  libraryRoot: string;
  direction: SyncDirection;
  strategy: SyncStrategy;
  initialized: boolean;
  lastSyncedAt: number;
  status: "idle" | "syncing" | "waiting" | "success" | "error";
  message: string;
}
export interface PlaylistSyncState { bindings: PlaylistSyncBinding[]; error: string }
