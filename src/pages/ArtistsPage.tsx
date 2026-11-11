import { useMemo } from "react";
import { FolderOpen, Users } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { ArtistCard } from "@/components/MediaCards";
import { buildArtists } from "@/lib/collections";
import { useTr } from "@/lib/i18n";

export function ArtistsPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const artists = useMemo(() => buildArtists(tracks), [tracks]);
  const artistCountLabel =
    artists.length === 1 ? tr("1 artist", "1 位艺术家") : tr("{count} artists", "{count} 位艺术家", { count: artists.length });

  return (
    <div className="page page--artists">
      <PageHeader
        eyebrow={tr("Voices", "歌者")}
        title={tr("Artists", "艺术家")}
        description={tr("{artists}, gathered from the corners of your collection.", "{artists}，来自你收藏的各个角落。", {
          artists: artistCountLabel,
        })}
        actions={artists.length ? <span className="count-badge">{artistCountLabel}</span> : undefined}
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
          <h2>{tr("No artists yet.", "还没有艺术家。")}</h2>
          <p>
            {tr(
              "Artist names come from your file tags, or from the “Artist - Title” file-name convention.",
              "艺术家名称来自文件标签，或遵循“艺术家 - 标题”的文件命名方式。",
            )}
          </p>
          <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
            <FolderOpen size={16} /> {tr("Choose music folder", "选择音乐文件夹")}
          </button>
        </div>
      )}
    </div>
  );
}
