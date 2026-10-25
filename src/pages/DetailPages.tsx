import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock3, Disc3, ListMusic, Play, Shuffle } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { TrackTable } from "@/components/TrackTable";
import { albumTotalTime, buildArtists, buildCollections } from "@/lib/collections";
import { formatLongDuration } from "@/lib/format";

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
  const collections = useMemo(() => buildCollections(tracks), [tracks]);
  const collection = view.kind === "album" ? collections.find((item) => item.key === view.key) : undefined;

  if (!collection) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={goBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="empty-stage glass empty-stage--compact">
          <h2>This collection moved.</h2>
          <p>Rescan the library to pick up the changes.</p>
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
        <ArrowLeft size={15} /> Albums
      </button>
      <header className="detail-hero glass">
        <div className="detail-hero__art">
          <Cover path={collection.coverPath} seed={collection.key} label={collection.title} radius={22} eager />
        </div>
        <div className="detail-hero__copy">
          <span className="eyebrow">
            <Disc3 size={13} /> {collection.kind === "album" ? "Album" : "Artist collection"}
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
            <span>{collection.tracks.length} songs</span>
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
              <Play size={15} fill="currentColor" /> Play
            </button>
            <button
              type="button"
              className="button button--glass"
              onClick={() => {
                const ordered = shuffle(collection.tracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> Shuffle
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
  const artists = useMemo(() => buildArtists(tracks), [tracks]);
  const artist = view.kind === "artist" ? artists.find((item) => item.name === view.name) : undefined;

  if (!artist) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={goBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="empty-stage glass empty-stage--compact">
          <h2>No songs by this artist.</h2>
          <p>The library may have changed since this page was opened.</p>
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
        <ArrowLeft size={15} /> Artists
      </button>
      <header className="artist-hero glass">
        <div className="artist-hero__art">
          <Cover path={artist.coverPath} seed={artist.name} label={artist.name} radius="50%" eager />
          <span className="artist-hero__halo" />
        </div>
        <div className="artist-hero__copy">
          <span className="eyebrow">Artist</span>
          <h1>{artist.name}</h1>
          <div className="detail-hero__facts">
            <span>{artist.tracks.length} songs</span>
            <i />
            <span>
              <ListMusic size={13} /> {collections.length} {collections.length === 1 ? "collection" : "collections"}
            </span>
          </div>
          <div className="detail-hero__actions">
            <button type="button" className="button button--dark" onClick={() => void playTrack(artist.tracks[0], queue)}>
              <Play size={15} fill="currentColor" /> Play
            </button>
            <button
              type="button"
              className="button button--glass"
              onClick={() => {
                const ordered = shuffle(artist.tracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> Shuffle
            </button>
            <button
              type="button"
              className="button button--glass"
              onClick={() => navigate({ kind: "albums" })}
            >
              <Disc3 size={15} /> Albums
            </button>
          </div>
        </div>
      </header>
      <TrackTable tracks={artist.tracks} queue={queue} />
    </motion.div>
  );
}
