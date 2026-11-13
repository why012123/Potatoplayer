import { useEffect, useRef, useState } from "react";
import { Album, ArrowLeft, ArrowRight, AudioLines, BarChart3, BrainCircuit, ChevronDown, CloudDownload, Compass, Disc3, FolderOpen, Heart, Home, Layers3, ListMusic, Maximize2, MessageCircle, Moon, Music2, Orbit, Pause, Play, Plus, Repeat, Repeat1, Search, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, SquarePen, Sun, Users, Volume2, VolumeX, X, RefreshCw, PanelRightClose } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { Cover } from "@/components/Cover";
import { Slider } from "@/components/Slider";
import { formatTime } from "@/lib/format";
import type { View } from "@/types";

const mainNav = [
  { kind: "home", label: "为你精选", icon: Home },
  { kind: "ai", label: "AI 工作台", icon: BrainCircuit },
  { kind: "discover", label: "在线发现", icon: Compass },
  { kind: "daily", label: "每日推荐", icon: AudioLines },
] as const;
const libraryNav = [
  { kind: "songs", label: "所有歌曲", icon: Music2 },
  { kind: "albums", label: "专辑", icon: Album },
  { kind: "artists", label: "艺术家", icon: Users },
  { kind: "favorites", label: "我喜欢的", icon: Heart },
  { kind: "collections", label: "区块与流派", icon: Layers3 },
] as const;
const toolsNav = [
  { kind: "stats", label: "聆听统计", icon: BarChart3 },
  { kind: "editor", label: "歌曲编辑", icon: SquarePen },
  { kind: "sync", label: "歌单同步", icon: RefreshCw },
  { kind: "comments", label: "音乐评论", icon: MessageCircle },
  { kind: "ultra", label: "Ultra", icon: Orbit },
] as const;
export function AiSidebar() {
  const s = useAppStore();
  const [more, setMore] = useState(false);
  const view = s.viewHistory[s.viewIndex];
  const active = view.kind === "album" ? "albums" : view.kind === "artist" ? "artists" : ["block", "genre"].includes(view.kind) ? "collections" : view.kind;
  useEffect(() => {
    if (toolsNav.some((item) => item.kind === view.kind)) setMore(true);
  }, [view.kind]);
  const nav = (items: readonly { kind: string; label: string; icon: typeof Home }[]) => items.map(({ kind, label, icon: Icon }) => (
    <button key={kind} className={`ai-nav-item ${active === kind && !s.searchQuery ? "is-active" : ""}`} aria-current={active === kind ? "page" : undefined} onClick={() => s.navigate({ kind } as View)} title={label}>
      <Icon size={18} /><span>{label}</span>{kind === "songs" && <small>{s.tracks.length}</small>}
    </button>
  ));
  return <aside className="ai-sidebar">
    <div className="ai-sidebar-drag window-drag" />
    <button className="ai-brand" onClick={() => s.navigate({ kind: "home" })} aria-label="Potato Music AI 首页"><span className="ai-logo"><AudioLines size={23} /></span><strong>potato<span>music <em>AI</em></span></strong></button>
    <div className="ai-sidebar-scroll">
      <div className="ai-nav-label">听见新的可能</div><nav aria-label="探索音乐">{nav(mainNav)}</nav>
      <div className="ai-nav-label">我的音乐</div><nav aria-label="我的音乐">{nav(libraryNav)}</nav>
      <div className="ai-nav-label ai-nav-label-row">我的歌单<button title="新建歌单" aria-label="新建歌单" onClick={() => s.openPrompt({ title: "新建歌单", placeholder: "给这段旋律起个名字", confirmLabel: "创建歌单", onSubmit: async (name) => { const p = await s.createPlaylist(name); if (p) s.navigate({ kind: "playlist", id: p.id }); } })}><Plus size={15}/></button></div>
      {s.playlists.length === 0 && <p className="ai-side-hint">把喜欢的旋律，收在一起。</p>}
      {s.playlists.map((p) => <button key={p.id} title={p.name} className={`ai-nav-item ${view.kind === "playlist" && view.id === p.id ? "is-active" : ""}`} onClick={() => s.navigate({ kind: "playlist", id: p.id })}><ListMusic size={17}/><span>{p.name}</span><small>{p.trackIds.length}</small></button>)}
      <button className="ai-nav-item ai-more" aria-expanded={more} onClick={() => setMore(!more)}><SlidersHorizontal size={17}/><span>音乐工具</span><ChevronDown size={14}/></button>
      {more && nav(toolsNav)}
    </div>
    <div className="ai-sidebar-bottom"><button className="ai-library-status" onClick={() => void s.chooseLibrary()}><span className="ai-status-dot"/><span>{s.scanning ? "正在整理曲库…" : "本地音乐库"}<small>{s.tracks.length} 首歌曲 · 选择文件夹</small></span><FolderOpen size={16}/></button><button className="ai-nav-item" onClick={() => s.navigate({ kind: "settings" })}><Settings2 size={17}/><span>设置</span><small>v0.3.0</small></button></div>
  </aside>;
}

