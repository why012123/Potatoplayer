import { useTr } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Album, ArrowLeft, ArrowRight, AudioLines, BarChart3, BrainCircuit, ChevronDown, Cloud, CloudDownload, FolderOpen, Heart, Home, Layers3, ListMusic, MessageCircle, Moon, Music2, Orbit, Pause, Play, Plus, RefreshCw, Repeat, Repeat1, Search, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, SquarePen, Sun, Users, Volume2, VolumeX, X, PanelRightClose } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { Cover } from "@/components/Cover";
import { Slider } from "@/components/Slider";
import { formatLongDuration, formatTime } from "@/lib/format";
import type { View } from "@/types";
export function AiSidebar() {
    const tr = useTr();
    const s = useAppStore();
    const view = s.viewHistory[s.viewIndex];
    const active = view.kind === "album" ? "albums" : view.kind === "artist" ? "artists" : ["block", "genre"].includes(view.kind) ? "collections" : view.kind;
    const showActive = !s.searchQuery;
    const mainNav = [
        { kind: "home", label: tr("Home", "首页"), icon: Home },
        { kind: "songs", label: tr("Songs", "歌曲"), icon: Music2 },
        { kind: "albums", label: tr("Albums", "专辑"), icon: Album },
        { kind: "artists", label: tr("Artists", "艺术家"), icon: Users },
        { kind: "collections", label: tr("Collections", "合集"), icon: Layers3 },
        { kind: "favorites", label: tr("Favorites", "收藏"), icon: Heart },
        { kind: "comments", label: tr("Comments", "评论"), icon: MessageCircle },
    ] as const;
    const moreNav = [
        { kind: "ai", label: tr("AI workspace", "AI 工作台"), icon: BrainCircuit },
        { kind: "daily", label: tr("Daily mix", "每日推荐"), icon: AudioLines },
        { kind: "stats", label: tr("Listening stats", "聆听统计"), icon: BarChart3 },
        { kind: "editor", label: tr("Song editor", "歌曲编辑"), icon: SquarePen },
        { kind: "ultra", label: "Ultra", icon: Orbit },
    ] as const;
    const activeMore = moreNav.some((item) => item.kind === active);
    const [moreOpen, setMoreOpen] = useState(activeMore);
    useEffect(() => {
        // Opening a tool page reveals the "more" group, like the old sidebar did.
        if (activeMore)
            setMoreOpen(true);
    }, [activeMore]);
    const totalDuration = s.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    // Show the release label reported by the backend (e.g. "s-ai1.9.0").
    const versionLabel = s.version || "";
    const sourceName = s.onlineSource === "qq" ? "QQ Music" : "NetEase";
    const newPlaylist = () => s.openPrompt({
        title: tr("New playlist", "新建歌单"),
        placeholder: tr("Give this playlist a name", "给这段旋律起个名字"),
        confirmLabel: tr("Create playlist", "创建歌单"),
        onSubmit: async (name) => {
            const p = await s.createPlaylist(name);
            if (p)
                s.navigate({ kind: "playlist", id: p.id });
        },
    });
    const pill = (visible: boolean) => visible ? <motion.span className="nav-item__pill" layoutId="ai-nav-active-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }}/> : null;
    return <aside className="ai-sidebar">
    <div className="ai-sidebar-drag window-drag"/>
    <button type="button" className="brand no-drag" onClick={() => s.navigate({ kind: "home" })} aria-label={tr("Potato Music AI home", "Potato Music AI 首页")} title={tr("Potato Music AI home", "Potato Music AI 首页")}>
      <span className="brand__mark"><AudioLines size={19} strokeWidth={2.1}/><span/></span>
      <span className="brand__type"><strong>potato</strong><em>AI</em></span>
    </button>
    <div className="ai-sidebar-scroll">
      <nav className="side-nav" aria-label={tr("Library", "资料库")}>
        <div className="nav-label">{tr("Library", "资料库")}</div>
        {mainNav.map(({ kind, label, icon: Icon }) => {
            const isActive = showActive && active === kind;
            return <button key={kind} type="button" className={`nav-item ${isActive ? "is-active" : ""}`} aria-current={isActive ? "page" : undefined} title={label} aria-label={label} onClick={() => s.navigate({ kind } as View)}>
          {pill(isActive)}
          <Icon size={17} strokeWidth={1.9}/>
          <span>{label}</span>
          {kind === "songs" && s.tracks.length > 0 && <span className="nav-item__count">{s.tracks.length}</span>}
          {kind === "favorites" && s.favorites.length > 0 && <span className="nav-item__count">{s.favorites.length}</span>}
        </button>;
        })}
        <button type="button" className={`nav-item nav-item--more ${showActive && activeMore ? "is-active" : ""}`} aria-expanded={moreOpen} title={moreOpen ? tr("Hide tools", "收起工具") : tr("More tools", "更多工具")} onClick={() => setMoreOpen((value) => !value)}>
          <ChevronDown className="nav-item__chevron" size={16} strokeWidth={1.9}/>
          <span>{tr("More", "更多")}</span>
        </button>
        <AnimatePresence initial={false}>
          {moreOpen && <motion.div key="ai-more-list" className="nav-sub-list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            {moreNav.map(({ kind, label, icon: Icon }, index) => {
            const isActive = showActive && active === kind;
            return <motion.button key={kind} type="button" className={`nav-item nav-item--sub ${isActive ? "is-active" : ""}`} aria-current={isActive ? "page" : undefined} title={label} aria-label={label} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.02 * index, ease: [0.22, 1, 0.36, 1] }} onClick={() => s.navigate({ kind } as View)}>
              {pill(isActive)}
              <Icon size={15} strokeWidth={1.9}/>
              <span>{label}</span>
              {kind === "daily" && (s.dailyMix?.trackIds.length ?? 0) > 0 && <span className="nav-item__count">{s.dailyMix?.trackIds.length}</span>}
            </motion.button>;
            })}
          </motion.div>}
        </AnimatePresence>
      </nav>

      <div className="online-nav">
        <div className="nav-label">{tr("Online", "在线")}</div>
        <div className={`nav-item nav-item--online ${showActive && active === "discover" ? "is-active" : ""}`} role="button" tabIndex={0} aria-current={showActive && active === "discover" ? "page" : undefined} title={tr("Discover", "发现")} aria-label={tr("Discover", "发现")} onClick={() => s.navigate({ kind: "discover" })} onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                s.navigate({ kind: "discover" });
            }
        }}>
          {pill(showActive && active === "discover")}
          <Cloud size={17} strokeWidth={1.9}/>
          <span>{tr("Discover", "发现")}</span>
          <button type="button" className="nav-item__source" title={tr("Switch online source (current: {source})", "切换在线音源（当前：{source}）", { source: sourceName })} aria-label={tr("Switch online source, current {source}", "切换在线音源，当前 {source}", { source: sourceName })} onClick={(event) => {
            event.stopPropagation();
            s.setOnlineSource(s.onlineSource === "qq" ? "netease" : "qq");
            s.navigate({ kind: "discover" });
        }}>{s.onlineSource === "qq" ? "QQ MUSIC" : "NETEASE"}</button>
        </div>
        <button type="button" className={`nav-item nav-item--online ${showActive && active === "sync" ? "is-active" : ""}`} aria-current={showActive && active === "sync" ? "page" : undefined} title={tr("Sync", "同步")} aria-label={tr("Sync", "同步")} onClick={() => s.navigate({ kind: "sync" })}>
          {pill(showActive && active === "sync")}
          <RefreshCw size={17} strokeWidth={1.9}/>
          <span>{tr("Sync", "同步")}</span>
        </button>
      </div>

      <div className="side-playlists">
        <div className="nav-label nav-label--row">
          <span>{tr("Playlists", "歌单")}</span>
          <button type="button" className="tiny-button" aria-label={tr("New playlist", "新建歌单")} title={tr("New playlist", "新建歌单")} onClick={newPlaylist}>
            <Plus size={14} strokeWidth={2.2}/>
          </button>
        </div>
        <div className="side-playlists__list">
          {s.playlists.length === 0 && <div className="playlist-hint">{tr("Playlists you make will live here.", "你创建的歌单会显示在这里。")}</div>}
          {s.playlists.map((playlist) => {
            const isActive = view.kind === "playlist" && view.id === playlist.id;
            return <button key={playlist.id} type="button" className={`playlist-link ${isActive ? "is-active" : ""}`} aria-current={isActive ? "page" : undefined} title={playlist.name} onClick={() => s.navigate({ kind: "playlist", id: playlist.id })}>
              <ListMusic size={15} strokeWidth={1.8}/>
              <span>{playlist.name}</span>
              <em>{playlist.trackIds.length}</em>
            </button>;
        })}
        </div>
      </div>
    </div>
    <div className="library-card">
      <div className="library-card__top">
        <span className="library-card__icon"><Sparkles size={14}/></span>
        <span className="library-card__status">
          <i className={`status-dot ${s.scanning ? "is-busy" : ""}`}/>
          {s.scanning ? (s.scanProgress?.total ? tr("Scanning {done} / {total}", "正在扫描 {done}/{total}", { done: s.scanProgress.done, total: s.scanProgress.total }) : tr("Scanning library", "正在扫描资料库")) : tr("Local library", "本地资料库")}
        </span>
      </div>
      <div className="library-card__numbers">
        <strong>{s.tracks.length}</strong>
        <span>{tr("songs", "首歌曲")}</span>
        <i/>
        <strong className="library-card__duration">{formatLongDuration(totalDuration)}</strong>
      </div>
      <button type="button" className="library-card__open" onClick={() => void s.chooseLibrary()}><FolderOpen size={13}/>{tr("Change folder", "更换文件夹")}</button>
    </div>
    <div className="sidebar-footer">
      <button type="button" className="sidebar-settings" onClick={() => s.navigate({ kind: "settings" })}>
        <Settings2 size={16} strokeWidth={1.9}/>
        <span>{tr("Settings", "设置")}</span>
      </button>
      <span className="sidebar-version">{versionLabel}</span>
    </div>
  </aside>;
}
export function AiTopBar() {
    const tr = useTr();
    const s = useAppStore();
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const focus = () => input.current?.focus();
        window.addEventListener("potato:focus-search", focus);
        return () => window.removeEventListener("potato:focus-search", focus);
    }, []);
    return <header className="ai-topbar window-drag"><div className="ai-history no-drag"><button aria-label={tr("Back", "后退")} disabled={s.viewIndex === 0} onClick={s.goBack}><ArrowLeft size={18}/></button><button aria-label={tr("Forward", "前进")} disabled={s.viewIndex >= s.viewHistory.length - 1} onClick={s.goForward}><ArrowRight size={18}/></button></div>
    <label className="ai-search no-drag"><Search size={16}/><input ref={input} aria-label={tr("Search library", "搜索资料库")} placeholder={tr("Search songs, artists, albums…", "搜索歌曲、歌手、专辑…")} value={s.searchQuery} onChange={(e) => s.setSearchQuery(e.target.value)}/>{s.searchQuery ? <button aria-label={tr("Clear search", "清除搜索")} onClick={() => s.setSearchQuery("")}><X size={14}/></button> : <kbd>⌘ F</kbd>}</label>
    <div className="ai-top-actions no-drag"><button title={tr("Downloads", "下载任务")} aria-label={tr("Downloads", "下载任务")} onClick={() => s.setDownloadPanelOpen(true)}><CloudDownload size={18}/></button><button title={tr("Toggle theme", "切换主题")} aria-label={tr("Toggle theme", "切换主题")} onClick={() => s.setTheme(s.theme === "dark" ? "light" : "dark")}>{s.theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><div className="ai-panel-switch" role="group" aria-label={tr("Side panel", "右侧栏显示方式")}>{([
            { mode: "hidden", label: tr("Hide", "隐藏"), icon: PanelRightClose },
            { mode: "ai", label: "AI", icon: Sparkles },
            { mode: "player", label: tr("Now playing", "播放页面"), icon: AudioLines },
        ] as const).map(({ mode, label, icon: Icon }) => <button key={mode} title={label} aria-label={tr("{v0} panel", "{v0}侧栏", { v0: label })} aria-pressed={s.rightPanelMode === mode} className={s.rightPanelMode === mode ? "is-active" : ""} onClick={() => s.setRightPanelMode(mode)}><Icon size={15}/><span>{label}</span></button>)}</div></div>
  </header>;
}
export function AiPlayer() {
    const tr = useTr();
    const s = useAppStore();
    const ask = useAssistant((state) => state.ask);
    const [queue, setQueue] = useState(false);
    const playback = s.playback;
    const track = s.tracks.find((t) => t.id === (playback?.trackId ?? s.previewTrackId));
    const queueIds = playback?.queue ?? [];
    useEffect(() => { if (!queue)
        return; const close = (e: KeyboardEvent) => { if (e.key === "Escape")
        setQueue(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [queue]);
    return <>
    {queue && <section className="ai-queue" aria-label={tr("Play queue", "播放队列")}><header><div><strong>{tr("Up next", "接下来播放")}</strong><small>{queueIds.length}{tr(" songs", "首歌曲")}</small></div><button aria-label={tr("Close queue", "关闭队列")} onClick={() => setQueue(false)}><X size={18}/></button></header><div className="ai-queue-list">{queueIds.length === 0 && <p className="ai-empty-copy">{tr("Your queue is empty. Pick a song to begin.", "队列还是空的，选一首歌开始吧。")}</p>}{queueIds.map((id, index) => { const t = s.tracks.find((item) => item.id === id); return t && <div className="ai-queue-row" key={`${id}-${index}`}><button onClick={() => void s.playTrack(t, queueIds)}><span>{playback?.trackId === id ? <AudioLines size={14}/> : String(index + 1).padStart(2, "0")}</span><div><strong>{t.title}</strong><small>{t.artist}</small></div></button><button aria-label={tr("Remove {v0}", "移除 {v0}", { v0: t.title })} onClick={() => void s.removeFromQueue(id)}><X size={14}/></button></div>; })}</div></section>}
    <footer className="ai-player" aria-label={tr("Music player", "音乐播放器")}>
      <div className="ai-playing-track"><button className="ai-player-cover" disabled={!track} aria-label={tr("Open immersive player", "打开沉浸播放")} onClick={() => s.setImmersive(true)}><Cover path={track?.coverPath} seed={track?.id ?? "potato"} label={track?.title ?? "P"} radius={9}/></button><div><strong>{track?.title ?? tr("Let the music begin", "让音乐，从这里开始")}</strong><small>{track?.artist ?? tr("Choose a song, or ask your music assistant", "选择一首歌，或者问问音乐助手")}</small></div><button className={track && s.favorites.includes(track.id) ? "is-active" : ""} disabled={!track} aria-label={tr("Favorite current song", "收藏当前歌曲")} aria-pressed={Boolean(track && s.favorites.includes(track.id))} onClick={() => track && void s.toggleFavorite(track.id)}><Heart size={17} fill={track && s.favorites.includes(track.id) ? "currentColor" : "none"}/></button></div>
      <div className="ai-transport"><div className="ai-transport-buttons"><button aria-label={tr("Shuffle", "随机播放")} aria-pressed={playback?.shuffle ?? false} className={playback?.shuffle ? "is-active" : ""} disabled={!track} onClick={() => void s.toggleShuffle()}><Shuffle size={16}/></button><button aria-label={tr("Previous track", "上一首")} disabled={!queueIds.length} onClick={() => void s.previous()}><SkipBack size={19}/></button><button className="ai-play-button" aria-label={playback?.playing ? tr("Pause", "暂停") : tr("Play", "播放")} disabled={!track} onClick={() => void s.togglePlay()}>{playback?.playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button aria-label={tr("Next track", "下一首")} disabled={!queueIds.length} onClick={() => void s.next()}><SkipForward size={19}/></button><button aria-label={tr("Repeat mode: {v0}", "循环模式：{v0}", { v0: playback?.repeat ?? "off" })} className={playback?.repeat !== "off" && playback?.repeat ? "is-active" : ""} disabled={!track} onClick={() => void s.cycleRepeat()}>{playback?.repeat === "one" ? <Repeat1 size={16}/> : <Repeat size={16}/>}</button></div><div className="ai-progress"><span>{formatTime(playback?.time ?? 0)}</span><Slider label={tr("Playback position", "播放进度")} value={playback?.time ?? 0} max={playback?.duration ?? track?.duration ?? 0} disabled={!playback?.trackId} onCommit={s.seek}/><span>{formatTime(playback?.duration || track?.duration || 0)}</span></div></div>
      <div className="ai-player-tools"><button aria-label={tr("Find similar songs", "找相似歌曲")} title={tr("Find similar songs", "找相似歌曲")} disabled={!track} onClick={() => void ask(tr("Find songs similar to this one", "找和这首相似的歌曲"))}><Sparkles size={17}/></button><button aria-label={tr("Equalizer", "均衡器")} title={tr("Equalizer", "均衡器")} onClick={() => s.setEqOpen(true)}><SlidersHorizontal size={16}/></button><button aria-label={tr("Mute", "静音")} aria-pressed={playback?.muted ?? false} onClick={() => s.setMuted(!playback?.muted)}>{playback?.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><Slider label={tr("Volume", "音量")} value={playback?.muted ? 0 : playback?.volume ?? s.settings?.volume ?? 0.7} max={1} step={0.01} onChange={s.setVolume} onCommit={s.setVolume}/><button className={queue ? "is-active" : ""} aria-label={tr("Play queue", "播放队列")} aria-expanded={queue} onClick={() => setQueue(!queue)}><ListMusic size={19}/></button></div>
    </footer>
  </>;
}
