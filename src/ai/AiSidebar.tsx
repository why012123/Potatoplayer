import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, ChevronRight, History, Maximize2, MessageCircle, Plus, SlidersHorizontal, Square, X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { RightPanelSwitch } from "@/components/RightPanelSwitch";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { useAssistant } from "./assistant";
import { AiTurnView } from "./AiTurnView";
import type { AssistantTurn } from "./types";

const REPLY_LIFETIME = 12_000;

// Remains mounted across collapse and mode changes: drafts and in-flight replies survive.
export function AiSidebar() {
  const tr = useTr();
  const open = useAppStore((s) => s.rightPanelOpen);
  const mode = useAppStore((s) => s.rightPanelMode);
  const setOpen = useAppStore((s) => s.setRightPanelOpen);
  const turns = useAssistant((s) => s.turns);
  const busy = useAssistant((s) => s.busy);
  const connected = useAssistant((s) => s.connected);
  const animationLevel = useAppStore((s) => s.appearance.animationLevel);
  const systemReducedMotion = useReducedMotion();
  const legacyReducedMotion = useAppStore((s) => s.reducedMotion);
  const reducedMotion = systemReducedMotion || legacyReducedMotion;
  const conversationId = useAssistant((s) => s.conversationId);
  const [draft, setDraft] = useState("");
  const [popup, setPopup] = useState<AssistantTurn | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const pendingTurn = useRef<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followEnd = useRef(true);

  const send = (prompt: string) => {
    if (!prompt.trim() || useAssistant.getState().busy) return;
    setPopup(null);
    setHovered(false);
    setFocused(false);
    followEnd.current = true;
    void useAssistant.getState().ask(prompt, { navigate: false });
    pendingTurn.current = useAssistant.getState().turns.at(-1)?.id ?? null;
  };
  const submit = () => {
    if (!draft.trim() || busy) return;
    send(draft);
    setDraft("");
    input.current?.focus();
  };
  const dismiss = () => {
    if (focused) input.current?.focus();
    setPopup(null);
    setHovered(false);
    setFocused(false);
  };

  useEffect(() => { setPopup(null); }, [conversationId]);
  useEffect(() => {
    if (open || mode !== "ai") setPopup(null);
    const turn = turns.find((item) => (item.requestId ?? item.id) === pendingTurn.current);
    if (!turn) { pendingTurn.current = null; return; }
    if (busy || (!turn.result && !turn.error)) return;
    pendingTurn.current = null;
    if (mode === "ai" && !open) {
      setHovered(false);
      setFocused(false);
      setPopup(turn);
    }
  }, [turns, busy, open, mode]);
  useEffect(() => {
    if (!popup || hovered || focused) return;
    const timer = window.setTimeout(() => setPopup(null), REPLY_LIFETIME);
    return () => window.clearTimeout(timer);
  }, [popup, hovered, focused]);
  useEffect(() => {
    if (open && mode === "ai" && followEnd.current && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    }
  }, [turns, busy, open, mode]);

  if (mode !== "ai") return null;
  const composer = <form className={`ai-side-composer ${open ? "" : "is-compact"}`} aria-busy={busy}
    onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <textarea ref={input} rows={open ? 3 : 1} maxLength={4000} value={draft}
      aria-label={tr("Message to music assistant", "给音乐助手的消息")}
      placeholder={busy ? tr("Thinking…", "正在思考…") : tr("Ask the music assistant…", "和音乐助手聊聊…")}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
        if (event.key === "Escape" && popup) { event.preventDefault(); event.stopPropagation(); dismiss(); }
      }} />
    <div className="ai-side-composer__actions">
      {!open && <IconButton label={tr("Expand AI chat", "展开 AI 聊天")} variant="ghost" size="sm" onClick={() => setOpen(true)}><Maximize2 size={15} /></IconButton>}
      {busy
        ? <IconButton label={tr("Stop generating", "停止生成")} variant="ghost" size="sm" onClick={() => useAssistant.getState().cancel()}><Square size={14} /></IconButton>
        : <button type="submit" className="ai-side-send" aria-label={tr("Send message", "发送消息")} disabled={!draft.trim()}><ArrowUp size={17} /></button>}
    </div>
  </form>;

  if (!open) return <div className="ai-mini-chat ai-scope ai-side-material">
    <AnimatePresence>{popup && <motion.section key={popup.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: reducedMotion || animationLevel !== "full" ? 0 : 0.18 }} className="ai-mini-reply" aria-label={tr("AI reply", "AI 回复")} aria-live="polite"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); } }}>
      <header><span>{tr("AI reply", "AI 回复")}</span><small>{tr("Saved in chat", "已保留在对话中")}</small>
        <IconButton label={tr("Close reply", "关闭回复")} variant="ghost" size="sm" onClick={dismiss}><X size={15} /></IconButton>
      </header>
      <div className="ai-mini-reply__body"><AiTurnView turn={turns.find(turn => turn.id === popup.id) ?? popup} onRetry={send} /></div>
      <button className="ai-mini-reply__expand" onClick={() => setOpen(true)}>{tr("View conversation", "查看完整对话")}<Maximize2 size={13} /></button>
    </motion.section>}</AnimatePresence>
    {composer}
  </div>;

  return <div className="right-panel-view ai-chat-sidebar ai-scope ai-side-material" aria-label={tr("AI chat sidebar", "AI 聊天侧栏")}>
    <div className="now-playing__head">
      <span className="eyebrow"><MessageCircle size={14} />{tr("AI chat", "AI 聊天")}</span>
      <div className="now-playing__head-actions">
        <IconButton label={tr("AI connection settings", "AI 连接设置")} variant="ghost" size="sm" onClick={() => window.dispatchEvent(new Event("potato:ai-settings"))}><SlidersHorizontal size={16} /></IconButton>
        <IconButton label={tr("New conversation", "新对话")} variant="ghost" size="sm" onClick={() => { pendingTurn.current = null; useAssistant.getState().startNew(); }}><Plus size={18} /></IconButton>
        <RightPanelSwitch />
        <IconButton label={tr("Minimize AI chat", "收起 AI 聊天")} variant="ghost" size="sm" onClick={() => setOpen(false)}><ChevronRight size={17} /></IconButton>
      </div>
    </div>
    <div className="ai-side-status"><span>{connected ? tr("AI connected", "AI 已连接") : tr("Local library mode", "本地曲库模式")}</span>
      <button onClick={() => { useAppStore.getState().navigate({ kind: "ai" }); useAppStore.getState().setRightPanelMode("player"); }}><History size={13} />{tr("History", "历史对话")}</button>
    </div>
    <div ref={transcript} className="ai-side-transcript" aria-live="polite" aria-busy={busy}
      onScroll={(event) => { const el = event.currentTarget; followEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {turns.length ? turns.map((turn) => <AiTurnView key={turn.id} turn={turn} onRetry={send} />)
        : <div className="ai-side-welcome"><MessageCircle size={28} /><h2>{tr("What would you like to hear?", "想听些什么？")}</h2><p>{tr("Find a song, make a playlist, or talk about the music playing now.", "找一首歌、整理歌单，或聊聊正在播放的音乐。")}</p>
          <button onClick={() => send(tr("Recommend a playlist", "为我推荐一份歌单"))}>{tr("Recommend a playlist", "推荐一份歌单")}</button></div>}
      {busy && <p className="ai-side-thinking" role="status">{tr("Thinking…", "正在思考…")}</p>}
    </div>
    <div className="ai-side-input">{composer}<small>{tr("Enter to send · Shift + Enter for a new line", "Enter 发送 · Shift + Enter 换行")}</small></div>
  </div>;
}
