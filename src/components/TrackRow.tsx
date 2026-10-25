import clsx from "clsx";
import { Check, Heart, MoreHorizontal, Play } from "lucide-react";
import type { Track } from "@/types";
import { Cover } from "@/components/Cover";
import { EqualizerBars } from "@/components/EqualizerBars";
import { formatTime } from "@/lib/format";
import { useAppStore } from "@/store";

interface TrackRowProps {
  track: Track;
  index: number;
  active: boolean;
  playing: boolean;
  favorite: boolean;
  onActivate: () => void;
  onToggleFavorite: () => void;
  onMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  compact?: boolean;
  showPlays?: boolean;
  showRating?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export function TrackRow({
  track,
  index,
  active,
  playing,
  favorite,
  onActivate,
  onToggleFavorite,
  onMenu,
  compact,
  showPlays,
  showRating,
  selectionMode,
  selected,
  onSelect,
}: TrackRowProps) {
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const blockColor = blocks.find((tag) => tag.name === track.block)?.color;
  const genreColor = genres.find((tag) => tag.name === track.genre)?.color;

  return (
    <div
      className={clsx(
        "track-row",
        active && "is-active",
        compact && "track-row--compact",
        selected && "is-selected",
        selectionMode && "is-selecting",
      )}
      role="button"
      tabIndex={0}
      onClick={() => (selectionMode ? onSelect?.() : onActivate())}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          if (selectionMode) onSelect?.();
          else onActivate();
        }
      }}
    >
      <div className="track-row__index">
        {selectionMode ? (
          <span className={clsx("row-check", selected && "is-on")}>
            {selected ? <Check size={11} strokeWidth={3} /> : null}
          </span>
        ) : active ? (
          <EqualizerBars playing={playing} />
        ) : (
          <>
            <span className="track-row__number">{String(index + 1).padStart(2, "0")}</span>
            <span className="track-row__hover-play">
              <Play size={13} fill="currentColor" strokeWidth={0} />
            </span>
          </>
        )}
      </div>
      <Cover
        path={track.coverPath}
        seed={track.id}
        label={track.title}
        radius={9}
        className="track-row__cover"
        eager={index < 8}
      />
      <div className="track-row__title">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      <div className="track-row__block">
        {track.block ? (
          <span className="tag-pill">
            <i style={{ background: blockColor ?? "var(--accent)" }} />
            {track.block}
          </span>
        ) : (
          <span className="tag-empty">—</span>
        )}
      </div>
      <div className="track-row__genre">
        {track.genre ? (
          <span className="tag-pill tag-pill--soft">
            <i style={{ background: genreColor ?? "var(--accent)" }} />
            {track.genre}
          </span>
        ) : (
          <span className="tag-empty">—</span>
        )}
      </div>
      {showPlays && (
        <div className="track-row__plays">
          {track.playCount ? `${track.playCount} plays` : "—"}
          {showRating && track.rating > 0 && <em>★ {track.rating.toFixed(1)}</em>}
        </div>
      )}
      <div className="track-row__time">{formatTime(track.duration)}</div>
      <button
        type="button"
        className={clsx("row-heart", favorite && "is-favorite")}
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Heart size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="row-more"
        aria-label="More options"
        title="More options"
        onClick={(event) => {
          event.stopPropagation();
          onMenu(event);
        }}
      >
        <MoreHorizontal size={17} />
      </button>
    </div>
  );
}
