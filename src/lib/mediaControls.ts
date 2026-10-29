import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { coverUrl } from "@/lib/covers";

type MediaAction = "toggle" | "play" | "pause" | "next" | "previous" | "stop" | "seek";

/**
 * Connects the OS media keys and the browser MediaSession to the real player.
 *
 * The Java/VLC backend is not an HTML media element, so the OS sees the
 * Electron window through global media shortcuts (registered in electron/main)
 * and through MediaSession metadata/actions. Both paths funnel into the same
 * debounced dispatch so a single headset button cannot toggle playback twice.
 */
export function useMediaControls() {
  const last = useRef<{ action: string; at: number }>({ action: "", at: 0 });

  const dispatch = useCallback((action: string, seconds?: number) => {
    const now = Date.now();
    if (action === last.current.action && now - last.current.at < 160) return;
    last.current = { action, at: now };
    const state = useAppStore.getState();
    const playing = Boolean(state.playback?.playing);
    switch (action) {
      case "toggle":
        void state.togglePlay();
        break;
      case "play":
        if (!playing) void state.togglePlay();
        break;
      case "pause":
      case "stop":
        if (playing) void state.togglePlay();
        break;
      case "next":
        void state.next();
        break;
      case "previous":
        void state.previous();
        break;
      case "seek":
        if (typeof seconds === "number" && Number.isFinite(seconds)) state.seek(seconds);
        break;
      default:
        break;
    }
  }, []);

  // System-wide media keys registered by Electron main. This is what makes
  // headphone buttons work while the window is in the background.
  useEffect(() => {
    if (!window.potato?.onMediaControl) return;
    return window.potato.onMediaControl((action) => {
      if (action.startsWith("seek:")) {
        const seconds = Number(action.slice(5));
        if (Number.isFinite(seconds)) dispatch("seek", seconds);
        return;
      }
      dispatch(action);
    });
  }, [dispatch]);

  // MediaSession covers macOS Now Playing / transport controls where the OS
  // routes a media command instead of a raw key event.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some actions are unavailable in older Chromium builds.
      }
    };
    set("play", () => dispatch("play"));
    set("pause", () => dispatch("pause"));
    set("stop", () => dispatch("stop"));
    set("nexttrack", () => dispatch("next"));
    set("previoustrack", () => dispatch("previous"));
    set("seekbackward", (details) => {
      const current = useAppStore.getState().playback?.time ?? 0;
      dispatch("seek", Math.max(0, current - (details.seekOffset ?? 10)));
    });
    set("seekforward", (details) => {
      const state = useAppStore.getState();
      const duration = state.playback?.duration ?? 0;
      const current = state.playback?.time ?? 0;
      const target = current + (details.seekOffset ?? 10);
      dispatch("seek", duration > 0 ? Math.min(duration, target) : target);
    });
    set("seekto", (details) => {
      if (typeof details.seekTime === "number") dispatch("seek", details.seekTime);
    });
    return () => {
      for (const action of [
        "play",
        "pause",
        "stop",
        "nexttrack",
        "previoustrack",
        "seekbackward",
        "seekforward",
        "seekto",
      ] as MediaSessionAction[]) {
        set(action, null);
      }
    };
  }, [dispatch]);

  const tracks = useAppStore((state) => state.tracks);
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const currentId = playback?.trackId ?? previewTrackId;
  const track = tracks.find((item) => item.id === currentId);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }
    const base = {
      title: track.title,
      artist: track.artist,
      album: track.album || "",
    };
    try {
      const artworkSrc = track.coverPath ? coverUrl(track.coverPath) : null;
      const artwork = artworkSrc
        ? [{ src: artworkSrc, sizes: "512x512", type: "image/jpeg" }]
        : [];
      navigator.mediaSession.metadata = new MediaMetadata({ ...base, artwork });
    } catch {
      try {
        navigator.mediaSession.metadata = new MediaMetadata(base);
      } catch {
        navigator.mediaSession.metadata = null;
      }
    }
    navigator.mediaSession.playbackState = playback?.playing ? "playing" : "paused";
    window.potato?.updateMediaState?.({
      active: true,
      title: track.title,
      artist: track.artist,
      album: track.album || "",
      coverPath: track.coverPath,
      duration: playback?.duration || track.duration || 0,
      position: playback?.time ?? 0,
      playing: Boolean(playback?.playing),
    });
  }, [track?.id, track?.title, track?.artist, track?.album, track?.coverPath, track?.duration, playback?.playing]);

  useEffect(() => {
    if (!track) {
      window.potato?.updateMediaState?.({ active: false });
    }
  }, [track?.id]);

  // Keep the native Now Playing elapsed time in sync when the user seeks. The
  // OS advances the progress itself between these sparse updates.
  const lastPositionSent = useRef(0);
  useEffect(() => {
    if (!track || !window.potato?.updateMediaState) return;
    const now = Date.now();
    if (now - lastPositionSent.current < 900) return;
    lastPositionSent.current = now;
    window.potato.updateMediaState({
      active: true,
      title: track.title,
      artist: track.artist,
      album: track.album || "",
      coverPath: track.coverPath,
      duration: playback?.duration || track.duration || 0,
      position: playback?.time ?? 0,
      playing: Boolean(playback?.playing),
    });
  }, [playback?.time, track?.id]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const duration = playback?.duration || track?.duration || 0;
    if (duration <= 0) return;
    const position = Math.max(0, Math.min(playback?.time ?? 0, duration));
    try {
      navigator.mediaSession.setPositionState({ duration, position, playbackRate: 1 });
    } catch {
      // Position updates are best-effort and must never interrupt playback.
    }
  }, [playback?.time, playback?.duration, track?.duration]);

  useEffect(() => {
    if (!window.potato?.onMediaShortcutStatus) return;
    let notified = false;
    return window.potato.onMediaShortcutStatus((status) => {
      if (notified || !status || status.toggle !== false) return;
      if (window.potato.platform !== "darwin") return;
      notified = true;
      const state = useAppStore.getState();
      const zh = state.appearance.language === "zh";
      state.pushToast(
        zh ? "系统耳机按键未完全启用" : "Headphone media keys are limited",
        zh
          ? "在系统设置 → 隐私与安全性 → 辅助功能中允许 Potatoplayer，然后重新打开。"
          : "Allow Potatoplayer in System Settings → Privacy & Security → Accessibility, then relaunch.",
        "error",
      );
    });
  }, []);
}
