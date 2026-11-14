import { useTr } from "@/lib/i18n";
import { useState } from "react";
import { ArrowUp, AudioLines, Compass, Headphones, LoaderCircle, Plus, RotateCcw, Sparkles, Square } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
export function AiComposer({ placeholder, autoFocus = false }: {
    placeholder?: string;
    autoFocus?: boolean;
}) {
    const tr = useTr();
    const s = useAppStore();
    const assistant = useAssistant();
    const [draft, setDraft] = useState("");
    const current = s.tracks.find((track) => track.id === (s.playback?.trackId ?? s.previewTrackId));
    const submit = () => {
        if (!draft.trim() || assistant.busy)
            return;
        const prompt = draft;
        setDraft("");
        void assistant.ask(prompt);
    };
    return (<div className="ai-compose-area ai-workspace-composer">
      {current && (<button className="ai-context-track" type="button" title={tr("Find similar songs", "查找相似歌曲")} disabled={assistant.busy} onClick={() => void assistant.ask(tr("Find songs similar to this one", "找和这首相似的歌曲"))}>
          <Headphones size={13}/>
          <span>
            {s.playback?.playing ? tr("Listening to", "正在听") : tr("Selected", "已选择")} · {current.title}
          </span>
          <Plus size={13}/>
        </button>)}
      <form className="ai-composer" onSubmit={(event) => {
            event.preventDefault();
            submit();
        }}>
        <textarea aria-label={tr("Message to music assistant", "给音乐助手的消息")} placeholder={placeholder ?? tr("What would you like to hear?", "想听什么？告诉我吧…")} value={draft} maxLength={1000} rows={2} autoFocus={autoFocus} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
            }
        }}/>
        <div>
          <span>
            <Sparkles size={12}/> {assistant.connected ? tr("DeepSeek · Tools enabled", "DeepSeek · 工具已启用") : tr("Local library", "本地曲库")}
          </span>
          {assistant.busy ? (<button type="button" aria-label={tr("Stop generating", "停止生成")} onClick={assistant.cancel}>
              <Square size={13}/>
            </button>) : (<button type="submit" aria-label={tr("Send message", "发送消息")} disabled={!draft.trim()}>
              <ArrowUp size={17}/>
            </button>)}
        </div>
      </form>
      <small className="ai-compose-hint">{tr("Enter to send · Shift + Enter for a new line", "Enter 发送 · Shift + Enter 换行")}</small>
    </div>);
}
