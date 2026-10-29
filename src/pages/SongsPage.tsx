import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownUp, Check, CheckSquare, FolderOpen, Layers3, ListEnd, ListMusic, ListPlus, Play, SearchX, Shuffle, Tag as TagIcon, X } from "lucide-react";
import { useAppStore, type SortMode } from "@/store";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { useTr } from "@/lib/i18n";
import { normalizeSearchText } from "@/lib/search";

type Filter = "all" | "favorites" | "rated";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function SongsPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const favoritesSet = new Set(favorites);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const sortMode = useAppStore((state) => state.sortMode);
  const setSortMode = useAppStore((state) => state.setSortMode);
  const playTrack = useAppStore((state) => state.playTrack);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const [filter, setFilter] = useState<Filter>("all");
  const [blockFilter, setBlockFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const setBulkAssign = useAppStore((state) => state.setBulkAssign);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const enqueueMany = useAppStore((state) => state.enqueueMany);

  const sortLabels: Record<SortMode, string> = {
    title: tr("Title", "标题"),
    artist: tr("Artist", "艺术家"),
    album: tr("Album", "专辑"),
    recent: tr("Recently added", "最近添加"),
    plays: tr("Most played", "播放最多"),
    rating: tr("Highest rated", "评分最高"),
  };

  const visible = useMemo(() => {
    const rawQuery = searchQuery.trim();
    const query = normalizeSearchText(rawQuery);
    let list = [...tracks];
    if (rawQuery) {
      list = query
        ? list.filter((track) =>
            normalizeSearchText(
              `${track.title} ${track.artist} ${track.album} ${track.genre} ${track.block}`,
            ).includes(query),
          )
        : [];
    }
    if (filter === "favorites") list = list.filter((track) => favoritesSet.has(track.id));
    if (filter === "rated") list = list.filter((track) => track.rating >= 8);
    if (blockFilter) list = list.filter((track) => track.block === blockFilter);
    if (genreFilter) list = list.filter((track) => track.genre === genreFilter);

    switch (sortMode) {
      case "artist":
        list.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
        break;
      case "album":
        list.sort((a, b) => (a.album || a.artist).localeCompare(b.album || b.artist) || a.title.localeCompare(b.title));
        break;
      case "recent":
        list.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case "plays":
        list.sort((a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title));
        break;
      case "rating":
        list.sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
        break;
      default:
        list.sort((a, b) => a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist));
    }
    return list;
  }, [tracks, searchQuery, filter, sortMode, favorites, blockFilter, genreFilter]);

  const queue = visible.map((track) => track.id);
  const duration = visible.reduce((sum, track) => sum + (track.duration || 0), 0);
  const selectedCount = selected.size;

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = visible.length > 0 && visible.every((track) => selected.has(track.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(visible.map((track) => track.id)));
  };
  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  if (!tracks.length) {
    return (
      <div className="page">
        <PageHeader title={tr("Songs", "歌曲")} description={tr("Every track in your local library.", "本地资料库中的全部曲目。")} />
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <FolderOpen size={28} />
          </div>
          <h2>{tr("No songs indexed yet.", "尚未索引任何歌曲。")}</h2>
          <p>{tr("Choose a folder with audio files and they will show up here.", "选择包含音频文件的文件夹，歌曲就会显示在这里。")}</p>
          <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
            <FolderOpen size={16} /> {tr("Choose music folder", "选择音乐文件夹")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--songs">
      <PageHeader
        eyebrow={tr("Your library", "你的资料库")}
        title={tr("Songs", "歌曲")}
        description={tr("{tracks} · {duration} of listening", "{tracks} · 聆听时长 {duration}", {
          tracks:
            tracks.length === 1
              ? tr("1 track", "1 首歌曲")
              : tr("{count} tracks", "{count} 首歌曲", { count: tracks.length }),
          duration: formatLongDuration(tracks.reduce((sum, track) => sum + track.duration, 0)),
        })}
        actions={
          <>
            <button
              type="button"
              className={clsx("button", selecting ? "button--dark" : "button--glass")}
              onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            >
              <CheckSquare size={15} />
              {selecting ? tr("Done", "完成") : tr("Select", "选择")}
            </button>
            <button
              type="button"
              className="button button--glass"
              onClick={() => {
                const ordered = shuffle(visible);
                if (ordered[0]) void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} />
              {tr("Shuffle", "随机播放")}
            </button>
            <button
              type="button"
              className="button button--dark"
              onClick={() => {
                if (visible[0]) void playTrack(visible[0], queue);
              }}
            >
              <Play size={15} fill="currentColor" />
              {tr("Play", "播放")}
            </button>
          </>
        }
      />

      <div className="library-controls glass">
      <div className="list-toolbar">
        <div className="filter-chips">
          {(
            [
              ["all", tr("All songs", "全部歌曲"), tracks.length],
              ["favorites", tr("Favorites", "收藏"), favorites.length],
              ["rated", tr("Rated 8+", "评分 8+"), tracks.filter((track) => track.rating >= 8).length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              className={clsx("filter-chip", filter === value && "is-active")}
              onClick={() => setFilter(value as Filter)}
            >
              {label}
              <em>{count}</em>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <span className="toolbar-count">
            {tr("{shown} of {total}", "显示 {shown} / {total}", { shown: visible.length, total: tracks.length })}
          </span>
          <label className="sort-control">
            <ArrowDownUp size={13} />
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              aria-label={tr("Sort songs", "歌曲排序")}
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="taxonomy-filterbar">
        <span className="taxonomy-filterbar__label">
          <Layers3 size={13} /> {tr("Focus", "筛选")}
        </span>
        <label className="taxonomy-select">
          <span className="taxonomy-select__dot" style={{ background: blocks.find((tag) => tag.name === blockFilter)?.color ?? "transparent" }} />
          <select
            value={blockFilter}
            onChange={(event) => setBlockFilter(event.target.value)}
            aria-label={tr("Filter by block", "按区块筛选")}
          >
            <option value="">{tr("All blocks", "全部区块")}</option>
            {blocks.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label className="taxonomy-select">
          <span className="taxonomy-select__dot" style={{ background: genres.find((tag) => tag.name === genreFilter)?.color ?? "transparent" }} />
          <select
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.target.value)}
            aria-label={tr("Filter by genre", "按流派筛选")}
          >
            <option value="">{tr("All genres", "全部流派")}</option>
            {genres.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        {(blockFilter || genreFilter) && (
          <button
            type="button"
            className="taxonomy-filterbar__clear"
            onClick={() => {
              setBlockFilter("");
              setGenreFilter("");
            }}
          >
            <X size={12} /> {tr("Clear focus", "清除筛选")}
          </button>
        )}
        <span className="taxonomy-filterbar__count">
          {visible.length === 1
            ? tr("1 match", "匹配 1 首")
            : tr("{count} matches", "匹配 {count} 首", { count: visible.length })}
        </span>
        {selecting && (
          <button type="button" className="taxonomy-filterbar__all" onClick={toggleAll}>
            {allSelected ? <Check size={12} /> : <CheckSquare size={12} />}
            {allSelected ? tr("All selected", "已全选") : tr("Select all", "全选")}
          </button>
        )}
      </div>

      {searchQuery && (
        <div className="query-note">
          <span>
            {tr("Results for ", "搜索结果：")}
            <strong>“{searchQuery}”</strong>
          </span>
          <em>{formatLongDuration(duration)}</em>
        </div>
      )}
      </div>

      {visible.length ? (
        <TrackTable
          tracks={visible}
          queue={queue}
          showPlays={sortMode === "plays"}
          showRating={sortMode === "rating"}
          selectionMode={selecting}
          selectedIds={selected}
          onSelect={toggleSelected}
        />
      ) : (
        <motion.div className="search-empty glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <SearchX size={24} />
          <h3>{tr("No matching songs", "没有匹配的歌曲")}</h3>
          <p>{tr("Try a different title, artist or album.", "试试其他标题、艺术家或专辑。")}</p>
        </motion.div>
      )}

      {selecting && selectedCount > 0 && createPortal(
        <motion.div
          className="bulk-bar"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <span>
            <strong>{selectedCount}</strong> {tr("selected", "首已选中")}
          </span>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => void enqueueMany([...selected], true)}
          >
            <ListEnd size={14} /> {tr("Play next", "下一首播放")}
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => void enqueueMany([...selected], false)}
          >
            <ListPlus size={14} /> {tr("Add to queue", "添加到队列")}
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => setAddToPlaylistTrackIds([...selected])}
          >
            <ListMusic size={14} /> {tr("Add to playlist", "添加到歌单")}
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => setBulkAssign({ trackIds: [...selected], field: "block" })}
          >
            <Layers3 size={14} /> {tr("Assign block", "分配区块")}
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => setBulkAssign({ trackIds: [...selected], field: "genre" })}
          >
            <TagIcon size={14} /> {tr("Assign genre", "分配流派")}
          </button>
          <button type="button" className="button button--dark button--small" onClick={exitSelection}>
            {tr("Done", "完成")}
          </button>
        </motion.div>,
        document.body,
      )}
    </div>
  );
}
