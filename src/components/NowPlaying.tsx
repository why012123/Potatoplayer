import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  ChevronRight,
  Heart,
  ListMusic,
  Mic2,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Maximize2,
  SlidersHorizontal,
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
import { SpectrumBars } from "@/components/SpectrumBars";
import { Slider } from "@/components/Slider";
import { IconButton } from "@/components/IconButton";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { formatTime } from "@/lib/format";

function NowPlayingSpectrum() {
  const vizBars = useAppStore((state) => state.vizBars);
  const capabilities = useAppStore((state) => state.engineCapabilities);
  if (!capabilities?.visualizer || vizBars.length === 0) return null;
  return <SpectrumBars bars={vizBars} className="now-playing__spectrum" />;
}

export function NowPlaying() {
  const tr = useTr();
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const lyrics = useAppStore((state) => state.lyrics);
  const lyricsLoading = useAppStore((state) => state.lyricsLoading);
  const rightTab = useAppStore((state) => state.rightTab);
  const setRightTab = useAppStore((state) => state.setRightTab);
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);
  const setImmersive = useAppStore((state) => state.setImmersive);
  const setEqOpen = useAppStore((state) => state.setEqOpen);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const next = useAppStore((state) => state.next);
  const previous = useAppStore((state) => state.previous);
  const seek = useAppStore((state) => state.seek);
  const setVolume = useAppStore((state) => state.setVolume);
  const setMuted = useAppStore((state) => state.setMuted);
  const cycleRepeat = useAppStore((state) => state.cycleRepeat);
  const toggleShuffle = useAppStore((state) => state.toggleShuffle);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTrackMenu = useAppStore((state) => state.setTrackMenu);
  const settings = useAppStore((state) => state.settings);

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
  const queue = playback?.queue ?? [];
  const queueTracks = queue.map((id) => trackBy.get(id)).filter((item): item is Track => Boolean(item));
  const repeat = playback?.repeat ?? "off";
  const shuffle = playback?.shuffle ?? false;

  const statusLabel = isPlaying
    ? tr("Now playing", "正在播放")
    : isCurrent
      ? tr("Ready to resume", "已暂停")
      : track
        ? tr("Ready when you are", "随时开始")
        : tr("Nothing playing", "暂无播放");
  const repeatLabel =
    repeat === "one"
      ? tr("Repeat one", "单曲循环")
      : repeat === "all"
        ? tr("Repeat all", "列表循环")
        : tr("Repeat off", "不循环");

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
    lyricRefs.current = [];
  }, [track?.id]);

  useEffect(() => {
    if (rightTab !== "lyrics" || activeLyric < 0) return;
    const node = lyricRefs.current[activeLyric];
    const container = node?.parentElement?.parentElement;
    if (!node || !container) return;
    const top = node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeLyric, rightTab]);

  const onPlay = () => {
    if (!track) return;
    if (isCurrent) {
      void togglePlay();
    } else {
      const queueIds = queue.length ? queue : tracks.map((item) => item.id);
      void playTrack(track, queueIds);
    }
  };

  const onSeek = (value: number) => {
    if (!track) return;
    if (isCurrent) seek(value);
    else void playTrack(track, queue.length ? queue : [track.id], value);
  };

  const volumeIcon = muted || volume === 0 ? <VolumeX size={17} /> : volume < 0.45 ? <Volume1 size={17} /> : <Volume2 size={17} />;

  return (
    <motion.aside
      className="now-playing glass"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="now-playing__glow" aria-hidden="true">
        {track?.coverPath && (
          <Cover path={track.coverPath} seed={track.id} label="" radius={48} className="now-playing__glow-cover" />
        )}
      </div>

      <div className="now-playing__head">
        <span className="eyebrow">
          {isPlaying ? <EqualizerBars playing className="eyebrow__eq" /> : null}
          {statusLabel}
        </span>
        <div className="now-playing__head-actions">
          <IconButton
            label={tr("Equalizer", "均衡器")}
            variant="ghost"
            size="sm"
            onClick={() => setEqOpen(true)}
          >
            <SlidersHorizontal size={16} />
          </IconButton>
          {track && (
            <IconButton
              label={tr("More options", "更多操作")}
              variant="ghost"
              size="sm"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setTrackMenu({ trackId: track.id, x: rect.right, y: rect.bottom });
              }}
            >
              <MoreHorizontal size={18} />
            </IconButton>
          )}
          <IconButton
            label={tr("Hide now playing", "收起正在播放")}
            variant="ghost"
            size="sm"
            onClick={() => setRightPanelOpen(false)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {track ? (
          <motion.div
            className="now-playing__body"
            key={track.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="now-playing__art-wrap"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                className="now-playing__art-button"
                onClick={() => setImmersive(true)}
                aria-label={tr("Enter immersive playback", "进入沉浸式播放")}
                title={tr("Open immersive playback", "打开沉浸式播放")}
              >
                <Cover
                  path={track.coverPath}
                  seed={track.id}
                  label={track.title}
                  radius={24}
                  className="now-playing__art"
                  eager
                />
                <span className="now-playing__art-hint">
                  <Maximize2 size={13} /> {tr("Immersive", "沉浸式")}
                </span>
              </button>
            </motion.div>

            <NowPlayingSpectrum />

            <div className="now-playing__meta">
              <div className="now-playing__title-line">
                <div>
                  <h2>{track.title}</h2>
                  <button
                    type="button"
                    className="now-playing__artist"
                    onClick={() => useAppStore.getState().navigate({ kind: "artist", name: track.artist })}
                  >
                    {track.artist}
                  </button>
                </div>
                <IconButton
                  label={favorite ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "添加收藏")}
                  variant="ghost"
                  size="sm"
                  className={clsx(favorite && "is-favorite")}
                  onClick={() => void toggleFavorite(track.id)}
                >
                  <Heart size={19} fill={favorite ? "currentColor" : "none"} />
                </IconButton>
              </div>
              <div className="now-playing__subline">
                <span>
                  {track.album || tr("{artist} · Collection", "{artist} · 合集", { artist: track.artist })}
                </span>
                {track.year > 0 && <span>{track.year}</span>}
                {track.rating > 0 && <span className="rating-inline">★ {track.rating.toFixed(1)}</span>}
              </div>
            </div>

            <div className="now-playing__progress">
              <Slider
                label={tr("Playback position", "播放进度")}
                value={Math.min(time, duration || time)}
                max={duration || 1}
                onChange={(value) => {
                  if (isCurrent) {
                    useAppStore.setState((state) =>
                      state.playback ? { playback: { ...state.playback, time: value } } : {},
                    );
                  }
                }}
                onCommit={onSeek}
                disabled={!track}
              />
              <div className="time-row">
                <span>{formatTime(time)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="transport">
              <IconButton
                label={shuffle ? tr("Turn shuffle off", "关闭随机播放") : tr("Turn shuffle on", "开启随机播放")}
                variant="ghost"
                size="sm"
                active={shuffle}
                onClick={() => void toggleShuffle()}
              >
                <Shuffle size={17} />
              </IconButton>
              <IconButton
                label={tr("Previous", "上一首")}
                variant="ghost"
                size="md"
                onClick={() => void previous()}
                disabled={!isCurrent}
              >
                <SkipBack size={21} fill="currentColor" strokeWidth={0.8} />
              </IconButton>
              <button
                type="button"
                className="transport__play"
                onClick={onPlay}
                aria-label={isPlaying ? tr("Pause", "暂停") : tr("Play", "播放")}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isPlaying ? (
                    <motion.span
                      key="pause"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.14 }}
                    >
                      <Pause size={23} fill="currentColor" strokeWidth={0} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="play"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.14 }}
                    >
                      <Play size={23} fill="currentColor" strokeWidth={0} style={{ transform: "translateX(1px)" }} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              <IconButton
                label={tr("Next", "下一首")}
                variant="ghost"
                size="md"
                onClick={() => void next()}
                disabled={!isCurrent}
              >
                <SkipForward size={21} fill="currentColor" strokeWidth={0.8} />
              </IconButton>
              <IconButton
                label={repeatLabel}
                variant="ghost"
                size="sm"
                active={repeat !== "off"}
                onClick={() => void cycleRepeat()}
              >
                {repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
              </IconButton>
            </div>

            <div className="volume-row">
              <button
                type="button"
                className="volume-row__icon"
                aria-label={muted ? tr("Unmute", "取消静音") : tr("Mute", "静音")}
                onClick={() => setMuted(!muted)}
              >
                {volumeIcon}
              </button>
              <Slider
                label={tr("Volume", "音量")}
                value={muted ? 0 : volume}
                max={1}
                step={0.01}
                compact
                onChange={setVolume}
                onCommit={setVolume}
              />
              <span>{Math.round((muted ? 0 : volume) * 100)}</span>
            </div>

            <div className="np-tabs">
              <button type="button" className={clsx(rightTab === "lyrics" && "is-active")} onClick={() => setRightTab("lyrics")}>
                {rightTab === "lyrics" && <motion.span layoutId="np-tab" className="np-tabs__pill" />}
                <Mic2 size={14} />
                {tr("Lyrics", "歌词")}
              </button>
              <button type="button" className={clsx(rightTab === "queue" && "is-active")} onClick={() => setRightTab("queue")}>
                {rightTab === "queue" && <motion.span layoutId="np-tab" className="np-tabs__pill" />}
                <ListMusic size={14} />
                {tr("Up next", "即将播放")}
                {queue.length > 0 && <em>{queue.length}</em>}
              </button>
            </div>

            <div className="np-content">
              <AnimatePresence mode="wait" initial={false}>
                {rightTab === "lyrics" ? (
                  <motion.div
                    key="lyrics"
                    className="lyrics-panel"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {lyricsLoading ? (
                      <div className="lyrics-skeleton">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : lyrics?.found && lyrics.lines.length ? (
                      <div className="lyrics-scroll">
                        <div className="lyrics-lines">
                          {lyrics.lines.map((line, index) => {
                            const active = index === activeLyric;
                            return (
                              <button
                                type="button"
                                key={`${line.time}-${index}`}
                                ref={(node) => {
                                  lyricRefs.current[index] = node;
                                }}
                                className={clsx("lyric-line", active && "is-active", index < activeLyric && "is-past")}
                                onClick={() => {
                                  if (isCurrent) seek(line.time);
                                  else void playTrack(track, queue.length ? queue : [track.id], line.time);
                                }}
                              >
                                <span>{line.text}</span>
                                {line.translation && <em>{line.translation}</em>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="lyrics-empty">
                        <Mic2 size={20} />
                        <strong>{tr("No lyrics for this one", "这首歌暂无歌词")}</strong>
                        <span>
                          {tr(
                            "Add a matching .lrc file next to the song, or in the library’s lyrics folder.",
                            "在歌曲同目录或资料库的歌词文件夹中放入匹配的 .lrc 文件。",
                          )}
                        </span>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="queue"
                    className="queue-panel"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {queueTracks.length ? (
                      <div className="queue-list">
                        {queueTracks.map((item, index) => {
                          const current = item.id === playback?.trackId;
                          return (
                            <button
                              type="button"
                              key={`${item.id}-${index}`}
                              className={clsx("queue-row", current && "is-current")}
                              onClick={() => void playTrack(item, queue, 0)}
                            >
                              <span className="queue-row__index">
                                {current ? <EqualizerBars playing={Boolean(playback?.playing)} /> : index + 1}
                              </span>
                              <Cover path={item.coverPath} seed={item.id} label={item.title} radius={8} className="queue-row__cover" />
                              <span className="queue-row__text">
                                <strong>{item.title}</strong>
                                <em>{item.artist}</em>
                              </span>
                              <span className="queue-row__time">{formatTime(item.duration)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="lyrics-empty">
                        <ListMusic size={20} />
                        <strong>{tr("Your queue is empty", "播放队列为空")}</strong>
                        <span>
                          {tr(
                            "Play an album or shuffle a playlist and the next songs will appear here.",
                            "播放一张专辑或随机播放歌单，接下来的歌曲会显示在这里。",
                          )}
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="now-playing__empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="now-playing__empty-art">
              <span className="vinyl" />
              <span className="vinyl vinyl--2" />
              <ListMusic size={28} />
            </div>
            <h2>{tr("Give the room a soundtrack.", "给房间一点配乐。")}</h2>
            <p>
              {tr(
                "Pick any song from your library and it will appear here with artwork, lyrics and queue.",
                "从资料库中任选一首歌，封面、歌词和播放队列都会显示在这里。",
              )}
            </p>
            <button
              type="button"
              className="button button--dark"
              onClick={() => useAppStore.getState().navigate({ kind: "songs" })}
            >
              {tr("Browse songs", "浏览歌曲")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
