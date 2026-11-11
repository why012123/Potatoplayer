import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Album,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Clock3,
  Command,
  Disc3,
  Gamepad2,
  HardDrive,
  Info,
  Keyboard,
  Layers3,
  LoaderCircle,
  Maximize2,
  Music2,
  Pause,
  Play,
  Rotate3d,
  Users,
} from "lucide-react";
import type { Track } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { formatTime, humanBytes } from "@/lib/format";
import { Cover } from "@/components/Cover";
import "./ultra.css";

/** Ultra turns every block into a deep column; the AI shell mirrors the first eight. */
const MAX_COLUMNS = 8;
const CASE_SLOTS = 5;
const pad = (value: number) => String(value).padStart(2, "0");

interface Lane {
  name: string;
  color: string | null;
  tracks: Track[];
  ungrouped: boolean;
}

function buildLanes(tracks: Track[], blocks: { name: string; color: string }[]): Lane[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = track.block?.trim() ?? "";
    const list = groups.get(key);
    if (list) list.push(track);
    else groups.set(key, [track]);
  }
  const colorByName = new Map(blocks.map((tag) => [tag.name, tag.color] as const));
  const named: Lane[] = [...groups.entries()]
    .filter(([name]) => Boolean(name))
    .map(([name, list]) => ({
      name,
      color: colorByName.get(name) ?? null,
      tracks: list,
      ungrouped: false,
    }))
    .sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const unfiled = groups.get("") ?? [];
  return unfiled.length ? [...named, { name: "", color: null, tracks: unfiled, ungrouped: true }] : named;
}

/**
 * Pick the covers for the CSS-only collage. The current track sits in the
 * centre slot; the rest are the best-rated covers around it. Slots never move,
 * so the composition stays stable when the library is small or empty.
 */
function buildCaseTracks(tracks: Track[], current: Track | undefined): (Track | null)[] {
  const seen = new Set<string>();
  const pool = [...tracks]
    .sort(
      (a, b) =>
        (b.rating || 0) - (a.rating || 0) ||
        (b.playCount || 0) - (a.playCount || 0) ||
        a.title.localeCompare(b.title, "zh-Hans-CN"),
    )
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  if (!pool.length) return Array.from({ length: CASE_SLOTS }, () => null);
  const centre = current && pool.some((track) => track.id === current.id) ? current : pool[0];
  const rest = pool.filter((track) => track.id !== centre.id);
  const order: (Track | null)[] = [
    rest[0] ?? null,
    rest[1] ?? null,
    centre,
    rest[2] ?? null,
    rest[3] ?? null,
  ];
  return Array.from({ length: CASE_SLOTS }, (_, index) => order[index] ?? null);
}

type LaunchState = "idle" | "opening" | "building" | "opened" | "error";

