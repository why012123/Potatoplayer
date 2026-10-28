import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ListEnd, ListPlus, LoaderCircle, Play, RefreshCw, Shuffle, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { useLanguage, useTr } from "@/lib/i18n";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function DailyMixPage() {
  const tr = useTr();
  const language = useLanguage();
  const dailyMix = useAppStore((state) => state.dailyMix);
  const tracks = useAppStore((state) => state.tracks);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueueMany = useAppStore((state) => state.enqueueMany);
  const refreshDailyMix = useAppStore((state) => state.refreshDailyMix);
  const pushToast = useAppStore((state) => state.pushToast);
  const [refreshing, setRefreshing] = useState(false);

  const trackBy = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const mixTracks = useMemo(
    () =>
      (dailyMix?.trackIds ?? [])
        .map((id) => trackBy.get(id))
        .filter((track): track is NonNullable<typeof track> => Boolean(track)),
    [dailyMix, trackBy],
  );
  const queue = mixTracks.map((track) => track.id);
  const duration = mixTracks.reduce((sum, track) => sum + track.duration, 0);
  const dateLabel = dailyMix?.date
    ? new Date(`${dailyMix.date}T00:00:00`).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", {
        month: "long",
        day: "numeric",
      })
    : tr("Today", "今天");

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const next = await refreshDailyMix();
    setRefreshing(false);
    if (next) {
      pushToast(
        tr("Today’s mix is refreshed", "今日推荐已刷新"),
        tr("{count} songs from your library.", "从你的资料库挑选了 {count} 首歌曲。", { count: next.trackIds.length }),
        "success",
      );
    }
  };

  if (!dailyMix) {
    return (
      <div className="page page--daily">
        <div className="online-loading glass">
          <LoaderCircle size={20} className="is-spinning" /> {tr("Building today’s mix…", "正在生成今日推荐…")}
        </div>
      </div>
    );
  }

  if (!mixTracks.length) {
    return (
      <div className="page page--daily">
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <Sparkles size={28} />
          </div>
          <h2>{tr("Your daily mix needs a little more music.", "每日推荐还需要一点音乐。")}</h2>
          <p>
            {tr(
              "Add songs to your library, then today’s mix will be built from your ratings and listening history.",
              "向资料库添加歌曲后，今日推荐会根据你的评分与聆听记录生成。",
            )}
          </p>
          <button type="button" className="button button--dark" onClick={() => void refresh()}>
            <RefreshCw size={15} /> {tr("Try again", "重试")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="page page--daily"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="playlist-hero glass">
        <div className="playlist-hero__cover">
          <div className={`playlist-mosaic playlist-mosaic--${Math.min(mixTracks.length, 4)}`}>
            {mixTracks.slice(0, 4).map((track) => (
              <Cover key={track.id} path={track.coverPath} seed={track.id} label={track.title} radius={6} />
            ))}
          </div>
        </div>
        <div className="playlist-hero__copy">
          <span className="eyebrow">
            <Sparkles size={12} /> {tr("Daily Mix", "每日推荐")}
          </span>
          <h1>{tr("Today’s mix", "今日推荐")}</h1>
          <p>
            {dateLabel} ·{" "}
            {tr(
              mixTracks.length === 1 ? "{count} song" : "{count} songs",
              "{count} 首歌曲",
              { count: mixTracks.length },
            )}{" "}
            · {formatLongDuration(duration)}
          </p>
          <p className="daily-mix__note">
            {tr(
              "Built from your own ratings, favorites and listening history. It stays the same all day.",
              "根据你的评分、收藏与聆听记录生成。今天内不会改变。",
            )}
          </p>
          <div className="detail-hero__actions">
            <button type="button" className="button button--dark" onClick={() => void playTrack(mixTracks[0], queue)}>
              <Play size={15} fill="currentColor" /> {tr("Play", "播放")}
            </button>
            <button
              type="button"
              className="button button--glass"
              onClick={() => {
                const ordered = shuffled(mixTracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> {tr("Shuffle", "随机播放")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              onClick={() => void enqueueMany(queue, true)}
            >
              <ListEnd size={15} /> {tr("Play next", "下一首播放")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              onClick={() => void enqueueMany(queue, false)}
            >
              <ListPlus size={15} /> {tr("Add to queue", "添加到队列")}
            </button>
            <button
              type="button"
              className="button button--glass button--compact"
              disabled={refreshing}
              onClick={() => void refresh()}
              title={tr("Rebuild today’s mix", "重新生成今日推荐")}
            >
              {refreshing ? <LoaderCircle size={15} className="is-spinning" /> : <RefreshCw size={15} />}
              {refreshing ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}
            </button>
          </div>
        </div>
      </header>

      <TrackTable tracks={mixTracks} queue={queue} showRating compact />
    </motion.div>
  );
}
