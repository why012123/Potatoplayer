import { useEffect, useRef, useState } from "react";
import { ArrowUp, Settings2, AudioLines, Check, Compass, Headphones, ListMusic, LoaderCircle, Play, Plus, RotateCcw, Search, Sparkles, Square, X } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { useAssistant } from "./assistant";
export function AssistantPanel() {
  const s = useAppStore();
  const assistant = useAssistant();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener("potato:focus-assistant", focus);
    return () => window.removeEventListener("potato:focus-assistant", focus);
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" }); }, [assistant.turns, assistant.busy]);
  const submit = () => { if (!draft.trim() || assistant.busy) return; void assistant.ask(draft); setDraft(""); };
  const current = s.tracks.find((t) => t.id === (s.playback?.trackId ?? s.previewTrackId));
  return <aside className="ai-assistant" aria-label="音乐助手">
    <header className="ai-assistant-header"><span className="ai-assistant-mark"><Sparkles size={18}/></span><div><strong>音乐助手 <em>AI</em></strong><small><i/>{assistant.providerLabel}</small></div><button title="AI 连接设置" aria-label="AI 连接设置" onClick={() => window.dispatchEvent(new Event("potato:ai-settings"))}><Settings2 size={15}/></button><button title="新对话" aria-label="新对话" onClick={assistant.clear}><RotateCcw size={15}/></button><button title="收起助手" aria-label="收起助手" onClick={() => s.setRightPanelOpen(false)}><X size={17}/></button></header>
    <div className="ai-conversation" ref={scroll}>
      {assistant.turns.length === 0 && <div className="ai-welcome"><div className="ai-welcome-symbol"><Sparkles size={31} strokeWidth={1.4}/><span/><i/></div><div className="ai-eyebrow">YOUR MUSIC COMPANION</div><h2>下一首，<br/>一起找到它。</h2><p>告诉我想听什么。<br/>从你的音乐里，找一点共鸣。</p><div className="ai-suggestions">{[
        { icon: Search, title: "帮我找首歌", subtitle: "记得歌名，或者歌手？", prompt: "" },
        { icon: ListMusic, title: "推荐一份歌单", subtitle: "从你的高分与收藏出发", prompt: "为我推荐一份歌单" },
        { icon: AudioLines, title: "沿着这首，继续听", subtitle: "探索相同歌手与流派", prompt: "找和这首相似的歌曲" },
      ].map(({ icon: Icon, title, subtitle, prompt }) => <button key={title} onClick={() => { if (prompt) void assistant.ask(prompt); else { setDraft("帮我找 "); input.current?.focus(); } }}><Icon size={17}/><div><strong>{title}</strong><small>{subtitle}</small></div><span>↗</span></button>)}</div><div className="ai-local-note"><span/><p>已准备好探索你的 <strong>{s.tracks.length}</strong> 首本地歌曲。{assistant.connected ? "已连接 DeepSeek，可以修改歌曲资料、编排歌单和搜索下载。" : "当前按曲库信息匹配，点击上方设置连接 DeepSeek。"}</p></div></div>}
      <div className="ai-turns" aria-live="polite" aria-busy={assistant.busy}>{assistant.turns.map((turn) => {
        const tracks = (turn.result?.trackIds ?? []).map((id) => s.tracks.find((t) => t.id === id)).filter((t) => t !== undefined);
        return <article className="ai-turn" key={turn.id}><div className="ai-user-message">{turn.prompt}</div><div className="ai-reply-label"><Sparkles size={13}/> POTATO ASSISTANT</div>{turn.error ? <div className="ai-response-error"><p>{turn.error}</p><button disabled={assistant.busy} onClick={() => void assistant.ask(turn.prompt)}>重新尝试 <RotateCcw size={13}/></button></div> : turn.result ? <>{turn.result.title && <h3>{turn.result.title}</h3>}<p className="ai-reply-explanation">{turn.result.explanation}</p>{tracks.length > 0 && <div className="ai-result-card"><div className="ai-result-heading"><ListMusic size={14}/><span>{tracks.length} 首 · {turn.result.intent === "playlist" ? "歌单草案" : "本地歌曲"}</span></div>{tracks.map((track) => <button className="ai-result-track" key={track.id} aria-label={`播放 ${track.title}`} onClick={() => void s.playTrack(track, tracks.map((t) => t.id))}><Cover path={track.coverPath} seed={track.id} label={track.title} radius={7}/><div><strong>{track.title}</strong><small>{track.artist}</small></div><Play size={13}/></button>)}<div className="ai-result-actions"><button className="ai-primary" onClick={() => void s.playTrack(tracks[0], tracks.map((t) => t.id))}><Play size={13} fill="currentColor"/> 播放全部</button><button aria-label="加入队列" title="加入队列" onClick={() => void s.enqueueMany(tracks.map((t) => t.id), false)}><ListMusic size={16}/></button><button aria-label="保存到歌单" title="保存到歌单" onClick={() => s.setAddToPlaylistTrackIds(tracks.map((t) => t.id))}><Plus size={17}/></button></div></div>}{tracks.length === 0 && !assistant.connected && <button className="ai-response-link" onClick={() => s.tracks.length ? s.navigate({ kind: "discover" }) : void s.chooseLibrary()}>{s.tracks.length ? <Compass size={14}/> : <Plus size={14}/>} {s.tracks.length ? "去在线发现" : "选择音乐文件夹"}</button>}</> : <><p className="ai-reply-explanation">{turn.streaming}</p><p className="ai-thinking"><LoaderCircle size={15}/> 正在处理…</p></>}{turn.activity && turn.activity.length > 0 && <details className="ai-tool-log"><summary>查看操作记录（{turn.activity.filter(item => !item.startsWith("…")).length}）</summary>{turn.activity.map((item,index) => <div key={index}>{item}</div>)}</details>}</article>;
      })}</div>
    </div>
    <div className="ai-compose-area">{current && <button className="ai-context-track" title="查找相似歌曲" disabled={assistant.busy} onClick={() => void assistant.ask("找和这首相似的歌曲")}><Headphones size={13}/><span>{s.playback?.playing ? "正在听" : "已选择"} · {current.title}</span><Plus size={13}/></button>}<form className="ai-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}><textarea ref={input} aria-label="给音乐助手的消息" placeholder="想听什么？告诉我吧…" value={draft} maxLength={1000} rows={2} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}/><div><span><Sparkles size={12}/> {assistant.connected ? "DeepSeek · 工具已启用" : "本地曲库"}</span>{assistant.busy ? <button type="button" aria-label="停止生成" onClick={assistant.cancel}><Square size={13}/></button> : <button type="submit" aria-label="发送消息" disabled={!draft.trim()}><ArrowUp size={17}/></button>}</div></form><small className="ai-compose-hint">Enter 发送 · Shift + Enter 换行</small></div>
  </aside>;
}
