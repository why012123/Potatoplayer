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
  coverPath: string | null;
  duration: number;
  year: number;
  trackNo: number;
  playCount: number;
  rating: number;
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
  | { kind: "home" }
  | { kind: "songs" }
  | { kind: "albums" }
  | { kind: "artists" }
  | { kind: "favorites" }
  | { kind: "stats" }
  | { kind: "collections" }
  | { kind: "editor"; trackId?: string }
  | { kind: "block"; name: string }
  | { kind: "genre"; name: string }
  | { kind: "discover" }
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

export interface NeteasePlaylist {
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
  status: "running" | "done" | "error";
  message?: string;
  importId?: string;
  source?: OnlineSource;
  createdAt: number;
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
