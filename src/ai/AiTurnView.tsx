import { AudioLines, Compass, ExternalLink, ListMusic, LoaderCircle, Play, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { useAssistant } from "./assistant";
import type { AssistantTurn } from "./types";

function sourceHost(url: string, fallback = "网页") {
  try {
    return new URL(url).hostname;
  } catch {
    return fallback;
  }
}

export function AiTurnView({ turn }: { turn: AssistantTurn }) {
  const s = useAppStore();
  const busy = useAssistant((state) => state.busy);
  const connected = useAssistant((state) => state.connected);
  const retry = useAssistant((state) => state.ask);
  const tracks = (turn.result?.trackIds ?? [])
    .map((id) => s.tracks.find((track) => track.id === id))
    .filter((track) => track !== undefined);
  return (
    <article className="ai-turn">
      <div className="ai-user-message">{turn.prompt}</div>
      <div className="ai-reply-label">
        <Sparkles size={13} /> POTATO ASSISTANT
        {turn.provider === "deepseek" && <em>DEEPSEEK</em>}
      </div>
      {turn.error ? (
        <div className="ai-response-error">
          <p>{turn.error}</p>
          <button disabled={busy} onClick={() => void retry(turn.prompt)}>
            重新尝试 <RotateCcw size={13} />
          </button>
        </div>
      ) : turn.result ? (
        <>
          {turn.result.title && <h3>{turn.result.title}</h3>}
          <p className="ai-reply-explanation">{turn.result.explanation}</p>
          {turn.result.sources && turn.result.sources.length > 0 && (
            <div className="ai-source-list">
              <span className="ai-source-caption">
                <Compass size={12} /> 网页来源
              </span>
              {turn.result.sources.map((source) => (
                <button
                  key={source.url}
                  type="button"
                  title={source.url}
                  onClick={() => void window.potato.openExternal(source.url)}
                >
                  <span>{source.site || sourceHost(source.url)}</span>
                  <strong>{source.title}</strong>
                  <ExternalLink size={12} />
                </button>
              ))}
            </div>
          )}
          {tracks.length > 0 && (
            <div className="ai-result-card">
              <div className="ai-result-heading">
                <ListMusic size={14} />
                <span>
                  {tracks.length} 首 · {turn.result.intent === "playlist" ? "歌单草案" : "本地歌曲"}
                </span>
              </div>
              {tracks.map((track) => (
                <button
                  className="ai-result-track"
                  key={track.id}
                  aria-label={`播放 ${track.title}`}
                  onClick={() => void s.playTrack(track, tracks.map((t) => t.id))}
                >
                  <Cover path={track.coverPath} seed={track.id} label={track.title} radius={7} />
                  <div>
                    <strong>{track.title}</strong>
                    <small>{track.artist}</small>
                  </div>
                  <Play size={13} />
                </button>
              ))}
              <div className="ai-result-actions">
                <button className="ai-primary" onClick={() => void s.playTrack(tracks[0], tracks.map((t) => t.id))}>
                  <Play size={13} fill="currentColor" /> 播放全部
                </button>
                <button
                  aria-label="加入队列"
                  title="加入队列"
                  onClick={() => void s.enqueueMany(tracks.map((t) => t.id), false)}
                >
                  <ListMusic size={16} />
                </button>
                <button
                  aria-label="保存到歌单"
                  title="保存到歌单"
                  onClick={() => s.setAddToPlaylistTrackIds(tracks.map((t) => t.id))}
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>
          )}
          {tracks.length === 0 && !connected && turn.result.intent === "search" && (
            <button
              className="ai-response-link"
              onClick={() => (s.tracks.length ? s.navigate({ kind: "discover" }) : void s.chooseLibrary())}
            >
              {s.tracks.length ? <Compass size={14} /> : <Plus size={14} />} {s.tracks.length ? "去在线发现" : "选择音乐文件夹"}
            </button>
          )}
        </>
      ) : (
        <>
          {turn.streaming ? (
            <p className="ai-reply-explanation">{turn.streaming}</p>
          ) : (
            <p className="ai-reply-explanation">
              <AudioLines size={14} /> 正在连接音乐与记忆…
            </p>
          )}
          <p className="ai-thinking">
            <LoaderCircle size={15} /> 正在处理…
          </p>
        </>
      )}
      {turn.activity && turn.activity.length > 0 && (
        <details className="ai-tool-log">
          <summary>查看操作记录（{turn.activity.filter((item) => !item.startsWith("…")).length}）</summary>
          {turn.activity.map((item, index) => (
            <div key={index}>{item}</div>
          ))}
        </details>
      )}
    </article>
  );
}
