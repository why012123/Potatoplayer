import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock3, Pencil, Play, Shuffle, Tag as TagIcon } from "lucide-react";
import { useAppStore } from "@/store";
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

export function TagPage() {
  const view = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const tracks = useAppStore((state) => state.tracks);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const navigate = useAppStore((state) => state.navigate);
  const goBack = useAppStore((state) => state.goBack);
  const playTrack = useAppStore((state) => state.playTrack);
  const setTaxonomyManager = useAppStore((state) => state.setTaxonomyManager);
  const setTagColor = useAppStore((state) => state.setTagColor);
  const [hoverColor, setHoverColor] = useState(false);

  const kind = view.kind === "genre" ? "genre" : "block";
  const name = "name" in view ? view.name : "";
  const tag = (kind === "block" ? blocks : genres).find((item) => item.name === name);
  const filtered = useMemo(
    () => tracks.filter((track) => (kind === "block" ? track.block : track.genre) === name),
    [tracks, kind, name],
  );
  const rated = filtered.filter((track) => track.rating > 0);
  const avg = rated.length ? rated.reduce((sum, track) => sum + track.rating, 0) / rated.length : 0;
  const duration = filtered.reduce((sum, track) => sum + track.duration, 0);
  const queue = filtered.map((track) => track.id);

  if (!tag) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={goBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="empty-stage glass empty-stage--compact">
          <h2>This {kind} no longer exists.</h2>
          <p>It may have been removed from your collection system.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="page page--tag"
      style={{ "--tag-color": tag.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <button type="button" className="back-link" onClick={goBack}>
        <ArrowLeft size={15} /> Blocks & Genres
      </button>
      <header className="tag-hero glass">
        <div className="tag-hero__mark">
          <span />
          <TagIcon size={28} />
        </div>
        <div className="tag-hero__copy">
          <span className="eyebrow">{kind}</span>
          <h1>{tag.name}</h1>
          <div className="detail-hero__facts">
            <span>{filtered.length} songs</span>
            <i />
            <span>
              <Clock3 size={13} /> {formatLongDuration(duration)}
            </span>
            {avg > 0 && (
              <>
                <i />
                <span className="rating-inline">
                  ★ {avg.toFixed(1)} from {rated.length} ratings
                </span>
              </>
            )}
          </div>
          <div className="detail-hero__actions">
            <button
              type="button"
              className="button button--dark"
              disabled={!filtered.length}
              onClick={() => filtered[0] && void playTrack(filtered[0], queue)}
            >
              <Play size={15} fill="currentColor" /> Play
            </button>
            <button
              type="button"
              className="button button--glass"
              disabled={!filtered.length}
              onClick={() => {
                const ordered = shuffle(filtered);
                if (ordered[0]) void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> Shuffle
            </button>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager(kind)}>
              <Pencil size={14} /> Manage
            </button>
            <label
              className="tag-color-picker"
              onMouseEnter={() => setHoverColor(true)}
              onMouseLeave={() => setHoverColor(false)}
              title="Change colour"
            >
              <span style={{ background: tag.color }} />
              <input
                type="color"
                value={tag.color}
                aria-label="Tag colour"
                onChange={(event) => void setTagColor(kind, tag.name, event.target.value)}
              />
              {hoverColor && <em>Colour</em>}
            </label>
          </div>
        </div>
        <div className="tag-hero__rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>

      {filtered.length ? (
        <TrackTable tracks={filtered} queue={queue} showPlays />
      ) : (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <TagIcon size={28} />
          </div>
          <h2>Nothing assigned here yet.</h2>
          <p>Select songs in the library and use “Assign block” or “Assign genre” to fill this {kind}.</p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            Browse songs
          </button>
        </div>
      )}
    </motion.div>
  );
}
