import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  AlertTriangle,
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
  Trash2,
} from "lucide-react";
import type { TagKind, Track } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { Modal } from "@/components/Modal";
import { Cover } from "@/components/Cover";
import { formatTime } from "@/lib/format";
import { useTr } from "@/lib/i18n";
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
  const deleteTrack = useAppStore((state) => state.deleteTrack);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTaxonomyManager = useAppStore((state) => state.setTaxonomyManager);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const tr = useTr();

  const initialId =
    (view.kind === "editor" && view.trackId) || playback?.trackId || previewTrackId || tracks[0]?.id || null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [query, setQuery] = useState("");
  const [blockFilter, setBlockFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [draft, setDraft] = useState<Draft>(() => draftFor(tracks.find((track) => track.id === initialId)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null;
  const favorite = selected ? favorites.includes(selected.id) : false;
  const favoriteLabel = favorite ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "添加收藏");
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
      if (event.isComposing || event.keyCode === 229) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const removeSelected = async () => {
    if (!selected || deleting) return;
    setDeleting(true);
    const ok = await deleteTrack(selected.id);
    setDeleting(false);
    if (ok) setDeleteOpen(false);
  };

  if (!tracks.length) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={tr("Curation", "策展")}
          title={tr("Song editor", "歌曲编辑")}
          description={tr(
            "Add music to your library first, then shape how each song is filed.",
            "请先向资料库添加音乐，再来整理每首歌的归档方式。",
          )}
        />
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <Disc3 size={28} />
          </div>
          <h2>{tr("No songs to edit yet.", "暂无可编辑的歌曲。")}</h2>
          <p>
            {tr(
              "Choose a music folder from Home, then come back to edit blocks, genres, ratings and notes.",
              "请先在首页选择音乐文件夹，再回来编辑区块、流派、评分和备注。",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--editor">
      <PageHeader
        eyebrow={tr("Curation", "策展")}
        title={tr("Song editor", "歌曲编辑")}
        description={tr(
          "One song at a time: file it, rate it, leave a note. Changes save into your library, not the audio file.",
          "一次一首歌：归档、评分、留下备注。更改只保存到资料库，不会改动音频文件。",
        )}
        actions={
          <>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager("block")}>
              <Layers3 size={14} /> {tr("Blocks", "区块")}
            </button>
            <button type="button" className="button button--glass" onClick={() => setTaxonomyManager("genre")}>
              <TagIcon size={14} /> {tr("Genres", "流派")}
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
              placeholder={tr("Find a song…", "查找歌曲…")}
              aria-label={tr("Find a song to edit", "查找要编辑的歌曲")}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label={tr("Clear search", "清除搜索")} onClick={() => setQuery("")}>
                ×
              </button>
            )}
          </div>
          <div className="editor-filters">
            <label>
              <span className="editor-filter-dot" style={{ background: blockColor }} />
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
            <label>
              <span className="editor-filter-dot" style={{ background: genreColor }} />
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
          </div>
          <div className="editor-browser__meta">
            <span>
              {tr(
                filtered.length === 1 ? "{count} song" : "{count} songs",
                "{count} 首歌曲",
                { count: filtered.length },
              )}
            </span>
            {blockFilter || genreFilter ? (
              <button
                type="button"
                onClick={() => {
                  setBlockFilter("");
                  setGenreFilter("");
                }}
              >
                {tr("Clear filters", "清除筛选")}
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
            {!filtered.length && <p className="editor-list__empty">{tr("No songs match these filters.", "没有歌曲符合这些筛选条件。")}</p>}
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
                    <Sparkles size={12} /> {tr("Selected song", "已选歌曲")}
                  </span>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.artist}
                    {selected.album ? ` · ${selected.album}` : ""}
                  </p>
                  <div className="editor-meta">
                    <span>{formatTime(selected.duration)}</span>
                    <i />
                    <span>
                      {tr(
                        selected.playCount === 1 ? "{count} play" : "{count} plays",
                        "{count} 次播放",
                        { count: selected.playCount },
                      )}
                    </span>
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
                      {playing ? tr("Pause", "暂停") : tr("Play", "播放")}
                    </button>
                    <button
                      type="button"
                      className={clsx("icon-button icon-button--glass icon-button--sm", favorite && "is-favorite")}
                      aria-label={favoriteLabel}
                      title={favoriteLabel}
                      onClick={() => void toggleFavorite(selected.id)}
                    >
                      <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--glass icon-button--sm danger-hover"
                      aria-label={tr("Delete song", "删除歌曲")}
                      title={tr("Delete song", "删除歌曲")}
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="editor-form">
                <label className="editor-field">
                  <span>
                    <Layers3 size={12} /> {tr("Block", "区块")}
                  </span>
                  <div className="editor-select-wrap">
                    <i style={{ background: blockColor }} />
                    <select value={draft.block} onChange={(event) => setDraft({ ...draft, block: event.target.value })}>
                      <option value="">{tr("No block", "无区块")}</option>
                      {blocks.map((tag) => (
                        <option key={tag.name} value={tag.name}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setTaxonomyManager("block")} title={tr("Manage blocks", "管理区块")}>
                      <Pencil size={12} />
                    </button>
                  </div>
                </label>

                <label className="editor-field">
                  <span>
                    <TagIcon size={12} /> {tr("Genre", "流派")}
                  </span>
                  <div className="editor-select-wrap">
                    <i style={{ background: genreColor }} />
                    <select value={draft.genre} onChange={(event) => setDraft({ ...draft, genre: event.target.value })}>
                      <option value="">{tr("No genre", "无流派")}</option>
                      {genres.map((tag) => (
                        <option key={tag.name} value={tag.name}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setTaxonomyManager("genre")} title={tr("Manage genres", "管理流派")}>
                      <Pencil size={12} />
                    </button>
                  </div>
                </label>

                <div className="editor-field editor-field--wide">
                  <span className="editor-field__label-row">
                    <span>{tr("Rating", "评分")}</span>
                    <strong>{draft.rating.toFixed(1)}</strong>
                  </span>
                  <div className="editor-rating">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.1}
                      value={draft.rating}
                      aria-label={tr("Personal rating", "个人评分")}
                      onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })}
                      style={{ "--rating-progress": `${draft.rating * 10}%` } as React.CSSProperties}
                    />
                    <button type="button" className="editor-rating__reset" onClick={() => setDraft({ ...draft, rating: 0 })}>
                      {tr("Reset", "重置")}
                    </button>
                  </div>
                </div>

                <label className="editor-field editor-field--wide">
                  <span>
                    {tr("Personal note", "个人备注")} <em>{draft.note.length} / 2000</em>
                  </span>
                  <textarea
                    className="editor-note"
                    value={draft.note}
                    maxLength={2000}
                    rows={4}
                    placeholder={tr("A memory, a mood, why it belongs here…", "一段回忆、一种心情，或它为何属于这里…")}
                    onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  />
                </label>
              </div>

              <div className="editor-savebar">
                <span className={clsx("editor-status", dirty && "is-dirty", saved && !dirty && "is-saved")}>
                  {saving ? (
                    <>
                      <LoaderCircle size={13} className="is-spinning" /> {tr("Saving…", "正在保存…")}
                    </>
                  ) : dirty ? (
                    <>
                      <span className="editor-status__dot" /> {tr("Unsaved changes", "有未保存的更改")}
                    </>
                  ) : saved ? (
                    <>
                      <Check size={13} /> {tr("Saved to your library", "已保存到资料库")}
                    </>
                  ) : (
                    <>
                      <Check size={13} /> {tr("All changes saved", "所有更改已保存")}
                    </>
                  )}
                </span>
                <div className="editor-savebar__actions">
                  <button type="button" className="button button--glass button--small" disabled={!dirty || saving} onClick={revert}>
                    <RotateCcw size={13} /> {tr("Discard", "放弃更改")}
                  </button>
                  <button
                    type="button"
                    className="button button--dark button--small"
                    disabled={!dirty || saving}
                    onClick={() => void saveDraft()}
                  >
                    {saving ? <LoaderCircle size={13} className="is-spinning" /> : <Save size={13} />}
                    {tr("Save changes", "保存更改")}
                  </button>
                </div>
              </div>

              <div className="editor-stepbar">
                <button type="button" className="text-button" onClick={() => void step(-1)}>
                  <ChevronLeft size={14} /> {tr("Previous", "上一首")}
                </button>
                <span>
                  {tr(
                    "{current} of {total}",
                    "{current} / {total}",
                    { current: selectedStep >= 0 ? selectedStep + 1 : "–", total: stepList.length },
                  )}
                </span>
                <button type="button" className="text-button" onClick={() => void step(1)}>
                  {tr("Next", "下一首")} <ChevronRight size={14} />
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {deleteOpen && selected && (
          <Modal className="delete-track-dialog" labelledBy="delete-track-title" onClose={() => setDeleteOpen(false)}>
            <div className="modal__eyebrow delete-track-eyebrow">
              <Trash2 size={12} /> {tr("Danger zone", "危险操作")}
            </div>
            <h2 id="delete-track-title">
              {tr("Delete “{title}”?", "删除“{title}”？", { title: selected.title })}
            </h2>
            <p className="modal__description">
              {tr(
                "This removes the song from your library and playlists. If the audio file is inside your library folder, it is moved to Potatoplayer's trash so it can still be recovered.",
                "这会从资料库和歌单中移除这首歌。如果音频文件位于资料库文件夹中，它会被移到 Potatoplayer 的回收站，日后仍可恢复。",
              )}
            </p>
            <div className="delete-track-target">
              <Cover path={selected.coverPath} seed={selected.id} label={selected.title} radius={10} />
              <div>
                <strong>{selected.title}</strong>
                <span>{selected.artist}</span>
              </div>
            </div>
            <div className="delete-track-warning">
              <AlertTriangle size={14} />
              {tr("The file will no longer appear in the library.", "该文件将不再显示在资料库中。")}
            </div>
            <div className="modal__actions">
              <button type="button" className="button button--glass" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                {tr("Cancel", "取消")}
              </button>
              <button type="button" className="button button--danger" disabled={deleting} onClick={() => void removeSelected()}>
                {deleting ? <LoaderCircle size={14} className="is-spinning" /> : <Trash2 size={14} />}
                {tr("Delete song", "删除歌曲")}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
