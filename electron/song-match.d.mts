interface SongFields {
  title: string;
  artist?: string;
  album?: string;
  aliases?: string[];
  genre?: string;
  block?: string;
  note?: string;
  rating?: number;
}
export function normalizeSongText(value?: string): string;
export function songQuery(prompt: string): string;
export function matchSongs<T extends SongFields>(tracks: T[], query?: string, filters?: { title?: string; artist?: string; album?: string; version?: string }): { track: T; score: number; reason: string }[];
