import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowDownUp, Check, CheckSquare, FolderOpen, Layers3, ListEnd, ListMusic, ListPlus, Play, SearchX, Shuffle, Tag as TagIcon, X } from "lucide-react";
import { useAppStore, type SortMode } from "@/store";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";

type Filter = "all" | "favorites" | "rated";

const sortLabels: Record<SortMode, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  recent: "Recently added",
  plays: "Most played",
  rating: "Highest rated",
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function SongsPage() {
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

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = [...tracks];
    if (query) {
      list = list.filter((track) =>
        `${track.title} ${track.artist} ${track.album} ${track.genre} ${track.block}`.toLowerCase().includes(query),
      );
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
        <PageHeader title="Songs" description="Every track in your local library." />
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <FolderOpen size={28} />
          </div>
          <h2>No songs indexed yet.</h2>
          <p>Choose a folder with audio files and they will show up here.</p>
          <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
            <FolderOpen size={16} /> Choose music folder
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--songs">
      <PageHeader
        title="Songs"
        description={`${tracks.length} tracks · ${formatLongDuration(tracks.reduce((sum, track) => sum + track.duration, 0))} of listening`}
        actions={
          <>
            <button
              type="button"
              className={clsx("button", selecting ? "button--dark" : "button--glass")}
              onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            >
              <CheckSquare size={15} />
              {selecting ? "Done" : "Select"}
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
              Shuffle
            </button>
            <button
              type="button"
              className="button button--dark"
              onClick={() => {
                if (visible[0]) void playTrack(visible[0], queue);
              }}
            >
              <Play size={15} fill="currentColor" />
              Play
            </button>
          </>
        }
      />

      <div className="list-toolbar glass">
        <div className="filter-chips">
          {(
            [
              ["all", "All songs", tracks.length],
              ["favorites", "Favorites", favorites.length],
              ["rated", "Rated 8+", tracks.filter((track) => track.rating >= 8).length],
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
            {visible.length} of {tracks.length}
          </span>
          <label className="sort-control">
            <ArrowDownUp size={13} />
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort songs">
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="taxonomy-filterbar glass">
        <span className="taxonomy-filterbar__label">
          <Layers3 size={13} /> Focus
        </span>
        <label className="taxonomy-select">
          <span className="taxonomy-select__dot" style={{ background: blocks.find((tag) => tag.name === blockFilter)?.color ?? "transparent" }} />
          <select value={blockFilter} onChange={(event) => setBlockFilter(event.target.value)} aria-label="Filter by block">
            <option value="">All blocks</option>
            {blocks.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label className="taxonomy-select">
          <span className="taxonomy-select__dot" style={{ background: genres.find((tag) => tag.name === genreFilter)?.color ?? "transparent" }} />
          <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)} aria-label="Filter by genre">
            <option value="">All genres</option>
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
            <X size={12} /> Clear focus
          </button>
        )}
        <span className="taxonomy-filterbar__count">{visible.length} matched</span>
        {selecting && (
          <button type="button" className="taxonomy-filterbar__all" onClick={toggleAll}>
            {allSelected ? <Check size={12} /> : <CheckSquare size={12} />}
            {allSelected ? "All selected" : "Select all"}
          </button>
        )}
      </div>

      {searchQuery && (
        <div className="query-note">
          <span>
            Results for <strong>“{searchQuery}”</strong>
          </span>
          <em>{formatLongDuration(duration)}</em>
        </div>
      )}

      {visible.length ? (
        <TrackTable
          tracks={visible}
          queue={queue}
          selectionMode={selecting}
          selectedIds={selected}
          onSelect={toggleSelected}
        />
      ) : (
        <motion.div className="search-empty glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <SearchX size={24} />
          <h3>No matching songs</h3>
          <p>Try a different title, artist or album.</p>
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
            <strong>{selectedCount}</strong> selected
          </span>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => void enqueueMany([...selected], true)}
          >
            <ListEnd size={14} /> Play next
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => void enqueueMany([...selected], false)}
          >
            <ListPlus size={14} /> Add to queue
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => setAddToPlaylistTrackIds([...selected])}
          >
            <ListMusic size={14} /> Add to playlist
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => setBulkAssign({ trackIds: [...selected], field: "block" })}
          >
            <Layers3 size={14} /> Assign block
          </button>
          <button
            type="button"
            className="button button--glass button--small"
            onClick={() => setBulkAssign({ trackIds: [...selected], field: "genre" })}
          >
            <TagIcon size={14} /> Assign genre
          </button>
          <button type="button" className="button button--dark button--small" onClick={exitSelection}>
            Done
          </button>
        </motion.div>,
        document.body,
      )}
    </div>
  );
}
