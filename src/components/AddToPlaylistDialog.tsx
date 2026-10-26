import { AnimatePresence } from "motion/react";
import { ListMusic, Plus } from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { Modal } from "@/components/Modal";

export function AddToPlaylistDialog() {
  const tr = useTr();
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
      title: tr("New playlist", "新建歌单"),
      description: many
        ? tr("Create a playlist with {count} songs.", "创建一个包含 {count} 首歌曲的歌单。", { count: ids.length })
        : tr("Create a playlist for “{title}”.", "为“{title}”创建歌单。", {
            title: track?.title ?? tr("this song", "这首歌曲"),
          }),
      placeholder: tr("Playlist name", "歌单名称"),
      confirmLabel: tr("Create & add", "创建并添加"),
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
            {tr("Add to playlist", "添加到歌单")}
          </div>
          <h2 id="add-playlist-title">
            {many
              ? tr("{count} selected songs", "已选择 {count} 首歌曲", { count: ids.length })
              : track.title}
          </h2>
          <p className="modal__description">
            {many ? tr("Choose a destination playlist.", "选择目标歌单。") : track.artist}
          </p>
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
                  <em>{tr("{count} songs", "{count} 首歌曲", { count: playlist.trackIds.length })}</em>
                </span>
                {ids.every((id) => playlist.trackIds.includes(id)) && (
                  <small>{tr("Already added", "已添加")}</small>
                )}
              </button>
            ))}
          </div>
          <button type="button" className="playlist-choice playlist-choice--new" onClick={create}>
            <span className="playlist-choice__art">
              <Plus size={17} />
            </span>
            <span>
              <strong>{tr("New playlist", "新建歌单")}</strong>
              <em>
                {many
                  ? tr("Create one with {count} songs", "创建一个包含 {count} 首歌曲的歌单", {
                      count: ids.length,
                    })
                  : tr("Create one with this song", "用这首歌曲创建歌单")}
              </em>
            </span>
          </button>
          <div className="modal__actions">
            <button type="button" className="button button--dark" onClick={close}>
              {tr("Done", "完成")}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
