import { useMemo } from "react";
import { Heart, Play, Shuffle } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function FavoritesPage() {
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const playTrack = useAppStore((state) => state.playTrack);
  const navigate = useAppStore((state) => state.navigate);
  const favoriteTracks = useMemo(
    () =>
      tracks
        .filter((track) => favorites.includes(track.id))
        .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)),
    [tracks, favorites],
  );
  const duration = favoriteTracks.reduce((sum, track) => sum + track.duration, 0);
  const queue = favoriteTracks.map((track) => track.id);

  return (
    <div className="page page--favorites">
      <PageHeader
        title="Favorites"
        description={
          favoriteTracks.length
            ? `${favoriteTracks.length} songs · ${formatLongDuration(duration)} you keep close.`
            : "The songs you love, kept in one quiet place."
        }
        actions={
          favoriteTracks.length ? (
            <>
              <button
                type="button"
                className="button button--glass"
                onClick={() => {
                  const ordered = shuffle(favoriteTracks);
                  void playTrack(ordered[0], ordered.map((track) => track.id));
                }}
              >
                <Shuffle size={15} /> Shuffle
              </button>
              <button type="button" className="button button--dark" onClick={() => void playTrack(favoriteTracks[0], queue)}>
                <Play size={15} fill="currentColor" /> Play
              </button>
            </>
          ) : undefined
        }
      />

      {favoriteTracks.length ? (
        <TrackTable tracks={favoriteTracks} queue={queue} />
      ) : (
        <div className="empty-stage glass empty-stage--compact favorites-empty">
          <div className="favorites-empty__heart">
            <Heart size={34} strokeWidth={1.3} />
            <span />
          </div>
          <h2>Save the ones that stay with you.</h2>
          <p>Tap the heart beside any song and it will appear here.</p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            Browse your songs
          </button>
        </div>
      )}
    </div>
  );
}
