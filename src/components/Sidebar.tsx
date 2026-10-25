import { motion } from "motion/react";
import {
  Album,
  Cloud,
  Disc3,
  FolderOpen,
  Heart,
  Home,
  Layers3,
  ListMusic,
  Music2,
  Plus,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import clsx from "clsx";
import type { View } from "@/types";
import { useAppStore } from "@/store";
import { formatLongDuration } from "@/lib/format";

const items: { label: string; view: View; icon: typeof Home; shortcut: string }[] = [
  { label: "Home", view: { kind: "home" }, icon: Home, shortcut: "1" },
  { label: "Songs", view: { kind: "songs" }, icon: Music2, shortcut: "2" },
  { label: "Albums", view: { kind: "albums" }, icon: Album, shortcut: "3" },
  { label: "Artists", view: { kind: "artists" }, icon: Users, shortcut: "4" },
  { label: "Collections", view: { kind: "collections" }, icon: Layers3, shortcut: "5" },
  { label: "Favorites", view: { kind: "favorites" }, icon: Heart, shortcut: "6" },
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

  const newPlaylist = () => {
    openPrompt({
      title: "New playlist",
      description: "Give this collection a name. You can add songs from any list.",
      placeholder: "Late night drive",
      confirmLabel: "Create playlist",
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

      <nav className="side-nav" aria-label="Library">
        <div className="nav-label">Library</div>
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeKind === item.view.kind;
          return (
            <button
              key={item.label}
              type="button"
              className={clsx("nav-item", active && "is-active")}
              onClick={() => navigate(item.view)}
            >
              {active && (
                <motion.span
                  className="nav-item__pill"
                  layoutId="nav-active-pill"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <Icon size={17} strokeWidth={1.9} />
              <span>{item.label}</span>
              {item.view.kind === "favorites" && favorites.length > 0 && (
                <span className="nav-item__count">{favorites.length}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="online-nav">
        <div className="nav-label">Online</div>
        <button
          type="button"
          className={clsx("nav-item nav-item--online", current.kind === "discover" && "is-active")}
          onClick={() => navigate({ kind: "discover" })}
        >
          {current.kind === "discover" && (
            <motion.span
              className="nav-item__pill"
              layoutId="nav-active-pill"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <Cloud size={17} strokeWidth={1.9} />
          <span>Discover</span>
          <em>NetEase</em>
        </button>
      </div>

      <div className="side-playlists">
        <div className="nav-label nav-label--row">
          <span>Playlists</span>
          <button type="button" className="tiny-button" aria-label="New playlist" title="New playlist" onClick={newPlaylist}>
            <Plus size={14} strokeWidth={2.2} />
          </button>
        </div>
        <div className="side-playlists__list">
          {playlists.length === 0 && <div className="playlist-hint">Playlists you make will live here.</div>}
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
                ? `Scanning ${scanProgress.done} / ${scanProgress.total}`
                : "Scanning library"
              : "Local library"}
          </span>
        </div>
        <div className="library-card__numbers">
          <strong>{tracks.length}</strong>
          <span>songs</span>
          <i />
          <strong>{formatLongDuration(totalDuration)}</strong>
        </div>
        <button type="button" className="library-card__open" onClick={() => void chooseLibrary()}>
          <FolderOpen size={13} />
          Change folder
        </button>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-settings" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={16} strokeWidth={1.9} />
          <span>Settings</span>
        </button>
        <div className="sidebar-avatar" title="Local listener">
          P
        </div>
      </div>
    </aside>
  );
}
