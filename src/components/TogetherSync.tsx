import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import type { Track } from "@/types";
import {
  nextTransferNonce,
  togetherFileUrl,
  useTogether,
  type TogetherPlayback,
  type TogetherTrack,
} from "@/lib/together";

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function togetherTrackKey(track: Track): string {
  if (track.neteaseId) return `netease:${track.neteaseId}`;
  return `meta:${normalize(track.title)}|${normalize(track.artist)}|${Math.round(track.duration)}`;
}

function remoteMetadata(track: Track): TogetherTrack {
  return {
    key: togetherTrackKey(track),
    neteaseId: track.neteaseId ?? "",
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
  };
}

function tempTrackId(key: string): string {
  return `together:${key}`;
}

function tempKey(track: Track | null): string | null {
  if (!track) return null;
  return track.id.startsWith("together:") ? track.id.slice("together:".length) : null;
}

function tempTrackFrom(remote: TogetherTrack, path: string, size: number): Track {
  return {
    id: tempTrackId(remote.key),
    path,
    title: remote.title,
    artist: remote.artist,
    album: remote.album,
    genre: "",
    block: "",
    note: "",
    coverPath: null,
    duration: remote.duration,
    year: 0,
    trackNo: 0,
    playCount: 0,
    rating: 0,
    neteaseId: remote.neteaseId || undefined,
    addedAt: Date.now(),
    fileSize: size,
  };
}

function findLocalTrack(tracks: Track[], remote: TogetherTrack): Track | undefined {
  if (remote.neteaseId) {
    const byId = tracks.find((track) => track.neteaseId === remote.neteaseId);
    if (byId) return byId;
  }
  const title = normalize(remote.title);
  const artist = normalize(remote.artist);
  const byName = tracks.find(
    (track) => normalize(track.title) === title && (!artist || normalize(track.artist) === artist),
  );
  if (byName) return byName;
  if (remote.duration > 0) {
    return tracks.find(
      (track) =>
        normalize(track.title) === title && Math.abs(track.duration - remote.duration) < 3,
    );
  }
  return undefined;
}

function findAnyTrack(
  tracks: Track[],
  tempTrack: Track | null,
  remote: TogetherTrack,
): Track | undefined {
  const local = findLocalTrack(tracks, remote);
  if (local) return local;
  if (tempTrack && tempTrack.id === tempTrackId(remote.key)) return tempTrack;
  return undefined;
}

function targetPosition(remote: TogetherPlayback, clockOffset: number): number {
  if (!remote.playing) return Math.max(0, remote.position);
  const serverNow = Date.now() + clockOffset;
  return Math.max(0, remote.position + (serverNow - remote.startedAt) / 1000);
}

function fileUrl(serverUrl: string, roomId: string, key: string): string {
  return togetherFileUrl(serverUrl, roomId, key);
}

function canceledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

function failTransfer(key: string, nonce: number, error: unknown) {
  const state = useTogether.getState();
  const transfer = state.transfers[key];
  if (!transfer || transfer.nonce !== nonce) return;
  const message = error instanceof Error ? error.message : String(error);
  const canceled = transfer.state === "canceled" || canceledError(error);
  state.setTransfer(key, {
    ...transfer,
    state: canceled ? "canceled" : "error",
    message: canceled ? "已取消" : message,
  });
}

function finishTransfer(key: string, nonce: number, message: string, loaded?: number, total?: number) {
  const state = useTogether.getState();
  const transfer = state.transfers[key];
  if (!transfer || transfer.nonce !== nonce || transfer.state !== "working") return;
  state.setTransfer(key, {
    ...transfer,
    state: "ready",
    message,
    loaded: loaded ?? transfer.loaded,
    total: total ?? transfer.total,
  });
  // Leave the completed row visible long enough to read, then let the room
  // panel go back to just members and chat.
  window.setTimeout(() => {
    const current = useTogether.getState().transfers[key];
    if (current?.nonce === nonce && current.state === "ready") {
      useTogether.getState().setTransfer(key, null);
    }
  }, 6000);
}

