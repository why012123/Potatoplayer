import { useMemo } from "react";
import { motion } from "motion/react";
import { Layers3, Pencil, Play, Sparkles, Tag as TagIcon } from "lucide-react";
import type { Tag, TagKind, Track } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { Cover } from "@/components/Cover";
import { formatLongDuration } from "@/lib/format";

function stats(tracks: Track[], field: TagKind, name: string) {
  const items = tracks.filter((track) => (field === "block" ? track.block : track.genre) === name);
  const rated = items.filter((track) => track.rating > 0);
  const avg = rated.length ? rated.reduce((sum, track) => sum + track.rating, 0) / rated.length : 0;
  return {
    items,
    avg,
    rated: rated.length,
    duration: items.reduce((sum, track) => sum + track.duration, 0),
    covers: items.filter((track) => track.coverPath).slice(0, 3),
  };
}

function TagCard({
  tag,
  field,
  tracks,
  index,
  onOpen,
  onPlay,
}: {
  tag: Tag;
  field: TagKind;
  tracks: Track[];
  index: number;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const data = stats(tracks, field, tag.name);
  return (
    <motion.div
      className="tag-card"
      style={{ "--tag-color": tag.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.22), duration: 0.32 }}
      whileHover={{ y: -4 }}
    >
      <button type="button" className="tag-card__open" onClick={onOpen} aria-label={`Open ${tag.name}`} />
      <div className="tag-card__top">
        <span className="tag-card__dot" />
        <span className="tag-card__kind">{field}</span>
        {data.avg > 0 && <span className="tag-card__rating">★ {data.avg.toFixed(1)}</span>}
      </div>
      <strong>{tag.name}</strong>
      <span className="tag-card__meta">
        {data.items.length} {data.items.length === 1 ? "song" : "songs"} · {formatLongDuration(data.duration)}
      </span>
      <div className="tag-card__covers">
        {data.covers.length ? (
          data.covers.map((track, i) => (
            <Cover
              key={track.id}
              path={track.coverPath}
              seed={track.id}
              label={track.title}
              radius={7}
              style={{ zIndex: 3 - i }}
            />
          ))
        ) : (
          <span className="tag-card__empty">
            <TagIcon size={18} />
          </span>
        )}
      </div>
      <button
        type="button"
        className="tag-card__play"
        aria-label={`Play ${tag.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
      >
        <Play size={15} fill="currentColor" strokeWidth={0} />
      </button>
    </motion.div>
  );
}

function TasteColumn({
  title,
  kind,
  tags,
  tracks,
  navigate,
}: {
  title: string;
  kind: TagKind;
  tags: Tag[];
  tracks: Track[];
  navigate: (view: { kind: "block" | "genre"; name: string }) => void;
}) {
  const rows = tags
    .map((tag) => ({ tag, ...stats(tracks, kind, tag.name) }))
    .filter((row) => row.rated > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
  return (
    <div className="taste-column">
      <div className="taste-column__head">
        <span>{title}</span>
        <em>Average rating</em>
      </div>
      {rows.length ? (
        rows.map((row) => (
          <button
            type="button"
            key={row.tag.name}
            className="taste-row"
            onClick={() => navigate({ kind, name: row.tag.name })}
          >
            <span className="taste-row__dot" style={{ background: row.tag.color }} />
            <span className="taste-row__name">{row.tag.name}</span>
            <span className="taste-row__bar">
              <i style={{ width: `${Math.min(100, (row.avg / 10) * 100)}%`, background: row.tag.color }} />
            </span>
            <strong>{row.avg.toFixed(1)}</strong>
            <em>{row.rated}</em>
          </button>
        ))
      ) : (
        <p className="taste-empty">Rate a few songs to see which blocks and genres rise to the top.</p>
      )}
    </div>
  );
}

export function CollectionsPage() {
  const tracks = useAppStore((state) => state.tracks);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const setTaxonomyManager = useAppStore((state) => state.setTaxonomyManager);

  const unassignedBlock = useMemo(() => tracks.filter((track) => !track.block).length, [tracks]);
  const unassignedGenre = useMemo(() => tracks.filter((track) => !track.genre).length, [tracks]);

  return (
    <div className="page page--collections">
      <PageHeader
        eyebrow="Your system"
        title="Blocks & Genres"
        description="The two axes of your library: blocks for where a song belongs, genres for what it sounds like."
        actions={
          <>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager("genre")}>
              <Pencil size={14} /> Manage genres
            </button>
            <button type="button" className="button button--dark" onClick={() => setTaxonomyManager("block")}>
              <Pencil size={14} /> Manage blocks
            </button>
          </>
        }
      />

      <section>
        <div className="section-header">
          <div>
            <h2>Blocks</h2>
            <span>{blocks.length} blocks · {unassignedBlock} songs unassigned</span>
          </div>
          <span className="count-badge">Core system</span>
        </div>
        {blocks.length ? (
          <div className="tag-grid">
            {blocks.map((tag, index) => (
              <TagCard
                key={tag.name}
                tag={tag}
                field="block"
                tracks={tracks}
                index={index}
                onOpen={() => navigate({ kind: "block", name: tag.name })}
                onPlay={() => {
                  const items = tracks.filter((track) => track.block === tag.name);
                  if (items[0]) void playTrack(items[0], items.map((track) => track.id));
                }}
              />
            ))}
          </div>
        ) : (
          <button type="button" className="tag-create-card" onClick={() => setTaxonomyManager("block")}>
            <Layers3 size={20} />
            <strong>Create your first block</strong>
            <span>Blocks are the shelves of your collection.</span>
          </button>
        )}
      </section>

      <section>
        <div className="section-header">
          <div>
            <h2>Genres</h2>
            <span>{genres.length} genres · {unassignedGenre} songs unassigned</span>
          </div>
          <span className="count-badge">Taste layer</span>
        </div>
        {genres.length ? (
          <div className="tag-grid">
            {genres.map((tag, index) => (
              <TagCard
                key={tag.name}
                tag={tag}
                field="genre"
                tracks={tracks}
                index={index}
                onOpen={() => navigate({ kind: "genre", name: tag.name })}
                onPlay={() => {
                  const items = tracks.filter((track) => track.genre === tag.name);
                  if (items[0]) void playTrack(items[0], items.map((track) => track.id));
                }}
              />
            ))}
          </div>
        ) : (
          <button type="button" className="tag-create-card" onClick={() => setTaxonomyManager("genre")}>
            <TagIcon size={20} />
            <strong>Create your first genre</strong>
            <span>Genres describe the colour of a song.</span>
          </button>
        )}
      </section>

      <section>
        <div className="section-header">
          <div>
            <h2>Taste profile</h2>
            <span>Weighted by average rating; unrated songs are excluded</span>
          </div>
          <Sparkles size={15} className="section-icon" />
        </div>
        <div className="taste-card glass">
          <TasteColumn title="Blocks" kind="block" tags={blocks} tracks={tracks} navigate={navigate} />
          <div className="taste-divider" />
          <TasteColumn title="Genres" kind="genre" tags={genres} tracks={tracks} navigate={navigate} />
        </div>
      </section>
    </div>
  );
}
