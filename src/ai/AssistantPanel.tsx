import { useTr } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import { AudioLines, History, ListMusic, Search, Settings2, Sparkles, X } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { AiComposer } from "./AiComposer";
import { AiTurnView } from "./AiTurnView";
export function AssistantPanel() {
    const tr = useTr();
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
        if (!element)
            return;
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
    return (<aside ref={panel} className="ai-assistant" aria-label={tr("Music assistant", "音乐助手")}>
      <header className="ai-assistant-header">
        <span className="ai-assistant-mark"><Sparkles size={18}/></span>
        <div>
          <strong>{tr("Music assistant", "音乐助手")}<em>AI</em></strong>
          <small><i />{assistant.connected ? assistant.providerLabel : tr("Local mode · No model connected", "本地模式 · 未连接模型")}</small>
        </div>
        <button title={tr("Conversations & memory", "历史对话与记忆")} aria-label={tr("Conversations & memory", "历史对话与记忆")} onClick={openHistory}><History size={15}/></button>
        <button title={tr("AI connection settings", "AI 连接设置")} aria-label={tr("AI connection settings", "AI 连接设置")} onClick={() => window.dispatchEvent(new Event("potato:ai-settings"))}><Settings2 size={15}/></button>
        <button title={tr("New conversation", "新对话")} aria-label={tr("New conversation", "新对话")} onClick={assistant.clear}><Sparkles size={15}/></button>
        <button title={tr("Hide assistant", "收起助手")} aria-label={tr("Hide assistant", "收起助手")} onClick={() => s.setRightPanelOpen(false)}><X size={17}/></button>
      </header>
      <div className="ai-conversation" ref={scroll}>
        {assistant.turns.length === 0 && (<div className="ai-welcome">
            <div className="ai-welcome-symbol"><Sparkles size={31} strokeWidth={1.4}/><span /><i /></div>
            <h2>{tr("What shall we play next?", "下一首，听什么？")}</h2>
            <p>{tr("Tell me a song, an artist, or the mood you are after.", "告诉我歌名、歌手，或你想听的感觉。")}</p>
            <div className="ai-suggestions">
              {[
                { icon: Search, title: tr("Find me a song", "帮我找首歌"), subtitle: tr("Remember the title or artist?", "记得歌名，或者歌手？"), prompt: "" },
                { icon: ListMusic, title: tr("Recommend a playlist", "推荐一份歌单"), subtitle: tr("Start with your favorites and highly rated songs", "从你的高分与收藏出发"), prompt: tr("Recommend a playlist for me", "为我推荐一份歌单") },
                { icon: AudioLines, title: tr("Keep this feeling going", "沿着这首，继续听"), subtitle: tr("Explore similar artists and genres", "探索相同歌手与流派"), prompt: tr("Find songs similar to this one", "找和这首相似的歌曲") },
                { icon: History, title: tr("Revisit a conversation", "翻翻过去的对话"), subtitle: tr("Return to a past listening moment", "回到某一次具体的聆听"), prompt: "" },
            ].map(({ icon: Icon, title, subtitle, prompt }) => (<button key={title} onClick={() => {
                    if (title === tr("Revisit a conversation", "翻翻过去的对话"))
                        openHistory();
                    else if (prompt)
                        void assistant.ask(prompt);
                    else
                        focusComposer();
                }}>
                  <Icon size={17}/>
                  <div><strong>{title}</strong><small>{subtitle}</small></div>
                  <span>↗</span>
                </button>))}
            </div>
            <div className="ai-local-note">
              <span />
              <p>{tr("Ready to explore your ", "已准备好探索你的 ")}<strong>{s.tracks.length}</strong>{tr("local songs.", "首本地歌曲。")}{assistant.connected
                ? tr("DeepSeek is connected. Edit song details, arrange playlists, search the web, and remember your preferences.", "已连接 DeepSeek，可以修改歌曲资料、编排歌单、联网查资料和记住你的偏好。") : tr("Matching your library locally. Open settings above to connect DeepSeek.", "当前按曲库信息匹配，点击上方设置连接 DeepSeek。")}
              </p>
            </div>
          </div>)}
        <div className="ai-turns" aria-live="polite" aria-busy={assistant.busy}>
          {assistant.turns.map((turn) => <AiTurnView key={turn.id} turn={turn}/>)}
        </div>
      </div>
      <AiComposer />
    </aside>);
}
