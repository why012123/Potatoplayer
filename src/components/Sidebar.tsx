import { motion } from "motion/react";
import {
  Album,
  Cloud,
  Disc3,
  FolderOpen,
  Heart,
  Home,
  BarChart3,
  Layers3,
  ListMusic,
  Music2,
  Plus,
  Settings2,
  Sparkles,
  SquarePen,
  Users,
} from "lucide-react";
import clsx from "clsx";
import type { View } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { formatLongDuration } from "@/lib/format";

const items: { label: string; labelZh: string; view: View; icon: typeof Home; shortcut: string }[] = [
  { label: "Home", labelZh: "首页", view: { kind: "home" }, icon: Home, shortcut: "1" },
  { label: "Songs", labelZh: "歌曲", view: { kind: "songs" }, icon: Music2, shortcut: "2" },
  { label: "Albums", labelZh: "专辑", view: { kind: "albums" }, icon: Album, shortcut: "3" },
  { label: "Artists", labelZh: "艺术家", view: { kind: "artists" }, icon: Users, shortcut: "4" },
  { label: "Collections", labelZh: "合集", view: { kind: "collections" }, icon: Layers3, shortcut: "5" },
  { label: "Favorites", labelZh: "收藏", view: { kind: "favorites" }, icon: Heart, shortcut: "6" },
  { label: "Stats", labelZh: "统计", view: { kind: "stats" }, icon: BarChart3, shortcut: "7" },
  { label: "Editor", labelZh: "编辑器", view: { kind: "editor" }, icon: SquarePen, shortcut: "8" },
];

export function Sidebar() {
  const viewHistory = useAppStore((state) => state.viewHistory);
  const viewIndex = useAppStore((state) => state.viewIndex);
  const navigate = useAppStore((state) => state.navigate);
  const playlists = useAppStore((state) => state.playlists);
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const createPlaylist = useAppStore((state) => state.createPlaylist);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const onlineSource = useAppStore((state) => state.onlineSource);
  const setOnlineSource = useAppStore((state) => state.setOnlineSource);
  const tr = useTr();

  const current = viewHistory[viewIndex] ?? { kind: "home" };
  const activeKind =
    current.kind === "album"
      ? "albums"
      : current.kind === "artist"
        ? "artists"
        : current.kind === "block" || current.kind === "genre"
          ? "collections"
          : current.kind;
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  const sourceName = onlineSource === "qq" ? "QQ Music" : "NetEase";

  const newPlaylist = () => {
    openPrompt({
      title: tr("New playlist", "新建歌单"),
      description: tr(
        "Give this collection a name. You can add songs from any list.",
        "为这个歌单取个名字。之后可以从任意列表中添加歌曲。",
      ),
      placeholder: tr("Late night drive", "深夜兜风"),
      confirmLabel: tr("Create playlist", "创建歌单"),
      onSubmit: async (name) => {
        const playlist = await createPlaylist(name);
        if (playlist) navigate({ kind: "playlist", id: playlist.id });
      },
    });
  };

  return (
    <aside className="sidebar glass">
      <div className="window-drag sidebar__drag" aria-hidden="true" />

      <div className="brand">
        <div className="brand__mark">
          <Disc3 size={19} strokeWidth={2.1} />
          <span />
        </div>
        <div className="brand__type">
          <strong>potato</strong>
          <em>super</em>
        </div>
      </div>

      <nav className="side-nav" aria-label={tr("Library", "资料库")}>
        <div className="nav-label">{tr("Library", "资料库")}</div>
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeKind === item.view.kind;
          return (
            <button
              key={item.label}
              type="button"
              className={clsx("nav-item", active && "is-active")}
              onClick={() => {
                if (!active) navigate(item.view);
              }}
            >
              {active && (
                <motion.span
                  className="nav-item__pill"
                  layoutId="nav-active-pill"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <Icon size={17} strokeWidth={1.9} />
              <span>{tr(item.label, item.labelZh)}</span>
              {item.view.kind === "favorites" && favorites.length > 0 && (
                <span className="nav-item__count">{favorites.length}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="online-nav">
        <div className="nav-label">{tr("Online", "在线")}</div>
        <div
          className={clsx("nav-item nav-item--online", current.kind === "discover" && "is-active")}
          role="button"
          tabIndex={0}
          onClick={() => navigate({ kind: "discover" })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              navigate({ kind: "discover" });
            }
          }}
        >
          {current.kind === "discover" && (
            <motion.span
              className="nav-item__pill"
              layoutId="nav-active-pill"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <Cloud size={17} strokeWidth={1.9} />
          <span>{tr("Discover", "发现")}</span>
          <button
            type="button"
            className="nav-item__source"
            title={tr("Switch online source (current: {source})", "切换在线音源（当前：{source}）", {
              source: sourceName,
            })}
            aria-label={tr("Switch online source, current {source}", "切换在线音源，当前 {source}", {
              source: sourceName,
            })}
            onClick={(event) => {
              event.stopPropagation();
              const next = onlineSource === "qq" ? "netease" : "qq";
              setOnlineSource(next);
              navigate({ kind: "discover" });
            }}
          >
            {onlineSource === "qq" ? "QQ MUSIC" : "NETEASE"}
          </button>
        </div>
      </div>

      <div className="side-playlists">
        <div className="nav-label nav-label--row">
          <span>{tr("Playlists", "歌单")}</span>
          <button
            type="button"
            className="tiny-button"
            aria-label={tr("New playlist", "新建歌单")}
            title={tr("New playlist", "新建歌单")}
            onClick={newPlaylist}
          >
            <Plus size={14} strokeWidth={2.2} />
          </button>
        </div>
        <div className="side-playlists__list">
          {playlists.length === 0 && (
            <div className="playlist-hint">{tr("Playlists you make will live here.", "你创建的歌单会显示在这里。")}</div>
          )}
          {playlists.map((playlist) => {
            const active = current.kind === "playlist" && current.id === playlist.id;
            return (
              <button
                key={playlist.id}
                type="button"
                className={clsx("playlist-link", active && "is-active")}
                onClick={() => navigate({ kind: "playlist", id: playlist.id })}
              >
                <ListMusic size={15} strokeWidth={1.8} />
                <span>{playlist.name}</span>
                <em>{playlist.trackIds.length}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar__spacer" />

      <div className="library-card">
        <div className="library-card__top">
          <span className="library-card__icon">
            <Sparkles size={14} />
          </span>
          <span className="library-card__status">
            <i
              className={clsx("status-dot", scanning && "is-busy")}
              style={{ background: scanning ? "var(--accent)" : "#5ec27a" }}
            />
            {scanning
              ? scanProgress?.total
                ? tr("Scanning {done} / {total}", "正在扫描 {done}/{total}", {
                    done: scanProgress.done,
                    total: scanProgress.total,
                  })
                : tr("Scanning library", "正在扫描资料库")
              : tr("Local library", "本地资料库")}
          </span>
        </div>
        <div className="library-card__numbers">
          <strong>{tracks.length}</strong>
          <span>{tracks.length === 1 ? tr("song", "首歌曲") : tr("songs", "首歌曲")}</span>
          <i />
          <strong>{formatLongDuration(totalDuration)}</strong>
        </div>
        <button type="button" className="library-card__open" onClick={() => void chooseLibrary()}>
          <FolderOpen size={13} />
          {tr("Change folder", "更换文件夹")}
        </button>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-settings" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={16} strokeWidth={1.9} />
          <span>{tr("Settings", "设置")}</span>
        </button>
        <div className="sidebar-avatar" title={tr("Local listener", "本地听众")}>
          P
        </div>
      </div>
    </aside>
  );
}
