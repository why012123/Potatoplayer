import { useMemo } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  FolderOpen,
  Heart,
  LoaderCircle,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  Shuffle,
  Sparkles,
} from "lucide-react";
import type { Track } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader, SectionHeader } from "@/components/Headers";
import { Cover } from "@/components/Cover";
import { TrackCard, ArtistCard } from "@/components/MediaCards";
import { TrackTable } from "@/components/TrackTable";
import { EqualizerBars } from "@/components/EqualizerBars";
import { buildArtists } from "@/lib/collections";
import { formatLongDuration, greeting, todayLine } from "@/lib/format";
import { coverUrl } from "@/lib/covers";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function HomePage() {
  const tracks = useAppStore((state) => state.tracks);
  const playback = useAppStore((state) => state.playback);
  const favorites = useAppStore((state) => state.favorites);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const navigate = useAppStore((state) => state.navigate);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);
  const setRightTab = useAppStore((state) => state.setRightTab);
  const rescan = useAppStore((state) => state.rescan);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);

  const trackBy = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const currentTrack = (playback?.trackId && trackBy.get(playback.trackId)) || (previewTrackId && trackBy.get(previewTrackId)) || null;
  const featured =
    currentTrack ??
    [...tracks].sort((a, b) => b.rating - a.rating || b.playCount - a.playCount)[0] ??
    null;

  const recent = useMemo(
    () => [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8),
    [tracks],
  );
  const onRepeat = useMemo(
    () =>
      [...tracks]
        .sort((a, b) => b.playCount - a.playCount || b.rating - a.rating)
        .filter((track) => track.playCount > 0 || track.rating > 0)
        .slice(0, 6),
    [tracks],
  );
  const artists = useMemo(() => buildArtists(tracks).slice(0, 7), [tracks]);
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  const blockCounts = blocks
    .map((tag) => {
      const items = tracks.filter((track) => track.block === tag.name);
      const rated = items.filter((track) => track.rating > 0);
      return {
        ...tag,
        count: items.length,
        avg: rated.length ? rated.reduce((sum, track) => sum + track.rating, 0) / rated.length : 0,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const genreCounts = genres
    .map((tag) => ({ ...tag, count: tracks.filter((track) => track.genre === tag.name).length }))
    .sort((a, b) => b.count - a.count);
  const isFeaturedPlaying = Boolean(featured && playback?.trackId === featured.id && playback.playing);
  const featuredFavorite = featured ? favorites.includes(featured.id) : false;
  const allQueue = tracks.map((track) => track.id);
  const scanPct = scanProgress?.total ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0;

  const playAll = () => {
    if (!onRepeat.length) return;
    void playTrack(onRepeat[0], onRepeat.map((track) => track.id));
  };

  const shuffleAll = () => {
    if (!tracks.length) return;
    const queue = shuffled(tracks);
    void playTrack(queue[0], queue.map((track) => track.id));
  };

  const onFeaturedPlay = () => {
    if (!featured) return;
    if (playback?.trackId === featured.id) void togglePlay();
    else void playTrack(featured, allQueue);
  };

  if (!tracks.length) {
    return (
      <div className="page page--empty">
        <PageHeader
          eyebrow={todayLine()}
          title={scanning ? "Making room for your music." : "A quiet room, for now."}
          description={
            scanning
              ? "Reading your folder, artwork and ratings. This only takes a moment."
              : "Point Potatoplayer Super at a music folder. Your files stay exactly where they are."
          }
        />
        <div className="empty-stage glass">
          <div className="empty-stage__rings" aria-hidden="true">
            <span />
            <span />
            <span />
            <div className="empty-stage__icon">
              {scanning ? <LoaderCircle size={30} className="is-spinning" /> : <FolderOpen size={30} />}
            </div>
          </div>
          {scanning ? (
            <>
              <h2>Scanning your library…</h2>
              <p>{scanProgress?.total ? `${scanProgress.done} of ${scanProgress.total} songs` : "Looking for audio files"}</p>
              <div className="big-progress">
                <span style={{ width: `${scanPct}%` }} />
              </div>
            </>
          ) : (
            <>
              <h2>Good music starts with a folder.</h2>
              <p>MP3, FLAC, M4A, OGG, WAV and AIFF. Existing Potato Player ratings and covers are picked up automatically.</p>
              <div className="empty-stage__actions">
                <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
                  <FolderOpen size={16} />
                  Choose music folder
                </button>
                <button type="button" className="button button--glass" onClick={() => void rescan()}>
                  <RefreshCw size={16} />
                  Retry scan
                </button>
              </div>
            </>
          )}
        </div>
        <div className="empty-tips">
          <div>
            <Heart size={16} />
            Favorites and playlists are remembered.
          </div>
          <div>
            <Mic2 size={16} />
            Sidecar LRC lyrics, including translations.
          </div>
          <div>
            <Sparkles size={16} />
            Covers and scores imported from your old library.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--home">
      <PageHeader
        eyebrow={todayLine()}
        title={greeting()}
        description={`${
          playback?.playing ? "The room is filled with sound." : "Your collection is here, ready when you are."
        }`}
        actions={
          <>
            <button type="button" className="button button--glass" onClick={() => void chooseLibrary()}>
              <FolderOpen size={15} />
              Import
            </button>
            <button type="button" className="button button--dark" onClick={shuffleAll}>
              <Shuffle size={15} />
              Shuffle all
            </button>
          </>
        }
      />

      <div className="stat-strip glass">
        <div>
          <span>Songs</span>
          <strong>{tracks.length}</strong>
        </div>
        <i />
        <div>
          <span>Listening time</span>
          <strong>{formatLongDuration(totalDuration)}</strong>
        </div>
        <i />
        <div>
          <span>Artists</span>
          <strong>{new Set(tracks.map((track) => track.artist)).size}</strong>
        </div>
        <i />
        <div>
          <span>Favorites</span>
          <strong>{favorites.length}</strong>
        </div>
        <div className="stat-strip__spark">
          <Sparkles size={15} />
          Local only
        </div>
      </div>

      {featured && (
        <motion.section
          className="hero"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {featured.coverPath && (
            <div
              className="hero__backdrop"
              style={{ backgroundImage: `url("${coverUrl(featured.coverPath)}")` }}
              aria-hidden="true"
            />
          )}
          <div className="hero__shade" aria-hidden="true" />
          <div className="hero__rings" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="hero__copy">
            <div className="hero__eyebrow">
              {playback?.trackId === featured.id ? (
                playback.playing ? (
                  <>
                    <EqualizerBars playing />
                    Now playing
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    Continue listening
                  </>
                )
              ) : (
                <>
                  <Sparkles size={12} />
                  {featured.rating > 0 ? "From your library" : "A good place to start"}
                </>
              )}
            </div>
            <h1>{featured.title}</h1>
            <button
              type="button"
              className="hero__artist"
              onClick={() => navigate({ kind: "artist", name: featured.artist })}
            >
              {featured.artist}
              <ArrowUpRight size={13} />
            </button>
            <p>
              {featured.album || `${featured.artist} · Collection`}
              {featured.year > 0 ? ` · ${featured.year}` : ""}
              {featured.playCount > 0 ? ` · ${featured.playCount} ${featured.playCount === 1 ? "play" : "plays"}` : ""}
            </p>
            <div className="hero__actions">
              <button type="button" className="button button--dark" onClick={onFeaturedPlay}>
                {isFeaturedPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                {isFeaturedPlaying ? "Pause" : playback?.trackId === featured.id ? "Resume" : "Play"}
              </button>
              <button
                type="button"
                className="button button--glass"
                onClick={() => {
                  setRightPanelOpen(true);
                  setRightTab("lyrics");
                }}
              >
                <Mic2 size={15} />
                Lyrics
              </button>
              <button
                type="button"
                className={`hero__heart ${featuredFavorite ? "is-favorite" : ""}`}
                aria-label={featuredFavorite ? "Remove from favorites" : "Add to favorites"}
                onClick={() => void toggleFavorite(featured.id)}
              >
                <Heart size={18} fill={featuredFavorite ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          <div className="hero__art-column" aria-hidden="true">
            <span className="hero__disc" />
            <motion.div
              className="hero__cover"
              whileHover={{ rotate: 0, scale: 1.02 }}
              initial={false}
              animate={{ rotate: -2.2 }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
            >
              <Cover path={featured.coverPath} seed={featured.id} label={featured.title} radius={24} eager />
            </motion.div>
            {featured.rating > 0 && <span className="hero__rating">★ {featured.rating.toFixed(1)}</span>}
          </div>
        </motion.section>
      )}

      {(blockCounts.length > 0 || genreCounts.length > 0) && (
        <section>
          <SectionHeader
            title="Your system"
            meta="Blocks shelve it. Genres describe it."
            action={
              <button type="button" className="text-button" onClick={() => navigate({ kind: "collections" })}>
                Open collections <ArrowUpRight size={13} />
              </button>
            }
          />
          <div className="taxonomy-overview glass">
            <div className="taxonomy-overview__blocks">
              <span className="taxonomy-overview__label">Blocks</span>
              {blockCounts.map((tag) => (
                <button
                  type="button"
                  key={tag.name}
                  className="home-block"
                  style={{ "--tag-color": tag.color } as React.CSSProperties}
                  onClick={() => navigate({ kind: "block", name: tag.name })}
                >
                  <i />
                  <span>{tag.name}</span>
                  <em>{tag.count}</em>
                  {tag.avg > 0 && <strong>★ {tag.avg.toFixed(1)}</strong>}
                </button>
              ))}
            </div>
            <div className="taxonomy-overview__genres">
              <span className="taxonomy-overview__label">Genres</span>
              <div>
                {genreCounts.map((tag) => (
                  <button
                    type="button"
                    key={tag.name}
                    className="tag-chip"
                    onClick={() => navigate({ kind: "genre", name: tag.name })}
                  >
                    <i style={{ background: tag.color }} />
                    {tag.name}
                    <em>{tag.count}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title="Recently added"
          meta={`${recent.length} fresh ${recent.length === 1 ? "record" : "records"}`}
          action={
            <button type="button" className="text-button" onClick={() => navigate({ kind: "albums" })}>
              Browse albums <ArrowUpRight size={13} />
            </button>
          }
        />
        <div className="card-row">
          {recent.map((track: Track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              index={index}
              onPlay={() => void playTrack(track, recent.map((item) => item.id))}
            />
          ))}
        </div>
      </section>

      {onRepeat.length > 0 && (
        <section>
          <SectionHeader
            title="On repeat"
            meta="The ones you keep coming back to"
            action={
              <button type="button" className="text-button" onClick={playAll}>
                <Play size={13} />
                Play all
              </button>
            }
          />
          <TrackTable
            tracks={onRepeat}
            queue={onRepeat.map((track) => track.id)}
            showPlays
            showRating
            compact
          />
        </section>
      )}

      {artists.length > 0 && (
        <section>
          <SectionHeader
            title="Artists in your orbit"
            meta="Based on what is in your library"
            action={
              <button type="button" className="text-button" onClick={() => navigate({ kind: "artists" })}>
                All artists <ArrowUpRight size={13} />
              </button>
            }
          />
          <div className="artist-row">
            {artists.map((artist, index) => (
              <ArtistCard
                key={artist.name}
                artist={artist}
                index={index}
                onOpen={() => navigate({ kind: "artist", name: artist.name })}
                onPlay={() => void playTrack(artist.tracks[0], artist.tracks.map((track) => track.id))}
              />
            ))}
          </div>
        </section>
      )}

      {scanning && (
        <div className="scan-toast">
          <LoaderCircle size={14} className="is-spinning" />
          Indexing more music · {scanPct}%
        </div>
      )}
    </div>
  );
}