export function AiTopBar() {
  const s = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener("potato:focus-search", focus);
    return () => window.removeEventListener("potato:focus-search", focus);
  }, []);
  return <header className="ai-topbar window-drag"><div className="ai-history no-drag"><button aria-label="后退" disabled={s.viewIndex === 0} onClick={s.goBack}><ArrowLeft size={18}/></button><button aria-label="前进" disabled={s.viewIndex >= s.viewHistory.length - 1} onClick={s.goForward}><ArrowRight size={18}/></button></div>
    <label className="ai-search no-drag"><Search size={16}/><input ref={input} aria-label="搜索资料库" placeholder="搜索歌曲、歌手、专辑…" value={s.searchQuery} onChange={(e) => s.setSearchQuery(e.target.value)}/>{s.searchQuery ? <button aria-label="清除搜索" onClick={() => s.setSearchQuery("")}><X size={14}/></button> : <kbd>⌘ F</kbd>}</label>
    <div className="ai-top-actions no-drag"><button title="下载任务" aria-label="下载任务" onClick={() => s.setDownloadPanelOpen(true)}><CloudDownload size={18}/></button><button title="切换主题" aria-label="切换主题" onClick={() => s.setTheme(s.theme === "dark" ? "light" : "dark")}>{s.theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><div className="ai-panel-switch" role="group" aria-label="右侧栏显示方式">{([
      {mode: "hidden", label: "隐藏", icon: PanelRightClose},
      {mode: "ai", label: "AI", icon: Sparkles},
      {mode: "player", label: "播放页面", icon: AudioLines},
    ] as const).map(({mode, label, icon: Icon}) => <button key={mode} title={label} aria-label={`${label}侧栏`} aria-pressed={s.rightPanelMode === mode} className={s.rightPanelMode === mode ? "is-active" : ""} onClick={() => s.setRightPanelMode(mode)}><Icon size={15}/><span>{label}</span></button>)}</div></div>
  </header>;
}

