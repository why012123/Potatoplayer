import { useLayoutEffect, useMemo, useRef } from "react";
import { ChevronRight, ListMusic, Shuffle, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import type { Track } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { formatTime } from "@/lib/format";
import { Cover } from "./Cover";
import { EqualizerBars } from "./EqualizerBars";
import { IconButton } from "./IconButton";
import { RightPanelSwitch } from "./RightPanelSwitch";

export function QueueSidebar() {
  const tr = useTr();
  const playback = useAppStore((s) => s.playback);
  const tracks = useAppStore((s) => s.tracks);
  const tempTrack = useAppStore((s) => s.tempTrack);
  const playTrack = useAppStore((s) => s.playTrack);
  const removeFromQueue = useAppStore((s) => s.removeFromQueue);
  const setOpen = useAppStore((s) => s.setRightPanelOpen);
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const queue = playback?.queue ?? [];
  const queueTracks = useMemo(() => {
    const byId = new Map(tracks.map(track => [track.id, track]));
    if (tempTrack) byId.set(tempTrack.id, tempTrack);
    return queue.map(id => byId.get(id)).filter((track): track is Track => Boolean(track));
  }, [queue, tracks, tempTrack]);
  const queueListRef = useRef<HTMLDivElement>(null);
  const currentQueueRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = queueListRef.current;
    const row = currentQueueRef.current;
    if (!list || !row) return;
    list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - row.clientHeight) / 2;
  }, [playback?.trackId, queueTracks.length]);

  return <div className="right-panel-view queue-sidebar" aria-label={tr("Play queue", "播放列表")}>
    <div className="now-playing__head">
      <span className="eyebrow"><ListMusic size={14} />{tr("Play queue", "播放列表")}</span>
      <div className="now-playing__head-actions">
        <IconButton label={tr("Equalizer", "均衡器")} variant="ghost" size="sm" onClick={() => setEqOpen(true)}><SlidersHorizontal size={16} /></IconButton>
        <IconButton label={tr("Shuffle", "随机播放")} variant="ghost" size="sm" active={playback?.shuffle} aria-pressed={Boolean(playback?.shuffle)} onClick={() => void toggleShuffle()}><Shuffle size={17} /></IconButton>
        <RightPanelSwitch />
        <IconButton label={tr("Minimize play queue", "收起播放列表")} variant="ghost" size="sm" onClick={() => setOpen(false)}><ChevronRight size={17} /></IconButton>
      </div>
    </div>
    <div className="queue-sidebar__summary">{tr("{count} songs", "{count} 首歌曲", { count: queueTracks.length })} · {formatTime(queueTracks.reduce((sum, track) => sum + (track.duration || 0), 0))}</div>
    <div className="queue-panel">
      {queueTracks.length ? (
        <div className="queue-list" ref={queueListRef}>
          {queueTracks.map((item, index) => {
            const current = item.id === playback?.trackId;
            return (
              <div
                key={`${item.id}-${index}`}
                ref={current ? (node) => { currentQueueRef.current = node; } : undefined}
                className={clsx("queue-row", current && "is-current")}
              >
                <button
                  type="button"
                  className="queue-row__hit"
                  aria-label={tr("Play {title}", "播放 {title}", { title: item.title })}
                  onClick={() => void playTrack(item, queue, 0)}
                />
                <span className="queue-row__index" aria-hidden="true">
                  {current ? <EqualizerBars playing={Boolean(playback?.playing)} /> : index + 1}
                </span>
                <span className="queue-row__cover-wrap" aria-hidden="true">
                  <Cover path={item.coverPath} seed={item.id} label={item.title} radius={8} className="queue-row__cover" />
                </span>
                <span className="queue-row__text" aria-hidden="true">
                  <strong>{item.title}</strong>
                  <em>{item.artist}</em>
                </span>
                <span className="queue-row__end">
                  <span className="queue-row__time" aria-hidden="true">{formatTime(item.duration)}</span>
                  {!current && (
                    <button
                      type="button"
                      className="queue-row__remove"
                      aria-label={tr("Remove {title} from queue", "从队列移出 {title}", { title: item.title })}
                      title={tr("Remove from queue", "移出队列")}
                      onClick={() => void removeFromQueue(item.id)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              </div>
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

    </div>
  </div>;
}
