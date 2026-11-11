import { useMemo } from "react";
import { motion } from "motion/react";
import { Layers3, Pencil, Play, Sparkles, Tag as TagIcon } from "lucide-react";
import type { Tag, TagKind, Track } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { Cover } from "@/components/Cover";
import { formatLongDuration } from "@/lib/format";
import { useTr } from "@/lib/i18n";

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
  const tr = useTr();
  const data = stats(tracks, field, tag.name);
  return (
    <motion.div
      className="tag-card"
      data-count={data.items.length}
      style={{ "--tag-color": tag.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.22), duration: 0.32 }}
      whileHover={{ y: -4 }}
    >
      <button
        type="button"
        className="tag-card__open"
        onClick={onOpen}
        aria-label={tr("Open {name}", "打开{name}", { name: tag.name })}
      />
      <div className="tag-card__top">
        <span className="tag-card__dot" />
        <span className="tag-card__kind">{field === "block" ? tr("block", "区块") : tr("genre", "流派")}</span>
        {data.avg > 0 && <span className="tag-card__rating">★ {data.avg.toFixed(1)}</span>}
      </div>
      <strong>{tag.name}</strong>
      <span className="tag-card__meta">
        {tr(
          data.items.length === 1 ? "{count} song" : "{count} songs",
          "{count} 首歌曲",
          { count: data.items.length },
        )}
        {" · "}
        {formatLongDuration(data.duration)}
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
        aria-label={tr("Play {name}", "播放{name}", { name: tag.name })}
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
  const tr = useTr();
  const rows = tags
    .map((tag) => ({ tag, ...stats(tracks, kind, tag.name) }))
    .filter((row) => row.rated > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
  return (
    <div className="taste-column">
      <div className="taste-column__head">
        <span>{title}</span>
        <em>{tr("Average rating", "平均评分")}</em>
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
        <p className="taste-empty">
          {tr(
            "Rate a few songs to see which blocks and genres rise to the top.",
            "给一些歌曲评分，看看哪些区块和流派会脱颖而出。",
          )}
        </p>
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
  const tr = useTr();

  const unassignedBlock = useMemo(() => tracks.filter((track) => !track.block).length, [tracks]);
  const unassignedGenre = useMemo(() => tracks.filter((track) => !track.genre).length, [tracks]);

  return (
    <div className="page page--collections">
      <PageHeader
        eyebrow={tr("Your system", "你的分类体系")}
        title={tr("Blocks & Genres", "区块与流派")}
        description={tr(
          "The two axes of your library: blocks for where a song belongs, genres for what it sounds like.",
          "资料库的两个维度：区块决定歌曲归属，流派描绘声音的样貌。",
        )}
        actions={
          <>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager("genre")}>
              <Pencil size={14} /> {tr("Manage genres", "管理流派")}
            </button>
            <button type="button" className="button button--dark" onClick={() => setTaxonomyManager("block")}>
              <Pencil size={14} /> {tr("Manage blocks", "管理区块")}
            </button>
          </>
        }
      />

      <section>
        <div className="section-header">
          <div>
            <h2>{tr("Blocks", "区块")}</h2>
            <span>
              {tr(
                blocks.length === 1 ? "{count} block" : "{count} blocks",
                "{count} 个区块",
                { count: blocks.length },
              )}
              {" · "}
              {tr(
                unassignedBlock === 1 ? "{count} song unassigned" : "{count} songs unassigned",
                "{count} 首歌曲未分配",
                { count: unassignedBlock },
              )}
            </span>
          </div>
          <span className="count-badge">{tr("Core system", "核心体系")}</span>
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
            <strong>{tr("Create your first block", "创建第一个区块")}</strong>
            <span>{tr("Blocks are the shelves of your collection.", "区块是收藏库中的书架。")}</span>
          </button>
        )}
      </section>

      <section>
        <div className="section-header">
          <div>
            <h2>{tr("Genres", "流派")}</h2>
            <span>
              {tr(
                genres.length === 1 ? "{count} genre" : "{count} genres",
                "{count} 个流派",
                { count: genres.length },
              )}
              {" · "}
              {tr(
                unassignedGenre === 1 ? "{count} song unassigned" : "{count} songs unassigned",
                "{count} 首歌曲未分配",
                { count: unassignedGenre },
              )}
            </span>
          </div>
          <span className="count-badge">{tr("Taste layer", "品味层")}</span>
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
            <strong>{tr("Create your first genre", "创建第一个流派")}</strong>
            <span>{tr("Genres describe the colour of a song.", "流派描绘一首歌的色彩。")}</span>
          </button>
        )}
      </section>

      <section>
        <div className="section-header">
          <div>
            <h2>{tr("Taste profile", "品味画像")}</h2>
            <span>
              {tr(
                "Weighted by average rating; unrated songs are excluded",
                "按平均评分加权，未评分歌曲不计入。",
              )}
            </span>
          </div>
          <Sparkles size={15} className="section-icon" />
        </div>
        <div className="taste-card glass">
          <TasteColumn title={tr("Blocks", "区块")} kind="block" tags={blocks} tracks={tracks} navigate={navigate} />
          <div className="taste-divider" />
          <TasteColumn title={tr("Genres", "流派")} kind="genre" tags={genres} tracks={tracks} navigate={navigate} />
        </div>
      </section>
    </div>
  );
}
