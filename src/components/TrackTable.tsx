import { useState } from "react";
import { GripVertical } from "lucide-react";
import clsx from "clsx";
import type { Track } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

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
  const tr = useTr();
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const moveTrack = useAppStore((state) => state.movePlaylistTrack);
  const playback = useAppStore((state) => state.playback);
  const favorites = useAppStore((state) => state.favorites);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTrackMenu = useAppStore((state) => state.setTrackMenu);
  const removeFromPlaylist = useAppStore((state) => state.removeFromPlaylist);
  const favoriteSet = new Set(favorites);

  if (!tracks.length) {
    return <div className="table-empty">{empty ?? tr("No songs here yet.", "这里还没有歌曲。")}</div>;
  }

  return (
    <div className={clsx("track-table", compact && "track-table--compact")}>
      <div className="track-table__head">
        <span>#</span>
        <span />
        <span>{tr("Title", "标题")}</span>
        <span>{tr("Block", "区块")}</span>
        <span>{tr("Genre", "流派")}</span>
        {(showPlays || showRating) && (
          <span className="track-table__metric-head">
            {showPlays && showRating
              ? tr("Plays · Rating", "次数 · 评分")
              : showPlays
                ? tr("Plays", "播放次数")
                : tr("Rating", "评分")}
          </span>
        )}
        <span className="align-right">{tr("Time", "时长")}</span>
        <span />
        <span />
      </div>
      <div className="track-table__body">
        {tracks.map((track, index) => {
          const active = playback?.trackId === track.id;
          return (
            <div key={track.id} className={clsx("track-table__row-wrap", playlistId && "is-reorderable", dropTarget === track.id && "is-drop-target")}
              onDragOver={(event) => { if (playlistId && dragged) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(track.id); } }}
              onDrop={(event) => { if (playlistId && dragged) { event.preventDefault(); void moveTrack(playlistId, dragged, track.id); setDragged(null); setDropTarget(null); } }}>
              {playlistId && <button type="button" className="playlist-drag-handle" draggable
                aria-label={tr("Reorder {title}", "调整 {title} 的顺序", { title: track.title })}
                title={tr("Drag to reorder · Alt + ↑ / ↓", "拖动排序 · Alt + ↑ / ↓")}
                onDragStart={(event) => { setDragged(track.id); event.dataTransfer.setData("text/plain", track.id); event.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                onKeyDown={(event) => {
                  if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  if (event.key === "ArrowUp" && index > 0) void moveTrack(playlistId, track.id, tracks[index - 1].id);
                  if (event.key === "ArrowDown" && index < tracks.length - 1) void moveTrack(playlistId, track.id, tracks[index + 2]?.id ?? "");
                }}><GripVertical size={15} /></button>}
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
                  title={tr("Remove from playlist", "从歌单中移除")}
                  aria-label={tr("Remove from playlist", "从歌单中移除")}
                  onClick={() => void removeFromPlaylist(playlistId, track.id)}
                >
                  {tr("Remove", "移除")}
                </button>
              )}
            </div>
          );
        })}
        {playlistId && <div className={clsx("playlist-drop-end", dragged && "is-dragging")}
          onDragOver={(event) => { if (dragged) event.preventDefault(); }}
          onDrop={(event) => { if (dragged) { event.preventDefault(); void moveTrack(playlistId, dragged, ""); setDragged(null); setDropTarget(null); } }}>
          {dragged ? tr("Move to end", "移动到末尾") : ""}
        </div>}
      </div>
    </div>
  );
}
