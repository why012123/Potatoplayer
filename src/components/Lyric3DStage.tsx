import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { LoaderCircle, Pause, Play, RotateCcw, SkipBack, SkipForward, SlidersHorizontal, X } from "lucide-react";
import type { LyricsPayload, Track } from "@/types";
import { formatTime } from "@/lib/format";

type Palette = { primary: string; secondary: string } | null;

type Props = {
  track: Track;
  lyrics: LyricsPayload | null;
  palette: Palette;
  time: number;
  duration: number;
  playing: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClassic: () => void;
  onExit: () => void;
  onCustomize: () => void;
  effects: { particles: boolean; camera: boolean; intensity: number };
};

type HostMessage = {
  type: string;
  message?: string;
  duration?: number;
};

export function Lyric3DStage({
  track,
  lyrics,
  palette,
  time,
  duration,
  playing,
  isCurrent,
  onToggle,
  onSeek,
  onNext,
  onPrevious,
  onClassic,
  onExit,
  onCustomize,
  effects,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [booted, setBooted] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const lyricLines = lyrics?.found ? lyrics.lines : [];
  const hasLyrics = lyricLines.length > 0;

  const send = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === "lyric3d:error") {
        setStageError(event.data.message ?? "The 3D stage could not start.");
      }
      if (event.data?.type === "lyric3d:ready" || event.data?.type === "lyric3d:booted") {
        setBooted(true);
        setLoaded(true);
        setStageError(null);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    send({ type: "lyric3d:ping" });
  }, [loaded]);

  useEffect(() => {
    if ((!loaded && !booted) || !hasLyrics) return;
    send({
      type: "lyric3d:init",
      payload: {
        title: track.title,
        artist: track.artist,
        duration,
        lines: lyricLines.map((line) => ({
          time: line.time,
          text: line.text,
          translation: line.translation,
        })),
        palette,
        time,
        playing,
        fx: effects,
      },
    });
  }, [loaded, booted, hasLyrics, lyricLines, palette, track.id, track.title, track.artist, duration]);

  useEffect(() => {
    if (!loaded && !booted) return;
    send({ type: "lyric3d:fx", ...effects });
  }, [loaded, booted, effects.particles, effects.camera, effects.intensity]);

  useEffect(() => {
    if ((!loaded && !booted) || !hasLyrics) return;
    const push = () => send({ type: "lyric3d:time", time, playing, duration });
    push();
    const timer = window.setInterval(push, 90);
    return () => window.clearInterval(timer);
  }, [loaded, booted, hasLyrics, time, playing, duration]);

  return (
    <motion.div
      className="lyric3d-stage"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <iframe
        ref={iframeRef}
        className="lyric3d-stage__frame"
        title="3D lyric performance"
        src="./lyric3d/index.html?embed=1"
        onLoad={() => setLoaded(true)}
        tabIndex={-1}
      />

      <div className="lyric3d-top">
        <div className="lyric3d-brand">
          <span className="lyric3d-brand__mark">3D</span>
          <span>
            <strong>LYRIC PERFORMANCE</strong>
            <em>{track.artist} · {track.title}</em>
          </span>
        </div>
        <div className="lyric3d-view-switch">
          <button type="button" onClick={onClassic}>经典</button>
          <button type="button" className="is-active">3D 演出</button>
        </div>
        <button type="button" className="lyric3d-customize" onClick={onCustomize} aria-label="Customize 3D stage">
          <SlidersHorizontal size={15} />
        </button>
        <button type="button" className="lyric3d-exit" onClick={onExit} aria-label="Exit immersive mode">
          <X size={17} />
        </button>
      </div>

      {(!hasLyrics || stageError) && (
        <div className="lyric3d-message">
          <strong>{stageError ? "3D stage unavailable" : "No timed lyrics"}</strong>
          <span>{stageError ?? "This song has no LRC timeline to perform."}</span>
          <button type="button" onClick={onClassic}>Back to classic</button>
        </div>
      )}

      {!loaded && !stageError && (
        <div className="lyric3d-loading">
          <LoaderCircle size={16} className="is-spinning" /> Building 3D stage…
        </div>
      )}

      <footer className="lyric3d-bottom">
        <div className="lyric3d-timeline">
          <span>{formatTime(time)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={Math.min(time, duration || 1)}
            aria-label="Playback position"
            style={{ "--progress": `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="lyric3d-controls">
          <button type="button" onClick={() => onSeek(Math.max(0, time - 10))} aria-label="Back 10 seconds">−10</button>
          <button type="button" onClick={onPrevious} aria-label="Previous" disabled={!isCurrent}>
            <SkipBack size={18} fill="currentColor" strokeWidth={0.7} />
          </button>
          <button type="button" className="lyric3d-play" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={20} fill="currentColor" strokeWidth={0} /> : <Play size={20} fill="currentColor" strokeWidth={0} />}
          </button>
          <button type="button" onClick={onNext} aria-label="Next" disabled={!isCurrent}>
            <SkipForward size={18} fill="currentColor" strokeWidth={0.7} />
          </button>
          <button type="button" onClick={() => onSeek(Math.min(duration, time + 10))} aria-label="Forward 10 seconds">+10</button>
        </div>
        <div className="lyric3d-live">
          <span className={playing ? "is-live" : ""} />
          {playing ? "PLAYING" : "PAUSED"} · IMMERSIVE 3D
          <button type="button" onClick={() => onSeek(0)} aria-label="Restart track"><RotateCcw size={13} /></button>
        </div>
      </footer>
    </motion.div>
  );
}
