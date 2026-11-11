import { create } from "zustand";
import type { Track } from "@/types";
import { useAppStore } from "@/store";

export type AssistantIntent = "search" | "play" | "playlist" | "similar";
export interface AssistantContext {
  tracks: Track[];
  favorites: string[];
  currentTrackId: string | null;
}
export interface AssistantResult {
  intent: AssistantIntent;
  title: string;
  explanation: string;
  trackIds: string[];
  actions?: Array<{name: string; status: string; detail?: string}>;
}
/** Providers propose songs only. Playback and library writes stay in UI actions.
 * A future remote provider should call an Electron IPC backend, never expose keys here. */
export interface MusicAssistantProvider {
  id: string;
  label: string;
  suggest(prompt: string, context: AssistantContext, signal: AbortSignal): Promise<AssistantResult>;
}
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
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
    if (intent === "similar") {
      if (!current) return { intent, title: "先选一首喜欢的歌", explanation: "播放或选择一首歌曲后，我会按歌手、流派和区块查找相近的收藏。", trackIds: [] };
      selected = tracks.filter((t) => t.id !== current.id && ((current.artist && t.artist === current.artist) || (current.genre && t.genre === current.genre) || (current.block && t.block === current.block)))
        .sort((a, b) => rank(b) - rank(a));
      title = `从《${current.title}》继续听`;
      explanation = "依据相同歌手、流派或区块匹配，尚未分析音频或使用 AI 模型。";
    } else if (/收藏|喜欢的歌|favorites/i.test(prompt)) {
      selected = tracks.filter((t) => favorites.includes(t.id)).sort((a, b) => rank(b) - rank(a));
      title = "把喜欢的歌，再听一遍";
      explanation = "这些歌曲来自你的收藏，按评分与播放次数排序。";
    } else if (/随便|日常推荐|今日|为我推荐|推荐歌单|常听|高分/i.test(prompt)) {
      selected = [...tracks].sort((a, b) => rank(b) - rank(a));
      title = "为熟悉的旋律，留一点时间";
      explanation = "依据本地评分、收藏和播放次数整理，未使用模型推断偏好。";
    } else {
      let query = prompt.replace(/帮我|给我|请|找一首|找一些|找点|找歌|找|搜索|播放|放一首|放点|推荐|生成|整理|一份|一个|一些|歌单|适合|的歌曲|的音乐|的歌|音乐|歌曲|听听/gi, " ").trim();
      query = query.replace(/^(search|play|find)\s+/i, "");
      const keywords = query.split(/\s+/).map(normalize).filter(Boolean);
      const moods: Record<string, string[]> = { "专注": ["纯音乐", "instrumental", "ambient", "piano", "钢琴", "轻音乐"], "学习": ["纯音乐", "instrumental", "piano", "轻音乐"], "夜晚": ["夜", "night", "ambient"], "放松": ["轻音乐", "acoustic", "ambient", "治愈"], "动漫": ["anime", "acg", "动画", "动漫"] };
      const mood = Object.keys(moods).find((key) => query.includes(key));
      selected = tracks.filter((track) => {
        const haystack = searchable(track);
        return mood ? moods[mood].some((key) => haystack.includes(normalize(key))) : keywords.length > 0 && keywords.every((key) => haystack.includes(key));
      }).sort((a, b) => rank(b) - rank(a));
      if (mood) explanation = `按「${moods[mood].join(" / ")}」等已有文字标签筛选；实际听感由你决定。`;
    }
    if (!selected.length) return { intent, title: "暂时没有匹配的歌曲", explanation: "本地模式仅能匹配已有信息。试试具体歌名、歌手或标签，也可以去在线发现找歌。", trackIds: [] };
    return { intent, title, explanation, trackIds: selected.slice(0, intent === "playlist" ? 12 : 6).map((t) => t.id) };
  },
};

