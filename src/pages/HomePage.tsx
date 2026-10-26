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
import { useTr } from "@/lib/i18n";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function HomePage() {
  const tr = useTr();
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
          title={scanning ? tr("Making room for your music.", "正在为你的音乐腾出空间。") : tr("A quiet room, for now.", "此刻，房间很安静。")}
          description={
            scanning
              ? tr(
                  "Reading your folder, artwork and ratings. This only takes a moment.",
                  "正在读取文件夹、封面与评分，很快就好。",
                )
              : tr(
                  "Point Potatoplayer Super at a music folder. Your files stay exactly where they are.",
                  "让 Potatoplayer Super 指向一个音乐文件夹。文件仍留在原处，不会移动。",
                )
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
              <h2>{tr("Scanning your library…", "正在扫描资料库…")}</h2>
              <p>
                {scanProgress?.total
                  ? scanProgress.total === 1
                    ? tr("{done} of 1 song", "正在扫描 {done} / 1 首歌曲", { done: scanProgress.done })
                    : tr("{done} of {total} songs", "正在扫描 {done} / {total} 首歌曲", {
                        done: scanProgress.done,
                        total: scanProgress.total,
                      })
                  : tr("Looking for audio files", "正在查找音频文件")}
              </p>
              <div className="big-progress">
                <span style={{ width: `${scanPct}%` }} />
              </div>
            </>
          ) : (
            <>
              <h2>{tr("Good music starts with a folder.", "好音乐，从一个文件夹开始。")}</h2>
              <p>
                {tr(
                  "MP3, FLAC, M4A, OGG, WAV and AIFF. Existing Potato Player ratings and covers are picked up automatically.",
                  "MP3、FLAC、M4A、OGG、WAV 与 AIFF。Potato Player 中已有的评分和封面会自动读取。",
                )}
              </p>
              <div className="empty-stage__actions">
                <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
                  <FolderOpen size={16} />
                  {tr("Choose music folder", "选择音乐文件夹")}
                </button>
                <button type="button" className="button button--glass" onClick={() => void rescan()}>
                  <RefreshCw size={16} />
                  {tr("Retry scan", "重新扫描")}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="empty-tips">
          <div>
            <Heart size={16} />
            {tr("Favorites and playlists are remembered.", "收藏与歌单会被记住。")}
          </div>
          <div>
            <Mic2 size={16} />
            {tr("Sidecar LRC lyrics, including translations.", "支持同目录 LRC 歌词，包含翻译。")}
          </div>
          <div>
            <Sparkles size={16} />
            {tr("Covers and scores imported from your old library.", "从旧资料库导入封面与评分。")}
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
        description={tr(
          playback?.playing ? "The room is filled with sound." : "Your collection is here, ready when you are.",
          playback?.playing ? "音乐正充盈着房间。" : "你的收藏已就位，随时可以开始。",
        )}
        actions={
          <>
            <button type="button" className="button button--glass" onClick={() => void chooseLibrary()}>
              <FolderOpen size={15} />
              {tr("Import", "导入")}
            </button>
            <button type="button" className="button button--dark" onClick={shuffleAll}>
              <Shuffle size={15} />
              {tr("Shuffle all", "全部随机播放")}
            </button>
          </>
        }
      />

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
                    {tr("Now playing", "正在播放")}
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    {tr("Continue listening", "继续聆听")}
                  </>
                )
              ) : (
                <>
                  <Sparkles size={12} />
                  {featured.rating > 0 ? tr("From your library", "来自你的资料库") : tr("A good place to start", "从这里开始正好")}
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
              {featured.album || `${featured.artist} · ${tr("Collection", "合集")}`}
              {featured.year > 0 ? ` · ${featured.year}` : ""}
              {featured.playCount > 0
                ? ` · ${
                    featured.playCount === 1
                      ? tr("1 play", "1 次播放")
                      : tr("{count} plays", "{count} 次播放", { count: featured.playCount })
                  }`
                : ""}
            </p>
            <div className="hero__actions">
              <button type="button" className="button button--dark" onClick={onFeaturedPlay}>
                {isFeaturedPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                {isFeaturedPlaying
                  ? tr("Pause", "暂停")
                  : playback?.trackId === featured.id
                    ? tr("Resume", "继续播放")
                    : tr("Play", "播放")}
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
                {tr("Lyrics", "歌词")}
              </button>
              <button
                type="button"
                className={`hero__heart ${featuredFavorite ? "is-favorite" : ""}`}
                aria-label={featuredFavorite ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "添加到收藏")}
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

      <div className="stat-strip glass">
        <div>
          <span>{tr("Songs", "歌曲")}</span>
          <strong>{tracks.length}</strong>
        </div>
        <i />
        <div>
          <span>{tr("Listening time", "聆听时长")}</span>
          <strong>{formatLongDuration(totalDuration)}</strong>
        </div>
        <i />
        <div>
          <span>{tr("Artists", "艺术家")}</span>
          <strong>{new Set(tracks.map((track) => track.artist)).size}</strong>
        </div>
        <i />
        <div>
          <span>{tr("Favorites", "收藏")}</span>
          <strong>{favorites.length}</strong>
        </div>
        <div className="stat-strip__spark">
          <Sparkles size={15} />
          {tr("Local only", "仅限本地")}
        </div>
      </div>

      {(blockCounts.length > 0 || genreCounts.length > 0) && (
        <section>
          <SectionHeader
            title={tr("Your system", "你的分类体系")}
            meta={tr("Blocks shelve it. Genres describe it.", "区块负责收纳，流派负责描述。")}
            action={
              <button type="button" className="text-button" onClick={() => navigate({ kind: "collections" })}>
                {tr("Open collections", "打开合集")} <ArrowUpRight size={13} />
              </button>
            }
          />
          <div className="taxonomy-overview glass">
            <div className="taxonomy-overview__blocks">
              <span className="taxonomy-overview__label">{tr("Blocks", "区块")}</span>
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
              <span className="taxonomy-overview__label">{tr("Genres", "流派")}</span>
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
          title={tr("Recently added", "最近添加")}
          meta={
            recent.length === 1
              ? tr("1 fresh record", "1 首新近收录")
              : tr("{count} fresh records", "{count} 首新近收录", { count: recent.length })
          }
          action={
            <button type="button" className="text-button" onClick={() => navigate({ kind: "albums" })}>
              {tr("Browse albums", "浏览专辑")} <ArrowUpRight size={13} />
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
            title={tr("On repeat", "反复聆听")}
            meta={tr("The ones you keep coming back to", "那些你总想再听一遍的歌")}
            action={
              <button type="button" className="text-button" onClick={playAll}>
                <Play size={13} />
                {tr("Play all", "播放全部")}
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
            title={tr("Artists in your orbit", "你常听的艺术家")}
            meta={tr("Based on what is in your library", "根据你资料库中的内容")}
            action={
              <button type="button" className="text-button" onClick={() => navigate({ kind: "artists" })}>
                {tr("All artists", "全部艺术家")} <ArrowUpRight size={13} />
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
          {tr("Indexing more music · {pct}%", "正在索引更多音乐 · {pct}%", { pct: scanPct })}
        </div>
      )}
    </div>
  );
}
