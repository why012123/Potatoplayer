import { useTr } from "@/lib/i18n";
import { useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { AudioLines, ChevronRight, Heart, ListMusic, Maximize2, Mic2, MoreHorizontal, Music2, Sparkles, Star, X } from "lucide-react";
import { Cover } from "@/components/Cover";
import { useAppStore } from "@/store";
import { formatTime } from "@/lib/format";
import { useFollowScroll } from "@/lib/useFollowScroll";
import type { Track } from "@/types";
/** A listening detail rail. Transport and volume stay in the persistent footer. */
export function AiNowPlaying() {
    const tr = useTr();
    const s = useAppStore();
    const track = s.tracks.find(t => t.id === (s.playback?.trackId ?? s.previewTrackId));
    const isCurrent = Boolean(track && track.id === s.playback?.trackId);
    const playing = isCurrent && s.playback?.playing;
    const time = isCurrent ? s.playback?.time ?? 0 : 0;
    const lyrics = s.lyricsTrackId === track?.id ? s.lyrics : null;
    const lines = lyrics?.found ? lyrics.lines : [];
    const queue = s.playback?.queue ?? [];
    const byId = useMemo(() => new Map(s.tracks.map(t => [t.id, t])), [s.tracks]);
    const queueTracks = queue.map(id => byId.get(id)).filter((t): t is Track => Boolean(t));
    const list = useRef<HTMLDivElement>(null);
    const currentLine = useRef<HTMLButtonElement>(null);
    const currentQueue = useRef<HTMLDivElement>(null);
    const systemReducedMotion = useReducedMotion();
    let activeLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= time + 0.08)
            activeLine = i;
        else
            break;
    }
    useEffect(() => {
        if (track)
            void s.ensureLyrics(track.id);
    }, [track?.id, s.ensureLyrics]);
    const follow = useFollowScroll(list, s.rightTab === "lyrics" ? currentLine : currentQueue, `${track?.id}-${s.rightTab}`, `${activeLine}-${lines.length}-${queue.length}`, s.appearance.animationLevel === "full" && !s.reducedMotion && !systemReducedMotion);
    const favorite = track && s.favorites.includes(track.id);
    const lyricLoading = Boolean(track && (s.lyricsTrackId !== track.id || s.lyricsLoading));
    return <aside className="ai-now-playing" aria-label={tr("Playback details", "播放详情")}>
    <header className="ai-np-header">
      <span className={`ai-np-status ${playing ? "is-playing" : ""}`}><i />{playing ? tr("Now listening", "正在聆听") : track ? tr("Your music", "此刻的音乐") : tr("Playback details", "播放详情")}</span>
      <div>
        {track && <button aria-label={tr("More song actions", "歌曲更多操作")} title={tr("More actions", "更多操作")} onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                s.setTrackMenu({ trackId: track.id, x: rect.right, y: rect.bottom });
            }}><MoreHorizontal size={17}/></button>}
        <button aria-label={tr("Hide playback details", "隐藏播放详情")} title={tr("Collapse", "收起")} onClick={() => s.setRightPanelMode("hidden")}><ChevronRight size={17}/></button>
      </div>
    </header>
    {track ? <>
      <div className="ai-np-record">
        <button className="ai-np-art" onClick={() => s.setImmersive(true)} aria-label={tr("Open immersive player", "打开沉浸式播放")} title={tr("Open immersive player", "打开沉浸式播放")}>
          <Cover path={track.coverPath} seed={track.id} label={track.title} radius={18} eager/>
          <span className="ai-np-expand"><Maximize2 size={14}/></span>
        </button>
        <div className="ai-np-title-row">
          <h2 title={track.title}>{track.title}</h2>
          <button className={`ai-np-heart ${favorite ? "is-active" : ""}`} aria-label={favorite ? tr("Unfavorite", "取消收藏") : tr("Favorite song", "收藏歌曲")} aria-pressed={Boolean(favorite)} onClick={() => void s.toggleFavorite(track.id)}><Heart size={19} fill={favorite ? "currentColor" : "none"}/></button>
        </div>
        <button className="ai-np-artist" onClick={() => s.navigate({ kind: "artist", name: track.artist })}>{track.artist || tr("Unknown artist", "未知艺术家")}</button>
        <div className="ai-np-details"><span title={track.album}>{[track.album, track.year > 0 ? track.year : null].filter(Boolean).join(" · ") || tr("Local music", "本地音乐")}</span>{track.rating > 0 && <span className="ai-np-rating"><Star size={10} fill="currentColor"/>{track.rating.toFixed(1)}</span>}</div>
      </div>
      <div className="ai-np-tabs" role="tablist" aria-label={tr("Playback detail tabs", "播放详情内容")}>
        <button id="ai-np-tab-lyrics" role="tab" aria-selected={s.rightTab === "lyrics"} aria-controls="ai-np-content" onClick={() => s.setRightTab("lyrics")}><Mic2 size={13}/>{tr("Lyrics", "歌词")}</button>
        <button id="ai-np-tab-queue" role="tab" aria-selected={s.rightTab === "queue"} aria-controls="ai-np-content" onClick={() => s.setRightTab("queue")}><ListMusic size={14}/>{tr("Play queue", "播放队列")}<small>{queueTracks.length}</small></button>
      </div>
      <div key={`${track.id}-${s.rightTab}`} id="ai-np-content" className="ai-np-content" role="tabpanel" tabIndex={0} aria-labelledby={`ai-np-tab-${s.rightTab}`} ref={list} {...follow.handlers}>
        {s.rightTab === "lyrics" ? lyricLoading ? <div className="ai-np-empty"><Mic2 size={22}/><p>{tr("Loading lyrics…", "正在读取歌词…")}</p></div> : lines.length ? <div className="ai-np-lyrics">
          {lines.map((line, index) => <button key={`${index}-${line.time}`} ref={index === activeLine ? currentLine : undefined} className={index === activeLine ? "is-current" : ""} aria-current={index === activeLine ? "true" : undefined} onClick={() => {
                        follow.resume();
                        if (isCurrent)
                            void s.seek(line.time);
                        else
                            void s.playTrack(track, queue.length ? queue : [track.id], line.time);
                    }}><span>{line.text || "♪"}</span>{line.translation && <small>{line.translation}</small>}</button>)}
        </div> : <div className="ai-np-empty"><AudioLines size={25} strokeWidth={1.3}/><p>{tr("No lyrics available for this song", "这首歌暂时没有歌词")}</p>{track.note ? <blockquote>{track.note}</blockquote> : <small>{tr("Just listening is enough.", "静静听，也很好。")}</small>}</div>
                : queueTracks.length ? <div className="ai-np-queue">
          {queueTracks.map((item, index) => <div key={`${item.id}-${index}`} ref={item.id === s.playback?.trackId ? currentQueue : undefined} className={`ai-np-queue-row ${item.id === s.playback?.trackId ? "is-current" : ""}`}>
            <button className="ai-np-queue-song" aria-label={tr("Play {v0}", "播放 {v0}", { v0: item.title })} onClick={() => void s.playTrack(item, queue)}>
              <Cover path={item.coverPath} seed={item.id} label="" radius={8}/>
              <span><strong>{item.title}</strong><small>{item.artist}</small></span>
              <em>{item.id === s.playback?.trackId ? <AudioLines size={13}/> : formatTime(item.duration)}</em>
            </button>
            <button className="ai-np-remove" title={tr("Remove from queue", "移出队列")} aria-label={tr("Remove {v0} from queue", "从队列移除 {v0}", { v0: item.title })} onClick={() => void s.removeFromQueue(item.id)}><X size={12}/></button>
          </div>)}
        </div> : <div className="ai-np-empty"><ListMusic size={24} strokeWidth={1.3}/><p>{tr("Your queue is empty", "队列还是空的")}</p><small>{tr("Pick a few favorites and keep listening.", "挑几首喜欢的，接着听。")}</small></div>}
      </div>
      <footer className="ai-np-footer">{follow.browsing && s.rightTab === "lyrics" && lines.length > 0 ? <button className="ai-np-resume" onClick={follow.resume}><Mic2 size={12}/>{tr("Follow current lyric", "回到当前歌词")}</button> : <span>{playing ? tr("The music continues", "音乐正在继续") : isCurrent ? tr("Paused", "已暂停") : tr("Ready to play", "准备播放")}</span>}<button onClick={() => { s.setRightPanelMode("ai"); window.setTimeout(() => window.dispatchEvent(new Event("potato:focus-assistant")), 0); }}><Sparkles size={13}/>{tr("Ask AI", "问问 AI")}</button></footer>
    </> : <div className="ai-np-empty ai-np-start"><Music2 size={36} strokeWidth={1}/><h2>{tr("Make room for music", "留一个位置给音乐")}</h2><p>{tr("Choose a song to see its artwork and lyrics here.", "选一首歌，封面与歌词会出现在这里。")}</p><button onClick={() => s.navigate({ kind: "songs" })}>{tr("Browse library", "浏览曲库")}<ChevronRight size={14}/></button></div>}
  </aside>;
}
