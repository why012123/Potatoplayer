import { useMemo } from "react";
import { Album, FolderOpen } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { CollectionCard } from "@/components/MediaCards";
import { buildCollections } from "@/lib/collections";

export function AlbumsPage() {
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const collections = useMemo(() => buildCollections(tracks), [tracks]);
  const albumCount = collections.filter((collection) => collection.kind === "album").length;

  return (
    <div className="page page--albums">
      <PageHeader
        title="Albums"
        description={
          albumCount > 0
            ? `${albumCount} albums, plus ${collections.length - albumCount} artist collections from loose tracks.`
            : `${collections.length} artist collections. Your files do not carry album tags, so songs are grouped by artist.`
        }
        actions={collections.length > 0 ? <span className="count-badge">{collections.length} collections</span> : undefined}
      />

      {collections.length ? (
        <div className="collection-grid">
          {collections.map((collection, index) => (
            <CollectionCard
              key={collection.key}
              collection={collection}
              index={index}
              onOpen={() => navigate({ kind: "album", key: collection.key })}
              onPlay={() => void playTrack(collection.tracks[0], collection.tracks.map((track) => track.id))}
            />
          ))}
        </div>
      ) : (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <Album size={28} />
          </div>
          <h2>No albums yet.</h2>
          <p>Add music and the covers, albums and artist collections will appear here.</p>
          <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
            <FolderOpen size={16} /> Choose music folder
          </button>
        </div>
      )}
    </div>
  );
}
