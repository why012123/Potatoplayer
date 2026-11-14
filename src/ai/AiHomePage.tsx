import { useTr } from "@/lib/i18n";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Coffee, Disc3, Heart, Headphones, Moon, Play, Plus, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { useAssistant } from "./assistant";
import { Cover } from "@/components/Cover";
import { AiHomeLibrary } from "./AiHomeLibrary";
export function AiHomePage() {
    const tr = useTr();
    const moods = [
        { label: tr("Time to focus", "专注时刻"), prompt: tr("Recommend a playlist for focus", "推荐适合专注的歌单"), icon: Headphones, color: "sage" },
        { label: tr("Slow down", "慢下来"), prompt: tr("Recommend a relaxing playlist", "推荐适合放松的歌单"), icon: Coffee, color: "peach" },
        { label: tr("After dark", "夜色渐深"), prompt: tr("Recommend a playlist for the evening", "推荐夜晚的歌单"), icon: Moon, color: "lilac" },
        { label: tr("Old favorites", "重逢喜欢"), prompt: tr("Make a playlist of my favorite songs", "整理我收藏的歌曲歌单"), icon: Heart, color: "sand" },
    ];
    const s = useAppStore();
    const ask = useAssistant((state) => state.ask);
    const busy = useAssistant((state) => state.busy);
    const [prompt, setPrompt] = useState("");
    const featured = [...s.tracks].sort((a, b) => b.rating - a.rating || b.playCount - a.playCount).slice(0, 4);
    const hour = new Date().getHours();
    const greeting = hour < 6 ? tr("Late-night listening", "夜深了") : hour < 12 ? tr("Good morning", "早上好") : hour < 18 ? tr("Good afternoon", "下午好") : tr("Good evening", "晚上好");
    return <div className="ai-home">
    <div className="ai-home-heading"><div><h1>{greeting}{tr(". Stay a while with music.", "，让音乐陪你一会儿。")}</h1><p>{tr("Find a song, press play, or talk about music from your library.", "从你的曲库开始，找歌、听歌，或聊聊音乐。")}</p></div><span className="ai-date">{new Intl.DateTimeFormat(tr("en", "zh-CN"), { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</span></div>
    <form className="ai-home-prompt" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) {
        void ask(prompt);
        setPrompt("");
    } }}><Sparkles size={18}/><input aria-label={tr("Ask your music assistant", "向音乐助手提问")} value={prompt} maxLength={1000} onChange={(e) => setPrompt(e.target.value)} placeholder={tr("Name a song or artist, or describe what you want to hear…", "告诉我歌名和歌手，或描述此刻想听的音乐…")}/><button disabled={!prompt.trim() || busy} aria-label={tr("Send music request", "发送音乐请求")}><ArrowRight size={19}/></button></form>
    <section><div className="ai-moods">{moods.map(({ label, prompt, icon: Icon, color }) => <button disabled={busy} key={label} className={`ai-mood ai-mood--${color}`} onClick={() => void ask(prompt)}><Icon size={22}/><strong>{label}</strong><ArrowUpRight className="ai-mood-arrow" size={15}/></button>)}</div></section>
    <section><div className="ai-section-heading"><div><h2>{tr("Worth another listen", "值得再听一遍")}</h2><p>{tr("Selected from your ratings and play counts.", "按你的评分与播放次数精选。")}</p></div><button onClick={() => s.navigate({ kind: "songs" })}>{tr("Browse library", "浏览曲库")}<ArrowRight size={14}/></button></div>{featured.length > 0 ? <div className="ai-record-grid">{featured.map((track) => <button className="ai-record-card" key={track.id} onClick={() => void s.playTrack(track, featured.map((t) => t.id))}><div className="ai-card-art"><Cover path={track.coverPath} seed={track.id} label={track.title} radius={12}/>{track.rating > 0 && <span className="ai-rating">★ {track.rating.toFixed(1)}</span>}<span className="ai-card-play"><Play size={18} fill="currentColor"/></span></div><strong>{track.title}</strong><small>{track.artist}</small></button>)}</div> : <div className="ai-import-empty"><Disc3 size={32}/><div><strong>{tr("Your music story starts here", "你的音乐故事，从这里开始")}</strong><p>{tr("Import your local music and bring familiar songs back.", "导入本地音乐，让熟悉的歌曲回到身边。")}</p></div><button className="ai-primary" onClick={() => void s.chooseLibrary()}><Plus size={16}/>{tr("Choose music folder", "选择音乐文件夹")}</button></div>}</section>
    <AiHomeLibrary />
  </div>;
}
