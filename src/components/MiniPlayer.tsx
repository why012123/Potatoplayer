import { motion } from "motion/react";
import { Maximize2, Pause, Play } from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { Cover } from "@/components/Cover";

export function MiniPlayer() {
  const tr = useTr();
  const open = useAppStore((state) => state.rightPanelOpen);
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const tracks = useAppStore((state) => state.tracks);
  const setOpen = useAppStore((state) => state.setRightPanelOpen);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const playTrack = useAppStore((state) => state.playTrack);
  const track = tracks.find((item) => item.id === (playback?.trackId ?? previewTrackId));
  if (open || !track) return null;
  const active = playback?.trackId === track.id;
  const progress = active && playback.duration ? (playback.time / playback.duration) * 100 : 0;

  return (
    <motion.div
      className="mini-player glass-strong"
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <button
        type="button"
        className="mini-player__open"
        onClick={() => setOpen(true)}
        aria-label={tr("Open now playing", "打开正在播放")}
      />
      <Cover path={track.coverPath} seed={track.id} label={track.title} radius={11} className="mini-player__cover" />
      <div className="mini-player__copy">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
        <div className="mini-player__progress">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      </div>
      <button
        type="button"
        className="mini-player__play"
        aria-label={active && playback.playing ? tr("Pause", "暂停") : tr("Play", "播放")}
        onClick={() => (active ? void togglePlay() : void playTrack(track, tracks.map((item) => item.id)))}
      >
        {active && playback.playing ? (
          <Pause size={18} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={18} fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <button
        type="button"
        className="mini-player__expand"
        aria-label={tr("Expand now playing", "展开正在播放")}
        onClick={() => setOpen(true)}
      >
        <Maximize2 size={15} />
      </button>
    </motion.div>
  );
}
