import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Heart,
  Layers3,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Tag as TagIcon,
} from "lucide-react";
import type { TagKind, Track } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { Cover } from "@/components/Cover";
import { formatTime } from "@/lib/format";
import { coverUrl } from "@/lib/covers";

type Draft = {
  block: string;
  genre: string;
  rating: number;
  note: string;
};

function draftFor(track: Track | undefined): Draft {
  return {
    block: track?.block ?? "",
    genre: track?.genre ?? "",
    rating: track?.rating ?? 0,
    note: track?.note ?? "",
  };
}

export function SongEditorPage() {
  const view = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const tracks = useAppStore((state) => state.tracks);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const favorites = useAppStore((state) => state.favorites);
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const updateTrack = useAppStore((state) => state.updateTrack);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTaxonomyManager = useAppStore((state) => state.setTaxonomyManager);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);

  const initialId =
    (view.kind === "editor" && view.trackId) || playback?.trackId || previewTrackId || tracks[0]?.id || null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [query, setQuery] = useState("");
  const [blockFilter, setBlockFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [draft, setDraft] = useState<Draft>(() => draftFor(tracks.find((track) => track.id === initialId)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null;
  const favorite = selected ? favorites.includes(selected.id) : false;
  const playing = Boolean(selected && playback?.trackId === selected.id && playback.playing);
  const coverSeed = selected?.id ?? "editor";

  useEffect(() => {
    if (view.kind === "editor" && view.trackId && view.trackId !== selectedId) {
      setSelectedId(view.trackId);
    }
    // Only react to a new route target, not to local list selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!selected && tracks[0]) setSelectedId(tracks[0].id);
  }, [selected, tracks]);

  useEffect(() => {
    setDraft(draftFor(selected));
    setSaved(false);
  }, [selected?.id, selected?.block, selected?.genre, selected?.rating, selected?.note]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tracks.filter((track) => {
      if (blockFilter && track.block !== blockFilter) return false;
      if (genreFilter && track.genre !== genreFilter) return false;
      if (!needle) return true;
      return `${track.title} ${track.artist} ${track.album} ${track.block} ${track.genre} ${track.note}`
        .toLowerCase()
        .includes(needle);
    });
  }, [tracks, query, blockFilter, genreFilter]);

  const dirty =
    Boolean(selected) &&
    (draft.block !== (selected?.block ?? "") ||
      draft.genre !== (selected?.genre ?? "") ||
      Math.abs(draft.rating - (selected?.rating ?? 0)) > 0.0001 ||
      draft.note !== (selected?.note ?? ""));

  const blockColor = blocks.find((tag) => tag.name === draft.block)?.color ?? "#b8aa97";
  const genreColor = genres.find((tag) => tag.name === draft.genre)?.color ?? "#b8aa97";
  const stepList = filtered.some((track) => track.id === selected?.id) ? filtered : tracks;
  const selectedStep = selected ? stepList.findIndex((track) => track.id === selected.id) : -1;

  useEffect(() => {
    const scrollSelectedIntoView = () => {
      const list = listRef.current;
      const node = list?.querySelector<HTMLElement>(".editor-track.is-active");
      if (!list || !node) return;
      const listRect = list.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      if (nodeRect.top < listRect.top || nodeRect.bottom > listRect.bottom) {
        list.scrollTo({
          top: list.scrollTop + nodeRect.top - listRect.top - 8,
          behavior: "smooth",
        });
      }
    };
    scrollSelectedIntoView();
    const timer = window.setTimeout(scrollSelectedIntoView, 380);
    return () => window.clearTimeout(timer);
  }, [selectedId, filtered.length, rightPanelOpen]);

  const saveDraft = async () => {
    if (!selected || !dirty || saving) return false;
    setSaving(true);
    const ok = await updateTrack(selected.id, {
      block: draft.block,
      genre: draft.genre,
      rating: draft.rating,
      note: draft.note,
    });
    setSaving(false);
    if (ok) setSaved(true);
    return ok;
  };

  const selectTrack = async (id: string) => {
    if (id === selected?.id) return;
    if (dirty) {
      const ok = await saveDraft();
      if (!ok) return;
    }
    setSelectedId(id);
  };

  const step = async (direction: -1 | 1) => {
    if (!stepList.length) return;
    const index = selectedStep < 0 ? 0 : selectedStep;
    const next = (index + direction + stepList.length) % stepList.length;
    await selectTrack(stepList[next].id);
  };

  const revert = () => {
    setDraft(draftFor(selected));
    setSaved(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!tracks.length) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Curation"
          title="Song editor"
          description="Add music to your library first, then shape how each song is filed."
        />
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <Disc3 size={28} />
          </div>
          <h2>No songs to edit yet.</h2>
          <p>Choose a music folder from Home, then come back to edit blocks, genres, ratings and notes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--editor">
      <PageHeader
        eyebrow="Curation"
        title="Song editor"
        description="One song at a time: file it, rate it, leave a note. Changes save into your library, not the audio file."
        actions={
          <>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager("block")}>
              <Layers3 size={14} /> Blocks
            </button>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager("genre")}>
              <TagIcon size={14} /> Genres
            </button>
          </>
        }
      />

      <div className="editor-layout">
        <aside className="editor-browser glass">
          <div className="editor-search">
            <Search size={14} />
            <input
              value={query}
              placeholder="Find a song…"
              aria-label="Find a song to edit"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                ×
              </button>
            )}
          </div>
          <div className="editor-filters">
            <label>
              <span className="editor-filter-dot" style={{ background: blockColor }} />
              <select value={blockFilter} onChange={(event) => setBlockFilter(event.target.value)} aria-label="Filter by block">
                <option value="">All blocks</option>
                {blocks.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="editor-filter-dot" style={{ background: genreColor }} />
              <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)} aria-label="Filter by genre">
                <option value="">All genres</option>
                {genres.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="editor-browser__meta">
            <span>{filtered.length} songs</span>
            {blockFilter || genreFilter ? (
              <button
                type="button"
                onClick={() => {
                  setBlockFilter("");
                  setGenreFilter("");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="editor-list" ref={listRef}>
            {filtered.map((track) => {
              const active = track.id === selected?.id;
              const trackBlockColor = blocks.find((tag) => tag.name === track.block)?.color;
              const trackGenreColor = genres.find((tag) => tag.name === track.genre)?.color;
              return (
                <button
                  type="button"
                  key={track.id}
                  className={clsx("editor-track", active && "is-active")}
                  data-track-id={track.id}
                  onClick={() => void selectTrack(track.id)}
                >
                  <Cover path={track.coverPath} seed={track.id} label={track.title} radius={8} className="editor-track__cover" />
                  <span className="editor-track__copy">
                    <strong>{track.title}</strong>
                    <em>{track.artist}</em>
                  </span>
                  <span className="editor-track__tags" aria-hidden="true">
                    <i style={{ background: trackBlockColor ?? "transparent" }} />
                    <i style={{ background: trackGenreColor ?? "transparent" }} />
                  </span>
                  {active && <span className="editor-track__active" />}
                </button>
              );
            })}
            {!filtered.length && <p className="editor-list__empty">No songs match these filters.</p>}
          </div>
        </aside>

        <AnimatePresence mode="wait" initial={false}>
          {selected && (
            <motion.section
              key={selected.id}
              className="editor-panel glass"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {selected.coverPath && (
                <div
                  className="editor-panel__wash"
                  style={{ backgroundImage: `url("${coverUrl(selected.coverPath)}")` }}
                  aria-hidden="true"
                />
              )}

              <div className="editor-panel__top">
                <div className="editor-art">
                  <Cover path={selected.coverPath} seed={coverSeed} label={selected.title} radius={19} eager />
                </div>
                <div className="editor-heading">
                  <span className="eyebrow">
                    <Sparkles size={12} /> Selected song
                  </span>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.artist}
                    {selected.album ? ` · ${selected.album}` : ""}
                  </p>
                  <div className="editor-meta">
                    <span>{formatTime(selected.duration)}</span>
                    <i />
                    <span>{selected.playCount} plays</span>
                    {selected.rating > 0 && (
                      <>
                        <i />
                        <span className="rating-inline">★ {draft.rating.toFixed(1)}</span>
                      </>
                    )}
                  </div>
                  <div className="editor-heading__actions">
                    <button
                      type="button"
                      className="button button--dark button--small"
                      onClick={() => (playing ? void togglePlay() : void playTrack(selected, tracks.map((track) => track.id)))}
                    >
                      {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                      {playing ? "Pause" : "Play"}
                    </button>
                    <button
                      type="button"
                      className={clsx("icon-button icon-button--glass icon-button--sm", favorite && "is-favorite")}
                      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                      title={favorite ? "Remove from favorites" : "Add to favorites"}
                      onClick={() => void toggleFavorite(selected.id)}
                    >
                      <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="editor-form">
                <label className="editor-field">
                  <span>
                    <Layers3 size={12} /> Block
                  </span>
                  <div className="editor-select-wrap">
                    <i style={{ background: blockColor }} />
                    <select value={draft.block} onChange={(event) => setDraft({ ...draft, block: event.target.value })}>
                      <option value="">No block</option>
                      {blocks.map((tag) => (
                        <option key={tag.name} value={tag.name}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setTaxonomyManager("block")} title="Manage blocks">
                      <Pencil size={12} />
                    </button>
                  </div>
                </label>

                <label className="editor-field">
                  <span>
                    <TagIcon size={12} /> Genre
                  </span>
                  <div className="editor-select-wrap">
                    <i style={{ background: genreColor }} />
                    <select value={draft.genre} onChange={(event) => setDraft({ ...draft, genre: event.target.value })}>
                      <option value="">No genre</option>
                      {genres.map((tag) => (
                        <option key={tag.name} value={tag.name}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setTaxonomyManager("genre")} title="Manage genres">
                      <Pencil size={12} />
                    </button>
                  </div>
                </label>

                <div className="editor-field editor-field--wide">
                  <span className="editor-field__label-row">
                    <span>Rating</span>
                    <strong>{draft.rating.toFixed(1)}</strong>
                  </span>
                  <div className="editor-rating">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.1}
                      value={draft.rating}
                      aria-label="Personal rating"
                      onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })}
                      style={{ "--rating-progress": `${draft.rating * 10}%` } as React.CSSProperties}
                    />
                    <button type="button" className="editor-rating__reset" onClick={() => setDraft({ ...draft, rating: 0 })}>
                      Reset
                    </button>
                  </div>
                </div>

                <label className="editor-field editor-field--wide">
                  <span>
                    Personal note <em>{draft.note.length} / 2000</em>
                  </span>
                  <textarea
                    className="editor-note"
                    value={draft.note}
                    maxLength={2000}
                    rows={4}
                    placeholder="A memory, a mood, why it belongs here…"
                    onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  />
                </label>
              </div>

              <div className="editor-savebar">
                <span className={clsx("editor-status", dirty && "is-dirty", saved && !dirty && "is-saved")}>
                  {saving ? (
                    <>
                      <LoaderCircle size={13} className="is-spinning" /> Saving…
                    </>
                  ) : dirty ? (
                    <>
                      <span className="editor-status__dot" /> Unsaved changes
                    </>
                  ) : saved ? (
                    <>
                      <Check size={13} /> Saved to your library
                    </>
                  ) : (
                    <>
                      <Check size={13} /> All changes saved
                    </>
                  )}
                </span>
                <div className="editor-savebar__actions">
                  <button type="button" className="button button--glass button--small" disabled={!dirty || saving} onClick={revert}>
                    <RotateCcw size={13} /> Discard
                  </button>
                  <button
                    type="button"
                    className="button button--dark button--small"
                    disabled={!dirty || saving}
                    onClick={() => void saveDraft()}
                  >
                    {saving ? <LoaderCircle size={13} className="is-spinning" /> : <Save size={13} />}
                    Save changes
                  </button>
                </div>
              </div>

              <div className="editor-stepbar">
                <button type="button" className="text-button" onClick={() => void step(-1)}>
                  <ChevronLeft size={14} /> Previous
                </button>
                <span>
                  {selectedStep >= 0 ? selectedStep + 1 : "–"} of {stepList.length}
                </span>
                <button type="button" className="text-button" onClick={() => void step(1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
