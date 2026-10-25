import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Album,
  ArrowRight,
  Cloud,
  Command,
  Heart,
  Home,
  Layers3,
  ListMusic,
  Music2,
  Search,
  Users,
} from "lucide-react";
import type { View } from "@/types";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";

type Action = {
  id: string;
  label: string;
  hint?: string;
  view?: View;
  trackId?: string;
  icon: React.ReactNode;
};

export function CommandPalette() {
  const open = useAppStore((state) => state.commandOpen);
  const setOpen = useAppStore((state) => state.setCommandOpen);
  const navigate = useAppStore((state) => state.navigate);
  const tracks = useAppStore((state) => state.tracks);
  const playlists = useAppStore((state) => state.playlists);
  const playTrack = useAppStore((state) => state.playTrack);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const base: Action[] = [
      { id: "home", label: "Home", hint: "Library", view: { kind: "home" }, icon: <Home size={16} /> },
      { id: "songs", label: "Songs", hint: "Library", view: { kind: "songs" }, icon: <Music2 size={16} /> },
      { id: "albums", label: "Albums", hint: "Library", view: { kind: "albums" }, icon: <Album size={16} /> },
      { id: "artists", label: "Artists", hint: "Library", view: { kind: "artists" }, icon: <Users size={16} /> },
      {
        id: "collections",
        label: "Blocks & Genres",
        hint: "Your system",
        view: { kind: "collections" },
        icon: <Layers3 size={16} />,
      },
      { id: "favorites", label: "Favorites", hint: "Library", view: { kind: "favorites" }, icon: <Heart size={16} /> },
      { id: "discover", label: "Discover", hint: "NetEase", view: { kind: "discover" }, icon: <Cloud size={16} /> },
    ];
    for (const playlist of playlists) {
      base.push({
        id: `playlist-${playlist.id}`,
        label: playlist.name,
        hint: "Playlist",
        view: { kind: "playlist", id: playlist.id },
        icon: <ListMusic size={16} />,
      });
    }
    const needle = query.trim().toLowerCase();
    const matchingTracks = tracks
      .filter((track) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle))
      .slice(0, 7)
      .map((track) => ({
        id: `track-${track.id}`,
        label: track.title,
        hint: track.artist,
        trackId: track.id,
        icon: (
          <Cover
            path={track.coverPath}
            seed={track.id}
            label={track.title}
            radius={6}
            className="command-cover"
          />
        ),
      }));
    if (!needle) return [...base, ...matchingTracks];
    return [...base.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(needle)), ...matchingTracks];
  }, [tracks, playlists, query]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, actions.length - 1)));
  }, [actions.length]);

  const run = (action: Action) => {
    setOpen(false);
    if (action.view) navigate(action.view);
    if (action.trackId) {
      const track = tracks.find((item) => item.id === action.trackId);
      if (track) void playTrack(track, tracks.map((item) => item.id));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="command-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            className="command-palette glass-strong"
            initial={{ opacity: 0, y: -14, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((current) => Math.min(current + 1, actions.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter" && actions[selected]) {
                event.preventDefault();
                run(actions[selected]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          >
            <div className="command-input-wrap">
              <Search size={18} />
              <input
                ref={inputRef}
                value={query}
                placeholder="Search or jump to…"
                aria-label="Command palette search"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(0);
                }}
              />
              <span className="command-key">ESC</span>
            </div>
            <div className="command-divider" />
            <div className="command-results">
              {!query && <div className="command-label">Jump to</div>}
              {actions.length === 0 && <div className="command-empty">No matches. Try a different word.</div>}
              {actions.map((action, index) => (
                <button
                  type="button"
                  key={action.id}
                  className={clsx("command-item", index === selected && "is-selected")}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => run(action)}
                >
                  <span className="command-item__icon">{action.icon}</span>
                  <span className="command-item__label">
                    <strong>{action.label}</strong>
                    {action.hint && <em>{action.hint}</em>}
                  </span>
                  <ArrowRight size={14} className="command-item__arrow" />
                </button>
              ))}
            </div>
            <div className="command-footer">
              <span>
                <Command size={12} /> K
              </span>
              <span>↑↓ to move</span>
              <span>↵ to open</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
