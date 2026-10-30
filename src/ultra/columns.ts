import type { Tag, Track } from "@/types";
import { normalizeSearchText } from "@/lib/search";

export interface UltraColumn {
  key: string;
  label: string;
  color: string;
  tracks: Track[];
}

export const UNFILED_COLOR = "#9a8f84";

export function buildColumns(
  tracks: Track[],
  blocks: Tag[],
  query: string,
): UltraColumn[] {
  const needle = normalizeSearchText(query);
  const groups = new Map<string, Track[]>();

  for (const track of tracks) {
    if (needle) {
      const haystack = normalizeSearchText(
        [track.title, track.artist, track.album, track.block, track.genre, track.note].join(" "),
      );
      if (!haystack.includes(needle)) continue;
    }
    const key = track.block || "";
    const list = groups.get(key);
    if (list) list.push(track);
    else groups.set(key, [track]);
  }

  const columns: UltraColumn[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    seen.add(block.name);
    const list = groups.get(block.name);
    if (!list?.length) continue;
    columns.push({
      key: block.name,
      label: block.name,
      color: block.color || UNFILED_COLOR,
      tracks: sortTracks(list),
    });
  }

  const unfiled = groups.get("");
  if (unfiled?.length) {
    columns.push({
      key: "",
      label: "Unfiled",
      color: UNFILED_COLOR,
      tracks: sortTracks(unfiled),
    });
  }

  // Defensive: blocks added while a stale UI is open should still appear.
  for (const [key, list] of groups) {
    if (seen.has(key) || !key || !list.length) continue;
    columns.push({ key, label: key, color: UNFILED_COLOR, tracks: sortTracks(list) });
  }

  return columns;
}

function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort(
    (a, b) =>
      (b.rating || 0) - (a.rating || 0) ||
      a.title.localeCompare(b.title, "zh-Hans-CN") ||
      a.id.localeCompare(b.id),
  );
}

export function fileNumber(index: number): string {
  return String(index + 1).padStart(3, "0");
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
