import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock3, Disc3, ListEnd, ListMusic, ListPlus, Play, Shuffle } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { TrackTable } from "@/components/TrackTable";
import { albumTotalTime, buildArtists, buildCollections } from "@/lib/collections";
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

export function AlbumDetailPage() {
  const tracks = useAppStore((state) => state.tracks);
  const view = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const navigate = useAppStore((state) => state.navigate);
  const goBack = useAppStore((state) => state.goBack);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueueMany = useAppStore((state) => state.enqueueMany);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const collections = useMemo(() => buildCollections(tracks), [tracks]);
  const collection = view.kind === "album" ? collections.find((item) => item.key === view.key) : undefined;
  const tr = useTr();

  if (!collection) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={goBack}>
          <ArrowLeft size={15} /> {tr("Back", "返回")}
        </button>
        <div className="empty-stage glass empty-stage--compact">
          <h2>{tr("This collection moved.", "此合集已移动。")}</h2>
          <p>{tr("Rescan the library to pick up the changes.", "重新扫描资料库以同步变更。")}</p>
        </div>
      </div>
    );
  }

  const queue = collection.tracks.map((track) => track.id);

  return (
    <motion.div
      className="page page--detail"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <button type="button" className="back-link" onClick={goBack}>
        <ArrowLeft size={15} /> {tr("Albums", "专辑")}
      </button>
      <header className="detail-hero glass">
        <div className="detail-hero__art">
          <Cover path={collection.coverPath} seed={collection.key} label={collection.title} radius={22} eager />
        </div>
        <div className="detail-hero__copy">
          <span className="eyebrow">
            <Disc3 size={13} />{" "}
            {collection.kind === "album" ? tr("Album", "专辑") : tr("Artist collection", "艺术家合集")}
          </span>
          <h1>{collection.title}</h1>
          <button
            type="button"
            className="detail-hero__artist"
            onClick={() => navigate({ kind: "artist", name: collection.artist })}
          >
            {collection.artist}
          </button>
          <div className="detail-hero__facts">
            <span>
              {tr(
                collection.tracks.length === 1 ? "{count} song" : "{count} songs",
                "{count} 首歌曲",
                { count: collection.tracks.length },
              )}
            </span>
            <i />
            <span>
              <Clock3 size={13} /> {formatLongDuration(albumTotalTime(collection.tracks))}
            </span>
          </div>
          <div className="detail-hero__actions">
            <button
              type="button"
              className="button button--dark"
              onClick={() => void playTrack(collection.tracks[0], queue)}
            >
              <Play size={15} fill="currentColor" /> {tr("Play", "播放")}
            </button>
            <button
              type="button"
              className="button button--glass"
              title={tr("Shuffle", "随机播放")}
              aria-label={tr("Shuffle", "随机播放")}
              onClick={() => {
                const ordered = shuffle(collection.tracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> {tr("Shuffle", "随机播放")}
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
          </div>
        </div>
        <div className="detail-hero__watermark" aria-hidden="true">
          <span />
          <span />
        </div>
      </header>

      <TrackTable tracks={collection.tracks} queue={queue} />
    </motion.div>
  );
}

export function ArtistDetailPage() {
  const tracks = useAppStore((state) => state.tracks);
  const view = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const navigate = useAppStore((state) => state.navigate);
  const goBack = useAppStore((state) => state.goBack);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueueMany = useAppStore((state) => state.enqueueMany);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const artists = useMemo(() => buildArtists(tracks), [tracks]);
  const artist = view.kind === "artist" ? artists.find((item) => item.name === view.name) : undefined;
  const tr = useTr();

  if (!artist) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={goBack}>
          <ArrowLeft size={15} /> {tr("Back", "返回")}
        </button>
        <div className="empty-stage glass empty-stage--compact">
          <h2>{tr("No songs by this artist.", "这位艺术家暂无歌曲。")}</h2>
          <p>{tr("The library may have changed since this page was opened.", "此页面打开后，资料库可能已发生变化。")}</p>
        </div>
      </div>
    );
  }

  const queue = artist.tracks.map((track) => track.id);
  const collections = buildCollections(artist.tracks);

  return (
    <motion.div
      className="page page--detail"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <button type="button" className="back-link" onClick={goBack}>
        <ArrowLeft size={15} /> {tr("Artists", "艺术家")}
      </button>
      <header className="artist-hero glass">
        <div className="artist-hero__art">
          <Cover path={artist.coverPath} seed={artist.name} label={artist.name} radius="50%" eager />
          <span className="artist-hero__halo" />
        </div>
        <div className="artist-hero__copy">
          <span className="eyebrow">{tr("Artist", "艺术家")}</span>
          <h1>{artist.name}</h1>
          <div className="detail-hero__facts">
            <span>
              {tr(
                artist.tracks.length === 1 ? "{count} song" : "{count} songs",
                "{count} 首歌曲",
                { count: artist.tracks.length },
              )}
            </span>
            <i />
            <span>
              <ListMusic size={13} />{" "}
              {tr(
                collections.length === 1 ? "{count} collection" : "{count} collections",
                "{count} 个合集",
                { count: collections.length },
              )}
            </span>
          </div>
          <div className="detail-hero__actions">
            <button type="button" className="button button--dark" onClick={() => void playTrack(artist.tracks[0], queue)}>
              <Play size={15} fill="currentColor" /> {tr("Play", "播放")}
            </button>
            <button
              type="button"
              className="button button--glass"
              title={tr("Shuffle", "随机播放")}
              aria-label={tr("Shuffle", "随机播放")}
              onClick={() => {
                const ordered = shuffle(artist.tracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> {tr("Shuffle", "随机播放")}
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
            <button
              type="button"
              className="button button--glass button--compact"
              title={tr("Open artist collections", "打开艺术家合集")}
              aria-label={tr("Open artist collections", "打开艺术家合集")}
              onClick={() => navigate({ kind: "albums" })}
            >
              <Disc3 size={15} /> {tr("Albums", "专辑")}
            </button>
          </div>
        </div>
      </header>
      <TrackTable tracks={artist.tracks} queue={queue} />
    </motion.div>
  );
}
