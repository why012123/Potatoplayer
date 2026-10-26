import { useMemo } from "react";
import { motion } from "motion/react";
import { ListEnd, ListPlus, Play, SearchX, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { TrackTable } from "@/components/TrackTable";
import { ArtistCard, CollectionCard } from "@/components/MediaCards";
import { buildArtists, buildCollections } from "@/lib/collections";
import { useTr } from "@/lib/i18n";

export function SearchPage() {
  const tr = useTr();
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
  const songCountLabel =
    matchingTracks.length === 1
      ? tr("1 song", "1 首歌曲")
      : tr("{count} songs", "{count} 首歌曲", { count: matchingTracks.length });
  const collectionCountLabel =
    matchingCollections.length === 1
      ? tr("1 album or collection", "1 个专辑或合集")
      : tr("{count} albums & collections", "{count} 个专辑与合集", { count: matchingCollections.length });
  const artistCountLabel =
    matchingArtists.length === 1
      ? tr("1 artist", "1 位艺术家")
      : tr("{count} artists", "{count} 位艺术家", { count: matchingArtists.length });

  return (
    <motion.div
      className="page page--search"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26 }}
    >
      <PageHeader
        eyebrow={tr("Search", "搜索")}
        title={tr("Results for “{query}”", "“{query}”的搜索结果", { query })}
        description={
          total
            ? `${songCountLabel} · ${collectionCountLabel} · ${artistCountLabel}`
            : tr("Nothing matched this time.", "这次没有找到匹配项。")
        }
        actions={
          matchingTracks.length ? (
            <>
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
                className="button button--dark"
                onClick={() => {
                  if (matchingTracks[0]) void playTrack(matchingTracks[0], queue);
                }}
              >
                <Play size={15} fill="currentColor" /> {tr("Play all", "播放全部")}
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
          <h2>{tr("No results for “{query}”.", "没有找到“{query}”的结果。", { query })}</h2>
          <p>{tr("Try a shorter phrase, or search by artist, album, genre or title.", "试试更短的关键词，或按艺术家、专辑、流派或标题搜索。")}</p>
        </div>
      ) : (
        <>
          {matchingTracks.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <h2>{tr("Songs", "歌曲")}</h2>
                  <span>{tr("The closest matches first", "最接近的匹配优先")}</span>
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
                  <h2>{tr("Albums & collections", "专辑与合集")}</h2>
                  <span>{tr("Covers that match your search", "与你搜索相符的封面")}</span>
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
                  <h2>{tr("Artists", "艺术家")}</h2>
                  <span>{tr("People behind the music", "音乐背后的人")}</span>
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
            {tr("Search is local and instant. Nothing leaves this Mac.", "搜索完全本地、即时完成，内容不会离开这台 Mac。")}
          </div>
        </>
      )}
    </motion.div>
  );
}
