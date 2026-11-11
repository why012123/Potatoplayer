import { useMemo } from "react";
import { Album, FolderOpen } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { CollectionCard } from "@/components/MediaCards";
import { buildCollections } from "@/lib/collections";
import { useTr } from "@/lib/i18n";

export function AlbumsPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const collections = useMemo(() => buildCollections(tracks), [tracks]);
  const albumCount = collections.filter((collection) => collection.kind === "album").length;
  const artistCollectionCount = collections.length - albumCount;
  const albumCountLabel =
    albumCount === 1 ? tr("1 album", "1 张专辑") : tr("{count} albums", "{count} 张专辑", { count: albumCount });
  const artistCollectionCountLabel =
    artistCollectionCount === 1
      ? tr("1 artist collection", "1 个艺术家合集")
      : tr("{count} artist collections", "{count} 个艺术家合集", { count: artistCollectionCount });
  const collectionCountLabel =
    collections.length === 1
      ? tr("1 collection", "1 个合集")
      : tr("{count} collections", "{count} 个合集", { count: collections.length });

  return (
    <div className="page page--albums">
      <PageHeader
        eyebrow={tr("Collection", "合集")}
        title={tr("Albums", "专辑")}
        description={
          albumCount > 0
            ? tr("{albums}, plus {collections} from loose tracks.", "{albums}，另有 {collections}（来自零散曲目）。", {
                albums: albumCountLabel,
                collections: artistCollectionCountLabel,
              })
            : tr(
                "{collections}. Your files do not carry album tags, so songs are grouped by artist.",
                "{collections}。文件没有专辑标签，因此歌曲按艺术家归组。",
                { collections: artistCollectionCountLabel },
              )
        }
        actions={collections.length > 0 ? <span className="count-badge">{collectionCountLabel}</span> : undefined}
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
          <h2>{tr("No albums yet.", "还没有专辑。")}</h2>
          <p>{tr("Add music and the covers, albums and artist collections will appear here.", "添加音乐后，封面、专辑与艺术家合集会显示在这里。")}</p>
          <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
            <FolderOpen size={16} /> {tr("Choose music folder", "选择音乐文件夹")}
          </button>
        </div>
      )}
    </div>
  );
}
