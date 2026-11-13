import { useState } from "react";
import { ArrowRight, ArrowUpRight, Coffee, Disc3, Heart, Headphones, Moon, Play, Plus, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { Cover } from "@/components/Cover";
import { AiHomeLibrary } from "./AiHomeLibrary";

const moods = [
  { label: "专注时刻", prompt: "推荐适合专注的歌单", icon: Headphones, color: "sage" },
  { label: "慢下来", prompt: "推荐适合放松的歌单", icon: Coffee, color: "peach" },
  { label: "夜色渐深", prompt: "推荐夜晚的歌单", icon: Moon, color: "lilac" },
  { label: "重逢喜欢", prompt: "整理我收藏的歌曲歌单", icon: Heart, color: "sand" },
];
export function AiHomePage() {
  const s = useAppStore();
  const ask = useAssistant((state) => state.ask);
  const busy = useAssistant((state) => state.busy);
  const [prompt, setPrompt] = useState("");
  const featured = [...s.tracks].sort((a,b) => b.rating - a.rating || b.playCount - a.playCount).slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  return <div className="ai-home">
    <div className="ai-home-heading"><div><h1>{greeting}，让音乐陪你一会儿。</h1><p>从你的曲库开始，找歌、听歌，或聊聊音乐。</p></div><span className="ai-date">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</span></div>
    <form className="ai-home-prompt" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) { void ask(prompt); setPrompt(""); } }}><Sparkles size={18}/><input aria-label="向音乐助手提问" value={prompt} maxLength={1000} onChange={(e) => setPrompt(e.target.value)} placeholder="告诉我歌名和歌手，或描述此刻想听的音乐…"/><button disabled={!prompt.trim() || busy} aria-label="发送音乐请求"><ArrowRight size={19}/></button></form>
    <section><div className="ai-moods">{moods.map(({ label, prompt, icon: Icon, color }) => <button disabled={busy} key={label} className={`ai-mood ai-mood--${color}`} onClick={() => void ask(prompt)}><Icon size={22}/><strong>{label}</strong><ArrowUpRight className="ai-mood-arrow" size={15}/></button>)}</div></section>
    <section><div className="ai-section-heading"><div><h2>值得再听一遍</h2><p>按你的评分与播放次数精选。</p></div><button onClick={() => s.navigate({ kind: "songs" })}>浏览曲库 <ArrowRight size={14}/></button></div>{featured.length > 0 ? <div className="ai-record-grid">{featured.map((track) => <button className="ai-record-card" key={track.id} onClick={() => void s.playTrack(track, featured.map((t) => t.id))}><div className="ai-card-art"><Cover path={track.coverPath} seed={track.id} label={track.title} radius={12}/>{track.rating > 0 && <span className="ai-rating">★ {track.rating.toFixed(1)}</span>}<span className="ai-card-play"><Play size={18} fill="currentColor"/></span></div><strong>{track.title}</strong><small>{track.artist}</small></button>)}</div> : <div className="ai-import-empty"><Disc3 size={32}/><div><strong>你的音乐故事，从这里开始</strong><p>导入本地音乐，让熟悉的歌曲回到身边。</p></div><button className="ai-primary" onClick={() => void s.chooseLibrary()}><Plus size={16}/> 选择音乐文件夹</button></div>}</section>
    <AiHomeLibrary />
  </div>;
}
