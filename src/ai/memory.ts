import { documentLanguage, pickText, type TextVars } from "@/lib/text";
const lx = (en: string, zh: string, vars?: TextVars) => pickText(documentLanguage(), en, zh, vars);
import { create } from "zustand";
import type { MemorySnapshot, ProfileMemory, SongMemory } from "./types";

const EMPTY: MemorySnapshot = {
  songs: [],
  profile: [],
  stats: { songs: 0, facts: 0, profile: 0, updatedAt: 0 },
};

interface AiMemoryStore {
  snapshot: MemorySnapshot;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  saveSong: (input: {
    trackId: string;
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    summary?: string;
    facts?: string[];
    replaceFacts?: boolean;
  }) => Promise<SongMemory | null>;
  deleteSong: (trackId: string, factId?: string) => Promise<void>;
  saveProfile: (input: { id?: string; text: string; tags?: string[]; importance?: number }) => Promise<ProfileMemory | null>;
  deleteProfile: (id: string) => Promise<void>;
}

const invoke = <T,>(method: string, params?: Record<string, unknown>) => window.potato.invoke<T>(method, params);

export const useAiMemory = create<AiMemoryStore>((set, get) => ({
  snapshot: EMPTY,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const snapshot = await invoke<MemorySnapshot>("ai.memory.snapshot");
      if (snapshot?.stats) set({ snapshot });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : lx("Could not load AI memory", "无法读取 AI 记忆") });
    } finally {
      set({ loading: false });
    }
  },
  refresh: async () => {
    try {
      const snapshot = await invoke<MemorySnapshot>("ai.memory.snapshot");
      if (snapshot?.stats) set({ snapshot });
    } catch {
      // Keep the last good snapshot.
    }
  },

  saveSong: async (input) => {
    try {
      const result = await invoke<{ memory: SongMemory }>("ai.memory.song.upsert", input);
      await get().refresh();
      return result?.memory ?? null;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : lx("Could not save song memory", "无法保存歌曲记忆") });
      return null;
    }
  },
  deleteSong: async (trackId, factId) => {
    try {
      await invoke("ai.memory.song.delete", { trackId, factId });
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : lx("Could not delete song memory", "无法删除歌曲记忆") });
    }
  },
  saveProfile: async (input) => {
    try {
      const result = await invoke<{ memory: ProfileMemory }>("ai.memory.profile.upsert", input);
      await get().refresh();
      return result?.memory ?? null;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : lx("Could not save preference", "无法保存长期记忆") });
      return null;
    }
  },
  deleteProfile: async (id) => {
    try {
      await invoke("ai.memory.profile.delete", { id });
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : lx("Could not delete preference", "无法删除长期记忆") });
    }
  },
}));
