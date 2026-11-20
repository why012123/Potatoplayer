import { documentLanguage, pickText, type TextVars } from "@/lib/text";
const lx = (en: string, zh: string, vars?: TextVars) => pickText(documentLanguage(), en, zh, vars);
import { create } from "zustand";
import { matchSongs, normalizeSongText as normalize, songQuery } from "../../electron/song-match.mjs";
import type { Track } from "@/types";
import { useAppStore } from "@/store";
import type {
  AiAction,
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

/** Local matching and the IPC-backed assistant share this entry point. */
export interface MusicAssistantProvider {
  id: string;
  label: string;
  suggest(prompt: string, context: AssistantContext, signal: AbortSignal): Promise<AssistantResult>;
}
const searchable = (track: Track) => normalize([track.title, track.artist, track.album, track.genre, track.block, track.note, ...(track.aliases ?? [])].join(" "));

export const localProvider: MusicAssistantProvider = {
  id: "local",
  get label() { return lx("Local mode · No model connected", "本地模式 · 未连接模型"); },
  async suggest(prompt, context, signal) {
    if (/(?:编辑|修改|更改|补全|更新).{0,16}(?:歌曲|资料|歌名|歌手|专辑|流派|备注|评分)|(?:歌名|评分|备注|歌手|流派|年份|专辑).{0,5}(?:改成|改为|设为)|\b(?:edit|update|rename) (?:this |the )?(?:song|track|metadata)\b/i.test(prompt)) {
      throw new Error(lx("Connect DeepSeek in AI settings to edit song details. No changes were made.", "请先在 AI 连接设置中启用 DeepSeek，再发送编辑请求。本次没有修改歌曲。"));
    }
    // Built-in English suggestions use the same local matching vocabulary.
    const suggestions: Record<string, string> = {
      "recommend a playlist for me": "为我推荐一份歌单",
      "recommend a playlist for focus": "推荐适合专注的歌单",
      "recommend a relaxing playlist": "推荐适合放松的歌单",
      "recommend a playlist for the evening": "推荐夜晚的歌单",
      "make a playlist of my favorite songs": "整理我收藏的歌曲歌单",
    };
    prompt = suggestions[prompt.toLowerCase()] ?? prompt;
    signal.throwIfAborted();
    const { tracks, favorites, currentTrackId } = context;
    const intent: AssistantIntent = /相似|类似|像这首|similar/i.test(prompt) ? "similar"
      : /歌单|推荐|playlist|recommend/i.test(prompt) ? "playlist"
      : /播放|放一首|放点|play/i.test(prompt) ? "play" : "search";
    const current = tracks.find((track) => track.id === currentTrackId);
    const rank = (track: Track) => track.rating * 10 + (favorites.includes(track.id) ? 15 : 0) + Math.min(track.playCount, 20);
    let selected: Track[] = [];
    let explanation = lx("Matched by song title, artist, album and existing library tags.", "按歌名、歌手、专辑与已有标签匹配本地曲库。");
    let title = intent === "play" ? lx("Ready to play", "准备好播放了") : lx("Found in your library", "在你的曲库里找到");
    if (!tracks.length) return { intent, title: lx("Start with your first song", "从你的第一首歌开始"), explanation: lx("Your library is empty. Choose a music folder to start finding songs and creating playlists.", "曲库还是空的。先选择音乐文件夹，我就能帮你查找歌曲和整理歌单。"), trackIds: [] };
    if (/采样率|取样率|位深|比特深度|声道|sample\s*rate|bit\s*depth/i.test(prompt)) {
      const query = prompt.replace(/采样率|取样率|位深|比特深度|声道|\b(?:sample\s*rate|bit\s*depth|what is|what are|the|of|this song|current song)\b|多少|是什么|是多少|告诉我|请问|这首歌|当前歌曲|这首|当前|的|？|\?/gi, " ").trim();
      const named = matchSongs(tracks, prompt).filter(item => item.score >= 95);
      const matches = named.length ? named.map(item => item.track)
        : query ? matchSongs(tracks, query).map(item => item.track) : current ? [current] : [];
      const selected = matches.slice(0, 8);
      const explanation = selected.length ? selected.map(track => {
        const rate = track.sampleRate && track.sampleRate > 0 ? `${track.sampleRate / 1000} kHz (${track.sampleRate} Hz)` : lx("Unavailable", "未读取到");
        const depth = track.bitDepth && track.bitDepth > 0 ? `${track.bitDepth} bit` : lx("Unavailable", "未读取到");
        const channels = track.channels && track.channels > 0 ? lx("{count} channels", "{count} 声道", { count: track.channels }) : lx("Channel count unavailable", "声道数未读取到");
        return lx("{title} · {artist}: sample rate {rate}, bit depth {depth}, {channels}{codec}.", "《{title}》 · {artist}：采样率 {rate}，位深 {depth}，{channels}{codec}。", { title: track.title, artist: track.artist, rate, depth, channels, codec: track.codec ? ` · ${track.codec}` : "" });
      }).join("\n") + lx("\nRead from local audio files. Missing specifications are not inferred from download tiers.", "\n以上为本地音频文件信息；缺失的规格不会按下载档位推测。")
        : lx("Select a song first, or include its title in your question.", "请先选中一首歌曲，或在问题里写出歌名。");
      return { intent: "search", title: lx("Audio specifications", "歌曲音频规格"), explanation, trackIds: selected.map(track => track.id) };
    }
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
        ? lx("Several songs share this title. Check the artist, album and version before choosing.", "找到多个同名候选，请核对歌手、专辑和版本后选择。")
        : lx("Title and artist matches come first, followed by albums and tags. Ratings only break ties.", "优先匹配歌名与歌手，再匹配专辑或标签；评分仅用于同等匹配的排序。");
    } else if (intent === "similar") {
      if (!current) return { intent, title: lx("Pick a song first", "先选一首喜欢的歌"), explanation: lx("Play or select a song to find related music by artist, genre and block.", "播放或选择一首歌曲后，我会按歌手、流派和区块查找相近的收藏。"), trackIds: [] };
      selected = tracks.filter((t) => t.id !== current.id && ((current.artist && t.artist === current.artist) || (current.genre && t.genre === current.genre) || (current.block && t.block === current.block)))
        .sort((a, b) => rank(b) - rank(a));
      title = lx("Keep listening after {title}", "从《{title}》继续听", { title: current.title });
      explanation = lx("Matched by shared artist, genre or block, without audio analysis or an AI model.", "依据相同歌手、流派或区块匹配，尚未分析音频或使用 AI 模型。");
    } else if (/^(?:整理|推荐|播放)?(?:我)?(?:的)?(?:收藏|喜欢的歌|favorites)(?:的歌曲)?(?:歌单)?$/i.test(query)) {
      selected = tracks.filter((t) => favorites.includes(t.id)).sort((a, b) => rank(b) - rank(a));
      title = lx("Revisit your favorites", "把喜欢的歌，再听一遍");
      explanation = lx("Your favorite songs, ordered by rating and play count.", "这些歌曲来自你的收藏，按评分与播放次数排序。");
    } else if (intent === "playlist" && /^(?:随便|日常推荐|今日推荐|一份|一个|一些|常听|高分|playlist)?$/i.test(query)) {
      selected = [...tracks].sort((a, b) => rank(b) - rank(a));
      title = lx("Make time for familiar songs", "为熟悉的旋律，留一点时间");
      explanation = lx("Selected from local ratings, favorites and play counts, without model-inferred preferences.", "依据本地评分、收藏和播放次数整理，未使用模型推断偏好。");
    } else {
      const moods: Record<string, string[]> = { "专注": ["纯音乐", "instrumental", "ambient", "piano", "钢琴", "轻音乐"], "学习": ["纯音乐", "instrumental", "piano", "轻音乐"], "夜晚": ["夜", "night", "ambient"], "放松": ["轻音乐", "acoustic", "ambient", "治愈"], "动漫": ["anime", "acg", "动画", "动漫"] };
      const mood = Object.keys(moods).find((key) => new RegExp(`^(?:适合)?${key}(?:时|的时候)?$`).test(query));
      selected = tracks.filter((track) => {
        const haystack = searchable(track);
        return Boolean(mood && moods[mood].some((key) => haystack.includes(normalize(key))));
      }).sort((a, b) => rank(b) - rank(a));
      if (mood) explanation = lx("Matched against existing tags for this mood; judge the sound for yourself.", "按「{tags}」等已有文字标签筛选；实际听感由你决定。", { tags: moods[mood].join(" / ") });
    }
    if (!selected.length) return { intent, title: lx("No matching songs yet", "暂时没有匹配的歌曲"), explanation: lx("Local mode matches existing metadata. Try a song title, artist or tag, or search Discover.", "本地模式仅能匹配已有信息。试试具体歌名、歌手或标签，也可以去在线发现找歌。"), trackIds: [] };
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
  ask: (prompt: string, options?: { navigate?: boolean }) => Promise<void>;
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
  return title || lx("New conversation", "新对话");
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

  ask: async (raw, options) => {
    const prompt = raw.trim().slice(0, 4000);
    if (!prompt || get().busy) return;
    const id = String(++requestId);
    const pending = new AbortController();
    controller = pending;
    const state = useAppStore.getState();
    // In-place chat surfaces keep the current library page and panel state.
    if (options?.navigate !== false && state.viewHistory[state.viewIndex]?.kind !== "ai") state.navigate({ kind: "ai" });
    set({
      busy: true,
      turns: [...get().turns.slice(-39), { id, requestId: id, prompt, createdAt: Date.now() }],
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
    const editorTarget = state.viewHistory[state.viewIndex]?.kind === "editor" ? state.editorTrackId : null;
    const contextTrackId = editorTarget ?? state.playback?.trackId ?? state.previewTrackId ?? undefined;
    try {
      const result = await provider.suggest(
        prompt,
        { tracks: state.tracks, favorites: state.favorites, currentTrackId: contextTrackId ?? null },
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
        turns: get().turns.map((turn) => (turn.id === id ? { ...turn, id: chat.turnId ?? turn.id, result: safe, provider: provider.id === "deepseek" ? "deepseek" : "local" } : turn)),
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
        const message = error instanceof Error ? error.message : lx("Could not complete this request. Please try again.", "暂时无法完成，请重试。");
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
        !turn.result && !turn.error ? { ...turn, error: lx("Stopped. You can send the request again.", "已停止，可以重新发送。") } : turn,
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

export const toolLabels = (): Record<string, string> => ({
  search_app: lx("Searching Potatoplayer", "检索应用资料"),
  search_library: lx("Searching your library", "检索本地曲库"),
  get_context: lx("Reading playback and playlists", "读取播放与歌单"),
  get_tracks: lx("Reading song details", "读取歌曲资料"),
  get_track_bindings: lx("Reading NetEase IDs / QQ MIDs", "查看网易云 ID / QQ MID"),
  update_track_bindings: lx("Updating platform song IDs", "更新平台歌曲标识"),
  search_qq: lx("Searching QQ Music", "搜索 QQ 音乐"),
  download_qq: lx("QQ Music download", "QQ 音乐下载"),
  get_listening_stats: lx("Reading listening stats", "读取聆听统计"),
  get_lyrics: lx("Reading lyrics", "读取歌词"),
  update_tracks: lx("Updating song details", "更新歌曲资料"),
  set_favorite: lx("Updating favorites", "更新收藏"),
  arrange_queue: lx("Arranging the queue", "编排播放队列"),
  control_playback: lx("Controlling playback", "控制播放"),
  manage_playlist: lx("Managing playlists", "管理歌单"),
  search_netease: lx("Searching NetEase Music", "搜索网易云完整资料"),
  get_netease_song_details: lx("Reading song and album details", "读取歌曲与专辑详情"),
  get_netease_comments: lx("Reading NetEase comments", "读取网易云评论"),
  download_netease: lx("NetEase download", "网易云下载"),
  web_search: lx("Searching the web", "联网搜索"),
  web_fetch: lx("Reading a web page", "读取网页"),
  get_song_memory: lx("Reading song memories", "读取歌曲记忆"),
  list_memories: lx("Searching long-term memory", "检索长期记忆"),
  remember_song: lx("Remembering this song", "记住这首歌"),
  remember_preference: lx("Saving a preference", "记住长期偏好"),
  forget_song_memory: lx("Deleting song memories", "删除歌曲记忆"),
  forget_preference: lx("Deleting a preference", "删除长期记忆"),
  set_appearance: lx("Updating appearance", "调整外观"),
});

export function receiveAssistantDownload(data: { conversationId?: string; turnId?: string; actions?: AiAction[]; downloadSummary?: string }) {
  if (data.conversationId !== useAssistant.getState().conversationId || !data.turnId) return;
  const jobIds = new Set(data.actions?.flatMap(action => action.jobs?.map(job => job.jobId) ?? []));
  useAssistant.setState(state => ({
    turns: state.turns.map(turn => {
      const matchesJob = turn.error && turn.operations?.some(action => action.jobs?.some(job => jobIds.has(job.jobId)));
      if (turn.id !== data.turnId && !matchesJob) return turn;
      const result: AssistantResult = turn.result ?? { intent: "search", title: "", explanation: "", trackIds: [] };
      return {
        ...turn, id: data.turnId!,
        result: { ...result, ...(data.actions ? { actions: data.actions } : {}),
          ...(data.downloadSummary ? { downloadSummary: data.downloadSummary } : {}) },
      };
    }),
  }));
}

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
      const d = data as AiAction & { requestId: string; type: string; text?: string; patch?: Record<string, unknown>; token?: string };
      if (d.requestId !== id || signal.aborted) return;
      if (d.type === "appearance" && d.patch) {
        // Super owns its appearance system (theme presets, accent, display and
        // motion). The AI layer must not rewrite those canonical defaults, so
        // the request is declined instead of applied.
        void window.potato.invoke("ai.appearanceAck", {
          token: d.token,
          error: lx(
            "Appearance is managed by Potatoplayer Super settings on this version.",
            "此版本的界面外观由 Potatoplayer Super 的设置管理。",
          ),
        });
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
                      operations: d.operation && d.status !== "running" ? [...(turn.operations ?? []), d] : turn.operations,
                      activity: [
                        ...(turn.activity ?? []).slice(-19),
                        `${d.status === "done" ? "✓" : d.status === "running" || d.status === "queued" ? "…" : "!"} ${toolLabels()[d.name ?? ""] ?? d.name}${d.detail ? ` · ${d.detail}` : ""}`,
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
