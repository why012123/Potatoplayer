import type { ArtistSummary, Collection, Track } from "@/types";
import { documentLanguage } from "@/lib/text";

export function buildCollections(tracks: Track[]): Collection[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const album = track.album?.trim();
    const key = album ? `album:${album.toLowerCase()}::${track.artist.toLowerCase()}` : `artist:${track.artist.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(track);
    groups.set(key, list);
  }

  const collections: Collection[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0) || a.title.localeCompare(b.title));
    const first = sorted[0];
    const hasAlbum = Boolean(first.album?.trim());
    const zh = documentLanguage() === "zh";
    const songCount = zh ? `${sorted.length} 首歌曲` : `${sorted.length} ${sorted.length === 1 ? "song" : "songs"}`;
    collections.push({
      key,
      title: hasAlbum ? first.album.trim() : first.artist,
      artist: first.artist,
      subtitle: hasAlbum ? `${first.artist} · ${songCount}` : `${songCount} · ${zh ? "合集" : "Collection"}`,
      coverPath: sorted.find((track) => track.coverPath)?.coverPath ?? null,
      tracks: sorted,
      kind: hasAlbum ? "album" : "artist",
    });
  }

  return collections.sort((a, b) => {
    const countDiff = b.tracks.length - a.tracks.length;
    return countDiff || a.title.localeCompare(b.title);
  });
}

export function buildArtists(tracks: Track[]): ArtistSummary[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const list = groups.get(track.artist) ?? [];
    list.push(track);
    groups.set(track.artist, list);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      tracks: items,
      coverPath: items.find((track) => track.coverPath)?.coverPath ?? null,
    }))
    .sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name));
}

export function albumTotalTime(tracks: Track[]): number {
  return tracks.reduce((total, track) => total + (track.duration || 0), 0);
}
