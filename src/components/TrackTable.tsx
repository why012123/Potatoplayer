import clsx from "clsx";
import type { Track } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { useAppStore } from "@/store";

interface TrackTableProps {
  tracks: Track[];
  queue: string[];
  showPlays?: boolean;
  showRating?: boolean;
  compact?: boolean;
  empty?: React.ReactNode;
  playlistId?: string;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (trackId: string) => void;
}

export function TrackTable({
  tracks,
  queue,
  showPlays,
  showRating,
  compact,
  empty,
  playlistId,
  selectionMode,
  selectedIds,
  onSelect,
}: TrackTableProps) {
  const playback = useAppStore((state) => state.playback);
  const favorites = useAppStore((state) => state.favorites);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTrackMenu = useAppStore((state) => state.setTrackMenu);
  const removeFromPlaylist = useAppStore((state) => state.removeFromPlaylist);
  const favoriteSet = new Set(favorites);

  if (!tracks.length) {
    return <div className="table-empty">{empty ?? "No songs here yet."}</div>;
  }

  return (
    <div className={clsx("track-table", compact && "track-table--compact")}>
      <div className="track-table__head">
        <span>#</span>
        <span />
        <span>Title</span>
        <span>Block</span>
        <span>Genre</span>
        {showPlays && <span>Plays</span>}
        <span className="align-right">Time</span>
        <span />
        <span />
      </div>
      <div className="track-table__body">
        {tracks.map((track, index) => {
          const active = playback?.trackId === track.id;
          return (
            <div key={track.id} className="track-table__row-wrap">
              <TrackRow
                track={track}
                index={index}
                active={active}
                playing={Boolean(playback?.playing && active)}
                favorite={favoriteSet.has(track.id)}
                compact={compact}
                showPlays={showPlays}
                showRating={showRating}
                selectionMode={selectionMode}
                selected={selectedIds?.has(track.id)}
                onSelect={() => onSelect?.(track.id)}
                onActivate={() => {
                  if (active) {
                    void togglePlay();
                  } else {
                    void playTrack(track, queue);
                  }
                }}
                onToggleFavorite={() => void toggleFavorite(track.id)}
                onMenu={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setTrackMenu({
                    trackId: track.id,
                    x: rect.right,
                    y: rect.bottom,
                  });
                }}
              />
              {playlistId && (
                <button
                  type="button"
                  className="track-row__remove"
                  title="Remove from playlist"
                  onClick={() => void removeFromPlaylist(playlistId, track.id)}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
