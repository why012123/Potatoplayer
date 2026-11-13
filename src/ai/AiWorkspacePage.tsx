import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  ChevronRight,
  Clock3,
  Database,
  History,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { Cover } from "@/components/Cover";
import { Modal } from "@/components/Modal";
import { useAssistant } from "./assistant";
import { useAiMemory } from "./memory";
import { AiComposer } from "./AiComposer";
import { AiTurnView } from "./AiTurnView";
import type { ConversationSummary, ProfileMemory, SongMemory } from "./types";

type Tab = "history" | "memory";

function relativeTime(timestamp: number, tr: ReturnType<typeof useTr>) {
  if (!timestamp) return tr("never", "还没有");
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return tr("just now", "刚刚");
  if (seconds < 3600) return tr("{count}m ago", "{count} 分钟前", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return tr("{count}h ago", "{count} 小时前", { count: Math.floor(seconds / 3600) });
  if (seconds < 86400 * 7) return tr("{count}d ago", "{count} 天前", { count: Math.floor(seconds / 86400) });
  return new Intl.DateTimeFormat(tr("en", "zh-CN"), { month: "short", day: "numeric" }).format(timestamp);
}

function importanceDots(value: number) {
  return Array.from({ length: 3 }, (_, index) => <i key={index} className={index < value ? "is-on" : ""} />);
}

export function AiWorkspacePage() {
  const tr = useTr();
  const s = useAppStore();
  const assistant = useAssistant();
  const memory = useAiMemory();
  const [tab, setTab] = useState<Tab>("history");
  const [query, setQuery] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [songEditor, setSongEditor] = useState<{ trackId: string; summary: string; facts: string } | null>(null);
  const [profileEditor, setProfileEditor] = useState<{ id?: string; text: string; tags: string; importance: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);

  const focusWorkspaceComposer = () => {
    const input = document.querySelector<HTMLTextAreaElement>(".ai-workspace-composer textarea");
    if (!input) return;
    input.scrollIntoView({ block: "nearest", behavior: "smooth" });
    input.focus();
  };

  useEffect(() => {
    void assistant.refreshConversations();
    void memory.load();
    const focus = () => focusWorkspaceComposer();
    window.addEventListener("potato:focus-workspace-composer", focus);
    const off = window.potato.onEvent(({ event }) => {
      if (event === "ai.memory.updated") void memory.refresh();
      if (event === "ai.conversation.updated" || event === "ai.conversation.deleted") {
        void assistant.refreshConversations();
      }
    });
    return () => {
      off();
      window.removeEventListener("potato:focus-workspace-composer", focus);
    };
  }, []);

  useEffect(() => {
    const element = transcript.current;
    if (!element) return;
    if (!assistant.turns.length && !assistant.busy) {
      element.scrollTo({ top: 0 });
      return;
    }
    if (assistant.busy) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
      return;
    }
    const lastTurn = element.querySelector<HTMLElement>(".ai-turn:last-of-type");
    if (!lastTurn) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
      return;
    }
    const top = lastTurn.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    element.scrollTo({ top: Math.max(0, top - 10), behavior: "smooth" });
  }, [assistant.turns, assistant.busy]);

  const compactHistory = tab === "history" && assistant.turns.length > 0;
  useEffect(() => {
    if (compactHistory) {
      document.querySelector(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [compactHistory]);

  const active = assistant.conversations.find((conversation) => conversation.id === assistant.conversationId);
  const filteredConversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assistant.conversations;
    return assistant.conversations.filter((conversation) =>
      `${conversation.title} ${conversation.preview}`.toLowerCase().includes(needle),
    );
  }, [assistant.conversations, query]);
  const pinned = filteredConversations.filter((conversation) => conversation.pinned);
  const recent = filteredConversations.filter((conversation) => !conversation.pinned);
  const memoryNeedle = memoryQuery.trim().toLowerCase();
  const visibleSongs = useMemo(
    () =>
      memory.snapshot.songs.filter((item) =>
        !memoryNeedle
          ? true
          : `${item.title} ${item.artist} ${item.album} ${item.summary} ${item.facts.map((fact) => fact.text).join(" ")}`
              .toLowerCase()
              .includes(memoryNeedle),
      ),
    [memory.snapshot.songs, memoryNeedle],
  );
  const visibleProfile = useMemo(
    () =>
      memory.snapshot.profile.filter((item) =>
        !memoryNeedle ? true : `${item.text} ${item.tags.join(" ")}`.toLowerCase().includes(memoryNeedle),
      ),
    [memory.snapshot.profile, memoryNeedle],
  );

  const openSongEditor = (trackId?: string, existing?: SongMemory) => {
    const fallback = existing ? s.tracks.find((track) => track.id === existing.trackId) : undefined;
    const first = trackId ?? existing?.trackId ?? fallback?.id ?? s.tracks[0]?.id ?? "";
    const found = memory.snapshot.songs.find((item) => item.trackId === first);
    setSongEditor({
      trackId: first,
      summary: found?.summary ?? existing?.summary ?? "",
      facts: (found?.facts ?? existing?.facts ?? []).map((fact) => fact.text).join("\n"),
    });
  };

  const openProfileEditor = (existing?: ProfileMemory) => {
    setProfileEditor({
      id: existing?.id,
      text: existing?.text ?? "",
      tags: existing?.tags.join(", ") ?? "",
      importance: existing?.importance ?? 1,
    });
  };

  const saveSong = async () => {
    if (!songEditor || saving) return;
    const facts = songEditor.facts.split("\n").map((item) => item.trim()).filter(Boolean);
    if (!songEditor.summary.trim() && !facts.length) return;
    setSaving(true);
    const saved = await memory.saveSong({
      trackId: songEditor.trackId,
      summary: songEditor.summary.trim(),
      facts,
      replaceFacts: true,
    });
    setSaving(false);
    if (saved) {
      setSongEditor(null);
      s.pushToast(tr("Song memory saved", "歌曲记忆已保存"), saved.title || saved.trackId, "success");
    } else {
      s.pushToast(tr("Could not save memory", "无法保存记忆"), memory.error ?? "", "error");
    }
  };

  const saveProfile = async () => {
    if (!profileEditor || saving) return;
    if (!profileEditor.text.trim()) return;
    setSaving(true);
    const tags = profileEditor.tags.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
    const saved = await memory.saveProfile({
      id: profileEditor.id,
      text: profileEditor.text.trim(),
      tags,
      importance: profileEditor.importance,
    });
    setSaving(false);
    if (saved) {
      setProfileEditor(null);
      s.pushToast(tr("Long-term memory saved", "长期记忆已保存"), saved.text, "success");
    } else {
      s.pushToast(tr("Could not save memory", "无法保存记忆"), memory.error ?? "", "error");
    }
  };

  const deleteSong = (item: SongMemory) => {
    s.openPrompt({
      title: tr("Delete this song memory?", "删除这首歌的记忆？"),
      description: tr(
        "The conversation history stays. Only the notes the assistant uses for this song are removed.",
        "历史对话仍会保留，只删除助手针对这首歌使用的记忆。",
      ),
      input: false,
      destructive: true,
      confirmLabel: tr("Delete memory", "删除记忆"),
      onSubmit: async () => {
        await memory.deleteSong(item.trackId);
      },
    });
  };

  const deleteProfile = (item: ProfileMemory) => {
    s.openPrompt({
      title: tr("Forget this preference?", "忘记这条长期记忆？"),
      description: item.text,
      input: false,
      destructive: true,
      confirmLabel: tr("Forget", "忘记"),
      onSubmit: async () => {
        await memory.deleteProfile(item.id);
      },
    });
  };

  const openConversation = (conversation: ConversationSummary) => {
    setTab("history");
    void assistant.loadConversation(conversation.id);
  };

  const renameConversation = (conversation: ConversationSummary) => {
    s.openPrompt({
      title: tr("Rename conversation", "重命名对话"),
      initialValue: conversation.title,
      placeholder: tr("Conversation title", "对话标题"),
      confirmLabel: tr("Save", "保存"),
      onSubmit: async (title) => {
        await assistant.renameConversation(conversation.id, title);
      },
    });
  };

  const deleteConversation = (conversation: ConversationSummary) => {
    s.openPrompt({
      title: tr("Delete this conversation?", "删除这段对话？"),
      description: tr(
        "The turns and their links are removed. Song memories and preferences stay.",
        "这段对话及其关联会被删除；歌曲记忆和长期偏好不受影响。",
      ),
      input: false,
      destructive: true,
      confirmLabel: tr("Delete conversation", "删除对话"),
      onSubmit: async () => {
        await assistant.deleteConversation(conversation.id);
      },
    });
  };

  const newConversation = () => {
    assistant.startNew();
    setTab("history");
  };

  const renderConversationItem = (conversation: ConversationSummary) => (
    <div className={clsx("ai-conversation-item", conversation.id === assistant.conversationId && "is-active")} key={conversation.id}>
      <button className="ai-conversation-open" onClick={() => openConversation(conversation)}>
        <span className="ai-conversation-time">
          <Clock3 size={11} /> {relativeTime(conversation.updatedAt, tr)}
        </span>
        <strong>{conversation.title}</strong>
        <p>{conversation.preview || tr("No reply yet", "还没有回复")}</p>
        <small>
          {conversation.turnCount} {tr("turns", "轮")}
          {conversation.songIds.length > 0 && ` · ${conversation.songIds.length} ${tr("songs", "首歌")}`}
        </small>
      </button>
      <div className="ai-conversation-actions">
        <button
          title={conversation.pinned ? tr("Unpin", "取消置顶") : tr("Pin", "置顶")}
          aria-label={conversation.pinned ? tr("Unpin conversation", "取消置顶对话") : tr("Pin conversation", "置顶对话")}
          onClick={() => void assistant.pinConversation(conversation.id, !conversation.pinned)}
        >
          {conversation.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button title={tr("Rename", "重命名")} aria-label={tr("Rename conversation", "重命名对话")} onClick={() => renameConversation(conversation)}>
          <Pencil size={13} />
        </button>
        <button title={tr("Delete", "删除")} aria-label={tr("Delete conversation", "删除对话")} onClick={() => deleteConversation(conversation)}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={clsx("ai-workspace", compactHistory && "has-conversation")}>
      <header className="ai-workspace-hero">
        <div className="ai-workspace-hero-copy">
          <h1>{tr("AI workspace", "AI 工作台")}</h1>
          <p>{tr("Keep conversations, song notes and listening preferences together.", "把每次对话，留成记忆。管理歌曲笔记与听歌偏好。")}</p>
        </div>
        <div className="ai-workspace-hero-actions">
          <button className="ai-primary" onClick={newConversation}>
            <Plus size={15} /> {tr("New conversation", "新对话")}
          </button>
        </div>
        <div className="ai-workspace-stats">
          <div>
            <span>{tr("CONVERSATIONS", "历史对话")}</span>
            <strong>{assistant.conversations.length}</strong>
            <small>{tr("with your assistant", "与音乐助手的来往")}</small>
          </div>
          <div>
            <span>{tr("SONG MEMORIES", "歌曲记忆")}</span>
            <strong>{memory.snapshot.stats.songs}</strong>
            <small>{memory.snapshot.stats.facts} {tr("notes across the library", "条记录分布在曲库")}</small>
          </div>
          <div>
            <span>{tr("LONG-TERM", "长期偏好")}</span>
            <strong>{memory.snapshot.stats.profile}</strong>
            <small>{tr("stable things worth keeping", "值得留下的稳定偏好")}</small>
          </div>
        </div>
      </header>

      <div className="ai-workspace-tabs" role="tablist" aria-label={tr("AI workspace sections", "AI 工作台分区")}>
        <button role="tab" aria-selected={tab === "history"} className={clsx(tab === "history" && "is-active")} onClick={() => setTab("history")}>
          <History size={15} /> {tr("Conversation history", "历史对话")}
          <em>{assistant.conversations.length}</em>
        </button>
        <button role="tab" aria-selected={tab === "memory"} className={clsx(tab === "memory" && "is-active")} onClick={() => setTab("memory")}>
          <Brain size={15} /> {tr("Memory index", "记忆索引")}
          <em>{memory.snapshot.stats.songs + memory.snapshot.stats.profile}</em>
        </button>
        <span className="ai-workspace-tab-note">
          <Database size={12} /> {memory.snapshot.stats.updatedAt ? tr("Updated {time}", "{time}更新", { time: relativeTime(memory.snapshot.stats.updatedAt, tr) }) : tr("Local only", "仅保存在本机")}
        </span>
      </div>

      {tab === "history" ? (
        <div className="ai-history-layout">
          <aside className="ai-conversation-rail">
            <div className="ai-conversation-rail-head">
              <div>
                <strong>{tr("Conversations", "对话")}</strong>
                <small>{assistant.conversations.length} {tr("saved", "段已保存")}</small>
              </div>
              <button className="ai-rail-new" onClick={newConversation} title={tr("New conversation", "新对话")} aria-label={tr("New conversation", "新对话")}>
                <Plus size={15} />
              </button>
            </div>
            <label className="ai-rail-search">
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr("Search conversations", "搜索对话")}
                aria-label={tr("Search conversations", "搜索对话")}
              />
              {query && <button onClick={() => setQuery("")} aria-label={tr("Clear search", "清除搜索")}><X size={12} /></button>}
            </label>
            <div className="ai-conversation-list">
              {pinned.length > 0 && (
                <div className="ai-conversation-group">
                  <span className="ai-conversation-group-label"><Pin size={10} /> {tr("Pinned", "置顶")}</span>
                  {pinned.map(renderConversationItem)}
                </div>
              )}
              {recent.length > 0 && (
                <div className="ai-conversation-group">
                  {pinned.length > 0 && <span className="ai-conversation-group-label">{tr("Recent", "最近")}</span>}
                  {recent.map(renderConversationItem)}
                </div>
              )}
              {!filteredConversations.length && (
                <div className="ai-conversation-empty">
                  <MessageCircle size={22} />
                  <strong>{query ? tr("No conversations match.", "没有匹配的对话。") : tr("No conversations yet.", "还没有历史对话。")}</strong>
                  <p>{tr("Ask the assistant about a song, a mood, or your library.", "问问助手一首歌、一种心情，或你的曲库。")}</p>
                  <button onClick={newConversation}>{tr("Start one", "开始一段")} <ArrowUpRight size={13} /></button>
                </div>
              )}
            </div>
          </aside>

          <section className="ai-conversation-panel">
            <header className="ai-conversation-head">
              <div>
                <span className="ai-eyebrow">{active?.pinned ? `${tr("PINNED", "置顶")} · ` : ""}CONVERSATION</span>
                <h2>{active?.title ?? tr("A new page, a new thought.", "新对话")}</h2>
                <p>
                  {assistant.conversationId
                    ? `${assistant.turns.length} ${tr("turns", "轮")} · ${active ? relativeTime(active.updatedAt, tr) : tr("just now", "刚刚")}`
                    : tr("Start typing below; the first message becomes this conversation’s title.", "在下方开始输入；第一条消息会成为这段对话的标题。")}
                </p>
              </div>
              <div className="ai-conversation-head-actions">
                {active && (
                  <>
                    <button title={tr("Rename", "重命名")} aria-label={tr("Rename conversation", "重命名对话")} onClick={() => renameConversation(active)}>
                      <Pencil size={14} />
                    </button>
                    <button title={tr("Delete", "删除")} aria-label={tr("Delete conversation", "删除对话")} onClick={() => deleteConversation(active)}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <button className="ai-conversation-side" onClick={focusWorkspaceComposer}>
                  <MessageCircle size={14} /> {tr("Continue", "继续对话")}
                </button>
              </div>
            </header>
            <div className="ai-workspace-transcript" ref={transcript}>
              {assistant.turns.length ? (
                assistant.turns.map((turn) => <AiTurnView key={turn.id} turn={turn} />)
              ) : (
                <div className="ai-workspace-welcome">
                  <p>{tr("Start with a song, an artist, or something you want to hear.", "从歌名、歌手，或一个听歌想法开始。")}</p>
                  <div className="ai-workspace-starters">
                    {[
                      tr("What should I listen to tonight?", "今晚适合听什么？"),
                      tr("Tell me the story behind this song.", "这首歌背后有什么故事？"),
                      tr("Remember that I like this album.", "记住我喜欢这张专辑。"),
                    ].map((starter) => (
                      <button key={starter} onClick={() => void assistant.ask(starter)}>
                        <Sparkles size={13} /> {starter}
                      </button>
                    ))}
                  </div>
                  {assistant.conversations.length > 0 && (
                    <button className="ai-workspace-recent-link" onClick={() => openConversation(assistant.conversations[0])}>
                      <History size={13} /> {tr("Continue “{title}”", "继续「{title}」", { title: assistant.conversations[0].title })}
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              )}
              {assistant.busy && (
                <div className="ai-workspace-thinking">
                  <span /><span /><span /> {tr("The assistant is listening…", "助手正在听…")}
                </div>
              )}
            </div>
            <AiComposer placeholder={tr("Ask, remember, or plan the next listen…", "问点什么，记住点什么，或安排下一次聆听…")} />
          </section>
        </div>
      ) : (
        <div className="ai-memory-workspace">
          <div className="ai-memory-toolbar">
            <label className="ai-memory-search">
              <Search size={14} />
              <input
                value={memoryQuery}
                onChange={(event) => setMemoryQuery(event.target.value)}
                placeholder={tr("Search song memories, artists, facts…", "搜索歌曲记忆、歌手、事实…")}
                aria-label={tr("Search AI memories", "搜索 AI 记忆")}
              />
              {memoryQuery && <button onClick={() => setMemoryQuery("")} aria-label={tr("Clear search", "清除搜索")}><X size={12} /></button>}
            </label>
            <div className="ai-memory-toolbar-actions">
              <button onClick={() => openSongEditor()}>
                <Plus size={14} /> {tr("Remember a song", "记住一首歌")}
              </button>
              <button className="ai-primary" onClick={() => openProfileEditor()}>
                <Plus size={14} /> {tr("Add a preference", "记一条偏好")}
              </button>
            </div>
          </div>

          <div className="ai-memory-grid">
            <section className="ai-memory-profile">
              <header className="ai-memory-section-head">
                <div>
                  <span className="ai-eyebrow">PROFILE · LONG-TERM INDEX</span>
                  <h2>{tr("What the assistant knows about you", "助手记住的你")}</h2>
                  <p>{tr("Stable preferences and facts. Every conversation can use this index.", "稳定的偏好与事实，每段对话都会参考这份索引。")}</p>
                </div>
                <span className="ai-memory-count">{visibleProfile.length}</span>
              </header>
              <div className="ai-profile-list">
                {visibleProfile.map((item) => (
                  <article className={`ai-profile-card importance-${item.importance}`} key={item.id}>
                    <div className="ai-profile-card-top">
                      <div className="ai-profile-dots" aria-label={tr("Importance {value} of 3", "重要度 {value}/3", { value: item.importance })}>{importanceDots(item.importance)}</div>
                      <span className={`ai-memory-source is-${item.source}`}>{item.source === "user" ? tr("YOU", "你写下") : "AI"}</span>
                      <div className="ai-profile-actions">
                        <button aria-label={tr("Edit memory", "编辑记忆")} title={tr("Edit", "编辑")} onClick={() => openProfileEditor(item)}><Pencil size={12} /></button>
                        <button aria-label={tr("Delete memory", "删除记忆")} title={tr("Delete", "删除")} onClick={() => deleteProfile(item)}><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <p>{item.text}</p>
                    <footer>
                      <span>{item.tags.map((tag) => <em key={tag}>{tag}</em>)}</span>
                      <small>{relativeTime(item.updatedAt, tr)}</small>
                    </footer>
                  </article>
                ))}
                {!visibleProfile.length && (
                  <div className="ai-memory-empty">
                    <BookOpen size={22} />
                    <strong>{memoryQuery ? tr("No preferences match.", "没有匹配的长期记忆。") : tr("No long-term memory yet.", "还没有长期记忆。")}</strong>
                    <p>{tr("Tell the assistant what you like, or add a note yourself.", "告诉助手你的偏好，或自己写一条。")}</p>
                    <button onClick={() => openProfileEditor()}>{tr("Add one", "写一条")} <Plus size={13} /></button>
                  </div>
                )}
              </div>
            </section>

            <section className="ai-memory-songs">
              <header className="ai-memory-section-head">
                <div>
                  <span className="ai-eyebrow">LIBRARY · SONG MEMORY INDEX</span>
                  <h2>{tr("A brief index for every song", "每首歌的简要记忆索引")}</h2>
                  <p>{tr("One-line summaries the assistant can pull into the right conversation.", "一行摘要，助手会在相关对话中自动取用。")}</p>
                </div>
                <span className="ai-memory-count">{visibleSongs.length}</span>
              </header>
              <div className="ai-memory-song-table">
                <div className="ai-memory-song-table-head">
                  <span>{tr("SONG", "歌曲")}</span>
                  <span>{tr("ONE-LINE MEMORY", "简要记忆")}</span>
                  <span>{tr("FACTS", "事实")}</span>
                  <span>{tr("UPDATED", "更新")}</span>
                  <span />
                </div>
                {visibleSongs.map((item) => {
                  const track = s.tracks.find((candidate) => candidate.id === item.trackId);
                  return (
                    <div className="ai-memory-song-row" key={item.trackId} role="button" tabIndex={0} onClick={() => openSongEditor(item.trackId, item)} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") openSongEditor(item.trackId, item); }}>
                      <div className="ai-memory-song">
                        <Cover path={track?.coverPath} seed={item.trackId} label={item.title || item.trackId} radius={7} />
                        <div>
                          <strong>{item.title || track?.title || item.trackId}</strong>
                          <small>{item.artist || track?.artist || tr("Unknown artist", "未知歌手")}{item.year > 0 ? ` · ${item.year}` : ""}</small>
                        </div>
                      </div>
                      <p>{item.summary || tr("No summary yet", "还没有摘要")}</p>
                      <span className="ai-memory-fact-count">{item.factCount}</span>
                      <span className="ai-memory-updated">{relativeTime(item.updatedAt, tr)}</span>
                      <div className="ai-memory-row-actions">
                        <button aria-label={tr("Edit memory", "编辑记忆")} title={tr("Edit", "编辑")} onClick={(event) => { event.stopPropagation(); openSongEditor(item.trackId, item); }}><Pencil size={12} /></button>
                        <button aria-label={tr("Delete memory", "删除记忆")} title={tr("Delete", "删除")} onClick={(event) => { event.stopPropagation(); deleteSong(item); }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}
                {!visibleSongs.length && (
                  <div className="ai-memory-empty ai-memory-empty--wide">
                    <Database size={22} />
                    <strong>{memoryQuery ? tr("No song memories match.", "没有匹配的歌曲记忆。") : tr("No song memories yet.", "还没有歌曲记忆。")}</strong>
                    <p>{tr("Ask the assistant to remember a song, or add the first note yourself.", "让助手记住一首歌，或自己写下第一条。")}</p>
                    <button onClick={() => openSongEditor()}>{tr("Remember a song", "记住一首歌")} <Plus size={13} /></button>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="ai-memory-footnote">
            <Brain size={14} />
            <span>
              {tr(
                "Conversations are saved on this Mac. Song memories only apply to the matching track IDs; deleting a memory never deletes audio or edits metadata.",
                "对话保存在这台 Mac 上。歌曲记忆只绑定对应的歌曲 ID；删除记忆不会删除音频，也不会修改歌曲资料。",
              )}
            </span>
          </div>
        </div>
      )}

      {songEditor && (
        <Modal onClose={() => !saving && setSongEditor(null)} labelledBy="ai-song-memory-title" className="ai-memory-modal">
          <button className="modal-close" aria-label={tr("Close", "关闭")} onClick={() => !saving && setSongEditor(null)}><X size={17} /></button>
          <div className="modal__eyebrow"><Sparkles size={13} /> SONG MEMORY</div>
          <h2 id="ai-song-memory-title">{tr("What should the assistant remember?", "想让助手记住什么？")}</h2>
          <p className="modal__description">{tr("A short summary for the index, plus any specific facts. The next time this song comes up, this memory is included automatically.", "一句给索引看的摘要，以及具体事实。下次聊到这首歌时，这段记忆会自动带上。")}</p>
          <label className="ai-memory-field">
            <span>{tr("Song", "歌曲")}</span>
            <select
              value={songEditor.trackId}
              onChange={(event) => {
                const trackId = event.target.value;
                const existing = memory.snapshot.songs.find((item) => item.trackId === trackId);
                setSongEditor({
                  trackId,
                  summary: existing?.summary ?? "",
                  facts: (existing?.facts ?? []).map((fact) => fact.text).join("\n"),
                });
              }}
            >
              {s.tracks.map((track) => <option key={track.id} value={track.id}>{track.title} — {track.artist}</option>)}
            </select>
          </label>
          <label className="ai-memory-field">
            <span>{tr("One-line memory", "一句话记忆")}</span>
            <input value={songEditor.summary} maxLength={200} onChange={(event) => setSongEditor((current) => current && { ...current, summary: event.target.value })} placeholder={tr("e.g. A late-night song; the user loves the bridge.", "例如：适合深夜听，用户特别喜欢桥段。")} />
          </label>
          <label className="ai-memory-field">
            <span>{tr("Facts, one per line", "具体事实，每行一条")}</span>
            <textarea value={songEditor.facts} rows={4} onChange={(event) => setSongEditor((current) => current && { ...current, facts: event.target.value })} placeholder={tr("The user first heard this in 2019.\nIt reminds them of winter.", "用户第一次听是在 2019 年。\n这首歌会让人想起冬天。")} />
          </label>
          <div className="modal__actions">
            <button className="button button--glass" disabled={saving} onClick={() => setSongEditor(null)}>{tr("Cancel", "取消")}</button>
            <button className="button button--dark" disabled={saving || (!songEditor.summary.trim() && !songEditor.facts.trim())} onClick={() => void saveSong()}>
              {saving ? tr("Saving…", "保存中…") : tr("Save memory", "保存记忆")}
            </button>
          </div>
        </Modal>
      )}

      {profileEditor && (
        <Modal onClose={() => !saving && setProfileEditor(null)} labelledBy="ai-profile-memory-title" className="ai-memory-modal">
          <button className="modal-close" aria-label={tr("Close", "关闭")} onClick={() => !saving && setProfileEditor(null)}><X size={17} /></button>
          <div className="modal__eyebrow"><BookOpen size={13} /> LONG-TERM MEMORY</div>
          <h2 id="ai-profile-memory-title">{tr("A preference worth keeping", "值得留下的偏好")}</h2>
          <p className="modal__description">{tr("Keep it short and stable. This becomes part of the assistant’s long-term index.", "尽量简短、稳定。它会进入助手的长期记忆索引。")}</p>
          <label className="ai-memory-field">
            <span>{tr("Memory", "记忆内容")}</span>
            <textarea value={profileEditor.text} rows={3} maxLength={500} onChange={(event) => setProfileEditor((current) => current && { ...current, text: event.target.value })} placeholder={tr("e.g. The user prefers quiet piano music at night.", "例如：用户喜欢在夜晚听安静的钢琴曲。")} />
          </label>
          <div className="ai-memory-field-row">
            <label className="ai-memory-field">
              <span>{tr("Tags", "标签")}</span>
              <input value={profileEditor.tags} onChange={(event) => setProfileEditor((current) => current && { ...current, tags: event.target.value })} placeholder={tr("night, piano, calm", "夜晚, 钢琴, 安静")} />
            </label>
            <label className="ai-memory-field ai-memory-field--importance">
              <span>{tr("Importance", "重要度")}</span>
              <select value={profileEditor.importance} onChange={(event) => setProfileEditor((current) => current && { ...current, importance: Number(event.target.value) })}>
                <option value={0}>{tr("Low", "低")}</option>
                <option value={1}>{tr("Normal", "普通")}</option>
                <option value={2}>{tr("High", "高")}</option>
                <option value={3}>{tr("Core", "核心")}</option>
              </select>
            </label>
          </div>
          <div className="modal__actions">
            <button className="button button--glass" disabled={saving} onClick={() => setProfileEditor(null)}>{tr("Cancel", "取消")}</button>
            <button className="button button--dark" disabled={saving || !profileEditor.text.trim()} onClick={() => void saveProfile()}>
              {saving ? tr("Saving…", "保存中…") : tr("Save memory", "保存记忆")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
