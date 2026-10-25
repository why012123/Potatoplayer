export type RepeatMode = "off" | "all" | "one";

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

export interface Settings {
  libraryRoot: string | null;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  lastTrackId?: string | null;
  lastPosition: number;
  reducedMotion: boolean;
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
  | { kind: "collections" }
  | { kind: "editor"; trackId?: string }
  | { kind: "block"; name: string }
  | { kind: "genre"; name: string }
  | { kind: "discover" }
  | { kind: "playlist"; id: string }
  | { kind: "album"; key: string }
  | { kind: "artist"; name: string };

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone?: "default" | "error" | "success";
}

export type TagKind = "block" | "genre";

export interface NeteaseStatus {
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

export interface EqPresetData {
  name: string;
  preamp: number;
  bands: number[];
}

export interface EqState {
  enabled: boolean;
  available: boolean;
  error: string | null;
  preamp: number;
  neutralPreamp: number;
  bands: number[];
  frequencies: number[];
  labels: string[];
  presets: EqPresetData[];
  factoryPresets: EqPresetData[];
}

export interface DownloadJob {
  jobId: string;
  neteaseId: string;
  title: string;
  downloaded: number;
  total: number;
  phase: string;
  status: "running" | "done" | "error";
  message?: string;
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
