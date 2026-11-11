import { useState } from "react";
import { ArrowRight, ArrowUpRight, AudioLines, Coffee, Disc3, Heart, Headphones, Moon, Play, Plus, Sparkles, Sun } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { Cover } from "@/components/Cover";
import { formatTime } from "@/lib/format";

const moods = [
  { label: "专注时刻", detail: "给思绪一点空间", prompt: "推荐适合专注的歌单", icon: Headphones, color: "sage" },
  { label: "慢下来", detail: "今天也辛苦了", prompt: "推荐适合放松的歌单", icon: Coffee, color: "peach" },
  { label: "夜色渐深", detail: "留一首歌给夜晚", prompt: "推荐夜晚的歌单", icon: Moon, color: "lilac" },
  { label: "重逢喜欢", detail: "那些舍不得跳过的歌", prompt: "整理我收藏的歌曲歌单", icon: Heart, color: "sand" },
];
export function AiHomePage() {
  const s = useAppStore();
  const ask = useAssistant((state) => state.ask);
  const connected = useAssistant((state) => state.connected);
  const busy = useAssistant((state) => state.busy);
  const [prompt, setPrompt] = useState("");
  const featured = [...s.tracks].sort((a,b) => b.rating - a.rating || b.playCount - a.playCount).slice(0, 4);
  const recent = [...s.tracks].sort((a,b) => b.addedAt - a.addedAt).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  return <div className="ai-home">
    <div className="ai-home-heading"><div><div className="ai-eyebrow"><span/> YOUR DAILY SOUNDTRACK</div><h1>{greeting}，让音乐陪你一会儿。</h1><p>熟悉的旋律，或是下一首惊喜。</p></div><span className="ai-date">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</span></div>
    <section className="ai-hero"><div className="ai-hero-copy"><span className="ai-hero-kicker"><Sparkles size={14}/> 音乐，有了新的打开方式</span><h2>此刻的心情，<br/>想听什么声音？</h2><p>找一首歌，重温一段旋律，<br/>或让音乐助手帮你整理一份歌单。</p><button className="ai-primary" onClick={() => { s.setRightPanelOpen(true); window.dispatchEvent(new Event("potato:focus-assistant")); }}><Sparkles size={16}/> 开始一段音乐对话 <ArrowUpRight size={17}/></button><small>{connected ? "DeepSeek 已连接 · 让音乐更懂你" : "从你的曲库出发 · 当前为本地模式"}</small></div><div className="ai-record-art" aria-hidden="true"><div className="ai-record-orbit"/><div className="ai-record-sleeve"><span>POTATO<br/>SELECTS.</span><div className="ai-sleeve-sun"/><small>A LITTLE SOUND,<br/>A LITTLE SOUL.</small></div><div className="ai-record"><div className="ai-record-label"><AudioLines size={30}/><small>SIDE A / 33 RPM</small></div></div><div className="ai-floating-label"><AudioLines size={15}/> 为每一种心情，找到旋律</div></div></section>
    <form className="ai-home-prompt" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) { void ask(prompt); setPrompt(""); } }}><Sparkles size={18}/><input aria-label="向音乐助手提问" value={prompt} maxLength={1000} onChange={(e) => setPrompt(e.target.value)} placeholder="试着说：帮我找一首歌，或者推荐一份歌单…"/><button disabled={!prompt.trim() || busy} aria-label="发送音乐请求"><ArrowRight size={19}/></button></form>
    <section><div className="ai-section-heading"><div><h2>跟着心情走</h2><p>不必想太多，从一个感觉开始。</p></div><span>MOOD & MOMENT</span></div><div className="ai-moods">{moods.map(({ label, detail, prompt, icon: Icon, color }) => <button disabled={busy} key={label} className={`ai-mood ai-mood--${color}`} onClick={() => void ask(prompt)}><Icon size={22}/><strong>{label}</strong><small>{detail}</small><ArrowUpRight className="ai-mood-arrow" size={15}/></button>)}</div></section>
    <section><div className="ai-section-heading"><div><h2>值得再听一遍 <span className="ai-label">FROM YOUR LIBRARY</span></h2><p>按你的评分与播放次数精选。</p></div><button onClick={() => s.navigate({ kind: "songs" })}>浏览曲库 <ArrowRight size={14}/></button></div>{featured.length > 0 ? <div className="ai-record-grid">{featured.map((track) => <button className="ai-record-card" key={track.id} onClick={() => void s.playTrack(track, featured.map((t) => t.id))}><div className="ai-card-art"><Cover path={track.coverPath} seed={track.id} label={track.title} radius={12}/>{track.rating > 0 && <span className="ai-rating">★ {track.rating.toFixed(1)}</span>}<span className="ai-card-play"><Play size={18} fill="currentColor"/></span></div><strong>{track.title}</strong><small>{track.artist}</small></button>)}</div> : <div className="ai-import-empty"><Disc3 size={32}/><div><strong>你的音乐故事，从这里开始</strong><p>导入本地音乐，让熟悉的歌曲回到身边。</p></div><button className="ai-primary" onClick={() => void s.chooseLibrary()}><Plus size={16}/> 选择音乐文件夹</button></div>}</section>
    {recent.length > 0 && <section><div className="ai-section-heading"><div><h2>最近加入</h2><p>新收藏，也许会成为下一首单曲循环。</p></div><button onClick={() => { s.setSortMode("recent"); s.navigate({ kind: "songs" }); }}>查看全部 <ArrowRight size={14}/></button></div><div className="ai-recent-list">{recent.map((track, index) => <div className="ai-recent-row" key={track.id}><span className="ai-row-number">{String(index + 1).padStart(2, "0")}</span><button className="ai-recent-song" onClick={() => void s.playTrack(track, recent.map((t) => t.id))}><Cover path={track.coverPath} seed={track.id} label={track.title} radius={7}/><div><strong>{track.title}</strong><small>{track.artist}</small></div></button><span className="ai-recent-album">{track.album || track.block || "本地音乐"}</span><span>{formatTime(track.duration)}</span><button aria-label={`播放 ${track.title}`} onClick={() => void s.playTrack(track, recent.map((t) => t.id))}><Play size={15}/></button></div>)}</div></section>}
    <div className="ai-home-footer"><AudioLines size={15}/><span>Good music. A little closer.</span><span>POTATO MUSIC AI</span></div>
  </div>;
}
