import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownUp, Check, CheckSquare, FolderOpen, Layers3, ListEnd, ListMusic, ListPlus, Play, SearchX, Shuffle, SlidersHorizontal, Tag as TagIcon, X } from "lucide-react";
import { useAppStore, type SortMode } from "@/store";
import type { Track } from "@/types";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { useTr } from "@/lib/i18n";
import { normalizeSearchText } from "@/lib/search";

type FilterScope = "all" | "favorites";
type PlaysFilter = "any" | "never" | "played" | "10" | "50";
type AddedFilter = "any" | "7d" | "30d" | "year" | "older";
type DurationFilter = "any" | "short" | "medium" | "long" | "epic";
type FormatFilter = "any" | "lossless" | "lossy";
type OnlineFilter = "any" | "bound" | "unbound" | "netease" | "qq";
type NotesFilter = "any" | "noted" | "empty";
type CoverFilter = "any" | "cover" | "no-cover";

interface SongFilters {
  scope: FilterScope;
  ratingMin: number;
  ratingMax: number;
  includeUnrated: boolean;
  plays: PlaysFilter;
  added: AddedFilter;
  duration: DurationFilter;
  format: FormatFilter;
  online: OnlineFilter;
  notes: NotesFilter;
  cover: CoverFilter;
  blocks: string[];
  genres: string[];
}

const DEFAULT_FILTERS: SongFilters = {
  scope: "all",
  ratingMin: 0,
  ratingMax: 10,
  includeUnrated: true,
  plays: "any",
  added: "any",
  duration: "any",
  format: "any",
  online: "any",
  notes: "any",
  cover: "any",
  blocks: [],
  genres: [],
};

const LOSSLESS_EXTENSIONS = new Set(["flac", "wav", "aiff", "aif", "ape", "dsf", "dff"]);
const LOSSY_EXTENSIONS = new Set(["mp3", "m4a", "aac", "ogg", "opus", "wma"]);

function cloneFilters(filters: SongFilters): SongFilters {
  return { ...filters, blocks: [...filters.blocks], genres: [...filters.genres] };
}

