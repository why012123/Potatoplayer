import { useMemo } from "react";
import { motion } from "motion/react";
import { MoreHorizontal, ListEnd, ListMusic, ListPlus, Pencil, Play, Plus, Shuffle, Trash2 } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { TrackTable } from "@/components/TrackTable";
import { formatLongDuration } from "@/lib/format";
import { useTr } from "@/lib/i18n";
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
  const tr = useTr();

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
          <h2>{tr("This playlist is gone.", "这个歌单已不存在。")}</h2>
          <p>{tr("It may have been deleted. Create a new one from the sidebar.", "它可能已被删除。可从侧边栏新建歌单。")}</p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            {tr("Browse songs", "浏览歌曲")}
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
      title: tr("Rename playlist", "重命名歌单"),
      initialValue: playlist.name,
      confirmLabel: tr("Save name", "保存名称"),
      onSubmit: async (name) => {
        if (name.trim() && name.trim() !== playlist.name) await renamePlaylist(playlist.id, name.trim());
      },
    });
  };

  const remove = () => {
    openPrompt({
      title: tr("Delete “{name}”?", "删除“{name}”？", { name: playlist.name }),
      description: tr(
        "The playlist will be removed. Your music files are never touched.",
        "歌单将被删除，你的音乐文件不会受到任何影响。",
      ),
      confirmLabel: tr("Delete playlist", "删除歌单"),
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
            <div className={`playlist-mosaic playlist-mosaic--${Math.min(playlistTracks.length, 4)}`}>
              {playlistTracks.slice(0, 4).map((track) => (
                <Cover key={track.id} path={track.coverPath} seed={track.id} label={track.title} radius={6} />
              ))}
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
          <span className="eyebrow">{tr("Playlist", "歌单")}</span>
          <h1>{playlist.name}</h1>
          <p>
            {tr(
              playlistTracks.length === 1 ? "{count} song" : "{count} songs",
              "{count} 首歌曲",
              { count: playlistTracks.length },
            )}
            {" · "}
            {formatLongDuration(duration)}
          </p>
          <div className="playlist-actions">
            <button
              type="button"
              className="button button--dark"
              disabled={!playlistTracks.length}
              onClick={() => void playTrack(playlistTracks[0], queue)}
            >
              <Play size={15} fill="currentColor" /> {tr("Play", "播放")}
            </button>
            <button
              type="button"
              className="button button--glass"
              title={tr("Shuffle", "随机播放")}
              aria-label={tr("Shuffle", "随机播放")}
              disabled={!playlistTracks.length}
              onClick={() => {
                const ordered = shuffle(playlistTracks);
                void playTrack(ordered[0], ordered.map((track) => track.id));
              }}
            >
              <Shuffle size={15} /> {tr("Shuffle", "随机播放")}
            </button>
            <button type="button" className="button button--glass" onClick={() => navigate({ kind: "songs" })}>
              <Plus size={15} /> {tr("Add songs", "添加歌曲")}
            </button>
            <details className="playlist-more" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
              <summary aria-label={tr("More playlist actions", "更多歌单操作")} title={tr("More", "更多")}><MoreHorizontal size={20} /></summary>
              <div className="playlist-more__menu" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }}>
                <button disabled={!queue.length} onClick={() => void enqueueMany(queue, true)}><ListEnd size={16} />{tr("Play next", "下一首播放")}</button>
                <button disabled={!queue.length} onClick={() => void enqueueMany(queue, false)}><ListPlus size={16} />{tr("Add to queue", "添加到播放队列")}</button>
                <button disabled={!queue.length} onClick={() => setAddToPlaylistTrackIds(queue)}><ListMusic size={16} />{tr("Add to another playlist", "添加到其他歌单")}</button>
                <button onClick={rename}><Pencil size={16} />{tr("Rename playlist", "重命名歌单")}</button>
                <button className="danger-hover" onClick={remove}><Trash2 size={16} />{tr("Delete playlist", "删除歌单")}</button>
              </div>
            </details>
          </div>
        </div>
      </header>

      {playlistTracks.length ? (
        <>
          <p className="playlist-sort-hint">{tr("Drag the handle to reorder · Alt + ↑ / ↓ also works", "拖动歌曲左侧手柄调整顺序 · 也可聚焦手柄后按 Alt + ↑ / ↓")}</p>
          <TrackTable tracks={playlistTracks} queue={queue} playlistId={playlist.id} compact />
        </>
      ) : (
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain">
            <ListMusic size={28} />
          </div>
          <h2>{tr("This playlist is a blank page.", "这个歌单还是一张白纸。")}</h2>
          <p>
            {tr(
              "Browse your songs, open the ··· menu and choose “Add to playlist”.",
              "浏览你的歌曲，打开 ··· 菜单并选择“添加到歌单”。",
            )}
          </p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            {tr("Find songs", "查找歌曲")}
          </button>
        </div>
      )}
    </motion.div>
  );
}
