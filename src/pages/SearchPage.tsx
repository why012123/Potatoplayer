import { useMemo } from "react";
import { motion } from "motion/react";
import { ListEnd, ListPlus, SearchX, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { ArtistCard, CollectionCard } from "@/components/MediaCards";
import { buildArtists, buildCollections } from "@/lib/collections";

export function SearchPage() {
  const query = useAppStore((state) => state.searchQuery).trim();
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueueMany = useAppStore((state) => state.enqueueMany);

  const needle = query.toLowerCase();
  const matchingTracks = useMemo(
    () =>
      tracks
        .filter((track) =>
          `${track.title} ${track.artist} ${track.album} ${track.genre} ${track.block}`.toLowerCase().includes(needle),
        )
        .slice(0, 40),
    [tracks, needle],
  );
  const matchingCollections = useMemo(
    () =>
      buildCollections(tracks)
        .filter((collection) => `${collection.title} ${collection.artist}`.toLowerCase().includes(needle))
        .slice(0, 5),
    [tracks, needle],
  );
  const matchingArtists = useMemo(
    () => buildArtists(tracks).filter((artist) => artist.name.toLowerCase().includes(needle)).slice(0, 5),
    [tracks, needle],
  );
  const total = matchingTracks.length + matchingCollections.length + matchingArtists.length;
  const queue = matchingTracks.map((track) => track.id);

  return (
    <motion.div
      className="page page--search"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26 }}
    >
      <PageHeader
        eyebrow="Search"
        title={`Results for “${query}”`}
        description={total ? `${matchingTracks.length} songs · ${matchingCollections.length} albums & collections · ${matchingArtists.length} artists` : "Nothing matched this time."}
        actions={
          matchingTracks.length ? (
            <>
              <button type="button" className="button button--glass" onClick={() => void enqueueMany(queue, true)}>
                <ListEnd size={15} /> Play next
              </button>
              <button type="button" className="button button--glass" onClick={() => void enqueueMany(queue, false)}>
                <ListPlus size={15} /> Add to queue
              </button>
            </>
          ) : undefined
        }
      />

      {!total ? (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <SearchX size={28} />
          </div>
          <h2>No results for “{query}”.</h2>
          <p>Try a shorter phrase, or search by artist, album, genre or title.</p>
        </div>
      ) : (
        <>
          {matchingTracks.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <h2>Songs</h2>
                  <span>The closest matches first</span>
                </div>
                <span className="count-badge">{matchingTracks.length}</span>
              </div>
              <TrackTable tracks={matchingTracks} queue={queue} />
            </section>
          )}

          {matchingCollections.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <h2>Albums & collections</h2>
                  <span>Covers that match your search</span>
                </div>
              </div>
              <div className="collection-grid collection-grid--compact">
                {matchingCollections.map((collection, index) => (
                  <CollectionCard
                    key={collection.key}
                    collection={collection}
                    index={index}
                    onOpen={() => navigate({ kind: "album", key: collection.key })}
                    onPlay={() => void playTrack(collection.tracks[0], collection.tracks.map((track) => track.id))}
                  />
                ))}
              </div>
            </section>
          )}

          {matchingArtists.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <h2>Artists</h2>
                  <span>People behind the music</span>
                </div>
              </div>
              <div className="artist-grid artist-grid--compact">
                {matchingArtists.map((artist, index) => (
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

          <div className="search-footnote">
            <Sparkles size={14} />
            Search is local and instant. Nothing leaves this Mac.
          </div>
        </>
      )}
    </motion.div>
  );
}