export function AiPlayer() {
  const s = useAppStore();
  const ask = useAssistant((state) => state.ask);
  const [queue, setQueue] = useState(false);
  const playback = s.playback;
  const track = s.tracks.find((t) => t.id === (playback?.trackId ?? s.previewTrackId));
  const queueIds = playback?.queue ?? [];
  useEffect(() => { if (!queue) return; const close = (e: KeyboardEvent) => { if (e.key === "Escape") setQueue(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [queue]);
  return <>
    {queue && <section className="ai-queue" aria-label="播放队列"><header><div><strong>接下来播放</strong><small>{queueIds.length} 首歌曲</small></div><button aria-label="关闭队列" onClick={() => setQueue(false)}><X size={18}/></button></header><div className="ai-queue-list">{queueIds.length === 0 && <p className="ai-empty-copy">队列还是空的，选一首歌开始吧。</p>}{queueIds.map((id, index) => { const t = s.tracks.find((item) => item.id === id); return t && <div className="ai-queue-row" key={`${id}-${index}`}><button onClick={() => void s.playTrack(t, queueIds)}><span>{playback?.trackId === id ? <AudioLines size={14}/> : String(index + 1).padStart(2, "0")}</span><div><strong>{t.title}</strong><small>{t.artist}</small></div></button><button aria-label={`移除 ${t.title}`} onClick={() => void s.removeFromQueue(id)}><X size={14}/></button></div>; })}</div></section>}
    <footer className="ai-player" aria-label="音乐播放器">
      <div className="ai-playing-track"><button className="ai-player-cover" disabled={!track} aria-label="打开沉浸播放" onClick={() => s.setImmersive(true)}><Cover path={track?.coverPath} seed={track?.id ?? "potato"} label={track?.title ?? "P"} radius={9}/></button><div><strong>{track?.title ?? "让音乐，从这里开始"}</strong><small>{track?.artist ?? "选择一首歌，或者问问音乐助手"}</small></div><button className={track && s.favorites.includes(track.id) ? "is-active" : ""} disabled={!track} aria-label="收藏当前歌曲" aria-pressed={Boolean(track && s.favorites.includes(track.id))} onClick={() => track && void s.toggleFavorite(track.id)}><Heart size={17} fill={track && s.favorites.includes(track.id) ? "currentColor" : "none"}/></button></div>
      <div className="ai-transport"><div className="ai-transport-buttons"><button aria-label="随机播放" aria-pressed={playback?.shuffle ?? false} className={playback?.shuffle ? "is-active" : ""} disabled={!track} onClick={() => void s.toggleShuffle()}><Shuffle size={16}/></button><button aria-label="上一首" disabled={!queueIds.length} onClick={() => void s.previous()}><SkipBack size={19}/></button><button className="ai-play-button" aria-label={playback?.playing ? "暂停" : "播放"} disabled={!track} onClick={() => void s.togglePlay()}>{playback?.playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button aria-label="下一首" disabled={!queueIds.length} onClick={() => void s.next()}><SkipForward size={19}/></button><button aria-label={`循环模式：${playback?.repeat ?? "off"}`} className={playback?.repeat !== "off" && playback?.repeat ? "is-active" : ""} disabled={!track} onClick={() => void s.cycleRepeat()}>{playback?.repeat === "one" ? <Repeat1 size={16}/> : <Repeat size={16}/>}</button></div><div className="ai-progress"><span>{formatTime(playback?.time ?? 0)}</span><Slider label="播放进度" value={playback?.time ?? 0} max={playback?.duration ?? track?.duration ?? 0} disabled={!playback?.trackId} onCommit={s.seek}/><span>{formatTime(playback?.duration || track?.duration || 0)}</span></div></div>
      <div className="ai-player-tools"><button aria-label="找相似歌曲" title="找相似歌曲" disabled={!track} onClick={() => void ask("找和这首相似的歌曲")}><Sparkles size={17}/></button><button aria-label="均衡器" title="均衡器" onClick={() => s.setEqOpen(true)}><SlidersHorizontal size={16}/></button><button aria-label="静音" aria-pressed={playback?.muted ?? false} onClick={() => s.setMuted(!playback?.muted)}>{playback?.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><Slider label="音量" value={playback?.muted ? 0 : playback?.volume ?? s.settings?.volume ?? 0.7} max={1} step={0.01} onChange={s.setVolume} onCommit={s.setVolume}/><button className={queue ? "is-active" : ""} aria-label="播放队列" aria-expanded={queue} onClick={() => setQueue(!queue)}><ListMusic size={19}/></button></div>
    </footer>
  </>;
}