export function TogetherSync() {
  const playback = useAppStore((state) => state.playback);
  const tracks = useAppStore((state) => state.tracks);
  const tempTrack = useAppStore((state) => state.tempTrack);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const seek = useAppStore((state) => state.seek);

  const status = useTogether((state) => state.status);
  const selfId = useTogether((state) => state.selfId);
  const hostId = useTogether((state) => state.hostId);
  const remote = useTogether((state) => state.state);
  const clockOffset = useTogether((state) => state.clockOffset);
  const missingKey = useTogether((state) => state.missingKey);
  const selfToken = useTogether((state) => state.selfToken);
  const serverUrl = useTogether((state) => state.serverUrl);
  const roomId = useTogether((state) => state.roomId);
  const files = useTogether((state) => state.files);
  const needs = useTogether((state) => state.needs);
  const transfers = useTogether((state) => state.transfers);
  const tempPlayingKey = useTogether((state) => state.tempPlayingKey);
  const publishPlayback = useTogether((state) => state.publishPlayback);
  const requestFile = useTogether((state) => state.requestFile);
  const setTransfer = useTogether((state) => state.setTransfer);
  const setTempPlayingKey = useTogether((state) => state.setTempPlayingKey);
  const setMissingKey = useTogether.setState;

  const isHost = Boolean(selfId && hostId === selfId);
  const lastPublish = useRef({ key: "", playing: false, position: 0, at: 0 });
  const applyLock = useRef(0);

  useEffect(() => {
    if (!isHost || status !== "connected" || !playback) return;

    let remoteTrack: TogetherTrack | null = null;
    if (tempTrack && playback.trackId === tempTrack.id) {
      const key = tempKey(tempTrack);
      if (key) {
        remoteTrack = {
          key,
          neteaseId: tempTrack.neteaseId ?? "",
          title: tempTrack.title,
          artist: tempTrack.artist,
          album: tempTrack.album,
          duration: tempTrack.duration,
        };
      }
    } else {
      const track = tracks.find((item) => item.id === playback.trackId);
      if (track) remoteTrack = remoteMetadata(track);
    }
    if (!remoteTrack) return;

    const now = Date.now();
    const last = lastPublish.current;
    const expected = last.position + (last.playing ? (now - last.at) / 1000 : 0);
    const jumped = Math.abs(playback.time - expected) > 0.75;
    const changed = remoteTrack.key !== last.key || playback.playing !== last.playing;
    if (!changed && !jumped && now - last.at < 1200) return;

    lastPublish.current = {
      key: remoteTrack.key,
      playing: playback.playing,
      position: playback.time,
      at: now,
    };
    publishPlayback({
      track: remoteTrack,
      playing: playback.playing,
      position: playback.time,
    });
  }, [playback, tracks, tempTrack, isHost, status, publishPlayback]);

  // Any member that already owns a requested track uploads it to the room.
  // A room-cached temporary track counts as owned: the new host must be able
  // to re-share the song that is already playing after a host handover.
  useEffect(() => {
    if (status !== "connected" || !selfToken || !roomId || typeof window.potato?.togetherUpload !== "function") return;
    for (const need of needs) {
      if (!need.track) continue;
      if (files.some((file) => file.key === need.key)) continue;
      if (transfers[need.key]) continue;
      const track = findAnyTrack(tracks, tempTrack, need.track);
      if (!track) continue;
      const nonce = nextTransferNonce();
      setTransfer(need.key, {
        key: need.key,
        direction: "up",
        state: "working",
        message: "正在上传…",
        title: need.track.title,
        nonce,
        loaded: 0,
        total: track.fileSize || undefined,
      });
      void window.potato
        .togetherUpload({
          id: need.key,
          url: fileUrl(serverUrl, roomId, need.key),
          token: selfToken,
          path: track.path,
          fileName: track.path.split(/[\\/]/).pop(),
        })
        .then(() => finishTransfer(need.key, nonce, "已上传", track.fileSize, track.fileSize))
        .catch((error: unknown) => failTransfer(need.key, nonce, error));
    }
  }, [
    needs,
    files,
    transfers,
    tracks,
    tempTrack,
    status,
    selfToken,
    roomId,
    serverUrl,
    setTransfer,
  ]);

  // A guest without the song asks the room for it, then downloads the relay
  // copy and plays it through the backend's temporary-track path.
  useEffect(() => {
    if (isHost || status !== "connected" || !remote?.track) return;
    const remoteTrack = remote.track;
    const key = remoteTrack.key;
    const id = tempTrackId(key);
    if (playback?.trackId === id) {
      if (missingKey) setMissingKey({ missingKey: null });
      return;
    }
    const track = findLocalTrack(tracks, remoteTrack);
    if (track) {
      if (missingKey) setMissingKey({ missingKey: null });
      if (tempPlayingKey) setTempPlayingKey(null);
      return;
    }
    if (missingKey !== key) setMissingKey({ missingKey: key });

    const file = files.find((item) => item.key === key);
    if (!file) {
      if (!needs.some((need) => need.key === key)) requestFile(key, remoteTrack);
      return;
    }
    if (transfers[key]) return;
    if (!selfToken || !roomId || typeof window.potato?.togetherDownload !== "function") return;

    const nonce = nextTransferNonce();
    setTransfer(key, {
      key,
      direction: "down",
      state: "working",
      message: "正在接收…",
      title: remoteTrack.title,
      nonce,
      loaded: 0,
      total: file.size,
    });
    void window.potato
      .togetherDownload({
        id: key,
        url: fileUrl(serverUrl, roomId, key),
        token: selfToken,
        sha256: file.sha256,
        ext: file.ext,
      })
      .then(async (downloaded) => {
        const current = useTogether.getState();
        const transfer = current.transfers[key];
        if (!transfer || transfer.nonce !== nonce || transfer.state !== "working") return;
        const currentRemote = current.state;
        if (!currentRemote?.track || currentRemote.track.key !== key) {
          finishTransfer(key, nonce, "已缓存", downloaded.size, downloaded.size);
          return;
        }
        const target = targetPosition(currentRemote, current.clockOffset);
        const track = tempTrackFrom(currentRemote.track, downloaded.path, downloaded.size);
        const ok = await useAppStore.getState().playTempFile(track, target);
        if (!ok) throw new Error("无法播放房间里的歌曲");
        if (!currentRemote.playing) {
          await new Promise((resolve) => window.setTimeout(resolve, 160));
          await useAppStore.getState().togglePlay();
        }
        if (useTogether.getState().transfers[key]?.nonce !== nonce) return;
        setTempPlayingKey(key);
        setTransfer(key, {
          key,
          direction: "down",
          state: "ready",
          message: "已补齐",
          title: currentRemote.track.title,
          nonce,
          loaded: downloaded.size,
          total: downloaded.size,
        });
        setMissingKey({ missingKey: null });
        window.setTimeout(() => {
          const latest = useTogether.getState().transfers[key];
          if (latest?.nonce === nonce && latest.state === "ready") {
            useTogether.getState().setTransfer(key, null);
          }
        }, 6000);
      })
      .catch((error: unknown) => failTransfer(key, nonce, error));
  }, [
    missingKey,
    files,
    needs,
    transfers,
    isHost,
    status,
    remote,
    selfToken,
    roomId,
    serverUrl,
    tracks,
    playback?.trackId,
    tempPlayingKey,
    requestFile,
    setTransfer,
    setTempPlayingKey,
    setMissingKey,
  ]);

  // Keep the downloaded temporary track aligned with the host clock.
  useEffect(() => {
    if (isHost || status !== "connected" || !remote?.track) return;
    const id = tempTrackId(remote.track.key);
    if (playback?.trackId !== id) return;
    const now = Date.now();
    if (applyLock.current > now) return;
    const target = targetPosition(remote, clockOffset);
    if (!remote.playing && playback.playing) {
      applyLock.current = now + 700;
      void togglePlay();
      return;
    }
    if (remote.playing && !playback.playing) {
      applyLock.current = now + 700;
      void togglePlay();
      return;
    }
    if (Math.abs(playback.time - target) > 1.2) {
      applyLock.current = now + 500;
      seek(target);
    }
  }, [remote, playback, clockOffset, isHost, status, togglePlay, seek]);

  useEffect(() => {
    if (isHost || status !== "connected" || !remote?.track) return;
    const now = Date.now();
    if (applyLock.current > now) return;

    const track = findLocalTrack(tracks, remote.track);
    if (!track) return;

    const target = targetPosition(remote, clockOffset);

    if (playback?.trackId !== track.id) {
      applyLock.current = now + 1400;
      void playTrack(track, [track.id], target);
      return;
    }

    if (remote.playing && !playback.playing) {
      applyLock.current = now + 900;
      void playTrack(track, [track.id], target);
      return;
    }

    if (!remote.playing && playback.playing) {
      applyLock.current = now + 900;
      void togglePlay().then(() => seek(target));
      return;
    }

    if (Math.abs(playback.time - target) > 1.2) {
      applyLock.current = now + 500;
      seek(target);
    }
  }, [
    remote,
    tracks,
    playback,
    clockOffset,
    isHost,
    status,
    playTrack,
    togglePlay,
    seek,
  ]);

  return null;
}
