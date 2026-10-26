import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock3, ListEnd, ListMusic, ListPlus, Pencil, Play, Shuffle, Tag as TagIcon } from "lucide-react";
import { useAppStore } from "@/store";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { useTr } from "@/lib/i18n";

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
  const enqueueMany = useAppStore((state) => state.enqueueMany);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const setTaxonomyManager = useAppStore((state) => state.setTaxonomyManager);
  const setTagColor = useAppStore((state) => state.setTagColor);
  const [hoverColor, setHoverColor] = useState(false);
  const tr = useTr();

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
          <ArrowLeft size={15} /> {tr("Back", "返回")}
        </button>
        <div className="empty-stage glass empty-stage--compact">
          <h2>
            {kind === "block"
              ? tr("This block no longer exists.", "这个区块已不存在。")
              : tr("This genre no longer exists.", "这个流派已不存在。")}
          </h2>
          <p>{tr("It may have been removed from your collection system.", "它可能已从你的分类体系中移除。")}</p>
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
        <ArrowLeft size={15} /> {tr("Blocks & Genres", "区块与流派")}
      </button>
      <header className="tag-hero glass">
        <div className="tag-hero__mark">
          <span />
          <TagIcon size={28} />
        </div>
        <div className="tag-hero__copy">
          <span className="eyebrow">{kind === "block" ? tr("Block", "区块") : tr("Genre", "流派")}</span>
          <h1>{tag.name}</h1>
          <div className="detail-hero__facts">
            <span>
              {tr(
                filtered.length === 1 ? "{count} song" : "{count} songs",
                "{count} 首歌曲",
                { count: filtered.length },
              )}
            </span>
            <i />
            <span>
              <Clock3 size={13} /> {formatLongDuration(duration)}
            </span>
            {avg > 0 && (
              <>
                <i />
                <span className="rating-inline">
                  {tr(
                    rated.length === 1 ? "★ {avg} from {count} rating" : "★ {avg} from {count} ratings",
                    "★ {avg} · {count} 人评分",
                    { avg: avg.toFixed(1), count: rated.length },
                  )}
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
              <Play size={15} fill="currentColor" /> {tr("Play", "播放")}
            </button>
            <button
              type="button"
              className="button button--glass"
              title={tr("Shuffle", "随机播放")}
              aria-label={tr("Shuffle", "随机播放")}
              disabled={!filtered.length}
              onClick={() => {
                const ordered = shuffle(filtered);
                if (ordered[0]) void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> {tr("Shuffle", "随机播放")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              title={tr("Play next", "下一首播放")}
              aria-label={tr("Play next", "下一首播放")}
              disabled={!filtered.length}
              onClick={() => void enqueueMany(queue, true)}
            >
              <ListEnd size={15} /> {tr("Play next", "下一首播放")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              title={tr("Add to queue", "添加到队列")}
              aria-label={tr("Add to queue", "添加到队列")}
              disabled={!filtered.length}
              onClick={() => void enqueueMany(queue, false)}
            >
              <ListPlus size={15} /> {tr("Add to queue", "添加到队列")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              title={tr("Add all to playlist", "全部添加到歌单")}
              aria-label={tr("Add all to playlist", "全部添加到歌单")}
              disabled={!filtered.length}
              onClick={() => setAddToPlaylistTrackIds(queue)}
            >
              <ListMusic size={15} /> {tr("Add to playlist", "添加到歌单")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              title={tr("Manage this tag", "管理此标签")}
              aria-label={tr("Manage this tag", "管理此标签")}
              onClick={() => setTaxonomyManager(kind)}
            >
              <Pencil size={14} /> {tr("Manage", "管理")}
            </button>
            <label
              className="tag-color-picker"
              onMouseEnter={() => setHoverColor(true)}
              onMouseLeave={() => setHoverColor(false)}
              title={tr("Change colour", "更改颜色")}
            >
              <span style={{ background: tag.color }} />
              <input
                type="color"
                value={tag.color}
                aria-label={tr("Tag colour", "标签颜色")}
                onChange={(event) => void setTagColor(kind, tag.name, event.target.value)}
              />
              {hoverColor && <em>{tr("Colour", "颜色")}</em>}
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
          <h2>{tr("Nothing assigned here yet.", "这里还没有分配内容。")}</h2>
          <p>
            {kind === "block"
              ? tr(
                  "Select songs in the library and use “Assign block” or “Assign genre” to fill this block.",
                  "在资料库中选择歌曲，使用“分配区块”或“分配流派”来填充这个区块。",
                )
              : tr(
                  "Select songs in the library and use “Assign block” or “Assign genre” to fill this genre.",
                  "在资料库中选择歌曲，使用“分配区块”或“分配流派”来填充这个流派。",
                )}
          </p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            {tr("Browse songs", "浏览歌曲")}
          </button>
        </div>
      )}
    </motion.div>
  );
}
