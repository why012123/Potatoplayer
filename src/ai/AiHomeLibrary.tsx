import { useTr } from "@/lib/i18n";
import { useMemo, type CSSProperties } from "react";
import { ArrowRight, Clock3, Heart, Layers3, Music2, Play, Users } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { TrackCard } from "@/components/MediaCards";
import { buildArtists } from "@/lib/collections";
import { formatLongDuration, formatTime } from "@/lib/format";
import type { Track } from "@/types";
import "./home-library.css";
function categories(tracks: Track[], field: "block" | "genre", tags: {
    name: string;
    color: string;
}[]) {
    const groups = new Map<string, {
        name: string;
        color: string;
        count: number;
        ratings: number[];
    }>();
    const colors = new Map(tags.map(tag => [tag.name, tag.color]));
    for (const track of tracks) {
        const name = track[field]?.trim();
        if (!name)
            continue;
        const group = groups.get(name) ?? { name, color: colors.get(name) || "var(--accent)", count: 0, ratings: [] };
        group.count++;
        if (track.rating > 0)
            group.ratings.push(track.rating);
        groups.set(name, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
/** The original library modules, below the AI homepage's existing main area. */
export function AiHomeLibrary() {
    const tr = useTr();
    const tracks = useAppStore(s => s.tracks);
    const favorites = useAppStore(s => s.favorites);
    const blocks = useAppStore(s => s.blocks);
    const genres = useAppStore(s => s.genres);
    const navigate = useAppStore(s => s.navigate);
    const playTrack = useAppStore(s => s.playTrack);
    const setSortMode = useAppStore(s => s.setSortMode);
    const toggleFavorite = useAppStore(s => s.toggleFavorite);
    const data = useMemo(() => {
        const artists = buildArtists(tracks).map(artist => ({
            ...artist,
            plays: artist.tracks.reduce((sum, track) => sum + track.playCount, 0),
        })).sort((a, b) => b.plays - a.plays || b.tracks.length - a.tracks.length || a.name.localeCompare(b.name));
        return {
            artists,
            duration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
            recent: [...tracks].sort((a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title)).slice(0, 8),
            repeat: tracks.filter(track => track.playCount > 0).sort((a, b) => b.playCount - a.playCount || b.rating - a.rating).slice(0, 6),
            blocks: categories(tracks, "block", blocks),
            genres: categories(tracks, "genre", genres),
        };
    }, [tracks, blocks, genres]);
    const minutes = Math.round(data.duration / 60);
    const hours = Math.floor(minutes / 60);
    if (!tracks.length)
        return null;
    const play = (items: Track[]) => { if (items.length)
        void playTrack(items[0], items.map(track => track.id)); };
    return <div className="ai-home-library">
    <section className="ai-library-overview" aria-label={tr("Library overview", "资料库概览")}>
      <button onClick={() => navigate({ kind: "songs" })}><Music2 size={16}/><span>{tr("Local songs", "本地歌曲")}<strong>{tracks.length.toLocaleString()}</strong></span><ArrowRight size={13}/></button>
      <div><Clock3 size={16}/><span>{tr("Library duration", "资料库时长")}<strong className="ai-library-duration">{hours > 0 && <span>{hours}<small>{tr("hr", "小时")}</small></span>}{(minutes % 60 > 0 || hours === 0) && <span>{minutes % 60}<small>{tr("min", "分钟")}</small></span>}</strong></span></div>
      <button onClick={() => navigate({ kind: "artists" })}><Users size={16}/><span>{tr("Artists", "艺术家")}<strong>{data.artists.length.toLocaleString()}</strong></span><ArrowRight size={13}/></button>
      <button onClick={() => navigate({ kind: "favorites" })}><Heart size={16}/><span>{tr("My favorites", "我的收藏")}<strong>{tracks.filter(track => favorites.includes(track.id)).length.toLocaleString()}</strong></span><ArrowRight size={13}/></button>
    </section>

    <section aria-labelledby="home-taxonomy-title">
      <div className="ai-section-heading"><div><h2 id="home-taxonomy-title">{tr("Your collections", "你的分类体系")}</h2><p>{tr("Organize with blocks. Describe with genres.", "区块负责收纳，流派负责描述。")}</p></div><button onClick={() => navigate({ kind: "collections" })}>{tr("Open collections", "打开合集")}<ArrowRight size={14}/></button></div>
      {data.blocks.length || data.genres.length ? <div className="ai-home-taxonomy">
        <div className="ai-home-blocks"><span className="ai-home-caption">{tr("Blocks · ", "区块 · ")}{data.blocks.length}</span>
          {data.blocks.slice(0, 5).map(tag => <button className="ai-home-block" key={tag.name} style={{ "--block-color": tag.color } as CSSProperties} onClick={() => navigate({ kind: "block", name: tag.name })}>
            <span className="ai-home-block-icon"><Layers3 size={16}/></span><strong>{tag.name}</strong><span>{tag.count}{tr(" songs", "首")}</span>{tag.ratings.length > 0 && <em>★ {(tag.ratings.reduce((sum, rating) => sum + rating, 0) / tag.ratings.length).toFixed(1)}</em>}<ArrowRight size={13}/>
          </button>)}
          {!data.blocks.length && <p className="ai-home-module-note">{tr("No blocks yet. Give your favorite music a home.", "还没有区块，给喜欢的音乐安排一个位置。")}</p>}
        </div>
        <div className="ai-home-genres"><span className="ai-home-caption">{tr("Genres · ", "流派 · ")}{data.genres.length}</span><div>
          {data.genres.slice(0, 12).map(tag => <button key={tag.name} onClick={() => navigate({ kind: "genre", name: tag.name })}><i style={{ background: tag.color }}/>{tag.name}<span>{tag.count}</span></button>)}
          {!data.genres.length && <p className="ai-home-module-note">{tr("Add genres to explore your library here.", "标记流派后，就能从这里探索曲库。")}</p>}
        </div>{data.genres.length > 12 && <button className="ai-home-more" onClick={() => navigate({ kind: "collections" })}>{tr("View all {count} genres", "查看全部 {count} 种流派", { count: data.genres.length })}<ArrowRight size={13}/></button>}</div>
      </div> : <button className="ai-home-module-empty" onClick={() => navigate({ kind: "collections" })}><Layers3 size={24}/><span><strong>{tr("A home for your music", "为音乐整理一个家")}</strong><small>{tr("Add blocks and genres to explore music your way.", "添加区块与流派，从自己的分类开始探索。")}</small></span><ArrowRight size={16}/></button>}
    </section>

    <section aria-labelledby="home-recent-title">
      <div className="ai-section-heading"><div><h2 id="home-recent-title">{tr("Recently added", "最近添加")}</h2><p>{data.recent.length}{tr(" recent additions. Keep new sounds close.", "首新近收录，把新声音留在手边。")}</p></div><button onClick={() => { setSortMode("recent"); navigate({ kind: "songs" }); }}>{tr("View all", "查看全部")}<ArrowRight size={14}/></button></div>
      <div className="ai-home-record-shelf">{data.recent.map((track, index) => <TrackCard key={track.id} track={track} index={index} onPlay={() => void playTrack(track, data.recent.map(item => item.id))}/>)}</div>
    </section>

    <section aria-labelledby="home-repeat-title">
      <div className="ai-section-heading"><div><h2 id="home-repeat-title">{tr("On repeat", "反复聆听")}</h2><p>{tr("Songs you keep coming back to, ordered by play count.", "那些你总想再听一遍的歌，按播放次数排列。")}</p></div>{data.repeat.length > 0 && <button onClick={() => play(data.repeat)}><Play size={14}/>{tr("Play all", "播放全部")}</button>}</div>
      {data.repeat.length ? <div className="ai-home-repeat-list">{data.repeat.map((track, index) => <div className="ai-home-repeat-row" key={track.id}>
        <span className="ai-row-number">{String(index + 1).padStart(2, "0")}</span>
        <button className="ai-recent-song" onClick={() => void playTrack(track, data.repeat.map(item => item.id))} aria-label={tr("Play {v0}", "播放 {v0}", { v0: track.title })}><Cover path={track.coverPath} seed={track.id} label={track.title} radius={8}/><div><strong>{track.title}</strong><small>{track.artist}</small></div></button>
        <span className="ai-home-repeat-plays">{track.playCount}{tr(" plays", "次播放")}</span><span className="ai-home-repeat-rating">{track.rating > 0 ? `★ ${track.rating.toFixed(1)}` : "—"}</span><span className="ai-home-repeat-duration">{formatTime(track.duration)}</span>
        <button className={`ai-home-favorite ${favorites.includes(track.id) ? "is-favorite" : ""}`} aria-label={`${favorites.includes(track.id) ? tr("Unfavorite", "取消收藏") : tr("Favorite", "收藏")} ${track.title}`} aria-pressed={favorites.includes(track.id)} onClick={() => void toggleFavorite(track.id)}><Heart size={15} fill={favorites.includes(track.id) ? "currentColor" : "none"}/></button>
      </div>)}</div> : <div className="ai-home-module-empty"><Music2 size={24}/><span><strong>{tr("From the first listen to the hundredth", "从第一遍，听到很多遍")}</strong><small>{tr("Your most-played songs will appear here.", "播放音乐后，这里会留下你常听的歌曲。")}</small></span><button className="ai-home-more" onClick={() => play(data.recent)}><Play size={14}/>{tr("Start listening", "开始聆听")}</button></div>}
    </section>

    <section aria-labelledby="home-artists-title">
      <div className="ai-section-heading"><div><h2 id="home-artists-title">{tr("Artists you return to", "你常听的艺术家")}</h2><p>{tr("Familiar faces from your library, ordered by play count.", "按播放次数排列，也看看曲库里的熟悉面孔。")}</p></div><button onClick={() => navigate({ kind: "artists" })}>{tr("All artists", "全部艺术家")}<ArrowRight size={14}/></button></div>
      <div className="ai-home-artist-shelf">{data.artists.slice(0, 7).map(artist => <article className="ai-home-artist" key={artist.name}>
        <button className="ai-home-artist-open" onClick={() => navigate({ kind: "artist", name: artist.name })} aria-label={tr("Open artist {v0}", "打开艺术家 {v0}", { v0: artist.name })}><Cover path={artist.coverPath} seed={artist.name} label={artist.name} radius="50%"/><strong title={artist.name}>{artist.name}</strong><small>{artist.tracks.length}{tr(" songs", "首歌曲")}</small></button>
        <button className="ai-home-artist-play" aria-label={tr("Play artist {v0}", "播放艺术家 {v0}", { v0: artist.name })} onClick={() => play(artist.tracks)}><Play size={14} fill="currentColor"/></button>
      </article>)}</div>
    </section>
  </div>;
}
