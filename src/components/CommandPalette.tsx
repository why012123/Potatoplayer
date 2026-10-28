import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Album,
  ArrowRight,
  BarChart3,
  Cloud,
  Command,
  Gamepad2,
  Heart,
  MessageCircle,
  Home,
  Layers3,
  ListMusic,
  Music2,
  Search,
  SquarePen,
  Users,
} from "lucide-react";
import type { View } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { isCommitEnter } from "@/lib/keyboard";
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
  const tr = useTr();
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
      { id: "home", label: tr("Home", "首页"), hint: tr("Library", "资料库"), view: { kind: "home" }, icon: <Home size={16} /> },
      { id: "songs", label: tr("Songs", "歌曲"), hint: tr("Library", "资料库"), view: { kind: "songs" }, icon: <Music2 size={16} /> },
      { id: "albums", label: tr("Albums", "专辑"), hint: tr("Library", "资料库"), view: { kind: "albums" }, icon: <Album size={16} /> },
      { id: "artists", label: tr("Artists", "艺术家"), hint: tr("Library", "资料库"), view: { kind: "artists" }, icon: <Users size={16} /> },
      {
        id: "collections",
        label: tr("Blocks & Genres", "区块与流派"),
        hint: tr("Your system", "你的分类体系"),
        view: { kind: "collections" },
        icon: <Layers3 size={16} />,
      },
      { id: "favorites", label: tr("Favorites", "收藏"), hint: tr("Library", "资料库"), view: { kind: "favorites" }, icon: <Heart size={16} /> },
      { id: "dive", label: "Dive", hint: tr("Rhythm mode", "节奏模式"), view: { kind: "dive" }, icon: <Gamepad2 size={16} /> },
      { id: "comments", label: tr("Comments", "评论"), hint: tr("Now playing", "正在播放"), view: { kind: "comments" }, icon: <MessageCircle size={16} /> },
      { id: "stats", label: tr("Listening stats", "聆听统计"), hint: tr("Your listening life", "你的聆听生活"), view: { kind: "stats" }, icon: <BarChart3 size={16} /> },
      { id: "discover", label: tr("Discover", "发现"), hint: "NetEase", view: { kind: "discover" }, icon: <Cloud size={16} /> },
    ];
    for (const playlist of playlists) {
      base.push({
        id: `playlist-${playlist.id}`,
        label: playlist.name,
        hint: tr("Playlist", "歌单"),
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
  }, [tracks, playlists, query, tr]);

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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08, ease: "easeOut" }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((current) => Math.min(current + 1, actions.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((current) => Math.max(0, current - 1));
              } else if (isCommitEnter(event) && actions[selected]) {
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
                placeholder={tr("Search or jump to…", "搜索或跳转…")}
                aria-label={tr("Command palette search", "命令面板搜索")}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(0);
                }}
              />
              <span className="command-key">ESC</span>
            </div>
            <div className="command-divider" />
            <div className="command-results">
              {!query && <div className="command-label">{tr("Jump to", "跳转到")}</div>}
              {actions.length === 0 && (
                <div className="command-empty">
                  {tr("No matches. Try a different word.", "没有匹配项，换个关键词试试。")}
                </div>
              )}
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
              <span>{tr("↑↓ to move", "↑↓ 移动")}</span>
              <span>{tr("↵ to open", "↵ 打开")}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
