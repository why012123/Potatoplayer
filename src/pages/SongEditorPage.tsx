import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  AlertTriangle,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Heart,
  Layers3,
  Link2,
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
import type { DownloadQuality, TagKind, Track } from "@/types";
import { downloadQualityLabel, downloadQualityRank, useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { Modal } from "@/components/Modal";
import { Cover } from "@/components/Cover";
import { formatTime, humanBytes } from "@/lib/format";
import { useTr } from "@/lib/i18n";
import { normalizeSearchText, trackSearchText } from "@/lib/search";
import { coverUrl } from "@/lib/covers";

type Draft = {
  block: string;
  genre: string;
  rating: number;
  note: string;
  neteaseId: string;
  qqId: string;
};

function draftFor(track: Track | undefined): Draft {
  return {
    block: track?.block ?? "",
    genre: track?.genre ?? "",
    rating: track?.rating ?? 0,
    note: track?.note ?? "",
    neteaseId: track?.neteaseId ?? "",
    qqId: track?.qqId ?? "",
  };
}

interface QualityOption {
  /** Honest obtainable tier: what the provider will actually serve. */
  quality: DownloadQuality;
  /** Tier that was requested when this option was probed (may differ when substituted). */
  requestedQuality?: DownloadQuality;
  servedLevel?: string;
  type?: string;
  br?: number;
  size?: number;
  substituted?: boolean;
}

interface QualityInfo {
  trackId: string;
  title: string;
  artist?: string;
  platform: string;
  onlineId?: string;
  currentQuality: DownloadQuality;
  available: QualityOption[];
  upgradeAvailable: boolean;
  /** Lower tiers the provider can honestly serve, highest first. */
  downgrades: QualityOption[];
  downgradeAvailable: boolean;
  recommended?: DownloadQuality;
  path?: string;
  fileSize?: number;
}

/** Response of track.changeQuality: quality options plus the queued change. */
interface ChangeQualityResult extends QualityInfo {
  queued?: boolean;
  direction?: "upgrade" | "downgrade" | "same";
  quality?: DownloadQuality;
  requestedQuality?: DownloadQuality;
  substituted?: boolean;
  previousQuality?: DownloadQuality;
  jobId?: string;
  reason?: string;
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
  const pushToast = useAppStore((state) => state.pushToast);
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
  const [qualityInfo, setQualityInfo] = useState<QualityInfo | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const [qualityBusy, setQualityBusy] = useState(false);
  const [qualityTier, setQualityTier] = useState<DownloadQuality | "">("");
  const [qualityConfirmOpen, setQualityConfirmOpen] = useState(false);
  const [qualityReload, setQualityReload] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null;
  const favorite = selected ? favorites.includes(selected.id) : false;
  const favoriteLabel = favorite ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "添加收藏");
  const playing = Boolean(selected && playback?.trackId === selected.id && playback.playing);
  const coverSeed = selected?.id ?? "editor";

  const upgradeOptions = qualityInfo?.available ?? [];
  const downgradeOptions = qualityInfo?.downgrades ?? [];
  const hasQualityChoices = Boolean(qualityInfo && (upgradeOptions.length || downgradeOptions.length));
  const currentQualityRank = qualityInfo ? downloadQualityRank(qualityInfo.currentQuality) : -1;
  const selectedQualityIsDowngrade = Boolean(
    qualityTier &&
      currentQualityRank >= 0 &&
      downloadQualityRank(qualityTier) >= 0 &&
      downloadQualityRank(qualityTier) < currentQualityRank,
  );
  const downgradeTarget = downgradeOptions.find((option) => option.quality === qualityTier);

  useEffect(() => {
    const trackId = selected?.id;
    if (!trackId) {
      setQualityInfo(null);
      setQualityError("");
      setQualityTier("");
      setQualityConfirmOpen(false);
      return;
    }
    let alive = true;
    setQualityLoading(true);
    setQualityInfo(null);
    setQualityError("");
    setQualityTier("");
    setQualityConfirmOpen(false);
    void window.potato
      .invoke<QualityInfo>("track.qualityOptions", { trackId })
      .then((info) => {
        if (!alive) return;
        setQualityInfo(info);
        // Prefer the recommended upgrade; when nothing can be upgraded, suggest the
        // highest honest downgrade without ever running it on its own.
        const recommended =
          info.recommended && (info.available ?? []).some((option) => option.quality === info.recommended)
            ? info.recommended
            : info.available?.[0]?.quality;
        setQualityTier(recommended ?? info.downgrades?.[0]?.quality ?? "");
      })
      .catch((error) => {
        if (!alive) return;
        setQualityInfo(null);
        setQualityError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (alive) setQualityLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected?.id, qualityReload]);

  const changeQuality = async () => {
    if (!selected || qualityBusy || !qualityTier) return;
    const target = qualityTier;
    setQualityBusy(true);
    try {
      const result = await window.potato.invoke<ChangeQualityResult>("track.changeQuality", {
        trackId: selected.id,
        quality: target,
      });
      if (result.queued) {
        setQualityConfirmOpen(false);
        const direction = result.direction ?? "upgrade";
        const title =
          direction === "downgrade"
            ? tr("Downgrade queued", "已加入降级队列")
            : direction === "same"
              ? tr("Refresh queued", "已加入信息刷新队列")
              : tr("Upgrade queued", "已加入升级队列");
        pushToast(
          title,
          [downloadQualityLabel(result.quality ?? target), tr("the download panel shows progress", "可在下载面板查看进度")]
            .filter(Boolean)
            .join(" · "),
          "success",
        );
      } else {
        setQualityConfirmOpen(false);
        pushToast(
          tr("Could not change quality", "无法更改音质"),
          result.reason || tr("The source cannot provide the requested tier right now.", "音源暂时无法提供所请求的档位。"),
          "default",
        );
      }
    } catch (error) {
      pushToast(
        tr("Could not change quality", "无法更改音质"),
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setQualityBusy(false);
    }
  };

  const requestQualityChange = () => {
    if (qualityBusy || !qualityTier) return;
    // Lowering the tier always asks first: it shrinks the file but reduces audio quality.
    if (selectedQualityIsDowngrade) {
      setQualityConfirmOpen(true);
      return;
    }
    void changeQuality();
  };

  useEffect(() => {
    const trackId = selected?.id;
    if (!trackId) return;
    const onlineIds = [selected?.neteaseId, selected?.qqId].filter((id): id is string => Boolean(id));
    const off = window.potato.onEvent(({ event, data }) => {
      if (event !== "download.done") return;
      const payload = data as { trackId?: string; neteaseId?: string };
      const matches =
        payload.trackId === trackId || Boolean(payload.neteaseId && onlineIds.includes(payload.neteaseId));
      if (matches) setQualityReload((value) => value + 1);
    });
    return off;
  }, [selected?.id, selected?.neteaseId, selected?.qqId]);

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
  }, [selected?.id, selected?.block, selected?.genre, selected?.rating, selected?.note, selected?.neteaseId, selected?.qqId]);

  const filtered = useMemo(() => {
    const rawQuery = query.trim();
    const needle = normalizeSearchText(rawQuery);
    return tracks.filter((track) => {
      if (blockFilter && track.block !== blockFilter) return false;
      if (genreFilter && track.genre !== genreFilter) return false;
      if (!rawQuery) return true;
      if (!needle) return false;
      return normalizeSearchText(trackSearchText(track)).includes(needle);
    });
  }, [tracks, query, blockFilter, genreFilter]);

  const dirty =
    Boolean(selected) &&
    (draft.block !== (selected?.block ?? "") ||
      draft.genre !== (selected?.genre ?? "") ||
      Math.abs(draft.rating - (selected?.rating ?? 0)) > 0.0001 ||
      draft.note !== (selected?.note ?? "") ||
      draft.neteaseId.trim() !== (selected?.neteaseId ?? "") ||
      draft.qqId.trim() !== (selected?.qqId ?? ""));

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
      neteaseId: draft.neteaseId,
      qqId: draft.qqId,
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

                <div className="editor-field editor-field--wide editor-source">
                  <span>
                    <Link2 size={12} /> {tr("Online identity", "在线身份")}
                    <em>{tr("Used by Comments", "用于评论页")}</em>
                  </span>
                  <div className="editor-source__grid">
                    <label>
                      <span>{tr("NetEase ID", "网易云 ID")}</span>
                      <input
                        className="text-field"
                        value={draft.neteaseId}
                        inputMode="numeric"
                        placeholder={tr("Numeric song id", "数字歌曲 ID")}
                        onChange={(event) => setDraft({
                          ...draft,
                          neteaseId: event.target.value,
                        })}
                      />
                    </label>
                    <label>
                      <span>{tr("QQ Music MID", "QQ 音乐 MID")}</span>
                      <input
                        className="text-field"
                        value={draft.qqId}
                        placeholder={tr("Song MID", "歌曲 MID")}
                        onChange={(event) => setDraft({
                          ...draft,
                          qqId: event.target.value,
                        })}
                      />
                    </label>
                  </div>
                  <em className="editor-source__hint">
                    {tr(
                      "Both platform IDs can be saved independently. Comments prefer NetEase when both are present; your audio file is untouched.",
                      "两个平台可同时绑定，修改一个不会清除另一个；同时绑定时评论优先使用网易云，不改动音频文件。",
                    )}
                  </em>
                </div>

                <div className="editor-field editor-field--wide editor-quality">
                  <span>
                    <AudioLines size={12} /> {tr("Audio quality", "音质")}
                    <em>
                      {qualityLoading
                        ? tr("Reading…", "读取中…")
                        : qualityInfo?.platform
                          ? tr("Online source ready", "在线音源已连接")
                          : tr("Bind an online ID first", "先绑定在线 ID")}
                    </em>
                  </span>
                  <div className="editor-quality__body">
                    {qualityLoading ? (
                      <span className="editor-quality__status">
                        <LoaderCircle size={13} className="is-spinning" /> {tr("Checking available tiers…", "正在探测可用档位…")}
                      </span>
                    ) : qualityError ? (
                      <span className="editor-quality__status">
                        {tr("Could not read available tiers.", "无法读取可用档位。")} {qualityError}
                      </span>
                    ) : !qualityInfo || !qualityInfo.platform ? (
                      <span className="editor-quality__status">
                        {tr(
                          "Add a NetEase or QQ Music ID above to change this song's audio quality.",
                          "在上方绑定网易云或 QQ 音乐 ID 后即可更改这首歌的音质。",
                        )}
                      </span>
                    ) : (
                      <>
                        <div className="editor-quality__current">
                          <span>{tr("Current", "当前")}</span>
                          <strong>{downloadQualityLabel(qualityInfo.currentQuality)}</strong>
                          <button
                            type="button"
                            className="text-button"
                            disabled={qualityLoading}
                            onClick={() => setQualityReload((value) => value + 1)}
                          >
                            {tr("Refresh", "刷新")}
                          </button>
                        </div>
                        {hasQualityChoices ? (
                          <div className="editor-quality__row">
                            <select
                              className="text-field"
                              value={qualityTier}
                              aria-label={tr("Target audio quality", "目标音质")}
                              onChange={(event) => setQualityTier(event.target.value as DownloadQuality)}
                            >
                              {upgradeOptions.length > 0 && (
                                <optgroup label={tr("Upgrade", "升级")}>
                                  {upgradeOptions.map((option) => (
                                    <option key={`upgrade-${option.quality}`} value={option.quality}>
                                      {downloadQualityLabel(option.quality)}
                                      {option.type ? ` · ${option.type.toUpperCase()}` : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {downgradeOptions.length > 0 && (
                                <optgroup label={tr("Downgrade", "降级")}>
                                  {downgradeOptions.map((option) => (
                                    <option key={`downgrade-${option.quality}`} value={option.quality}>
                                      {downloadQualityLabel(option.quality)}
                                      {option.type ? ` · ${option.type.toUpperCase()}` : ""}
                                      {option.size ? ` · ${humanBytes(option.size)}` : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <button
                              type="button"
                              className="button button--dark button--small"
                              disabled={qualityBusy || !qualityTier}
                              onClick={requestQualityChange}
                            >
                              {qualityBusy ? <LoaderCircle size={13} className="is-spinning" /> : <RotateCcw size={13} />}
                              {tr("Re-download & replace", "重新下载并替换")}
                            </button>
                          </div>
                        ) : (
                          <span className="editor-quality__status">
                            {tr("No higher or lower tier is available right now.", "暂时没有可替换的更高或更低档位。")}
                          </span>
                        )}
                        <em className="editor-quality__hint">
                          {tr(
                            "Higher or lower tiers can replace the file; downgrading shrinks the file but lowers audio quality. Block, genre, rating, note, favorites and playlists stay unchanged.",
                            "可替换为更高或更低档位；降级会减小文件体积但降低音质；区块、流派、评分、备注、收藏和歌单保持不变。",
                          )}
                        </em>
                      </>
                    )}
                  </div>
                </div>

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

      <AnimatePresence>
        {qualityConfirmOpen && selected && qualityInfo && qualityTier && (
          <Modal className="delete-track-dialog" labelledBy="quality-downgrade-title" onClose={() => setQualityConfirmOpen(false)}>
            <div className="modal__eyebrow">
              <AlertTriangle size={12} /> {tr("Confirm downgrade", "确认降级")}
            </div>
            <h2 id="quality-downgrade-title">{tr("Replace with a lower-quality copy?", "替换为更低音质？")}</h2>
            <p className="modal__description">
              {tr(
                "“{title}” will be re-downloaded at the lower tier and its file replaced. The file gets smaller, but audio quality drops; going back up means downloading the higher tier again.",
                "《{title}》将按更低档位重新下载并替换文件。体积会减小，但音质会降低；想恢复更高音质需要重新下载更高档位。",
                { title: selected.title },
              )}
            </p>
            <div className="delete-track-target">
              <Cover path={selected.coverPath} seed={selected.id} label={selected.title} radius={10} />
              <div>
                <strong>{selected.title}</strong>
                <span>
                  {`${downloadQualityLabel(qualityInfo.currentQuality)} → ${downloadQualityLabel(qualityTier)}`}
                  {qualityInfo.fileSize && downgradeTarget?.size
                    ? ` · ${humanBytes(qualityInfo.fileSize)} → ${humanBytes(downgradeTarget.size)}`
                    : ""}
                </span>
              </div>
            </div>
            <div className="delete-track-warning">
              <AlertTriangle size={14} />
              {tr(
                "Block, genre, rating, note, favorites and playlists stay unchanged.",
                "区块、流派、评分、备注、收藏和歌单保持不变。",
              )}
            </div>
            <div className="modal__actions">
              <button type="button" className="button button--glass" disabled={qualityBusy} onClick={() => setQualityConfirmOpen(false)}>
                {tr("Cancel", "取消")}
              </button>
              <button type="button" className="button button--dark" disabled={qualityBusy} onClick={() => void changeQuality()}>
                {qualityBusy ? <LoaderCircle size={14} className="is-spinning" /> : <AudioLines size={14} />}
                {tr("Replace file", "替换文件")}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