export function UltraPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const blocks = useAppStore((state) => state.blocks);
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);

  const [launchState, setLaunchState] = useState<LaunchState>("idle");
  const [launchError, setLaunchError] = useState("");
  const [ultraReady, setUltraReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void window.potato.ultraStatus?.()
      .then((status) => { if (alive) setUltraReady(Boolean(status?.ready)); })
      .catch(() => { if (alive) setUltraReady(false); });
    return () => { alive = false; };
  }, []);

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === (playback?.trackId ?? previewTrackId)),
    [tracks, playback?.trackId, previewTrackId],
  );

  const stats = useMemo(() => {
    const albums = new Set<string>();
    const artists = new Set<string>();
    let seconds = 0;
    let bytes = 0;
    for (const track of tracks) {
      const album = track.album?.trim();
      if (album) albums.add(album);
      const artist = track.artist?.trim();
      if (artist) artists.add(artist);
      seconds += track.duration || 0;
      bytes += track.fileSize || 0;
    }
    return { albums: albums.size, artists: artists.size, seconds, hours: seconds / 3600, bytes };
  }, [tracks]);

  const columns = useMemo(() => buildLanes(tracks, blocks), [tracks, blocks]);
  const shownColumns = useMemo(() => columns.slice(0, MAX_COLUMNS), [columns]);
  const hiddenColumns = columns.length - shownColumns.length;
  const lanePeak = useMemo(
    () => Math.max(1, ...shownColumns.map((lane) => lane.tracks.length)),
    [shownColumns],
  );
  const cases = useMemo(() => buildCaseTracks(tracks, currentTrack), [tracks, currentTrack]);

  const isCurrentTrack = Boolean(currentTrack && playback?.trackId === currentTrack.id);
  const isPlaying = Boolean(isCurrentTrack && playback?.playing);
  const currentTime = isCurrentTrack ? playback?.time ?? 0 : 0;
  const currentDuration = currentTrack
    ? (isCurrentTrack ? playback?.duration || currentTrack.duration : currentTrack.duration) || 0
    : 0;
  const progress = currentDuration > 0 ? Math.min(1, currentTime / currentDuration) : 0;
  const queueCount = playback?.queue.length ?? 0;

  const platform = `${window.potato?.platform ?? ""} ${navigator.platform ?? ""}`.toLowerCase();
  const isMac = platform.includes("mac") || platform.includes("darwin");
  const modKey = isMac ? "⌘" : "Ctrl";
  const shiftKey = isMac ? "⇧" : "Shift";

  const openUltra = useCallback(async () => {
    setLaunchState("opening");
    setLaunchError("");
    try {
      if (!window.potato?.openUltra) throw new Error("Ultra bridge unavailable");
      let ready = ultraReady === true;
      if (!ready && window.potato.ultraStatus) {
        const status = await window.potato.ultraStatus();
        ready = Boolean(status?.ready);
        setUltraReady(ready);
      }
      if (!ready && window.potato.prepareUltra) {
        setLaunchState("building");
        await window.potato.prepareUltra();
        setUltraReady(true);
      }
      await window.potato.openUltra();
      setLaunchState("opened");
    } catch (reason) {
      setLaunchError(reason instanceof Error ? reason.message : String(reason));
      setLaunchState("error");
    }
  }, [ultraReady]);

  const onTransport = () => {
    if (!currentTrack) return;
    if (playback?.trackId === currentTrack.id) {
      void togglePlay();
      return;
    }
    const queue = playback?.queue?.length ? playback.queue : tracks.map((track) => track.id);
    void playTrack(currentTrack, queue);
  };

  const statItems = [
    {
      icon: Music2,
      value: tracks.length.toLocaleString(),
      label: tr("Songs", "歌曲"),
      detail: tr("Catalogued in the archive", "已编入三维档案"),
    },
    {
      icon: Album,
      value: stats.albums.toLocaleString(),
      label: tr("Albums", "专辑"),
      detail: tr("Each one becomes a boxed CD", "每张都会变成盒装 CD"),
    },
    {
      icon: Users,
      value: stats.artists.toLocaleString(),
      label: tr("Artists", "艺术家"),
      detail: tr("Written on every spine", "写在每一张盒脊上"),
    },
    {
      icon: Layers3,
      value: columns.length.toLocaleString(),
      label: tr("Columns", "档案列"),
      detail: tr("One column per block", "每个区块排成一列"),
    },
    {
      icon: Clock3,
      value: stats.hours < 100 ? stats.hours.toFixed(1) : Math.round(stats.hours).toLocaleString(),
      label: tr("Hours", "小时"),
      detail: tr("Total library runtime", "曲库总时长"),
    },
    {
      icon: HardDrive,
      value: humanBytes(stats.bytes),
      label: tr("On disk", "占用"),
      detail: tr("Audio and cover files", "音频与封面文件"),
    },
  ];

  const insideKeys = [
    { label: tr("Play or pause", "播放 / 暂停"), keys: ["Space"] },
    { label: tr("Open track details", "打开曲目详情"), keys: ["Enter"] },
    { label: tr("Move between columns", "在列之间切换"), keys: ["←", "→"] },
    { label: tr("Close details", "关闭详情"), keys: ["Esc"] },
    { label: tr("Rotate or open a CD case", "旋转或开合 CD 盒"), keys: [tr("DRAG", "拖动")] },
  ];
  const outerKeys = [
    { label: tr("Open Ultra anywhere", "随时打开 Ultra"), keys: [modKey, shiftKey, "U"] },
    { label: tr("Command palette", "命令面板"), keys: [modKey, "K"] },
  ];

  return (
    <div className="ultra-page">
      <header className="ultra-hero">
        <div className="ultra-hero__copy">
          <div className="ai-eyebrow">
            <span /> {tr("ULTRA · 3D CD ARCHIVE", "ULTRA · 三维 CD 档案")}
          </div>
          <h1>{tr("Your library, shelved in three dimensions.", "把整座曲库，\n收进三维档案墙。")}</h1>
          <p>
            {tr(
              "Ultra opens a separate full-screen window: every album becomes a boxed CD, stacked into deep, scrollable columns. Walk the archive, pull a case out, turn it 360°, and keep listening — playback is shared with this window.",
              "Ultra 会在独立窗口打开：每张专辑变成盒装 CD，排成可滚动的纵深档案列。沿着阵列浏览、抽出盒体、360° 端详，播放状态与这里完全同步。",
            )}
          </p>
          <div className="ultra-hero__actions">
            <button
              type="button"
              className="ultra-btn ultra-btn--primary"
              onClick={() => void openUltra()}
              disabled={launchState === "opening" || launchState === "building"}
            >
              {launchState === "opening" || launchState === "building" ? (
                <LoaderCircle size={15} className="ultra-spin" />
              ) : (
                <Box size={15} />
              )}
              <span className="ultra-btn__label">
                {launchState === "building"
                  ? tr("Preparing Ultra…", "正在准备 Ultra…")
                  : launchState === "opening"
                    ? tr("Opening…", "正在打开…")
                    : ultraReady === false
                      ? tr("Build & open Ultra", "构建并打开 Ultra")
                      : tr("Open Ultra", "打开 Ultra")}
              </span>
              {launchState !== "opening" && launchState !== "building" && <ArrowUpRight size={14} />}
            </button>
            {currentTrack ? (
              <button
                type="button"
                className="ultra-btn ultra-btn--ghost"
                onClick={() => void openUltra()}
                disabled={launchState === "opening" || launchState === "building"}
              >
                <Disc3 size={15} />
                <span className="ultra-btn__label">
                  {tr("Continue with “{title}”", "在 Ultra 中继续《{title}》", { title: currentTrack.title })}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="ultra-btn ultra-btn--ghost"
                onClick={() => navigate({ kind: "songs" })}
              >
                <Music2 size={15} />
                <span className="ultra-btn__label">{tr("Browse the library first", "先浏览曲库")}</span>
              </button>
            )}
          </div>
          <p
            className={`ultra-launch-note ${launchState === "error" ? "is-error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {launchState === "building" && (
              <>
                <LoaderCircle size={12} className="ultra-spin" />
                {tr(
                  "First run: building the 3D archive. This can take a few minutes.",
                  "第一次运行：正在构建三维档案，可能需要几分钟。",
                )}
              </>
            )}
            {launchState === "opening" && (
              <>
                <LoaderCircle size={12} className="ultra-spin" />
                {tr("Opening Ultra in its own window…", "正在独立窗口中打开 Ultra…")}
              </>
            )}
            {launchState === "opened" && (
              <>
                <Check size={12} />
                {tr(
                  "Ultra is open in a separate window and shares this session's playback.",
                  "Ultra 已在独立窗口打开，并与这里共享播放状态。",
                )}
              </>
            )}
            {launchState === "error" && (
              <>
                <AlertCircle size={12} />
                {tr("Could not open Ultra. {detail}", "无法打开 Ultra。{detail}", { detail: launchError })}
              </>
            )}
          </p>
          <div className="ultra-hero__meta">
            <span>
              <span className="ultra-kbd-group">
                <kbd className="ultra-kbd">{modKey}</kbd>
                <kbd className="ultra-kbd">{shiftKey}</kbd>
                <kbd className="ultra-kbd">U</kbd>
              </span>
              {tr("Open anytime", "随时打开")}
            </span>
            <span>
              <Maximize2 size={11} /> {tr("Separate full-screen window", "独立全屏窗口")}
            </span>
            <span>
              <Disc3 size={11} /> {tr("Shares playback with this app", "与应用共享播放")}
            </span>
          </div>
        </div>

        <div className="ultra-stage" aria-hidden="true">
          <span className="ultra-stage__grid" />
          <span className="ultra-stage__glow" />
          <div className="ultra-disc">
            <span className="ultra-disc__label">
              <i>POTATO</i>
              <b />
              <i>ULTRA</i>
            </span>
          </div>
          <div className="ultra-cases">
            {cases.map((track, index) => (
              <div
                key={track?.id ?? `case-${index}`}
                className={`ultra-case ultra-case--${index + 1}`}
              >
                {track ? (
                  <>
                    <Cover
                      path={track.coverPath}
                      seed={track.id}
                      label={track.title}
                      radius={5}
                      className="ultra-case__cover"
                    />
                    <span className="ultra-case__title">{track.title}</span>
                  </>
                ) : (
                  <span className="ultra-case__blank">
                    <em>POTATO</em>ULTRA
                  </span>
                )}
                <span className="ultra-case__spine" />
              </div>
            ))}
          </div>
          <span className="ultra-hud ultra-hud--tl">
            <i /> {tr("ARCHIVE ONLINE", "档案在线")}
          </span>
          {currentTrack && (
            <span className="ultra-hud ultra-hud--tr">
              {tr("NOW PLAYING", "正在播放")} ·{" "}
              <span className="ultra-hud__title">{currentTrack.title}</span>
            </span>
          )}
          <span className="ultra-hud ultra-hud--bl">
            {tr("COLUMN", "列")} 01 / {pad(Math.min(columns.length, MAX_COLUMNS) || 1)}
          </span>
          <span className="ultra-hud ultra-hud--br">
            <Rotate3d size={10} /> {tr("DRAG · 360° VIEW", "拖动 · 360° 查看")}
          </span>
        </div>
      </header>

      <section className="ultra-stats" aria-label={tr("Library at a glance", "曲库一览")}>
        {statItems.map(({ icon: Icon, value, label, detail }, index) => (
          <div className="ultra-stat" key={label}>
            <div className="ultra-stat__top">
              <Icon size={13} />
              <em>{pad(index + 1)}</em>
            </div>
            <strong>{value}</strong>
            <span className="ultra-stat__label">{label}</span>
            <span className="ultra-stat__detail">{detail}</span>
          </div>
        ))}
      </section>

      <div className="ultra-main">
        <section className="ultra-panel ultra-columns" aria-labelledby="ultra-columns-title">
          <div className="ai-section-heading">
            <div>
              <h2 id="ultra-columns-title">{tr("The column shelf", "档案列架")}</h2>
              <p>
                {tr(
                  "Every block becomes a deep column; ungrouped songs close the archive.",
                  "每个区块是一列纵深档案，未分组歌曲排在最后。",
                )}
              </p>
            </div>
            <button
              type="button"
              className="ultra-head-link"
              onClick={() => navigate({ kind: "collections" })}
            >
              {tr("All blocks", "全部区块")} <ArrowRight size={13} />
            </button>
          </div>

          {shownColumns.length ? (
            <div className="ultra-lanes">
              {shownColumns.map((lane, index) =>
                lane.ungrouped ? (
                  <div
                    className="ultra-lane is-static"
                    key="unfiled"
                    title={tr(
                      "Unfiled songs are the last column in Ultra.",
                      "未分组歌曲会在 Ultra 中排在最后一列。",
                    )}
                  >
                    <LaneTop index={index} badge={tr("UNFILED", "未分组")} />
                    <LaneBody lane={lane} peak={lanePeak} total={tracks.length} />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ultra-lane"
                    key={lane.name}
                    onClick={() => navigate({ kind: "block", name: lane.name })}
                  >
                    <LaneTop index={index} />
                    <LaneBody lane={lane} peak={lanePeak} total={tracks.length} />
                  </button>
                ),
              )}
            </div>
          ) : (
            <div className="ultra-empty">
              <Disc3 size={26} />
              <div>
                <strong>{tr("The archive wall is still empty.", "档案墙还是空的。")}</strong>
                <p>
                  {tr(
                    "Add music to your library — each block becomes a column of boxed CDs.",
                    "先向曲库添加音乐——每个区块都会变成一列盒装 CD。",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="ultra-btn ultra-btn--ghost"
                onClick={() => void chooseLibrary()}
              >
                <Music2 size={14} /> {tr("Choose a music folder", "选择音乐文件夹")}
              </button>
            </div>
          )}

          {hiddenColumns > 0 && (
            <button
              type="button"
              className="ultra-more-link"
              onClick={() => navigate({ kind: "collections" })}
            >
              {tr(
                "Plus {count} more blocks — Ultra keeps the column wall scrollable.",
                "另有 {count} 个区块——Ultra 的档案墙可以继续滚动。",
                { count: hiddenColumns },
              )}
              <ArrowRight size={11} />
            </button>
          )}
        </section>

        <aside className="ultra-panel ultra-now" aria-label={tr("Now playing", "正在播放")}>
          <div className="ultra-now__head">
            <span className="ai-eyebrow">
              <span /> {tr("NOW PLAYING", "正在播放")}
            </span>
            <span className={`ultra-eq ${isPlaying ? "" : "is-paused"}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>

          {currentTrack ? (
            <>
              <div className="ultra-now__body">
                <div className="ultra-now__art">
                  <span className="ultra-now__disc" aria-hidden="true" />
                  <Cover
                    path={currentTrack.coverPath}
                    seed={currentTrack.id}
                    label={currentTrack.title}
                    radius={8}
                    eager
                  />
                </div>
                <div className="ultra-now__copy">
                  <strong>{currentTrack.title}</strong>
                  <span>{currentTrack.artist}</span>
                  <small>
                    {currentTrack.album || currentTrack.block || tr("Local library", "本地曲库")}
                  </small>
                </div>
              </div>
              <div className="ultra-now__timeline">
                <span>{formatTime(currentTime)}</span>
                <span className="ultra-now__track" aria-hidden="true">
                  <i style={{ transform: `scaleX(${progress})` }} />
                </span>
                <span>{formatTime(currentDuration)}</span>
              </div>
              <div className="ultra-now__meta">
                <span>{tr("{count} in queue", "队列 {count} 首", { count: queueCount })}</span>
                <span>{currentTrack.block || tr("Unfiled", "未分组")}</span>
              </div>
              <div className="ultra-now__actions">
                <button
                  type="button"
                  className="ultra-round"
                  onClick={onTransport}
                  aria-label={isPlaying ? tr("Pause", "暂停") : tr("Play", "播放")}
                >
                  {isPlaying ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </button>
                <button
                  type="button"
                  className="ultra-now__resume"
                  onClick={() => void openUltra()}
                >
                  <Box size={13} />
                  <span>{tr("Continue in Ultra", "在 Ultra 中继续")}</span>
                </button>
              </div>
              <p className="ultra-now__note">
                {tr(
                  "The dock and the archive share this playback state — the CD case follows the same track.",
                  "播放栏与档案共享同一份播放状态，CD 盒会跟着这首歌曲。",
                )}
              </p>
            </>
          ) : (
            <div className="ultra-now__empty">
              <Disc3 size={24} />
              <strong>{tr("Nothing on the platter yet", "唱机上还没有唱片")}</strong>
              <p>
                {tr(
                  "Start a song here, then open Ultra — the archive opens on the same library and playback.",
                  "在这里播放一首歌，再打开 Ultra——档案会从同一份曲库和播放状态开始。",
                )}
              </p>
              <button
                type="button"
                className="ultra-btn ultra-btn--ghost"
                onClick={() => navigate({ kind: "songs" })}
              >
                <Music2 size={14} /> {tr("Pick a song", "去挑一首")}
              </button>
            </div>
          )}

          <div className="ultra-now__features">
            <span className="ultra-now__features-title">{tr("IN ULTRA", "在 ULTRA 里")}</span>
            <div className="ultra-feature">
              <span className="ultra-feature__icon">
                <Layers3 size={13} />
              </span>
              <div>
                <strong>{tr("Deep columns", "纵深档案列")}</strong>
                <small>{tr("Blocks become shelves you can scroll through.", "区块变成可以滚动的档案列。")}</small>
              </div>
            </div>
            <div className="ultra-feature">
              <span className="ultra-feature__icon">
                <Rotate3d size={13} />
              </span>
              <div>
                <strong>{tr("360° CD case", "360° 开盒查看")}</strong>
                <small>{tr("Open the jewel case and read the inner sleeve.", "打开盒盖，读内页与光盘。")}</small>
              </div>
            </div>
            <div className="ultra-feature">
              <span className="ultra-feature__icon">
                <Disc3 size={13} />
              </span>
              <div>
                <strong>{tr("Shared playback", "共享播放")}</strong>
                <small>{tr("The dock keeps following this window.", "播放栏继续跟随这个窗口。")}</small>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="ultra-note" aria-labelledby="ultra-note-title">
        <div className="ultra-note__copy">
          <div className="ai-eyebrow">
            <span /> {tr("EDITOR'S NOTE", "编辑手记")}
          </div>
          <h2 id="ultra-note-title">
            {tr("Dive steps aside. Ultra takes the stage.", "Dive 退场，Ultra 接棒。")}
          </h2>
          <p>
            {tr(
              "Dive was this shell's small rhythm experiment: pick a track, hit any key, follow the pulse. It proved the library could be more than a list.",
              "Dive 曾是 AI 版导航里的小实验：选一首歌，任意键跟拍。它证明了曲库不只是列表。",
            )}
          </p>
          <p>
            {tr(
              "Ultra takes the same slot with a larger idea — the whole collection as a walkable 3D CD archive, while still sharing this window's library and playback.",
              "Ultra 接过了同一个位置，也接过了更大的想法——把整座曲库做成可以走进去的三维 CD 档案，同时继续共享这里的曲库与播放。",
            )}
          </p>
          <p className="ultra-note__small">
            {tr(
              "The rhythm stage itself isn't gone; it just no longer owns the AI navigation.",
              "节奏舞台本身没有消失，只是不再占用 AI 版导航。",
            )}
          </p>
        </div>
        <div className="ultra-note__swap">
          <div className="ultra-swap-row is-old">
            <span className="ultra-swap-row__icon">
              <Gamepad2 size={16} />
            </span>
            <div>
              <strong>DIVE</strong>
              <small>{tr("Any-key rhythm · generated chart", "任意键跟拍 · 本地生成谱面")}</small>
            </div>
            <span className="ultra-swap-row__tag">{tr("OLD SLOT", "旧位置")}</span>
          </div>
          <span className="ultra-swap-arrow">
            <ArrowDown size={13} /> {tr("REPLACED BY", "由它接替")}
          </span>
          <div className="ultra-swap-row is-new">
            <span className="ultra-swap-row__icon">
              <Box size={16} />
            </span>
            <div>
              <strong>ULTRA</strong>
              <small>{tr("3D CD archive · shared playback", "三维 CD 档案 · 共享播放")}</small>
            </div>
            <span className="ultra-swap-row__tag">{tr("NEW SLOT", "新位置")}</span>
          </div>
        </div>
      </section>

      <section className="ultra-keys" aria-label={tr("Keyboard shortcuts", "键盘与快捷键")}>
        <div className="ultra-keys__group">
          <h3>
            <Keyboard size={13} /> {tr("Inside Ultra", "在 Ultra 里")}
          </h3>
          {insideKeys.map((row) => (
            <div className="ultra-key-row" key={row.label}>
              <span>{row.label}</span>
              <span className="ultra-key-row__keys">
                {row.keys.map((key) => (
                  <kbd className="ultra-kbd" key={key}>
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="ultra-keys__group">
          <h3>
            <Command size={13} /> {tr("From this window", "从这里")}
          </h3>
          {outerKeys.map((row) => (
            <div className="ultra-key-row" key={row.label}>
              <span>{row.label}</span>
              <span className="ultra-key-row__keys">
                {row.keys.map((key) => (
                  <kbd className="ultra-kbd" key={key}>
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
          <p className="ultra-keys__note">
            {tr(
              "The macOS menu also has Window → Open Potatoplayer Ultra.",
              "macOS 菜单栏的 Window → Open Potatoplayer Ultra 也能打开。",
            )}
          </p>
        </div>
        <div className="ultra-keys__group ultra-keys__group--quiet">
          <h3>
            <Info size={13} /> {tr("Good to know", "小提示")}
          </h3>
          <p>
            {tr(
              "Ultra runs in its own window; closing it does not stop playback. Three.js only starts there — this page keeps the main renderer light.",
              "Ultra 运行在独立窗口，关闭窗口不会停止播放。Three.js 只在那边启动，这一页让主渲染器保持轻量。",
            )}
          </p>
        </div>
      </section>
    </div>
  );
}

function LaneTop({ index, badge }: { index: number; badge?: string }) {
  const tr = useTr();
  return (
    <span className="ultra-lane__top">
      <span className="ultra-lane__index">
        {`${tr("COLUMN", "列")} ${pad(index + 1)}`}
      </span>
      {badge ? (
        <span className="ultra-lane__badge">{badge}</span>
      ) : (
        <ChevronRight size={12} className="ultra-lane__arrow" />
      )}
    </span>
  );
}

function LaneBody({ lane, peak, total }: { lane: Lane; peak: number; total: number }) {
  const tr = useTr();
  const share = Math.min(1, lane.tracks.length / peak);
  const percent = Math.round((lane.tracks.length / Math.max(1, total)) * 100);
  return (
    <>
      <span className="ultra-lane__covers" aria-hidden="true">
        {lane.tracks.slice(0, 4).map((track) => (
          <Cover
            key={track.id}
            path={track.coverPath}
            seed={track.id}
            label={track.title}
            radius={5}
            className="ultra-lane__cover"
          />
        ))}
      </span>
      <strong>
        <span
          className="ultra-lane__dot"
          style={lane.color ? { background: lane.color } : undefined}
        />
        <span className="ultra-lane__name">{lane.name || tr("Unfiled", "未分组")}</span>
      </strong>
      <span className="ultra-lane__meta">
        <span>{lane.tracks.length}</span>
        <span>{percent}%</span>
      </span>
      <span className="ultra-lane__bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${share})` }} />
      </span>
    </>
  );
}

export default UltraPage;
