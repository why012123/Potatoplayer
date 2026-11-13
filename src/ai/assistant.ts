import { create } from "zustand";
import { matchSongs, normalizeSongText as normalize, songQuery } from "../../electron/song-match.mjs";
import type { Track } from "@/types";
import { useAppStore } from "@/store";
import type {
  AssistantContext,
  AssistantIntent,
  AssistantResult,
  AssistantTurn,
  ChatResponse,
  ConnectionStatus,
  Conversation,
  ConversationSummary,
  ConversationTurn,
} from "./types";

export type {
  AiSource,
  AssistantContext,
  AssistantIntent,
  AssistantResult,
  AssistantTurn,
  ChatResponse,
  ConnectionStatus,
  Conversation,
  ConversationSummary,
  ConversationTurn,
  MemoryFact,
  MemorySnapshot,
  ProfileMemory,
  SongMemory,
} from "./types";

/** Providers propose songs only. Playback and library writes stay in UI actions.
 * A future remote provider should call an Electron IPC backend, never expose keys here. */
export interface MusicAssistantProvider {
  id: string;
  label: string;
  suggest(prompt: string, context: AssistantContext, signal: AbortSignal): Promise<AssistantResult>;
}
const searchable = (track: Track) => normalize([track.title, track.artist, track.album, track.genre, track.block, track.note, ...(track.aliases ?? [])].join(" "));

export const localProvider: MusicAssistantProvider = {
  id: "local",
  label: "本地模式 · 未连接模型",
  async suggest(prompt, context, signal) {
    signal.throwIfAborted();
    const { tracks, favorites, currentTrackId } = context;
    const intent: AssistantIntent = /相似|类似|像这首|similar/i.test(prompt) ? "similar"
      : /歌单|推荐|playlist|recommend/i.test(prompt) ? "playlist"
      : /播放|放一首|放点|play/i.test(prompt) ? "play" : "search";
    const current = tracks.find((track) => track.id === currentTrackId);
    const rank = (track: Track) => track.rating * 10 + (favorites.includes(track.id) ? 15 : 0) + Math.min(track.playCount, 20);
    let selected: Track[] = [];
    let explanation = "按歌名、歌手、专辑与已有标签匹配本地曲库。";
    let title = intent === "play" ? "准备好播放了" : "在你的曲库里找到";
    if (!tracks.length) return { intent, title: "从你的第一首歌开始", explanation: "曲库还是空的。先选择音乐文件夹，我就能帮你查找歌曲和整理歌单。", trackIds: [] };
    const literal = matchSongs(tracks, prompt).filter((match) => match.score >= 95);
    const query = songQuery(prompt);
    let matches = literal.length ? literal : query ? matchSongs(tracks, query) : [];
    // Only interpret “歌手的歌名” after a literal lookup, preserving titles containing 的.
    if (!matches.length) {
      const artist = tracks.map((track) => track.artist).filter(Boolean).sort((a,b) => b.length-a.length)
        .find((name) => query.startsWith(`${name}的`) || query.startsWith(`${name} 的`));
      if (artist) matches = matchSongs(tracks, query.slice(artist.length).replace(/^\s*的\s*/, ""), { artist });
    }
    if (matches.length) {
      selected = matches.map((match) => match.track);
      const exact = matches.filter((match) => match.score >= 95);
      if (exact.length) selected = exact.map((match) => match.track);
      explanation = exact.length > 1
        ? "找到多个同名候选，请核对歌手、专辑和版本后选择。"
        : "优先匹配歌名与歌手，再匹配专辑或标签；评分仅用于同等匹配的排序。";
    } else if (intent === "similar") {
      if (!current) return { intent, title: "先选一首喜欢的歌", explanation: "播放或选择一首歌曲后，我会按歌手、流派和区块查找相近的收藏。", trackIds: [] };
      selected = tracks.filter((t) => t.id !== current.id && ((current.artist && t.artist === current.artist) || (current.genre && t.genre === current.genre) || (current.block && t.block === current.block)))
        .sort((a, b) => rank(b) - rank(a));
      title = `从《${current.title}》继续听`;
      explanation = "依据相同歌手、流派或区块匹配，尚未分析音频或使用 AI 模型。";
    } else if (/^(?:整理|推荐|播放)?(?:我)?(?:的)?(?:收藏|喜欢的歌|favorites)(?:的歌曲)?(?:歌单)?$/i.test(query)) {
      selected = tracks.filter((t) => favorites.includes(t.id)).sort((a, b) => rank(b) - rank(a));
      title = "把喜欢的歌，再听一遍";
      explanation = "这些歌曲来自你的收藏，按评分与播放次数排序。";
    } else if (intent === "playlist" && /^(?:随便|日常推荐|今日推荐|一份|一个|一些|常听|高分|playlist)?$/i.test(query)) {
      selected = [...tracks].sort((a, b) => rank(b) - rank(a));
      title = "为熟悉的旋律，留一点时间";
      explanation = "依据本地评分、收藏和播放次数整理，未使用模型推断偏好。";
    } else {
      const moods: Record<string, string[]> = { "专注": ["纯音乐", "instrumental", "ambient", "piano", "钢琴", "轻音乐"], "学习": ["纯音乐", "instrumental", "piano", "轻音乐"], "夜晚": ["夜", "night", "ambient"], "放松": ["轻音乐", "acoustic", "ambient", "治愈"], "动漫": ["anime", "acg", "动画", "动漫"] };
      const mood = Object.keys(moods).find((key) => new RegExp(`^(?:适合)?${key}(?:时|的时候)?$`).test(query));
      selected = tracks.filter((track) => {
        const haystack = searchable(track);
        return Boolean(mood && moods[mood].some((key) => haystack.includes(normalize(key))));
      }).sort((a, b) => rank(b) - rank(a));
      if (mood) explanation = `按「${moods[mood].join(" / ")}」等已有文字标签筛选；实际听感由你决定。`;
    }
    if (!selected.length) return { intent, title: "暂时没有匹配的歌曲", explanation: "本地模式仅能匹配已有信息。试试具体歌名、歌手或标签，也可以去在线发现找歌。", trackIds: [] };
    return { intent, title, explanation, trackIds: selected.slice(0, intent === "playlist" ? 12 : 6).map((t) => t.id) };
  },
};

