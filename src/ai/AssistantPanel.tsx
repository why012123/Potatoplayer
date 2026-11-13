import { useEffect, useRef } from "react";
import { AudioLines, History, ListMusic, Search, Settings2, Sparkles, X } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { AiComposer } from "./AiComposer";
import { AiTurnView } from "./AiTurnView";

export function AssistantPanel() {
  const s = useAppStore();
  const assistant = useAssistant();
  const scroll = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const focusComposer = () => panel.current?.querySelector<HTMLTextAreaElement>(".ai-composer textarea")?.focus();
  useEffect(() => {
    const focus = () => focusComposer();
    window.addEventListener("potato:focus-assistant", focus);
    return () => window.removeEventListener("potato:focus-assistant", focus);
  }, []);
  useEffect(() => {
    const element = scroll.current;
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
  const openHistory = () => {
    s.navigate({ kind: "ai" });
    s.setRightPanelOpen(false);
  };
  return (
    <aside ref={panel} className="ai-assistant" aria-label="音乐助手">
      <header className="ai-assistant-header">
        <span className="ai-assistant-mark"><Sparkles size={18} /></span>
        <div>
          <strong>音乐助手 <em>AI</em></strong>
          <small><i />{assistant.providerLabel}</small>
        </div>
        <button title="历史对话与记忆" aria-label="历史对话与记忆" onClick={openHistory}><History size={15} /></button>
        <button title="AI 连接设置" aria-label="AI 连接设置" onClick={() => window.dispatchEvent(new Event("potato:ai-settings"))}><Settings2 size={15} /></button>
        <button title="新对话" aria-label="新对话" onClick={assistant.clear}><Sparkles size={15} /></button>
        <button title="收起助手" aria-label="收起助手" onClick={() => s.setRightPanelOpen(false)}><X size={17} /></button>
      </header>
      <div className="ai-conversation" ref={scroll}>
        {assistant.turns.length === 0 && (
          <div className="ai-welcome">
            <div className="ai-welcome-symbol"><Sparkles size={31} strokeWidth={1.4} /><span /><i /></div>
            <div className="ai-eyebrow">YOUR MUSIC COMPANION</div>
            <h2>下一首，<br />一起找到它。</h2>
            <p>告诉我想听什么。<br />从你的音乐里，找一点共鸣。</p>
            <div className="ai-suggestions">
              {[
                { icon: Search, title: "帮我找首歌", subtitle: "记得歌名，或者歌手？", prompt: "" },
                { icon: ListMusic, title: "推荐一份歌单", subtitle: "从你的高分与收藏出发", prompt: "为我推荐一份歌单" },
                { icon: AudioLines, title: "沿着这首，继续听", subtitle: "探索相同歌手与流派", prompt: "找和这首相似的歌曲" },
                { icon: History, title: "翻翻过去的对话", subtitle: "回到某一次具体的聆听", prompt: "" },
              ].map(({ icon: Icon, title, subtitle, prompt }) => (
                <button
                  key={title}
                  onClick={() => {
                    if (title === "翻翻过去的对话") openHistory();
                    else if (prompt) void assistant.ask(prompt);
                    else focusComposer();
                  }}
                >
                  <Icon size={17} />
                  <div><strong>{title}</strong><small>{subtitle}</small></div>
                  <span>↗</span>
                </button>
              ))}
            </div>
            <div className="ai-local-note">
              <span />
              <p>
                已准备好探索你的 <strong>{s.tracks.length}</strong> 首本地歌曲。
                {assistant.connected
                  ? "已连接 DeepSeek，可以修改歌曲资料、编排歌单、联网查资料和记住你的偏好。"
                  : "当前按曲库信息匹配，点击上方设置连接 DeepSeek。"}
              </p>
            </div>
          </div>
        )}
        <div className="ai-turns" aria-live="polite" aria-busy={assistant.busy}>
          {assistant.turns.map((turn) => <AiTurnView key={turn.id} turn={turn} />)}
        </div>
      </div>
      <AiComposer />
    </aside>
  );
}
