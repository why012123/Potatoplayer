import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
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
  SlidersHorizontal,
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
import { useTr } from "@/lib/i18n";
import { Lyric3DStage } from "@/components/Lyric3DStage";
import { ImmersiveCustomizer } from "@/components/ImmersiveCustomizer";
import { SpectrumBars } from "@/components/SpectrumBars";
import {
  accentFromPreferences,
  loadImmersivePreferences,
  saveImmersivePreferences,
  type ImmersivePreferences,
} from "@/lib/immersive";

export function ImmersiveView({ palette }: { palette: { primary: string; secondary: string } | null }) {
  const playback = useAppStore((state) => state.playback);
  const vizBars = useAppStore((state) => state.vizBars);
  const capabilities = useAppStore((state) => state.engineCapabilities);
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
  const setEqOpen = useAppStore((state) => state.setEqOpen);
  const ensureLyrics = useAppStore((state) => state.ensureLyrics);
  const tr = useTr();
  const [prefs, setPrefs] = useState<ImmersivePreferences>(() => loadImmersivePreferences());
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const view3d = prefs.lyricView === "3d";
  const spectrumAvailable = Boolean(capabilities?.visualizer);
  const showSpectrum = Boolean(prefs.showSpectrum && spectrumAvailable && vizBars.length > 0);
  const setView3d = (value: boolean) => setPrefs((current) => ({ ...current, lyricView: value ? "3d" : "classic" }));
  const updatePrefs = (patch: Partial<ImmersivePreferences>) => setPrefs((current) => ({ ...current, ...patch }));

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

  useEffect(() => {
    if (view3d && track) void ensureLyrics(track.id);
  }, [view3d, track, ensureLyrics]);

  useEffect(() => {
    saveImmersivePreferences(prefs);
  }, [prefs]);

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
  const coverAccent = palette?.primary ?? null;
  const customAccent = accentFromPreferences(prefs, coverAccent);
  const immersiveStyle = {
    "--immerse-lyric-scale": prefs.lyricScale,
    "--immerse-lyric-align": prefs.lyricAlign,
    "--immerse-bg-blur": prefs.backgroundBlur,
    "--immerse-bg-dim": prefs.backgroundDim,
    "--immerse-bg-grain": prefs.backgroundGrain,
    "--immerse-bg-veil": prefs.backgroundVeil,
    "--immerse-panel-opacity": prefs.lyricPanelOpacity,
    "--immerse-panel-border": prefs.lyricPanelBorder,
    "--immerse-panel-blur": `${prefs.lyricPanelBlur}px`,
    "--immerse-panel-radius": `${prefs.lyricPanelRadius}px`,
    "--immerse-line-height": prefs.lyricLineSpacing,
    "--immerse-spectrum-scale": prefs.spectrumScale,
    "--immerse-spectrum-opacity": prefs.spectrumOpacity,
    ...(prefs.accent !== "cover" && customAccent ? { "--accent": customAccent } : {}),
  } as CSSProperties;
  const immersiveClasses = clsx(
    "immerse",
    `immerse--${prefs.layout}`,
    !prefs.showCover && "immerse--no-cover",
    !prefs.showInfo && "immerse--no-info",
    !prefs.showHeader && "immerse--no-header",
    !prefs.showTranslation && "immerse--no-translation",
    !prefs.showProgress && "immerse--no-progress",
    !prefs.showVolume && "immerse--no-volume",
    !prefs.showFavorite && "immerse--no-favorite",
    !prefs.lyricsFrame && "immerse--no-lyrics-frame",
    !prefs.lyricActiveHighlight && "immerse--no-lyric-highlight",
    prefs.lyricAlign === "center" && "immerse--lyrics-center",
    prefs.lyricSerif && "immerse--serif",
  );

  const customizerModal = (
    <AnimatePresence>
      {customizerOpen && (
        <motion.div
          className="immerse__customizer-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <ImmersiveCustomizer
            prefs={prefs}
            onChange={updatePrefs}
            onClose={() => setCustomizerOpen(false)}
            spectrumAvailable={spectrumAvailable}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (view3d && track) {
    return (
      <>
        <Lyric3DStage
          track={track}
          lyrics={lyrics}
          palette={palette}
          time={time}
          duration={duration}
          playing={isPlaying}
          isCurrent={isCurrent}
          onToggle={onPlay}
          onSeek={onSeek}
          onNext={() => void next()}
          onPrevious={() => void previous()}
          onClassic={() => setView3d(false)}
          onExit={exit}
          onCustomize={() => setCustomizerOpen(true)}
          effects={{
            particles: prefs.stageParticles,
            camera: prefs.stageCamera,
            intensity: prefs.stageIntensity,
          }}
        />
        {showSpectrum && (
          <div className="lyric3d-spectrum-wrap" aria-hidden="true">
            <SpectrumBars bars={vizBars} className="lyric3d-spectrum" />
          </div>
        )}
        {customizerModal}
      </>
    );
  }

  return (
    <motion.div
      className={immersiveClasses}
      style={immersiveStyle}
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
          {tr("Immersive listening", "沉浸聆听")}
        </div>
        <div className="immerse__top-right">
          <div className="immerse__view-switch" role="group" aria-label={tr("Lyric view", "歌词视图")}>
            <button type="button" className="is-active">{tr("Classic", "经典")}</button>
            <button type="button" onClick={() => setView3d(true)}>{tr("3D stage", "3D 演出")}</button>
          </div>
          <button type="button" className="immerse__customize" onClick={() => setCustomizerOpen(true)} title={tr("Customize immersive mode", "自定义沉浸模式")} aria-label={tr("Customize immersive mode", "自定义沉浸模式")}>
            <SlidersHorizontal size={15} />
          </button>
          <div className="immerse__exit-hint">
            <Minimize2 size={13} />
            {tr("Click the artwork to exit", "点击封面退出")}
          </div>
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
                  aria-label={tr("Exit immersive playback", "退出沉浸播放")}
                  title={tr("Click artwork to exit immersive mode", "点击封面退出沉浸模式")}
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
                    <Minimize2 size={14} /> {tr("Exit immersive", "退出沉浸模式")}
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
                    {isPlaying
                      ? tr("Now playing", "正在播放")
                      : isCurrent
                        ? tr("Paused", "已暂停")
                        : tr("Ready when you are", "随时开始")}
                  </span>
                  <h1>{track.title}</h1>
                  <p>{track.artist}</p>
                  <div className="immerse__meta">
                    <span>{track.album || tr("{artist} · Collection", "{artist} · 精选集", { artist: track.artist })}</span>
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
                      aria-label={favorite ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "添加到收藏")}
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
                  <Mic2 size={14} /> {tr("Lyrics", "歌词")}
                </span>
                {lyrics?.translated && <em>{tr("Original + translation", "原文 + 翻译")}</em>}
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
                  <strong>{tr("Let the music speak.", "让音乐说话。")}</strong>
                  <span>{tr("No lyrics file was found for this song.", "未找到这首歌的歌词文件。")}</span>
                </div>
              )}
            </section>
          </main>

          <footer className="immerse__bottom">
            {showSpectrum && (
              <div className="immerse__spectrum-wrap" aria-hidden="true">
                <SpectrumBars bars={vizBars} className="immerse__spectrum" />
              </div>
            )}
            <div className="immerse__timeline">
              <span>{formatTime(time)}</span>
              <Slider
                label={tr("Playback position", "播放进度")}
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
                <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? tr("Unmute", "取消静音") : tr("Mute", "静音")}>
                  {volumeIcon}
                </button>
                <Slider
                  label={tr("Volume", "音量")}
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
                  aria-label={tr("Shuffle", "随机播放")}
                >
                  <Shuffle size={19} />
                </button>
                <button type="button" onClick={() => void previous()} aria-label={tr("Previous", "上一首")} disabled={!isCurrent}>
                  <SkipBack size={27} fill="currentColor" strokeWidth={0.6} />
                </button>
                <button type="button" className="immerse__play" onClick={onPlay} aria-label={isPlaying ? tr("Pause", "暂停") : tr("Play", "播放")}>
                  {isPlaying ? (
                    <Pause size={27} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={27} fill="currentColor" strokeWidth={0} />
                  )}
                </button>
                <button type="button" onClick={() => void next()} aria-label={tr("Next", "下一首")} disabled={!isCurrent}>
                  <SkipForward size={27} fill="currentColor" strokeWidth={0.6} />
                </button>
                <button
                  type="button"
                  className={repeat !== "off" ? "is-active" : ""}
                  onClick={() => void cycleRepeat()}
                  aria-label={repeat === "one"
                    ? tr("Repeat one", "单曲循环")
                    : repeat === "all"
                      ? tr("Repeat all", "列表循环")
                      : tr("Repeat off", "不循环")}
                >
                  {repeat === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />}
                </button>
              </div>

              <div className="immerse__bottom-note">
                <button type="button" className="immerse__eq" onClick={() => setEqOpen(true)} aria-label={tr("Open equalizer", "打开均衡器")} title={tr("Equalizer", "均衡器")}>
                  <SlidersHorizontal size={16} />
                </button>
                <span>{(muted ? 0 : Math.round(volume * 100)) + "%"}</span>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <div className="immerse__empty">
          <button type="button" className="immerse__empty-cover" onClick={exit} aria-label={tr("Exit immersive mode", "退出沉浸模式")}>
            <Disc3 size={44} />
          </button>
          <h1>{tr("Nothing is playing.", "暂无播放。")}</h1>
          <p>{tr("Choose a song, then click its artwork to enter the listening room.", "选择一首歌曲，然后点击封面进入聆听室。")}</p>
        </div>
      )}

      {customizerModal}
    </motion.div>
  );
}
