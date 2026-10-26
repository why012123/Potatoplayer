import { AnimatePresence } from "motion/react";
import { ListMusic, Plus } from "lucide-react";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";

export function AddToPlaylistDialog() {
  const trackId = useAppStore((state) => state.addToPlaylistTrackId);
  const manyIds = useAppStore((state) => state.addToPlaylistTrackIds);
  const tracks = useAppStore((state) => state.tracks);
  const playlists = useAppStore((state) => state.playlists);
  const addManyToPlaylist = useAppStore((state) => state.addManyToPlaylist);
  const createPlaylist = useAppStore((state) => state.createPlaylist);
  const setAddToPlaylistTrackId = useAppStore((state) => state.setAddToPlaylistTrackId);
  const setAddToPlaylistTrackIds = useAppStore((state) => state.setAddToPlaylistTrackIds);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const ids = manyIds.length ? manyIds : trackId ? [trackId] : [];
  const track = tracks.find((item) => item.id === (trackId ?? ids[0]));
  const many = ids.length > 1;

  const close = () => {
    setAddToPlaylistTrackId(null);
    setAddToPlaylistTrackIds([]);
  };

  const create = () => {
    if (!ids.length) return;
    close();
    openPrompt({
      title: "New playlist",
      description: many ? `Create a playlist with ${ids.length} songs.` : `Create a playlist for “${track?.title ?? "this song"}”.`,
      placeholder: "Playlist name",
      confirmLabel: "Create & add",
      onSubmit: async (name) => {
        const playlist = await createPlaylist(name);
        if (playlist) await addManyToPlaylist(playlist.id, ids);
      },
    });
  };

  return (
    <AnimatePresence>
      {ids.length > 0 && track && (
        <Modal onClose={close} className="playlist-dialog" labelledBy="add-playlist-title">
          <div className="modal__eyebrow">
            <ListMusic size={13} />
            Add to playlist
          </div>
          <h2 id="add-playlist-title">{many ? `${ids.length} selected songs` : track.title}</h2>
          <p className="modal__description">{many ? "Choose a destination playlist." : track.artist}</p>
          <div className="playlist-dialog__list">
            {playlists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                className="playlist-choice"
                onClick={() => {
                  void addManyToPlaylist(playlist.id, ids);
                  close();
                }}
              >
                <span className="playlist-choice__art">
                  <ListMusic size={17} />
                </span>
                <span>
                  <strong>{playlist.name}</strong>
                  <em>{playlist.trackIds.length} songs</em>
                </span>
                {ids.every((id) => playlist.trackIds.includes(id)) && <small>Already added</small>}
              </button>
            ))}
          </div>
          <button type="button" className="playlist-choice playlist-choice--new" onClick={create}>
            <span className="playlist-choice__art">
              <Plus size={17} />
            </span>
            <span>
              <strong>New playlist</strong>
              <em>{many ? `Create one with ${ids.length} songs` : "Create one with this song"}</em>
            </span>
          </button>
          <div className="modal__actions">
            <button type="button" className="button button--glass" onClick={close}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