export interface AssistantTurn { id: number; prompt: string; result?: AssistantResult; error?: string; streaming?: string; activity?: string[] }
let provider: MusicAssistantProvider = localProvider;
let controller: AbortController | null = null;
let requestId = 0;
interface AssistantStore {
  turns: AssistantTurn[];
  busy: boolean;
  providerLabel: string;
  connected: boolean;
  ask: (prompt: string) => Promise<void>;
  clear: () => void;
  cancel: () => void;
}
export const useAssistant = create<AssistantStore>((set, get) => ({
  turns: [], busy: false, providerLabel: localProvider.label, connected: false,
  ask: async (raw) => {
    const prompt = raw.trim().slice(0, 1000);
    if (!prompt || get().busy) return;
    const id = ++requestId;
    const pending = new AbortController();
    controller = pending;
    const state = useAppStore.getState();
    state.setRightPanelOpen(true);
    set({ busy: true, turns: [...get().turns.slice(-19), { id, prompt }] });
    try {
      const result = await provider.suggest(prompt, { tracks: state.tracks, favorites: state.favorites, currentTrackId: state.playback?.trackId ?? state.previewTrackId }, pending.signal);
      if (pending.signal.aborted || id !== requestId) return;
      // Resolve only known IDs; an adapter cannot invent playable library entries.
      const valid = new Set(useAppStore.getState().tracks.map((t) => t.id));
      const safe = { ...result, trackIds: [...new Set(result.trackIds)].filter((key) => valid.has(key)).slice(0, 50) };
      set({ turns: get().turns.map((turn) => turn.id === id ? { ...turn, result: safe } : turn) });
    } catch (error) {
      if (!pending.signal.aborted && id === requestId) set({ turns: get().turns.map((turn) => turn.id === id ? { ...turn, error: error instanceof Error ? error.message : "暂时无法完成，请重试。" } : turn) });
    } finally {
      if (id === requestId) { controller = null; set({ busy: false }); }
    }
  },
  cancel: () => {
    controller?.abort(); controller = null; ++requestId;
    set({ busy: false, turns: get().turns.map((turn) => !turn.result && !turn.error ? { ...turn, error: "已停止，可以重新发送。" } : turn) });
  },
  clear: () => { get().cancel(); set({ turns: [] }); void window.potato?.invoke("ai.reset").catch(() => undefined); },
}));

/** Provider seam shared by the built-in local matcher and IPC-backed DeepSeek. */
export function setMusicAssistantProvider(next: MusicAssistantProvider) {
  useAssistant.getState().clear(); provider = next;
  useAssistant.setState({ providerLabel: next.label });
}

export interface ConnectionStatus { enabled: boolean; model: string; hasKey: boolean; storage: string; baseUrl: string; busy: boolean }
const toolLabels: Record<string,string> = {search_library:"检索本地曲库",get_context:"读取播放与歌单",get_tracks:"读取歌曲资料",get_lyrics:"读取歌词",update_tracks:"更新歌曲资料",set_favorite:"更新收藏",arrange_queue:"编排播放队列",control_playback:"控制播放",manage_playlist:"管理歌单",search_netease:"搜索网易云",download_netease:"加入下载任务",set_appearance:"调整外观"};
const deepseekProvider: MusicAssistantProvider = {
  id: "deepseek", label: "DeepSeek",
  async suggest(prompt, context, signal) {
    const id = String(requestId);
    const current = useAppStore.getState();
    const cancel = () => { void window.potato.invoke("ai.cancel", { requestId: id }).catch(() => undefined); };
    signal.addEventListener("abort", cancel, { once: true });
    const off = window.potato.onEvent(({event,data}) => {
      if(event !== "ai.progress") return;
      const d = data as {requestId: string; type: string; text?: string; name?: string; status?: string; detail?: string; patch?: Record<string, unknown>; token?: string};
      if(d.requestId !== id || signal.aborted) return;
      if(d.type === "appearance" && d.patch) {
        try {
          const { theme, ...appearance } = d.patch;
          if(theme === "light" || theme === "dark") useAppStore.getState().setTheme(theme);
          useAppStore.getState().setAppearance(appearance);
          void window.potato.invoke("ai.appearanceAck", {token:d.token});
        } catch(error) { void window.potato.invoke("ai.appearanceAck", {token:d.token,error:String(error)}); }
      }
      useAssistant.setState(state => ({turns:state.turns.map(turn => turn.id !== Number(id) ? turn : {...turn,
        ...(d.type === "text" ? {streaming:d.text} : {}),
        ...(d.type === "tool" ? {activity:[...(turn.activity ?? []).slice(-19), `${d.status === "done" ? "✓" : d.status === "error" ? "!" : "…"} ${toolLabels[d.name ?? ""] ?? d.name}${d.detail ? ` · ${d.detail}` : ""}`]} : {}),
      })}));
    });
    try {
      return await window.potato.invoke<AssistantResult>("ai.chat", {requestId:id,prompt,currentTrackId:context.currentTrackId,appearance:{...current.appearance,theme:current.theme}});
    } finally { off(); signal.removeEventListener("abort",cancel); }
  },
};
export async function refreshAssistantConnection() {
  try {
    const status=await window.potato.invoke<ConnectionStatus>("ai.status");
    provider=status.enabled && status.hasKey ? deepseekProvider : localProvider;
    useAssistant.setState({ connected: provider.id === "deepseek", providerLabel: provider.id === "deepseek" ? `DeepSeek · ${status.model}` : localProvider.label });
    return status;
  } catch { provider=localProvider;useAssistant.setState({connected:false,providerLabel:localProvider.label}); }
}
