import { useState } from "react";
import { ArrowUp, BrainCircuit, Heart, Headphones, LoaderCircle, Moon, Sparkles } from "lucide-react";
import { useAssistant } from "./assistant";
import { useTr } from "@/lib/i18n";
import { greeting } from "@/lib/format";

const SUGGESTIONS = [
  { en: "What should I listen to tonight?", zh: "今晚适合听什么？", icon: Moon },
  { en: "Recommend a playlist for focus", zh: "推荐适合专注的歌单", icon: Headphones },
  { en: "Make a playlist of my favorite songs", zh: "整理我收藏的歌曲", icon: Heart },
];

/**
 * The single AI surface on Super's home page. It shares the assistant store with
 * the AI workspace page, so a question asked here continues there instead of
 * opening a second, disconnected chat (Super has no AI sidebar or bottom player).
 */
export function AiHomeSection() {
  const tr = useTr();
  const ask = useAssistant((state) => state.ask);
  const busy = useAssistant((state) => state.busy);
  const connected = useAssistant((state) => state.connected);
  const [draft, setDraft] = useState("");

  const submit = (prompt: string) => {
    const value = prompt.trim();
    if (!value || busy) return;
    setDraft("");
    void ask(value);
  };

  return (
    <div className="ai-home-ai glass ai-scope">
      <div className="ai-home-ai__head">
        <span className="ai-home-ai__mark" aria-hidden="true">
          <BrainCircuit size={19} />
        </span>
        <div className="ai-home-ai__copy">
          <strong>
            {greeting()} {tr("What would you like to hear?", "想听点什么？")}
          </strong>
          <small>{tr("Ask here; the answer opens in the AI workspace.", "在这里提问，答案会在 AI 工作台里展开。")}</small>
        </div>
        <span className="ai-home-ai__mode">
          <Sparkles size={12} />
          {connected ? "DeepSeek" : tr("Local library", "本地曲库")}
        </span>
      </div>

      <form
        className="ai-home-ai__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <input
          value={draft}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={tr("Ask about a song, a mood, or your library…", "问问歌曲、心情，或你的曲库…")}
          aria-label={tr("Ask the AI assistant", "向 AI 助手提问")}
        />
        <button
          type="submit"
          className="button button--dark"
          disabled={!draft.trim() || busy}
          aria-label={tr("Ask the AI assistant", "向 AI 助手提问")}
        >
          {busy ? <LoaderCircle size={14} className="is-spinning" /> : <ArrowUp size={14} />}
          {tr("Ask", "提问")}
        </button>
      </form>

      <div className="ai-home-ai__chips">
        {SUGGESTIONS.map(({ en, zh, icon: Icon }) => (
          <button key={en} type="button" disabled={busy} onClick={() => submit(tr(en, zh))}>
            <Icon size={12} />
            {tr(en, zh)}
          </button>
        ))}
      </div>
    </div>
  );
}