let provider: MusicAssistantProvider = localProvider;
let controller: AbortController | null = null;
let requestId = 0;

interface AssistantStore {
  turns: AssistantTurn[];
  busy: boolean;
  providerLabel: string;
  connected: boolean;
  conversationId: string | null;
  conversations: ConversationSummary[];
  conversationsLoading: boolean;
  ask: (prompt: string) => Promise<void>;
  startNew: () => void;
  clear: () => void;
  cancel: () => void;
  loadConversation: (id: string) => Promise<Conversation | null>;
  refreshConversations: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string, pinned: boolean) => Promise<void>;
}

const invoke = <T,>(method: string, params?: Record<string, unknown>) => window.potato.invoke<T>(method, params);

function conversationTitle(prompt: string) {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 48);
  return title || "新对话";
}

function toTurn(turn: ConversationTurn): AssistantTurn {
  return {
    id: turn.id,
    prompt: turn.prompt,
    createdAt: turn.createdAt,
    result: turn.result,
    error: turn.error,
    activity: turn.activity,
    provider: turn.provider,
    contextTrackId: turn.contextTrackId,
  };
}

export const useAssistant = create<AssistantStore>((set, get) => ({
  turns: [],
  busy: false,
  providerLabel: localProvider.label,
  connected: false,
  conversationId: null,
  conversations: [],
  conversationsLoading: false,

  ask: async (raw) => {
    const prompt = raw.trim().slice(0, 4000);
    if (!prompt || get().busy) return;
    const id = String(++requestId);
    const pending = new AbortController();
    controller = pending;
    const state = useAppStore.getState();
    if (state.viewHistory[state.viewIndex]?.kind !== "ai") state.setRightPanelMode("ai");
    set({
      busy: true,
      turns: [...get().turns.slice(-39), { id, prompt, createdAt: Date.now() }],
    });
    let conversationId = get().conversationId;
    if (!conversationId) {
      try {
        const created = await invoke<ConversationSummary>("ai.conversations.create", { title: conversationTitle(prompt) });
        if (created?.id) {
          conversationId = created.id;
          set({
            conversationId,
            conversations: [created, ...get().conversations.filter((item) => item.id !== created.id)],
          });
        }
      } catch {
        // The DeepSeek path can still create its own conversation server-side.
      }
    }
    const contextTrackId = state.playback?.trackId ?? state.previewTrackId ?? undefined;
    try {
      const result = await provider.suggest(
        prompt,
        { tracks: state.tracks, favorites: state.favorites, currentTrackId: state.playback?.trackId ?? state.previewTrackId },
        pending.signal,
      );
      if (pending.signal.aborted || id !== String(requestId)) return;
      // Resolve only known IDs; an adapter cannot invent playable library entries.
      const valid = new Set(useAppStore.getState().tracks.map((track) => track.id));
      const safe: AssistantResult = {
        ...result,
        trackIds: [...new Set(result.trackIds)].filter((key) => valid.has(key)).slice(0, 50),
      };
      const chat = result as ChatResponse;
      if (chat.conversationId && !get().conversationId) conversationId = chat.conversationId;
      set({
        turns: get().turns.map((turn) => (turn.id === id ? { ...turn, result: safe, provider: provider.id === "deepseek" ? "deepseek" : "local" } : turn)),
        ...(chat.conversationId ? { conversationId: chat.conversationId } : {}),
        ...(chat.conversation
          ? { conversations: [chat.conversation, ...get().conversations.filter((item) => item.id !== chat.conversation!.id)] }
          : {}),
      });
      if (provider.id !== "deepseek" && conversationId) {
        try {
          const saved = await invoke<{ conversation: ConversationSummary; turn: ConversationTurn }>("ai.conversations.append", {
            id: conversationId,
            turn: {
              prompt,
              result: safe,
              provider: "local",
              contextTrackId,
            },
          });
          if (saved?.turn) {
            set({
              turns: get().turns.map((turn) => (turn.id === id ? { ...turn, id: saved.turn.id, createdAt: saved.turn.createdAt } : turn)),
              conversations: saved.conversation
                ? [saved.conversation, ...get().conversations.filter((item) => item.id !== saved.conversation.id)]
                : get().conversations,
            });
          }
        } catch {
          // Chat still works if history persistence is unavailable.
        }
      }
      void get().refreshConversations();
    } catch (error) {
      const aborted = pending.signal.aborted;
      if (!aborted && id === String(requestId)) {
        const message = error instanceof Error ? error.message : "暂时无法完成，请重试。";
        set({ turns: get().turns.map((turn) => (turn.id === id ? { ...turn, error: message } : turn)) });
        if (provider.id !== "deepseek" && conversationId) {
          try {
            await invoke("ai.conversations.append", {
              id: conversationId,
              turn: { prompt, error: message, provider: "local", contextTrackId },
            });
          } catch {}
        }
      }
      if (provider.id === "deepseek") void get().refreshConversations();
    } finally {
      if (id === String(requestId)) {
        controller = null;
        set({ busy: false });
      }
    }
  },

  startNew: () => {
    get().cancel();
    ++requestId;
    controller = null;
    set({ turns: [], conversationId: null, busy: false });
    void invoke("ai.reset").catch(() => undefined);
  },
  clear: () => get().startNew(),

  cancel: () => {
    controller?.abort();
    controller = null;
    ++requestId;
    set({
      busy: false,
      turns: get().turns.map((turn) =>
        !turn.result && !turn.error ? { ...turn, error: "已停止，可以重新发送。" } : turn,
      ),
    });
  },

  loadConversation: async (id) => {
    if (get().busy) get().cancel();
    set({ conversationsLoading: true });
    try {
      const conversation = await invoke<Conversation>("ai.conversations.get", { id });
      if (!conversation?.id) return null;
      set({
        conversationId: conversation.id,
        turns: conversation.turns.map(toTurn),
        busy: false,
      });
      return conversation;
    } catch {
      return null;
    } finally {
      set({ conversationsLoading: false });
    }
  },

  refreshConversations: async () => {
    try {
      const list = await invoke<ConversationSummary[]>("ai.conversations.list");
      if (Array.isArray(list)) set({ conversations: list });
    } catch {
      // The workspace can still start a new conversation.
    }
  },

  deleteConversation: async (id) => {
    try {
      await invoke("ai.conversations.delete", { id });
      if (get().conversationId === id) set({ conversationId: null, turns: [] });
      await get().refreshConversations();
    } catch {
      // Leave the list untouched if the backend rejected the deletion.
    }
  },

  renameConversation: async (id, title) => {
    try {
      await invoke("ai.conversations.rename", { id, title });
      await get().refreshConversations();
    } catch {}
  },

  pinConversation: async (id, pinned) => {
    try {
      await invoke("ai.conversations.pin", { id, pinned });
      await get().refreshConversations();
    } catch {}
  },
}));

