import { useMemo } from "react";
import { Heart, ListEnd, ListMusic, ListPlus, Play, Shuffle } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { useTr } from "@/lib/i18n";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function FavoritesPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueueMany = useAppStore((state) => state.enqueueMany);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const navigate = useAppStore((state) => state.navigate);
  const favoriteTracks = useMemo(
    () =>
      tracks
        .filter((track) => favorites.includes(track.id))
        .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)),
    [tracks, favorites],
  );
  const duration = favoriteTracks.reduce((sum, track) => sum + track.duration, 0);
  const queue = favoriteTracks.map((track) => track.id);
  const favoriteCountLabel =
    favoriteTracks.length === 1
      ? tr("1 song", "1 首歌曲")
      : tr("{count} songs", "{count} 首歌曲", { count: favoriteTracks.length });

  return (
    <div className="page page--favorites">
      <PageHeader
        eyebrow={tr("Kept close", "珍藏")}
        title={tr("Favorites", "收藏")}
        description={
          favoriteTracks.length
            ? tr("{songs} · {duration}, kept close.", "{songs} · {duration}，珍藏于此。", {
                songs: favoriteCountLabel,
                duration: formatLongDuration(duration),
              })
            : tr("The songs you love, kept in one quiet place.", "你喜爱的歌，都安放在这处安静角落。")
        }
        actions={
          favoriteTracks.length ? (
            <>
              <button
                type="button"
                className="button button--glass"
                onClick={() => {
                  const ordered = shuffle(favoriteTracks);
                  void playTrack(ordered[0], ordered.map((track) => track.id));
                }}
              >
                <Shuffle size={15} /> {tr("Shuffle", "随机播放")}
              </button>
              <button type="button" className="button button--dark" onClick={() => void playTrack(favoriteTracks[0], queue)}>
                <Play size={15} fill="currentColor" /> {tr("Play", "播放")}
              </button>
              <button
                type="button"
                className="button button--glass button--compact"
                title={tr("Play next", "下一首播放")}
                aria-label={tr("Play next", "下一首播放")}
                onClick={() => void enqueueMany(queue, true)}
              >
                <ListEnd size={15} /> {tr("Play next", "下一首播放")}
              </button>
              <button
                type="button"
                className="button button--glass button--compact"
                title={tr("Add to queue", "添加到队列")}
                aria-label={tr("Add to queue", "添加到队列")}
                onClick={() => void enqueueMany(queue, false)}
              >
                <ListPlus size={15} /> {tr("Add to queue", "添加到队列")}
              </button>
              <button
                type="button"
                className="button button--glass button--compact"
                title={tr("Add all to playlist", "全部添加到歌单")}
                aria-label={tr("Add all to playlist", "全部添加到歌单")}
                onClick={() => setAddToPlaylistTrackIds(queue)}
              >
                <ListMusic size={15} /> {tr("Add to playlist", "添加到歌单")}
              </button>
            </>
          ) : undefined
        }
      />

      {favoriteTracks.length ? (
        <TrackTable tracks={favoriteTracks} queue={queue} />
      ) : (
        <div className="empty-stage glass empty-stage--compact favorites-empty">
          <div className="favorites-empty__heart">
            <Heart size={34} strokeWidth={1.3} />
            <span />
          </div>
          <h2>{tr("Save the ones that stay with you.", "把留在心里的歌收藏起来。")}</h2>
          <p>{tr("Tap the heart beside any song and it will appear here.", "点击任意歌曲旁的红心，它就会出现在这里。")}</p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            {tr("Browse your songs", "浏览你的歌曲")}
          </button>
        </div>
      )}
    </div>
  );
}
