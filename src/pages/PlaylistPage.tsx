import { useMemo } from "react";
import { motion } from "motion/react";
import { ListEnd, ListMusic, ListPlus, Pencil, Play, Plus, Shuffle, Trash2 } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { coverUrl } from "@/lib/covers";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function PlaylistPage() {
  const view = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const playlists = useAppStore((state) => state.playlists);
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const enqueueMany = useAppStore((state) => state.enqueueMany);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const renamePlaylist = useAppStore((state) => state.renamePlaylist);
  const deletePlaylist = useAppStore((state) => state.deletePlaylist);
  const playlist = view.kind === "playlist" ? playlists.find((item) => item.id === view.id) : undefined;

  const trackBy = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const playlistTracks = useMemo(
    () => (playlist?.trackIds ?? []).map((id) => trackBy.get(id)).filter((track): track is NonNullable<typeof track> => Boolean(track)),
    [playlist, trackBy],
  );

  if (!playlist) {
    return (
      <div className="page">
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <ListMusic size={28} />
          </div>
          <h2>This playlist is gone.</h2>
          <p>It may have been deleted. Create a new one from the sidebar.</p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            Browse songs
          </button>
        </div>
      </div>
    );
  }

  const queue = playlistTracks.map((track) => track.id);
  const duration = playlistTracks.reduce((sum, track) => sum + track.duration, 0);
  const cover = playlistTracks.find((track) => track.coverPath)?.coverPath ?? null;

  const rename = () => {
    openPrompt({
      title: "Rename playlist",
      initialValue: playlist.name,
      confirmLabel: "Save name",
      onSubmit: async (name) => {
        if (name.trim() && name.trim() !== playlist.name) await renamePlaylist(playlist.id, name.trim());
      },
    });
  };

  const remove = () => {
    openPrompt({
      title: `Delete “${playlist.name}”?`,
      description: "The playlist will be removed. Your music files are never touched.",
      confirmLabel: "Delete playlist",
      input: false,
      destructive: true,
      onSubmit: async () => {
        await deletePlaylist(playlist.id);
      },
    });
  };

  return (
    <motion.div
      className="page page--playlist"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="playlist-hero glass">
        <div className="playlist-hero__cover">
          {playlistTracks.length ? (
            <div className="playlist-mosaic">
              {playlistTracks.slice(0, 4).map((track) => (
                <Cover key={track.id} path={track.coverPath} seed={track.id} label={track.title} radius={6} />
              ))}
              {playlistTracks.length === 1 && <div className="playlist-mosaic__empty" />}
            </div>
          ) : (
            <div className="playlist-hero__blank">
              <ListMusic size={32} />
            </div>
          )}
          {cover && (
            <span className="playlist-hero__tint" style={{ backgroundImage: `url("${coverUrl(cover)}")` }} />
          )}
        </div>
        <div className="playlist-hero__copy">
          <span className="eyebrow">Playlist</span>
          <h1>{playlist.name}</h1>
          <p>
            {playlistTracks.length} {playlistTracks.length === 1 ? "song" : "songs"} · {formatLongDuration(duration)}
          </p>
          <div className="detail-hero__actions">
            <button
              type="button"
              className="button button--dark"
              disabled={!playlistTracks.length}
              onClick={() => void playTrack(playlistTracks[0], queue)}
            >
              <Play size={15} fill="currentColor" /> Play
            </button>
            <button
              type="button"
              className="button button--glass"
              disabled={!playlistTracks.length}
              onClick={() => {
                const ordered = shuffle(playlistTracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> Shuffle
            </button>
            <button
              type="button"
              className="button button--glass"
              disabled={!playlistTracks.length}
              onClick={() => void enqueueMany(queue, true)}
            >
              <ListEnd size={15} /> Play next
            </button>
            <button
              type="button"
              className="button button--glass"
              disabled={!playlistTracks.length}
              onClick={() => void enqueueMany(queue, false)}
            >
              <ListPlus size={15} /> Add to queue
            </button>
            <button
              type="button"
              className="button button--glass"
              title="Add all to another playlist"
              aria-label="Add all to another playlist"
              disabled={!playlistTracks.length}
              onClick={() => setAddToPlaylistTrackIds(queue)}
            >
              <ListMusic size={15} /> Add to playlist
            </button>
            <button type="button" className="button button--glass" onClick={() => navigate({ kind: "songs" })}>
              <Plus size={15} /> Add songs
            </button>
            <button type="button" className="icon-button icon-button--ghost icon-button--sm" title="Rename playlist" onClick={rename}>
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="icon-button icon-button--ghost icon-button--sm danger-hover"
              title="Delete playlist"
              onClick={remove}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </header>

      {playlistTracks.length ? (
        <TrackTable tracks={playlistTracks} queue={queue} playlistId={playlist.id} compact />
      ) : (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <ListMusic size={28} />
          </div>
          <h2>This playlist is a blank page.</h2>
          <p>Browse your songs, open the ··· menu and choose “Add to playlist”.</p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            Find songs
          </button>
        </div>
      )}
    </motion.div>
  );
}
