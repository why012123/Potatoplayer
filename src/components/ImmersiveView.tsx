import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Disc3,
  Heart,
  Maximize2,
  Mic2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Track } from "@/types";
import { Cover } from "@/components/Cover";
import { EqualizerBars } from "@/components/EqualizerBars";
import { Slider } from "@/components/Slider";
import { useAppStore } from "@/store";
import { coverUrl } from "@/lib/covers";
import { formatTime } from "@/lib/format";

export function ImmersiveView() {
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const lyrics = useAppStore((state) => state.lyrics);
  const settings = useAppStore((state) => state.settings);
  const setImmersive = useAppStore((state) => state.setImmersive);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const playTrack = useAppStore((state) => state.playTrack);
  const next = useAppStore((state) => state.next);
  const previous = useAppStore((state) => state.previous);
  const seek = useAppStore((state) => state.seek);
  const setVolume = useAppStore((state) => state.setVolume);
  const setMuted = useAppStore((state) => state.setMuted);
  const cycleRepeat = useAppStore((state) => state.cycleRepeat);
  const toggleShuffle = useAppStore((state) => state.toggleShuffle);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);

  const trackBy = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const currentId = playback?.trackId ?? previewTrackId;
  const track = currentId ? trackBy.get(currentId) : undefined;
  const isCurrent = Boolean(track && playback?.trackId === track.id);
  const isPlaying = Boolean(isCurrent && playback?.playing);
  const time = isCurrent ? playback?.time ?? 0 : 0;
  const duration = isCurrent && playback?.duration ? playback.duration : track?.duration ?? 0;
  const volume = playback?.volume ?? settings?.volume ?? 0.78;
  const muted = playback?.muted ?? false;
  const favorite = track ? favorites.includes(track.id) : false;
  const repeat = playback?.repeat ?? "off";
  const shuffle = playback?.shuffle ?? false;

  const activeLyric = useMemo(() => {
    if (!lyrics?.found || !lyrics.lines.length) return -1;
    let index = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= time + 0.08) index = i;
      else break;
    }
    return index;
  }, [lyrics, time]);

  const lyricRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const node = lyricRefs.current[activeLyric];
    const container = node?.parentElement?.parentElement;
    if (node && container) {
      const top = node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, [activeLyric]);

  useEffect(() => {
    if (!track) setImmersive(false);
  }, [track, setImmersive]);

  const onPlay = () => {
    if (!track) return;
    if (isCurrent) void togglePlay();
    else void playTrack(track, tracks.map((item) => item.id));
  };

  const onSeek = (seconds: number) => {
    if (!track) return;
    if (isCurrent) seek(seconds);
    else void playTrack(track, [track.id], seconds);
  };

  const onLyricClick = (seconds: number) => {
    if (!track) return;
    if (isCurrent) seek(seconds);
    else void playTrack(track, [track.id], seconds);
  };

  const exit = () => setImmersive(false);
  const cover = track ? coverUrl(track.coverPath) : null;
  const volumeIcon =
    muted || volume === 0 ? <VolumeX size={19} /> : volume < 0.45 ? <Volume1 size={19} /> : <Volume2 size={19} />;

  return (
    <motion.div
      className="immerse"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="immerse__background"
        style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
        aria-hidden="true"
      />
      <div className="immerse__veil" aria-hidden="true" />
      <div className="immerse__grain" aria-hidden="true" />

      <header className="immerse__top">
        <div className="immerse__brand">
          <span className="immerse__brand-mark">
            <Disc3 size={16} />
          </span>
          <strong>potato</strong>
          <em>super</em>
        </div>
        <div className="immerse__label">
          <EqualizerBars playing={isPlaying} />
          Immersive listening
        </div>
        <div className="immerse__exit-hint">
          <Minimize2 size={13} />
          Click the artwork to exit
        </div>
      </header>

      {track ? (
        <>
          <main className="immerse__body">
            <section className="immerse__art-side">
              <motion.div
                className="immerse__art-stage"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="immerse__disc" aria-hidden="true" />
                <button
                  type="button"
                  className="immerse__cover-button"
                  onClick={exit}
                  aria-label="Exit immersive playback"
                  title="Click artwork to exit immersive mode"
                >
                  <Cover
                    path={track.coverPath}
                    seed={track.id}
                    label={track.title}
                    radius={25}
                    className="immerse__cover"
                    eager
                  />
                  <span className="immerse__cover-hint">
                    <Minimize2 size={14} /> Exit immersive
                  </span>
                </button>
              </motion.div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  className="immerse__track-info"
                  key={track.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="immerse__eyebrow">
                    {isPlaying ? <EqualizerBars playing /> : <Maximize2 size={12} />}
                    {isPlaying ? "Now playing" : isCurrent ? "Paused" : "Ready when you are"}
                  </span>
                  <h1>{track.title}</h1>
                  <p>{track.artist}</p>
                  <div className="immerse__meta">
                    <span>{track.album || `${track.artist} · Collection`}</span>
                    <i />
                    <span>{formatTime(track.duration)}</span>
                    {track.rating > 0 && (
                      <>
                        <i />
                        <span className="immerse__rating">★ {track.rating.toFixed(1)}</span>
                      </>
                    )}
                    <button
                      type="button"
                      className={`immerse__favorite ${favorite ? "is-favorite" : ""}`}
                      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                      onClick={() => void toggleFavorite(track.id)}
                    >
                      <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </section>

            <section className="immerse__lyrics-side">
              <div className="immerse__lyrics-head">
                <span>
                  <Mic2 size={14} /> Lyrics
                </span>
                {lyrics?.translated && <em>Original + translation</em>}
              </div>
              {lyrics?.found && lyrics.lines.length ? (
                <div className="immerse__lyrics-scroll">
                  <div className="immerse__lyrics">
                    {lyrics.lines.map((line, index) => {
                      const active = index === activeLyric;
                      return (
                        <button
                          type="button"
                          key={`${line.time}-${index}`}
                          ref={(node) => {
                            lyricRefs.current[index] = node;
                          }}
                          className={`immerse__lyric ${active ? "is-active" : ""} ${index < activeLyric ? "is-past" : ""}`}
                          onClick={() => onLyricClick(line.time)}
                        >
                          <span>{line.text}</span>
                          {line.translation && <em>{line.translation}</em>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="immerse__no-lyrics">
                  <Disc3 size={25} />
                  <strong>Let the music speak.</strong>
                  <span>No lyrics file was found for this song.</span>
                </div>
              )}
            </section>
          </main>

          <footer className="immerse__bottom">
            <div className="immerse__timeline">
              <span>{formatTime(time)}</span>
              <Slider
                label="Playback position"
                value={Math.min(time, duration || time)}
                max={duration || 1}
                className="immerse-range"
                disabled={!track}
                onChange={(value) => {
                  if (isCurrent) {
                    useAppStore.setState((state) =>
                      state.playback ? { playback: { ...state.playback, time: value } } : {},
                    );
                  }
                }}
                onCommit={onSeek}
              />
              <span>{formatTime(duration)}</span>
            </div>

            <div className="immerse__control-row">
              <div className="immerse__volume">
                <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>
                  {volumeIcon}
                </button>
                <Slider
                  label="Volume"
                  value={muted ? 0 : volume}
                  max={1}
                  compact
                  onChange={setVolume}
                  onCommit={setVolume}
                />
              </div>

              <div className="immerse__transport">
                <button
                  type="button"
                  className={shuffle ? "is-active" : ""}
                  onClick={() => void toggleShuffle()}
                  aria-label="Shuffle"
                >
                  <Shuffle size={19} />
                </button>
                <button type="button" onClick={() => void previous()} aria-label="Previous" disabled={!isCurrent}>
                  <SkipBack size={27} fill="currentColor" strokeWidth={0.6} />
                </button>
                <button type="button" className="immerse__play" onClick={onPlay} aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? (
                    <Pause size={27} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={27} fill="currentColor" strokeWidth={0} />
                  )}
                </button>
                <button type="button" onClick={() => void next()} aria-label="Next" disabled={!isCurrent}>
                  <SkipForward size={27} fill="currentColor" strokeWidth={0.6} />
                </button>
                <button
                  type="button"
                  className={repeat !== "off" ? "is-active" : ""}
                  onClick={() => void cycleRepeat()}
                  aria-label={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off"}
                >
                  {repeat === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />}
                </button>
              </div>

              <div className="immerse__bottom-note">
                <span>{(muted ? 0 : Math.round(volume * 100)) + "%"}</span>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <div className="immerse__empty">
          <button type="button" className="immerse__empty-cover" onClick={exit} aria-label="Exit immersive mode">
            <Disc3 size={44} />
          </button>
          <h1>Nothing is playing.</h1>
          <p>Choose a song, then click its artwork to enter the listening room.</p>
        </div>
      )}
    </motion.div>
  );
}
