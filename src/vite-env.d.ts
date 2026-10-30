/// <reference types="vite/client" />

import type { Bootstrap, LyricsPayload, PlaybackState } from "./types";

export interface BackendEvent {
  event: string;
  data: unknown;
}

export interface Palette {
  primary: string;
  secondary: string;
}

export interface PotatoAPI {
  invoke<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  onEvent(listener: (event: BackendEvent) => void): () => void;
  onWindowFocus(listener: (active: boolean) => void): () => void;
  onMediaControl(listener: (action: string) => void): () => void;
  updateMediaState(state: {
    active: boolean;
    title?: string;
    artist?: string;
    album?: string;
    coverPath?: string | null;
    duration?: number;
    position?: number;
    playing?: boolean;
  }): void;
  onMediaShortcutStatus(
    listener: (status: Partial<Record<"toggle" | "next" | "previous" | "stop", boolean>> | null) => void,
  ): () => void;
  pickFolder(): Promise<string | null>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<boolean>;
  coverPalette(path: string): Promise<Palette | null>;
  openUltra(): Promise<void>;
  rendererReady(): void;
  platform: string;
}

declare global {
  interface Window {
    potato: PotatoAPI;
    __POTATO_BOOTSTRAP__?: Bootstrap;
    __POTATO_LYRICS__?: LyricsPayload;
    __POTATO_PLAYBACK__?: PlaybackState;
  }
}
