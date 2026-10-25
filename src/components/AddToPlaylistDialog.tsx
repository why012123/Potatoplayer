import { AnimatePresence } from "motion/react";
import { ListMusic, Plus } from "lucide-react";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";

export function AddToPlaylistDialog() {
  const trackId = useAppStore((state) => state.addToPlaylistTrackId);
  const tracks = useAppStore((state) => state.tracks);
  const playlists = useAppStore((state) => state.playlists);
  const addToPlaylist = useAppStore((state) => state.addToPlaylist);
  const createPlaylist = useAppStore((state) => state.createPlaylist);
  const setAddToPlaylistTrackId = useAppStore((state) => state.setAddToPlaylistTrackId);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const track = tracks.find((item) => item.id === trackId);

  const close = () => setAddToPlaylistTrackId(null);

  const create = () => {
    if (!trackId) return;
    close();
    openPrompt({
      title: "New playlist",
      description: `Create a playlist for “${track?.title ?? "this song"}”.`,
      placeholder: "Playlist name",
      confirmLabel: "Create & add",
      onSubmit: async (name) => {
        await createPlaylist(name, trackId);
      },
    });
  };

  return (
    <AnimatePresence>
      {trackId && track && (
        <Modal onClose={close} className="playlist-dialog" labelledBy="add-playlist-title">
          <div className="modal__eyebrow">
            <ListMusic size={13} />
            Add to playlist
          </div>
          <h2 id="add-playlist-title">{track.title}</h2>
          <p className="modal__description">{track.artist}</p>
          <div className="playlist-dialog__list">
            {playlists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                className="playlist-choice"
                onClick={() => {
                  void addToPlaylist(playlist.id, trackId);
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
                {playlist.trackIds.includes(trackId) && <small>Already added</small>}
              </button>
            ))}
          </div>
          <button type="button" className="playlist-choice playlist-choice--new" onClick={create}>
            <span className="playlist-choice__art">
              <Plus size={17} />
            </span>
            <span>
              <strong>New playlist</strong>
              <em>Create one with this song</em>
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