function matchesSongFilters(track: Track, filters: SongFilters, favoriteIds: Set<string>): boolean {
  if (filters.scope === "favorites" && !favoriteIds.has(track.id)) return false;

  if (track.rating === 0) {
    if (!filters.includeUnrated || filters.ratingMin > 0) return false;
  } else if (track.rating < filters.ratingMin || track.rating > filters.ratingMax) {
    return false;
  }

  if (filters.plays === "never" && track.playCount > 0) return false;
  if (filters.plays === "played" && track.playCount <= 0) return false;
  if ((filters.plays === "10" || filters.plays === "50") && track.playCount < Number(filters.plays)) {
    return false;
  }

  if (filters.added !== "any") {
    if (!track.addedAt) return false;
    const age = Date.now() - track.addedAt;
    const day = 86_400_000;
    if (filters.added === "7d" && age > 7 * day) return false;
    if (filters.added === "30d" && age > 30 * day) return false;
    if (filters.added === "year" && age > 365 * day) return false;
    if (filters.added === "older" && age < 365 * day) return false;
  }

  if (filters.duration !== "any") {
    if (track.duration <= 0) return false;
    if (filters.duration === "short" && track.duration >= 120) return false;
    if (filters.duration === "medium" && (track.duration < 120 || track.duration >= 300)) return false;
    if (filters.duration === "long" && (track.duration < 300 || track.duration >= 600)) return false;
    if (filters.duration === "epic" && track.duration < 600) return false;
  }

  if (filters.format !== "any") {
    const extension = track.path.toLowerCase().split(".").pop() ?? "";
    if (filters.format === "lossless" && !LOSSLESS_EXTENSIONS.has(extension)) return false;
    if (filters.format === "lossy" && !LOSSY_EXTENSIONS.has(extension)) return false;
  }

  if (filters.online === "bound" && !track.neteaseId && !track.qqId) return false;
  if (filters.online === "unbound" && (track.neteaseId || track.qqId)) return false;
  if (filters.online === "netease" && !track.neteaseId) return false;
  if (filters.online === "qq" && !track.qqId) return false;

  if (filters.notes === "noted" && !track.note.trim()) return false;
  if (filters.notes === "empty" && track.note.trim()) return false;
  if (filters.cover === "cover" && !track.coverPath) return false;
  if (filters.cover === "no-cover" && track.coverPath) return false;

  if (filters.blocks.length && !filters.blocks.includes(track.block)) return false;
  if (filters.genres.length && !filters.genres.includes(track.genre)) return false;
  return true;
}

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
  const [filters, setFilters] = useState<SongFilters>(() => cloneFilters(DEFAULT_FILTERS));
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<SongFilters>(() => cloneFilters(DEFAULT_FILTERS));
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
    list = list.filter((track) => matchesSongFilters(track, filters, favoritesSet));

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
  }, [tracks, searchQuery, sortMode, favorites, filters]);

  const queue = visible.map((track) => track.id);
  const duration = visible.reduce((sum, track) => sum + (track.duration || 0), 0);
  const selectedCount = selected.size;
  const formatRating = (value: number) => value.toFixed(1);
  const ratingRangeActive = filters.ratingMin > 0 || filters.ratingMax < 10;
  const ratingLabel = ratingRangeActive
    ? tr(
        "Rating {min}–{max}",
        "评分 {min}–{max}",
        { min: formatRating(filters.ratingMin), max: formatRating(filters.ratingMax) },
      )
    : !filters.includeUnrated
      ? tr("Rated only", "仅已评分")
      : "";
  const playsLabel =
    filters.plays === "never"
      ? tr("Never played", "从未播放")
      : filters.plays === "played"
        ? tr("Played", "播放过")
        : filters.plays === "10"
          ? tr("10+ plays", "播放 10+")
          : filters.plays === "50"
            ? tr("50+ plays", "播放 50+")
            : "";
  const addedLabel =
    filters.added === "7d"
      ? tr("Added in 7 days", "7 天内添加")
      : filters.added === "30d"
        ? tr("Added in 30 days", "30 天内添加")
        : filters.added === "year"
          ? tr("Added this year", "今年添加")
          : filters.added === "older"
            ? tr("Older than a year", "一年前添加")
            : "";
  const durationLabel =
    filters.duration === "short"
      ? tr("Under 2 min", "2 分钟以下")
      : filters.duration === "medium"
        ? tr("2–5 min", "2–5 分钟")
        : filters.duration === "long"
          ? tr("5–10 min", "5–10 分钟")
          : filters.duration === "epic"
            ? tr("10 min+", "10 分钟以上")
            : "";
  const formatLabel =
    filters.format === "lossless" ? tr("Lossless", "无损") : filters.format === "lossy" ? tr("Lossy", "有损") : "";
  const onlineLabel =
    filters.online === "bound"
      ? tr("Linked online", "已绑定在线身份")
      : filters.online === "unbound"
        ? tr("Not linked", "未绑定在线身份")
        : filters.online === "netease"
          ? "NetEase"
          : filters.online === "qq"
            ? "QQ Music"
            : "";
  const notesLabel =
    filters.notes === "noted" ? tr("With notes", "有备注") : filters.notes === "empty" ? tr("No notes", "无备注") : "";
  const coverLabel =
    filters.cover === "cover" ? tr("With cover", "有封面") : filters.cover === "no-cover" ? tr("No cover", "无封面") : "";
  const filterSummary = [
    filters.scope === "favorites" ? tr("Favorites", "收藏") : "",
    ratingLabel,
    playsLabel,
    addedLabel,
    durationLabel,
    formatLabel,
    onlineLabel,
    notesLabel,
    coverLabel,
    ...filters.blocks,
    ...filters.genres,
  ].filter(Boolean);
  const activeFilterCount = filterSummary.length;
  const openFilters = () => {
    setDraft(cloneFilters(filters));
    setFilterOpen(true);
  };
  const applyFilters = () => {
    setFilters(cloneFilters(draft));
    setFilterOpen(false);
  };
  const clearFilters = () => {
    setDraft(cloneFilters(DEFAULT_FILTERS));
  };
  const clearAppliedFilters = () => {
    setFilters(cloneFilters(DEFAULT_FILTERS));
  };
  const draftCount = useMemo(
    () => tracks.filter((track) => matchesSongFilters(track, draft, favoritesSet)).length,
    [tracks, draft, favorites],
  );
  const setRatingMin = (value: number) => {
    setDraft((current) => ({
      ...current,
      ratingMin: Math.min(value, current.ratingMax),
    }));
  };
  const setRatingMax = (value: number) => {
    setDraft((current) => ({
      ...current,
      ratingMax: Math.max(value, current.ratingMin),
    }));
  };
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFilterOpen(false);
      }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [filterOpen]);

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
              className="button button--glass filter-button"
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              onClick={openFilters}
            >
              <SlidersHorizontal size={15} />
              {tr("Filter", "筛选")}
              {activeFilterCount > 0 && <em className="filter-button__count">{activeFilterCount}</em>}
            </button>
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
          <div className="filter-summary">
            {activeFilterCount === 0 ? (
              <span>{tr("All songs", "全部歌曲")}</span>
            ) : (
              <>
                {filterSummary.map((label, index) => (
                  <span className="filter-summary__chip" key={`${label}-${index}`}>{label}</span>
                ))}
                <button type="button" className="filter-summary__clear" onClick={clearAppliedFilters}>
                  <X size={12} /> {tr("Clear", "清除")}
                </button>
              </>
            )}
            {selecting && (
              <button type="button" className="taxonomy-filterbar__all" onClick={toggleAll}>
                {allSelected ? <Check size={12} /> : <CheckSquare size={12} />}
                {allSelected ? tr("All selected", "已全选") : tr("Select all", "全选")}
              </button>
            )}
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

      {filterOpen && createPortal(
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFilterOpen(false);
          }}
        >
          <div className="modal filter-dialog glass-strong" role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title">
            <div className="filter-dialog__head">
              <div className="filter-dialog__headcopy">
                <div className="filter-dialog__mark">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <div className="modal__eyebrow">
                    <span className="modal__dot" /> {tr("Library", "资料库")}
                  </div>
                  <h2 id="filter-dialog-title">{tr("Filter songs", "筛选歌曲")}</h2>
                  <p className="modal__description">
                    {tr("Shape the library down to the records you want to hear now.", "把资料库收窄到你现在想听的唱片。")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="filter-dialog__close"
                aria-label={tr("Close filter", "关闭筛选")}
                onClick={() => setFilterOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="filter-dialog__body">
              <section className="filter-section filter-section--quick">
                <div className="filter-section__head">
                  <span className="filter-section__title">{tr("Collection", "收藏范围")}</span>
                  <span className="filter-section__hint">{tr("Start with everything, or only your favorites.", "从全部歌曲开始，或只看收藏。")}</span>
                </div>
                <div className="filter-choice-grid filter-choice-grid--scope">
                  {(
                    [
                      ["all", tr("All songs", "全部歌曲"), tracks.length],
                      ["favorites", tr("Favorites", "收藏"), favorites.length],
                    ] as const
                  ).map(([value, label, count]) => (
                    <button
                      key={value}
                      type="button"
                      className={clsx("filter-choice", draft.scope === value && "is-active")}
                      onClick={() => setDraft((current) => ({ ...current, scope: value }))}
                    >
                      <span>{label}</span>
                      <em>{count}</em>
                    </button>
                  ))}
                </div>
              </section>

              <section className="filter-section">
                <div className="filter-section__head">
                  <span className="filter-section__title">{tr("Rating & activity", "评分与播放")}</span>
                  <span className="filter-section__hint">{tr("Narrow by how you have listened.", "按你的聆听习惯缩小范围。")}</span>
                </div>
                <div className="filter-fields filter-fields--two filter-fields--activity">
                  <div className="rating-range">
                    <div className="rating-range__head">
                      <div>
                        <span className="rating-range__label">{tr("Rating range", "评分范围")}</span>
                        <strong>{formatRating(draft.ratingMin)} – {formatRating(draft.ratingMax)}</strong>
                      </div>
                      {draft.ratingMin === 0 && (
                        <button
                          type="button"
                          className={clsx("rating-range__switch", draft.includeUnrated && "is-on")}
                          role="switch"
                          aria-checked={draft.includeUnrated}
                          onClick={() => setDraft((current) => ({ ...current, includeUnrated: !current.includeUnrated }))}
                        >
                          <i /> {tr("Include unrated", "包含未评分")}
                        </button>
                      )}
                    </div>
                    <div className="rating-range__slider">
                      <div className="rating-range__track">
                        <div
                          className="rating-range__fill"
                          style={{
                            left: `${draft.ratingMin * 10}%`,
                            right: `${(10 - draft.ratingMax) * 10}%`,
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={draft.ratingMin}
                        aria-label={tr("Minimum rating", "最低评分")}
                        className="rating-range__input rating-range__input--min"
                        onChange={(event) => setRatingMin(Number(event.target.value))}
                      />
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={draft.ratingMax}
                        aria-label={tr("Maximum rating", "最高评分")}
                        className="rating-range__input rating-range__input--max"
                        onChange={(event) => setRatingMax(Number(event.target.value))}
                      />
                    </div>
                    <div className="rating-range__ticks" aria-hidden="true">
                      <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
                    </div>
                  </div>
                  <label>
                    <span>{tr("Play count", "播放次数")}</span>
                    <select
                      value={draft.plays}
                      onChange={(event) => setDraft((current) => ({ ...current, plays: event.target.value as PlaysFilter }))}
                    >
                      <option value="any">{tr("Any play count", "全部次数")}</option>
                      <option value="never">{tr("Never played", "从未播放")}</option>
                      <option value="played">{tr("Played", "播放过")}</option>
                      <option value="10">{tr("10+ plays", "播放 10+")}</option>
                      <option value="50">{tr("50+ plays", "播放 50+")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{tr("Added", "添加时间")}</span>
                    <select
                      value={draft.added}
                      onChange={(event) => setDraft((current) => ({ ...current, added: event.target.value as AddedFilter }))}
                    >
                      <option value="any">{tr("Any time", "任何时间")}</option>
                      <option value="7d">{tr("Last 7 days", "最近 7 天")}</option>
                      <option value="30d">{tr("Last 30 days", "最近 30 天")}</option>
                      <option value="year">{tr("This year", "今年")}</option>
                      <option value="older">{tr("Older", "一年前")}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="filter-section">
                <div className="filter-section__head">
                  <span className="filter-section__title">{tr("File & identity", "文件与身份")}</span>
                  <span className="filter-section__hint">{tr("Match duration, audio format and online links.", "按时长、音频格式和在线绑定筛选。")}</span>
                </div>
                <div className="filter-fields filter-fields--three">
                  <label>
                    <span>{tr("Duration", "时长")}</span>
                    <select
                      value={draft.duration}
                      onChange={(event) => setDraft((current) => ({ ...current, duration: event.target.value as DurationFilter }))}
                    >
                      <option value="any">{tr("Any length", "全部时长")}</option>
                      <option value="short">{tr("Under 2 min", "2 分钟以下")}</option>
                      <option value="medium">{tr("2–5 min", "2–5 分钟")}</option>
                      <option value="long">{tr("5–10 min", "5–10 分钟")}</option>
                      <option value="epic">{tr("10 min+", "10 分钟以上")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{tr("Format", "格式")}</span>
                    <select
                      value={draft.format}
                      onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value as FormatFilter }))}
                    >
                      <option value="any">{tr("Any format", "全部格式")}</option>
                      <option value="lossless">{tr("Lossless", "无损")}</option>
                      <option value="lossy">{tr("Lossy", "有损")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{tr("Online", "在线身份")}</span>
                    <select
                      value={draft.online}
                      onChange={(event) => setDraft((current) => ({ ...current, online: event.target.value as OnlineFilter }))}
                    >
                      <option value="any">{tr("Any link", "全部")}</option>
                      <option value="bound">{tr("Linked", "已绑定")}</option>
                      <option value="unbound">{tr("Not linked", "未绑定")}</option>
                      <option value="netease">NetEase</option>
                      <option value="qq">QQ Music</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="filter-section">
                <div className="filter-section__head">
                  <span className="filter-section__title">{tr("Details", "其他细节")}</span>
                  <span className="filter-section__hint">{tr("Notes and artwork completeness.", "备注与封面完整度。")}</span>
                </div>
                <div className="filter-fields filter-fields--two">
                  <label>
                    <span>{tr("Notes", "备注")}</span>
                    <select
                      value={draft.notes}
                      onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value as NotesFilter }))}
                    >
                      <option value="any">{tr("Any note state", "全部")}</option>
                      <option value="noted">{tr("With notes", "有备注")}</option>
                      <option value="empty">{tr("No notes", "无备注")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{tr("Cover", "封面")}</span>
                    <select
                      value={draft.cover}
                      onChange={(event) => setDraft((current) => ({ ...current, cover: event.target.value as CoverFilter }))}
                    >
                      <option value="any">{tr("Any artwork", "全部")}</option>
                      <option value="cover">{tr("With cover", "有封面")}</option>
                      <option value="no-cover">{tr("No cover", "无封面")}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="filter-section">
                <div className="filter-section__head">
                  <span className="filter-section__title">{tr("Blocks", "区块")}</span>
                  <span className="filter-section__hint">
                    {draft.blocks.length
                      ? tr("{count} selected", "已选 {count} 个", { count: draft.blocks.length })
                      : tr("Select one or more blocks.", "可多选区块。")}
                  </span>
                </div>
                <div className="filter-tags">
                  {blocks.map((tag) => {
                    const count = tracks.filter((track) => track.block === tag.name).length;
                    const active = draft.blocks.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        type="button"
                        className={clsx("filter-tag", active && "is-active")}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            blocks: active ? current.blocks.filter((name) => name !== tag.name) : [...current.blocks, tag.name],
                          }))
                        }
                      >
                        <i style={{ background: tag.color }} />
                        <span>{tag.name}</span>
                        <em>{count}</em>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="filter-section">
                <div className="filter-section__head">
                  <span className="filter-section__title">{tr("Genres", "流派")}</span>
                  <span className="filter-section__hint">
                    {draft.genres.length
                      ? tr("{count} selected", "已选 {count} 个", { count: draft.genres.length })
                      : tr("Select one or more genres.", "可多选流派。")}
                  </span>
                </div>
                <div className="filter-tags">
                  {genres.map((tag) => {
                    const count = tracks.filter((track) => track.genre === tag.name).length;
                    const active = draft.genres.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        type="button"
                        className={clsx("filter-tag", active && "is-active")}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            genres: active ? current.genres.filter((name) => name !== tag.name) : [...current.genres, tag.name],
                          }))
                        }
                      >
                        <i style={{ background: tag.color }} />
                        <span>{tag.name}</span>
                        <em>{count}</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="filter-dialog__foot">
              <span className="filter-dialog__result">
                <strong>{draftCount}</strong>{" "}
                {tr(
                  draftCount === 1 ? "song will match" : "songs will match",
                  draftCount === 1 ? "首歌曲符合" : "首歌曲符合",
                )}
              </span>
              <div className="filter-dialog__actions">
                <button type="button" className="button button--glass" onClick={clearFilters}>
                  {tr("Reset", "重置")}
                </button>
                <button type="button" className="button button--dark" onClick={applyFilters}>
                  {tr("Apply filters", "应用筛选")}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.querySelector(".app") ?? document.getElementById("root") ?? document.body,
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