/** Provider seam shared by the built-in local matcher and IPC-backed DeepSeek. */
export function setMusicAssistantProvider(next: MusicAssistantProvider) {
  provider = next;
  useAssistant.setState({ providerLabel: next.label });
}

const toolLabels: Record<string, string> = {
  search_library: "检索本地曲库",
  get_context: "读取播放与歌单",
  get_tracks: "读取歌曲资料",
  get_track_bindings: "查看网易云 ID / QQ MID",
  update_track_bindings: "更新平台歌曲标识",
  search_qq: "搜索 QQ 音乐",
  download_qq: "加入 QQ 下载任务",
  get_listening_stats: "读取聆听统计",
  get_lyrics: "读取歌词",
  update_tracks: "更新歌曲资料",
  set_favorite: "更新收藏",
  arrange_queue: "编排播放队列",
  control_playback: "控制播放",
  manage_playlist: "管理歌单",
  search_netease: "搜索网易云完整资料",
  get_netease_song_details: "读取歌曲与专辑详情",
  get_netease_comments: "读取网易云评论",
  download_netease: "加入下载任务",
  web_search: "联网搜索",
  web_fetch: "读取网页",
  get_song_memory: "读取歌曲记忆",
  list_memories: "检索长期记忆",
  remember_song: "记住这首歌",
  remember_preference: "记住长期偏好",
  forget_song_memory: "删除歌曲记忆",
  forget_preference: "删除长期记忆",
  set_appearance: "调整外观",
};

