import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Heart, Layers3, ListEnd, ListMusic, ListPlus, Play } from "lucide-react";
import { useAppStore } from "@/store";

export function TrackMenu() {
  const menu = useAppStore((state) => state.trackMenu);
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueue = useAppStore((state) => state.enqueue);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTrackMenu = useAppStore((state) => state.setTrackMenu);
  const setAddToPlaylistTrackId = useAppStore((state) => state.setAddToPlaylistTrackId);
  const navigate = useAppStore((state) => state.navigate);
  const setEditTrackId = useAppStore((state) => state.setEditTrackId);
  const track = tracks.find((item) => item.id === menu?.trackId);
  const favorite = track ? favorites.includes(track.id) : false;

  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTrackMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, setTrackMenu]);

  const close = () => setTrackMenu(null);
  const left = menu ? Math.max(14, Math.min(menu.x - 244, window.innerWidth - 258)) : 0;
  const top = menu ? Math.max(14, Math.min(menu.y + 6, window.innerHeight - 330)) : 0;

  return (
    <AnimatePresence>
      {menu && track && (
        <>
          <div className="menu-scrim" onPointerDown={close} />
          <motion.div
            className="track-menu glass-strong"
            style={{ left, top }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -3 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="track-menu__head">
              <span>{track.title}</span>
              <em>{track.artist}</em>
            </div>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                const queue = tracks.map((item) => item.id);
                void playTrack(track, queue);
                close();
              }}
            >
              <Play size={15} fill="currentColor" />
              Play
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                void enqueue(track.id, true);
                close();
              }}
            >
              <ListEnd size={15} />
              Play next
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                void enqueue(track.id, false);
                close();
              }}
            >
              <ListPlus size={15} />
              Add to queue
            </button>
            <div className="menu-separator" />
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                void toggleFavorite(track.id);
                close();
              }}
            >
              <Heart size={15} fill={favorite ? "currentColor" : "none"} />
              {favorite ? "Remove from favorites" : "Add to favorites"}
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setAddToPlaylistTrackId(track.id);
                close();
              }}
            >
              <ListMusic size={15} />
              Add to playlist…
            </button>
            <div className="menu-separator" />
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setEditTrackId(track.id);
                close();
              }}
            >
              <Layers3 size={15} />
              Blocks & genre…
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                navigate({ kind: "artist", name: track.artist });
                close();
              }}
            >
              <ArrowUpRight size={15} />
              Go to artist
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
