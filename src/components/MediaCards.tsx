import { motion } from "motion/react";
import { Play } from "lucide-react";
import type { ArtistSummary, Collection, Track } from "@/types";
import { Cover } from "@/components/Cover";
import { initials } from "@/lib/format";

export function TrackCard({
  track,
  onPlay,
  index = 0,
}: {
  track: Track;
  onPlay: () => void;
  index?: number;
}) {
  return (
    <motion.button
      type="button"
      className="media-card"
      onClick={onPlay}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.2), duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="media-card__cover">
        <Cover path={track.coverPath} seed={track.id} label={track.title} radius={19} eager={index < 4} />
        <span className="media-card__play">
          <Play size={18} fill="currentColor" strokeWidth={0} />
        </span>
      </div>
      <div className="media-card__text">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      {track.rating > 0 && <span className="rating-chip">★ {track.rating.toFixed(1)}</span>}
    </motion.button>
  );
}

export function CollectionCard({
  collection,
  onOpen,
  onPlay,
  index = 0,
}: {
  collection: Collection;
  onOpen: () => void;
  onPlay: () => void;
  index?: number;
}) {
  return (
    <motion.div
      className="collection-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.18), duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <button type="button" className="collection-card__open" onClick={onOpen} tabIndex={-1} aria-label={`Open ${collection.title}`} />
      <Cover path={collection.coverPath} seed={collection.key} label={collection.title} radius={18} className="collection-card__cover" />
      <div className="collection-card__meta">
        <strong>{collection.title}</strong>
        <span>{collection.subtitle}</span>
      </div>
      <button
        type="button"
        className="collection-card__play"
        title={`Play ${collection.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
      >
        <Play size={17} fill="currentColor" strokeWidth={0} />
      </button>
    </motion.div>
  );
}

export function ArtistCard({
  artist,
  onOpen,
  onPlay,
  index = 0,
}: {
  artist: ArtistSummary;
  onOpen: () => void;
  onPlay: () => void;
  index?: number;
}) {
  return (
    <motion.div
      className="artist-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.2), duration: 0.32 }}
      whileHover={{ y: -4 }}
    >
      <button type="button" className="artist-card__open" onClick={onOpen} tabIndex={-1} aria-label={`Open ${artist.name}`} />
      <Cover
        path={artist.coverPath}
        seed={artist.name}
        label={artist.name}
        radius="50%"
        className="artist-card__cover"
      />
      <div className="artist-card__fallback">{initials(artist.name)}</div>
      <strong>{artist.name}</strong>
      <span>{artist.tracks.length} songs</span>
      <button
        type="button"
        className="artist-card__play"
        title={`Play ${artist.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
      >
        <Play size={16} fill="currentColor" strokeWidth={0} />
      </button>
    </motion.div>
  );
}
