import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import type { Track } from "@/types";
import {
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

function targetPosition(remote: TogetherPlayback, clockOffset: number): number {
  if (!remote.playing) return Math.max(0, remote.position);
  const serverNow = Date.now() + clockOffset;
  return Math.max(0, remote.position + (serverNow - remote.startedAt) / 1000);
}

export function TogetherSync() {
  const playback = useAppStore((state) => state.playback);
  const tracks = useAppStore((state) => state.tracks);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const seek = useAppStore((state) => state.seek);

  const status = useTogether((state) => state.status);
  const selfId = useTogether((state) => state.selfId);
  const hostId = useTogether((state) => state.hostId);
  const remote = useTogether((state) => state.state);
  const clockOffset = useTogether((state) => state.clockOffset);
  const missingKey = useTogether((state) => state.missingKey);
  const publishPlayback = useTogether((state) => state.publishPlayback);
  const setMissingKey = useTogether.setState;

  const isHost = Boolean(selfId && hostId === selfId);
  const lastPublish = useRef({ key: "", playing: false, position: 0, at: 0 });
  const applyLock = useRef(0);

  useEffect(() => {
    if (!isHost || status !== "connected" || !playback) return;
    const track = tracks.find((item) => item.id === playback.trackId);
    if (!track) return;

    const now = Date.now();
    const key = togetherTrackKey(track);
    const last = lastPublish.current;
    const expected = last.position + (last.playing ? (now - last.at) / 1000 : 0);
    const jumped = Math.abs(playback.time - expected) > 0.75;
    const changed = key !== last.key || playback.playing !== last.playing;
    if (!changed && !jumped && now - last.at < 1200) return;

    lastPublish.current = {
      key,
      playing: playback.playing,
      position: playback.time,
      at: now,
    };
    publishPlayback({
      track: remoteMetadata(track),
      playing: playback.playing,
      position: playback.time,
    });
  }, [playback, tracks, isHost, status, publishPlayback]);

  useEffect(() => {
    if (isHost || status !== "connected" || !remote?.track) return;
    const now = Date.now();
    if (applyLock.current > now) return;

    const track = findLocalTrack(tracks, remote.track);
    if (!track) {
      if (missingKey !== remote.track.key) setMissingKey({ missingKey: remote.track.key });
      return;
    }
    if (missingKey) setMissingKey({ missingKey: null });

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
    missingKey,
    playTrack,
    togglePlay,
    seek,
    setMissingKey,
  ]);

  return null;
}
