import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight, BookOpen, Brain, ChevronRight, Clock3, Database, History, MessageCircle, Music2, Pencil, Pin, PinOff, Plus, Search, Settings2, Sparkles, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { Cover } from "@/components/Cover";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/Headers";
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
  const [selectedMemory, setSelectedMemory] = useState<{ kind: "song"; trackId: string } | { kind: "profile"; id: string } | null>(null);
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
    element.scrollTo({ top: Math.max(0, top - 12), behavior: "smooth" });
  }, [assistant.turns, assistant.busy]);

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
  const memoryTotal = memory.snapshot.stats.songs + memory.snapshot.stats.profile;
  const memoryUpdated = memory.snapshot.stats.updatedAt
    ? tr("{time} updated", "{time}更新", { time: relativeTime(memory.snapshot.stats.updatedAt, tr) })
    : tr("Saved on this Mac", "仅保存在本机");

  // The memory tab mirrors the history layout: a list rail on the left and a
  // full detail panel on the right. With nothing selected, show the first item.
  const detailSong = selectedMemory?.kind === "song"
    ? visibleSongs.find((item) => item.trackId === selectedMemory.trackId)
    : selectedMemory ? undefined : visibleSongs[0];
  const detailProfile = selectedMemory?.kind === "profile"
    ? visibleProfile.find((item) => item.id === selectedMemory.id)
    : selectedMemory ? undefined : visibleProfile[0];

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

  const openConnection = () => window.dispatchEvent(new Event("potato:ai-settings"));

  const renderConversationItem = (conversation: ConversationSummary) => (
    <div className={clsx("ai-ws-conversation", conversation.id === assistant.conversationId && "is-active")} key={conversation.id}>
      <button className="ai-ws-conversation__open" onClick={() => openConversation(conversation)}>
        <div className="ai-ws-conversation__title">
          <strong>{conversation.title}</strong>
          {conversation.pinned && <Pin size={10} />}
        </div>
        <p>{conversation.preview || tr("No reply yet", "还没有回复")}</p>
        <small>
          <span className="ai-ws-conversation__time">
            <Clock3 size={10} /> {relativeTime(conversation.updatedAt, tr)}
          </span>
          <span>{conversation.turnCount} {tr("turns", "轮")}</span>
          {conversation.songIds.length > 0 && <span>{conversation.songIds.length} {tr("songs", "首")}</span>}
        </small>
      </button>
      <div className="ai-ws-row-actions">
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
    <div className="page ai-scope ai-workspace-page">
      <PageHeader
        eyebrow={tr("AI · DEEPSEEK", "AI · DEEPSEEK")}
        title={tr("AI workspace", "AI 工作台")}
        description={tr(
          "Conversations, song notes and listening preferences in one place.",
          "把每次对话留成记忆，管理歌曲笔记与听歌偏好。",
        )}
        actions={
          <>
            <button
              type="button"
              className="button button--glass"
              onClick={openConnection}
              title={tr("AI connection settings", "AI 连接设置")}
            >
              <Settings2 size={15} />
              {assistant.connected ? tr("Connection", "连接设置") : tr("Connect AI", "连接 AI")}
            </button>
            <button type="button" className="button button--dark" onClick={newConversation}>
              <Plus size={15} />
              {tr("New conversation", "新对话")}
            </button>
          </>
        }
      >
        <div className="ai-ws-status">
          <span className={clsx("ai-ws-status__mode", assistant.connected && "is-connected")}>
            {assistant.connected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {assistant.connected ? tr("DeepSeek connected", "DeepSeek 已连接") : tr("Local library mode", "本地曲库模式")}
          </span>
          <span className="ai-ws-status__item">
            <strong>{assistant.conversations.length}</strong> {tr("conversations", "段对话")}
          </span>
          <span className="ai-ws-status__item">
            <strong>{memory.snapshot.stats.songs}</strong> {tr("song memories", "条歌曲记忆")}
          </span>
          <span className="ai-ws-status__item">
            <strong>{memory.snapshot.stats.profile}</strong> {tr("preferences", "条长期偏好")}
          </span>
        </div>
      </PageHeader>

      <div className="ai-ws-tabs" role="tablist" aria-label={tr("AI workspace sections", "AI 工作台分区")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={clsx("ai-ws-tab", tab === "history" && "is-active")}
          onClick={() => setTab("history")}
        >
          <History size={14} /> {tr("Conversation history", "历史对话")}
          <em>{assistant.conversations.length}</em>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "memory"}
          className={clsx("ai-ws-tab", tab === "memory" && "is-active")}
          onClick={() => setTab("memory")}
        >
          <Brain size={14} /> {tr("Memory index", "记忆索引")}
          <em>{memoryTotal}</em>
        </button>
        <span className="ai-ws-tabs__note">
          <Database size={11} /> {memoryUpdated}
        </span>
      </div>

      {tab === "history" ? (
        <div className="ai-ws-history">
          <aside className="ai-ws-card ai-ws-rail">
            <header className="ai-ws-rail__head">
              <div>
                <strong>{tr("Conversations", "对话历史")}</strong>
                <small>{assistant.conversations.length} {tr("saved", "段已保存")}</small>
              </div>
              <button
                className="ai-ws-icon-button"
                onClick={newConversation}
                title={tr("New conversation", "新对话")}
                aria-label={tr("New conversation", "新对话")}
              >
                <Plus size={15} />
              </button>
            </header>
            <label className="ai-ws-search">
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr("Search conversations", "搜索对话")}
                aria-label={tr("Search conversations", "搜索对话")}
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label={tr("Clear search", "清除搜索")}>
                  <X size={12} />
                </button>
              )}
            </label>
            <div className="ai-ws-list">
              {pinned.length > 0 && (
                <div className="ai-ws-group">
                  <span className="ai-ws-group__label"><Pin size={10} /> {tr("Pinned", "置顶")}</span>
                  {pinned.map(renderConversationItem)}
                </div>
              )}
              {recent.length > 0 && (
                <div className="ai-ws-group">
                  {pinned.length > 0 && <span className="ai-ws-group__label">{tr("Recent", "最近")}</span>}
                  {recent.map(renderConversationItem)}
                </div>
              )}
              {!filteredConversations.length && (
                <div className="ai-ws-empty">
                  <span className="ai-ws-empty__icon"><MessageCircle size={19} /></span>
                  <strong>{query ? tr("No conversations match.", "没有匹配的对话。") : tr("No conversations yet.", "还没有历史对话。")}</strong>
                  <p>{tr("Ask the assistant about a song, a mood, or your library.", "问问助手一首歌、一种心情，或你的曲库。")}</p>
                  <button className="text-button" onClick={newConversation}>
                    {tr("Start one", "开始一段")} <ArrowUpRight size={12} />
                  </button>
                </div>
              )}
            </div>
          </aside>

          <section className="ai-ws-card ai-ws-chat">
            <header className="ai-ws-chat__head">
              <div className="ai-ws-chat__copy">
                <span className="ai-ws-eyebrow">
                  {active?.pinned ? `${tr("PINNED", "置顶")} · ` : ""}
                  {tr("CONVERSATION", "对话")}
                </span>
                <h2>{active?.title ?? tr("A new page, a new thought.", "新对话")}</h2>
                <p>
                  {assistant.conversationId
                    ? `${assistant.turns.length} ${tr("turns", "轮")} · ${active ? relativeTime(active.updatedAt, tr) : tr("just now", "刚刚")}`
                    : tr("Start typing below; the first message becomes this conversation’s title.", "在下方开始输入；第一条消息会成为这段对话的标题。")}
                </p>
              </div>
              <div className="ai-ws-chat__actions">
                {active && (
                  <>
                    <button className="ai-ws-icon-button" title={tr("Rename", "重命名")} aria-label={tr("Rename conversation", "重命名对话")} onClick={() => renameConversation(active)}>
                      <Pencil size={14} />
                    </button>
                    <button className="ai-ws-icon-button" title={tr("Delete", "删除")} aria-label={tr("Delete conversation", "删除对话")} onClick={() => deleteConversation(active)}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <button className="button button--glass button--small" onClick={focusWorkspaceComposer}>
                  <MessageCircle size={13} /> {tr("Continue", "继续对话")}
                </button>
              </div>
            </header>

            <div className="ai-ws-transcript" ref={transcript}>
              {assistant.turns.length ? (
                assistant.turns.map((turn) => <AiTurnView key={turn.id} turn={turn} />)
              ) : (
                <div className="ai-ws-welcome">
                  <h2>{tr("What are we listening to?", "想听点什么？")}</h2>
                  <p>
                    {tr(
                      "Ask about a song, plan a playlist, or leave a note to remember.",
                      "问问某首歌、排一份歌单，或让助手记住一件事。",
                    )}
                  </p>
                  <div className="ai-ws-starters">
                    {[
                      tr("What should I listen to tonight?", "今晚适合听什么？"),
                      tr("Tell me the story behind this song.", "这首歌背后有什么故事？"),
                      tr("Remember that I like this album.", "记住我喜欢这张专辑。"),
                    ].map((starter) => (
                      <button key={starter} onClick={() => void assistant.ask(starter)}>
                        <Sparkles size={12} />
                        <span>{starter}</span>
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  {assistant.conversations.length > 0 && (
                    <button className="ai-ws-recent" onClick={() => openConversation(assistant.conversations[0])}>
                      <History size={12} />
                      <span>{tr("Continue “{title}”", "继续「{title}」", { title: assistant.conversations[0].title })}</span>
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}
              {assistant.busy && (
                <div className="ai-ws-thinking">
                  <span /><span /><span /> {tr("The assistant is listening…", "助手正在听…")}
                </div>
              )}
            </div>

            <div className="ai-ws-composer-dock">
              <AiComposer placeholder={tr("Ask, remember, or plan the next listen…", "问点什么，记住点什么，或安排下一次聆听…")} />
            </div>
          </section>
        </div>
      ) : (
        <div className="ai-ws-memory">
          <div className="ai-ws-history ai-ws-mem-layout">
            <aside className="ai-ws-card ai-ws-rail">
              <header className="ai-ws-rail__head">
                <div>
                  <strong>{tr("Memory index", "记忆索引")}</strong>
                  <small>{memoryTotal} {tr("saved", "条已保存")}</small>
                </div>
              </header>

              <div className="ai-ws-mem-actions">
                <button type="button" className="button button--glass button--small" onClick={() => openSongEditor()}>
                  <Plus size={13} /> {tr("Remember a song", "记住一首歌")}
                </button>
                <button type="button" className="button button--dark button--small" onClick={() => openProfileEditor()}>
                  <Plus size={13} /> {tr("Add a preference", "记一条偏好")}
                </button>
              </div>

              <label className="ai-ws-search">
                <Search size={13} />
                <input
                  value={memoryQuery}
                  onChange={(event) => setMemoryQuery(event.target.value)}
                  placeholder={tr("Search song memories, artists, facts…", "搜索歌曲记忆、歌手、事实…")}
                  aria-label={tr("Search AI memories", "搜索 AI 记忆")}
                />
                {memoryQuery && (
                  <button onClick={() => setMemoryQuery("")} aria-label={tr("Clear search", "清除搜索")}>
                    <X size={12} />
                  </button>
                )}
              </label>

              <div className="ai-ws-list">
                {visibleProfile.length > 0 && (
                  <div className="ai-ws-group">
                    <span className="ai-ws-group__label"><BookOpen size={10} /> {tr("Long-term preferences", "长期偏好")}</span>
                    {visibleProfile.map((item) => (
                      <div
                        className={clsx("ai-ws-mem-item", selectedMemory?.kind === "profile" && selectedMemory.id === item.id && "is-active")}
                        key={item.id}
                      >
                        <button type="button" className="ai-ws-mem-item__open" onClick={() => setSelectedMemory({ kind: "profile", id: item.id })}>
                          <div className="ai-ws-mem-item__title">
                            <strong>{item.text}</strong>
                            <span className="ai-ws-dots" aria-label={tr("Importance {value} of 3", "重要度 {value}/3", { value: item.importance })}>
                              {importanceDots(item.importance)}
                            </span>
                          </div>
                          <p>{item.tags.length ? item.tags.join(" · ") : tr("No tags", "无标签")}</p>
                          <small>{relativeTime(item.updatedAt, tr)}</small>
                        </button>
                        <div className="ai-ws-row-actions">
                          <button title={tr("Edit", "编辑")} aria-label={tr("Edit memory", "编辑记忆")} onClick={(event) => { event.stopPropagation(); openProfileEditor(item); }}><Pencil size={12} /></button>
                          <button title={tr("Delete", "删除")} aria-label={tr("Delete memory", "删除记忆")} onClick={(event) => { event.stopPropagation(); deleteProfile(item); }}><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {visibleSongs.length > 0 && (
                  <div className="ai-ws-group">
                    <span className="ai-ws-group__label"><Music2 size={10} /> {tr("Song memories", "歌曲记忆")}</span>
                    {visibleSongs.map((item) => {
                      const track = s.tracks.find((candidate) => candidate.id === item.trackId);
                      return (
                        <div
                          className={clsx("ai-ws-mem-item ai-ws-mem-item--song", selectedMemory?.kind === "song" && selectedMemory.trackId === item.trackId && "is-active")}
                          key={item.trackId}
                        >
                          <button type="button" className="ai-ws-mem-item__open" onClick={() => setSelectedMemory({ kind: "song", trackId: item.trackId })}>
                            <div className="ai-ws-mem-item__title ai-ws-mem-item__song">
                              <Cover path={track?.coverPath} seed={item.trackId} label={item.title || item.trackId} radius={6} />
                              <div>
                                <strong>{item.title || track?.title || item.trackId}</strong>
                                <small>{item.artist || track?.artist || tr("Unknown artist", "未知歌手")}{item.year > 0 ? ` · ${item.year}` : ""}</small>
                              </div>
                            </div>
                            <p>{item.summary || tr("No summary yet", "还没有摘要")}</p>
                          </button>
                          <div className="ai-ws-row-actions">
                            <button title={tr("Edit", "编辑")} aria-label={tr("Edit memory", "编辑记忆")} onClick={(event) => { event.stopPropagation(); openSongEditor(item.trackId, item); }}><Pencil size={12} /></button>
                            <button title={tr("Delete", "删除")} aria-label={tr("Delete memory", "删除记忆")} onClick={(event) => { event.stopPropagation(); deleteSong(item); }}><Trash2 size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!visibleSongs.length && !visibleProfile.length && (
                  <div className="ai-ws-empty">
                    <span className="ai-ws-empty__icon"><Brain size={19} /></span>
                    <strong>{memoryQuery ? tr("No memory matches this search.", "没有匹配这条搜索的记忆。") : tr("No memory yet.", "还没有记忆。")}</strong>
                    <p>{tr("Ask the assistant to remember something, or add the first note yourself.", "让助手记住一件事，或自己写下第一条。")}</p>
                    <button className="text-button" onClick={() => openProfileEditor()}>
                      {tr("Add a preference", "记一条偏好")} <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            </aside>

            <section className="ai-ws-card ai-ws-mem-detail">
              {detailSong ? (
                <>
                  <header className="ai-ws-detail-head">
                    <Cover
                      path={s.tracks.find((candidate) => candidate.id === detailSong.trackId)?.coverPath}
                      seed={detailSong.trackId}
                      label={detailSong.title || detailSong.trackId}
                      radius={10}
                    />
                    <div className="ai-ws-detail-copy">
                      <span className="ai-ws-eyebrow">{tr("SONG MEMORY", "歌曲记忆")}</span>
                      <h2>{detailSong.title || detailSong.trackId}</h2>
                      <p>{detailSong.artist || tr("Unknown artist", "未知歌手")}{detailSong.year > 0 ? ` · ${detailSong.year}` : ""}</p>
                    </div>
                    <div className="ai-ws-detail-actions">
                      <button type="button" className="button button--glass button--small" onClick={() => openSongEditor(detailSong.trackId, detailSong)}>
                        <Pencil size={13} /> {tr("Edit", "编辑")}
                      </button>
                      <button type="button" className="button button--glass button--small" onClick={() => deleteSong(detailSong)}>
                        <Trash2 size={13} /> {tr("Delete", "删除")}
                      </button>
                    </div>
                  </header>
                  <div className="ai-ws-detail-body">
                    <section className="ai-ws-detail-section">
                      <h3>{tr("One-line memory", "一句话记忆")}</h3>
                      <p>{detailSong.summary || tr("No summary yet", "还没有摘要")}</p>
                    </section>
                    <section className="ai-ws-detail-section">
                      <h3>{tr("Facts", "具体事实")} <em>{detailSong.factCount}</em></h3>
                      {detailSong.facts.length > 0 ? (
                        <ul className="ai-ws-fact-list">
                          {detailSong.facts.map((fact) => <li key={fact.id}>{fact.text}</li>)}
                        </ul>
                      ) : (
                        <p className="ai-ws-detail-muted">{tr("No specific facts yet.", "还没有具体事实。")}</p>
                      )}
                    </section>
                    <p className="ai-ws-detail-updated">
                      <Clock3 size={11} /> {tr("Updated {time}", "{time}更新", { time: relativeTime(detailSong.updatedAt, tr) })}
                    </p>
                  </div>
                </>
              ) : detailProfile ? (
                <>
                  <header className="ai-ws-detail-head">
                    <span className="ai-ws-detail-mark"><BookOpen size={19} /></span>
                    <div className="ai-ws-detail-copy">
                      <span className="ai-ws-eyebrow">{tr("LONG-TERM MEMORY", "长期记忆")}</span>
                      <h2>{tr("A preference the assistant keeps", "助手记住的一条偏好")}</h2>
                      <p>{detailProfile.source === "user" ? tr("Written by you", "你写下的") : tr("Learned from a conversation", "从对话中学到")}</p>
                    </div>
                    <div className="ai-ws-detail-actions">
                      <button type="button" className="button button--glass button--small" onClick={() => openProfileEditor(detailProfile)}>
                        <Pencil size={13} /> {tr("Edit", "编辑")}
                      </button>
                      <button type="button" className="button button--glass button--small" onClick={() => deleteProfile(detailProfile)}>
                        <Trash2 size={13} /> {tr("Delete", "删除")}
                      </button>
                    </div>
                  </header>
                  <div className="ai-ws-detail-body">
                    <section className="ai-ws-detail-section">
                      <h3>{tr("Preference", "偏好内容")}</h3>
                      <p className="ai-ws-detail-text">{detailProfile.text}</p>
                    </section>
                    <section className="ai-ws-detail-section">
                      <h3>{tr("Tags", "标签")}</h3>
                      <div className="ai-ws-detail-tags">
                        {detailProfile.tags.length > 0
                          ? detailProfile.tags.map((tag) => <em key={tag}>{tag}</em>)
                          : <span className="ai-ws-detail-muted">{tr("No tags", "无标签")}</span>}
                      </div>
                    </section>
                    <section className="ai-ws-detail-section">
                      <h3>{tr("Importance", "重要度")}</h3>
                      <div className="ai-ws-dots ai-ws-dots--large" aria-label={tr("Importance {value} of 3", "重要度 {value}/3", { value: detailProfile.importance })}>
                        {importanceDots(detailProfile.importance)}
                      </div>
                    </section>
                    <p className="ai-ws-detail-updated">
                      <Clock3 size={11} /> {tr("Updated {time}", "{time}更新", { time: relativeTime(detailProfile.updatedAt, tr) })}
                    </p>
                  </div>
                </>
              ) : (
                <div className="ai-ws-empty ai-ws-empty--detail">
                  <span className="ai-ws-empty__icon"><Brain size={19} /></span>
                  <strong>{memoryQuery ? tr("No memory matches this search.", "没有匹配这条搜索的记忆。") : tr("Nothing selected yet.", "还没有选中记忆。")}</strong>
                  <p>{tr("Pick a memory on the left, or add a new one.", "在左侧选择一条记忆，或者新建一条。")}</p>
                </div>
              )}
            </section>
          </div>

          <p className="ai-ws-footnote">
            <Brain size={13} />
            <span>
              {tr(
                "Conversations are saved on this Mac. Song memories only apply to the matching track IDs; deleting a memory never deletes audio or edits metadata.",
                "对话保存在这台 Mac 上。歌曲记忆只绑定对应的歌曲 ID；删除记忆不会删除音频，也不会修改歌曲资料。",
              )}
            </span>
          </p>
        </div>
      )}

      {songEditor && (
        <Modal onClose={() => !saving && setSongEditor(null)} labelledBy="ai-song-memory-title" className="ai-memory-modal">
          <button className="modal-close" aria-label={tr("Close", "关闭")} onClick={() => !saving && setSongEditor(null)}><X size={17} /></button>
          <div className="modal__eyebrow"><Sparkles size={13} /> {tr("SONG MEMORY", "歌曲记忆")}</div>
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
          <div className="modal__eyebrow"><BookOpen size={13} /> {tr("LONG-TERM MEMORY", "长期记忆")}</div>
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