const deepseekProvider: MusicAssistantProvider = {
  id: "deepseek",
  label: "DeepSeek",
  async suggest(prompt, context, signal) {
    const id = String(requestId);
    const current = useAppStore.getState();
    const cancel = () => {
      void window.potato.invoke("ai.cancel", { requestId: id }).catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    const off = window.potato.onEvent(({ event, data }) => {
      if (event !== "ai.progress") return;
      const d = data as { requestId: string; type: string; text?: string; name?: string; status?: string; detail?: string; patch?: Record<string, unknown>; token?: string };
      if (d.requestId !== id || signal.aborted) return;
      if (d.type === "appearance" && d.patch) {
        try {
          const { theme, ...appearance } = d.patch;
          if (theme === "light" || theme === "dark") useAppStore.getState().setTheme(theme);
          useAppStore.getState().setAppearance(appearance);
          void window.potato.invoke("ai.appearanceAck", { token: d.token });
        } catch (error) {
          void window.potato.invoke("ai.appearanceAck", { token: d.token, error: String(error) });
        }
      }
      useAssistant.setState((state) => ({
        turns: state.turns.map((turn) =>
          turn.id !== id
            ? turn
            : {
                ...turn,
                ...(d.type === "text" ? { streaming: d.text } : {}),
                ...(d.type === "tool"
                  ? {
                      activity: [
                        ...(turn.activity ?? []).slice(-19),
                        `${d.status === "done" ? "✓" : d.status === "error" ? "!" : "…"} ${toolLabels[d.name ?? ""] ?? d.name}${d.detail ? ` · ${d.detail}` : ""}`,
                      ],
                    }
                  : {}),
              },
        ),
      }));
    });
    try {
      return await window.potato.invoke<ChatResponse>("ai.chat", {
        requestId: id,
        prompt,
        currentTrackId: context.currentTrackId,
        conversationId: useAssistant.getState().conversationId,
        title: conversationTitle(prompt),
        appearance: { ...current.appearance, theme: current.theme },
      });
    } finally {
      off();
      signal.removeEventListener("abort", cancel);
    }
  },
};

export async function refreshAssistantConnection() {
  try {
    const status = await invoke<ConnectionStatus>("ai.status");
    provider = status.enabled && status.hasKey ? deepseekProvider : localProvider;
    useAssistant.setState({
      connected: provider.id === "deepseek",
      providerLabel: provider.id === "deepseek" ? `DeepSeek · ${status.model}` : localProvider.label,
    });
    return status;
  } catch {
    provider = localProvider;
    useAssistant.setState({ connected: false, providerLabel: localProvider.label });
    return null;
  }
}
