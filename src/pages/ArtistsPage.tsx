import { useMemo } from "react";
import { FolderOpen, Users } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { ArtistCard } from "@/components/MediaCards";
import { buildArtists } from "@/lib/collections";

export function ArtistsPage() {
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const artists = useMemo(() => buildArtists(tracks), [tracks]);

  return (
    <div className="page page--artists">
      <PageHeader
        title="Artists"
        description={`${artists.length} artists in your library, ordered by how much of them you keep.`}
        actions={artists.length ? <span className="count-badge">{artists.length} artists</span> : undefined}
      />
      {artists.length ? (
        <div className="artist-grid">
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
      ) : (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <Users size={28} />
          </div>
          <h2>No artists yet.</h2>
          <p>Artist names come from your file tags, or from the “Artist - Title” file-name convention.</p>
          <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
            <FolderOpen size={16} /> Choose music folder
          </button>
        </div>
      )}
    </div>
  );
}
