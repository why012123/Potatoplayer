/**
 * Ultra's lyric-first stage. The presentation model (full-screen lyric focus,
 * context falloff, word-level highlight) is inspired by Folia; this React and
 * CSS implementation is original. See CREDITS.md and docs/lyrics-stage.md.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import {
  Disc3,
  Heart,
  LoaderCircle,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import type { LyricsLine, LyricsPayload, LyricsWord, Track } from "@/types";
import type {
  ImmersiveStageLayout,
  ImmersiveStageMotion,
  ImmersiveStageTheme,
} from "@/lib/immersive";
import { Cover } from "@/components/Cover";
import { Slider } from "@/components/Slider";
import { coverUrl } from "@/lib/covers";
import { formatTime } from "@/lib/format";
import { useTr } from "@/lib/i18n";

type Palette = { primary: string; secondary: string } | null;

type Props = {
  track: Track;
  lyrics: LyricsPayload | null;
  lyricsLoading?: boolean;
  palette: Palette;
  time: number;
  duration: number;
  playing: boolean;
  isCurrent: boolean;
  favorite: boolean;
  showCover: boolean;
  showInfo: boolean;
  showHeader: boolean;
  showTranslation: boolean;
  showProgress: boolean;
  showFavorite: boolean;
  lyricScale: number;
  lyricSerif: boolean;
  stageTheme: ImmersiveStageTheme;
  stageLayout: ImmersiveStageLayout;
  stageMotion: ImmersiveStageMotion;
  stageAlign: "left" | "center";
  stageWordHighlight: boolean;
  stageContext: number;
  stageGlow: number;
  reducedMotion: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClassic: () => void;
  onExit: () => void;
  onCustomize: () => void;
  onFavorite: () => void;
};

const THEME_ACCENTS: Record<Exclude<ImmersiveStageTheme, "cover">, [string, string]> = {
  ember: ["#efb07e", "#d8675f"],
  mono: ["#f4f0e9", "#a9a49c"],
  night: ["#9db8d8", "#7676b8"],
};

function useSmoothTime(time: number, playing: boolean, duration: number): number {
  const [smooth, setSmooth] = useState(time);
  const anchor = useRef({ time, at: performance.now() });

  useEffect(() => {
    anchor.current = { time, at: performance.now() };
    setSmooth(time);
  }, [time, playing]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      // 30 fps is enough for the lyric highlight while keeping the stage cheap.
      if (now - last >= 32) {
        last = now;
        const next = anchor.current.time + (now - anchor.current.at) / 1000;
        setSmooth(duration > 0 ? Math.min(duration, next) : next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  return smooth;
}

function wordFill(word: LyricsWord, time: number): number {
  if (time <= word.time) return 0;
  if (time >= word.end) return 1;
  return Math.max(0, Math.min(1, (time - word.time) / Math.max(0.001, word.end - word.time)));
}

function activeLineIndex(lines: LyricsLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time + 0.06) index = i;
    else break;
  }
  return index;
}

function distanceOpacity(distance: number): number {
  if (distance === 0) return 1;
  return Math.max(0.12, 0.48 - (distance - 1) * 0.09);
}

export function LyricStage({
  track,
  lyrics,
  lyricsLoading = false,
  palette,
  time,
  duration,
  playing,
  isCurrent,
  favorite,
  showCover,
  showInfo,
  showHeader,
  showTranslation,
  showProgress,
  showFavorite,
  lyricScale,
  lyricSerif,
  stageTheme,
  stageLayout,
  stageMotion,
  stageAlign,
  stageWordHighlight,
  stageContext,
  stageGlow,
  reducedMotion,
  onToggle,
  onSeek,
  onNext,
  onPrevious,
  onClassic,
  onExit,
  onCustomize,
  onFavorite,
}: Props) {
  const tr = useTr();
  const smoothTime = useSmoothTime(time, playing, duration);
  const lines = lyrics?.found ? lyrics.lines : [];
  const activeIndex = useMemo(() => activeLineIndex(lines, smoothTime), [lines, smoothTime]);
  const hasWords = lines.some((line) => line.words?.some((word) => word.text.trim()));
  const cover = coverUrl(track.coverPath);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [themeA, themeB] = stageTheme === "cover"
    ? [palette?.primary ?? "#e9b77f", palette?.secondary ?? "#c98f73"]
    : THEME_ACCENTS[stageTheme];
  const accent = themeA;
  const stageStyle = {
    "--stage-accent": accent,
    "--stage-accent-2": themeB,
    "--stage-lyric-scale": lyricScale,
    "--stage-glow": stageGlow,
    "--stage-cover": cover ? `url("${cover}")` : "none",
  } as CSSProperties;

  useEffect(() => {
    const node = lineRefs.current[activeIndex];
    const container = scrollRef.current;
    if (!node || !container) return;
    const top = node.offsetTop - container.clientHeight / 2 + node.offsetHeight / 2;
    container.scrollTo({
      top: Math.max(0, top),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeIndex, reducedMotion]);

  const stageClass = clsx(
    "stage",
    `stage--${stageLayout}`,
    `stage--theme-${stageTheme}`,
    `stage--align-${stageAlign}`,
    stageMotion === "drift" && !reducedMotion && "stage--drift",
    lyricSerif && "stage--serif",
    !showCover && "stage--no-cover",
    !showInfo && "stage--no-info",
    !showHeader && "stage--no-header",
    !showTranslation && "stage--no-translation",
    !showProgress && "stage--no-progress",
  );

  const formatLabel = lyrics?.format
    ? lyrics.format === "LRC" && hasWords
      ? tr("LRC · WORD", "LRC · 逐字")
      : lyrics.format
    : tr("TIMED LYRICS", "时间轴歌词");

  return (
    <motion.div
      className={stageClass}
      style={stageStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="stage__backdrop"
        style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
        aria-hidden="true"
      />
      <div className="stage__veil" aria-hidden="true" />
      <div className="stage__aura stage__aura--one" aria-hidden="true" />
      <div className="stage__aura stage__aura--two" aria-hidden="true" />
      <div className="stage__grain" aria-hidden="true" />

      <header className="stage__top">
        {showHeader && (
          <div className="stage__brand">
            <span className="stage__mark"><Disc3 size={14} /></span>
            <strong>potato</strong>
            <em>ultra</em>
          </div>
        )}
        <div className="stage__top-track">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </div>
        <div className="stage__top-actions">
          <div className="stage__view-switch" role="group" aria-label={tr("Lyric view", "歌词视图")}>
            <button type="button" className="is-active">{tr("Stage", "舞台")}</button>
            <button type="button" onClick={onClassic}>{tr("Classic", "经典")}</button>
          </div>
          <button
            type="button"
            className="stage__icon-button"
            onClick={onCustomize}
            aria-label={tr("Customize lyric stage", "自定义歌词舞台")}
            title={tr("Customize lyric stage", "自定义歌词舞台")}
          >
            <SlidersHorizontal size={15} />
          </button>
          <button
            type="button"
            className="stage__icon-button"
            onClick={onExit}
            aria-label={tr("Exit immersive mode", "退出沉浸模式")}
            title={tr("Exit immersive mode", "退出沉浸模式")}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <main className="stage__body">
        {showCover && (
          <aside className="stage__art">
            <div className="stage__cover-wrap">
              <span className="stage__disc" aria-hidden="true" />
              <Cover
                path={track.coverPath}
                seed={track.id}
                label={track.title}
                radius={24}
                className="stage__cover"
                eager
              />
            </div>
            {showInfo && (
              <div className="stage__track-copy">
                <span className="stage__eyebrow">
                  {playing ? tr("Now performing", "正在演出") : tr("Paused", "已暂停")}
                </span>
                <strong>{track.title}</strong>
                <span>{track.artist}</span>
                <small>
                  {track.album || tr("{artist} · collection", "{artist} · 精选集", { artist: track.artist })}
                  {track.rating > 0 ? ` · ★ ${track.rating.toFixed(1)}` : ""}
                </small>
              </div>
            )}
            {showFavorite && (
              <button
                type="button"
                className={clsx("stage__favorite", favorite && "is-favorite")}
                onClick={onFavorite}
                aria-label={favorite ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "添加到收藏")}
              >
                <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                {favorite ? tr("In favorites", "已收藏") : tr("Favorite", "收藏")}
              </button>
            )}
          </aside>
        )}

        <section className="stage__lyrics-shell" aria-live="polite">
          <div className="stage__lyrics-head">
            <span><Mic2 size={13} /> {tr("Lyric stage", "歌词舞台")}</span>
            <em>{formatLabel}</em>
          </div>

          {lyricsLoading ? (
            <div className="stage__empty">
              <LoaderCircle size={19} className="is-spinning" />
              <strong>{tr("Finding the words…", "正在寻找歌词…")}</strong>
            </div>
          ) : lines.length ? (
            <div className="stage__lyrics-scroll" ref={scrollRef}>
              <div className="stage__lyrics">
                {lines.map((line, index) => {
                  const distance = index - activeIndex;
                  const absolute = Math.abs(distance);
                  const active = index === activeIndex;
                  const visible = stageLayout === "minimal"
                    ? active
                    : stageLayout === "focus"
                      ? absolute <= 1
                      : absolute <= stageContext;
                  const lineStyle = {
                    "--stage-distance": absolute,
                    "--stage-line-opacity": visible ? distanceOpacity(absolute) : 0,
                    "--stage-line-blur": active ? "0px" : `${Math.min(4.5, absolute * 0.9)}px`,
                    "--stage-line-shift": `${Math.max(-28, Math.min(28, distance * 9))}px`,
                  } as CSSProperties;
                  return (
                    <button
                      type="button"
                      key={`${line.time}-${index}`}
                      ref={(node) => {
                        lineRefs.current[index] = node;
                      }}
                      className={clsx(
                        "stage-line",
                        active && "is-active",
                        index < activeIndex && "is-past",
                        !visible && "is-hidden",
                      )}
                      style={lineStyle}
                      onClick={() => onSeek(line.time)}
                      aria-current={active ? "true" : undefined}
                    >
                      <span className="stage-line__text">
                        {active && hasWords && stageWordHighlight && line.words?.length
                          ? line.words.map((word, wordIndex) => (
                            <span
                              // Word indexes are stable inside a lyric line.
                              key={`${word.time}-${wordIndex}`}
                              className="stage-word"
                              data-current={line.words?.[wordIndex + 1]?.time !== undefined
                                && smoothTime >= word.time
                                && smoothTime < (line.words[wordIndex + 1]?.time ?? word.end)
                                ? "true"
                                : undefined}
                              style={{ "--word-fill": `${wordFill(word, smoothTime) * 100}%` } as CSSProperties}
                            >
                              {word.text}
                            </span>
                          ))
                          : line.text}
                      </span>
                      {active && showTranslation && line.translation && (
                        <em className="stage-line__translation">{line.translation}</em>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="stage__empty">
              <Disc3 size={25} />
              <strong>{tr("No timed lyrics for this one.", "这首歌还没有时间轴歌词。")}</strong>
              <span>{tr("Add a .lrc, .ttml, .qrc or .yrc file next to the song.", "在歌曲旁放入 .lrc、.ttml、.qrc 或 .yrc 文件。")}</span>
              <button type="button" onClick={onClassic}>{tr("Back to classic", "返回经典")}</button>
            </div>
          )}
        </section>
      </main>

      <footer className="stage__bottom">
        {showProgress && (
          <div className="stage__timeline">
            <span>{formatTime(smoothTime)}</span>
            <Slider
              label={tr("Playback position", "播放进度")}
              value={Math.min(smoothTime, duration || 1)}
              max={duration || 1}
              className="stage-range"
              disabled={!isCurrent}
              onCommit={onSeek}
            />
            <span>{formatTime(duration)}</span>
          </div>
        )}
        <div className="stage__transport">
          <button type="button" onClick={() => onSeek(Math.max(0, smoothTime - 10))} aria-label={tr("Back 10 seconds", "快退 10 秒")}>
            −10
          </button>
          <button type="button" onClick={onPrevious} aria-label={tr("Previous", "上一首")} disabled={!isCurrent}>
            <SkipBack size={20} fill="currentColor" strokeWidth={0.7} />
          </button>
          <button type="button" className="stage__play" onClick={onToggle} aria-label={playing ? tr("Pause", "暂停") : tr("Play", "播放")}>
            {playing ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} />}
          </button>
          <button type="button" onClick={onNext} aria-label={tr("Next", "下一首")} disabled={!isCurrent}>
            <SkipForward size={20} fill="currentColor" strokeWidth={0.7} />
          </button>
          <button type="button" onClick={() => onSeek(0)} aria-label={tr("Restart track", "重新播放")}>
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="stage__hint">
          <span className={playing ? "is-live" : ""} />
          {hasWords && stageWordHighlight ? tr("WORD-SYNCED", "逐字同步") : tr("CLICK A LINE TO JUMP", "点击歌词跳转")}
        </div>
      </footer>
    </motion.div>
  );
}
