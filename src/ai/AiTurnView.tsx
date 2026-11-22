import { useTr } from "@/lib/i18n";
import { AudioLines, Check, Clock3, CircleAlert, Compass, ExternalLink, ListMusic, LoaderCircle, Play, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useAppStore } from "@/store";
import { Cover } from "@/components/Cover";
import { toolLabels, useAssistant } from "./assistant";
import type { AssistantTurn } from "./types";
function sourceHost(url: string, fallback: string) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return fallback;
    }
}
export function AiTurnView({ turn, onRetry }: {
    onRetry?: (prompt: string, files?: File[]) => void;
    turn: AssistantTurn;
}) {
    const tr = useTr();
    const s = useAppStore();
    const busy = useAssistant((state) => state.busy);
    const connected = useAssistant((state) => state.connected);
    const retry = useAssistant((state) => state.ask);
    const tracks = (turn.result?.trackIds ?? [])
        .map((id) => s.tracks.find((track) => track.id === id))
        .filter((track) => track !== undefined);
    const operations = (turn.result?.actions ?? turn.operations ?? []).filter(action => action.operation);
    const labels = toolLabels();
    const statusLabels: Record<string, string> = {
        done: tr("Completed", "已完成"), queued: tr("Queued", "已排队"), running: tr("In progress", "进行中"),
        partial: tr("Partially completed", "部分完成"), skipped: tr("Skipped", "未执行"),
        cancelled: tr("Cancelled", "已取消"), error: tr("Failed", "失败"), unknown: tr("Unconfirmed", "结果未确认"),
    };
    const sourceLabels: Record<string, string> = {
        history: tr("Past conversation", "旧对话"), song_memory: tr("Song memory", "歌曲记忆"),
        profile_memory: tr("Preferences", "长期偏好"), tracks: tr("Library", "曲库"),
        quality: tr("Audio quality", "音质"), stats: tr("Listening stats", "聆听统计"),
        lyrics: tr("Lyrics", "歌词"), settings: tr("Settings", "设置"),
        playlists: tr("Playlists", "歌单"), downloads: tr("Downloads", "下载任务"),
        ultra: tr("Ultra archive", "Ultra 档案"), playback: tr("Playback", "播放状态"),
    };
    const loadConversation = async (id: string, turnId?: string) => {
        const conversation = await useAssistant.getState().loadConversation(id);
        if (!conversation) return;
        s.navigate({ kind: "ai" });
        if (turnId) requestAnimationFrame(() => document.getElementById(`ai-turn-${turnId}`)?.scrollIntoView({ block: "nearest" }));
    };
    return (<article className="ai-turn" id={`ai-turn-${turn.id}`}>
      <div className="ai-user-message">{turn.prompt}{!!turn.imageCount && <small>{tr("{n} attached image(s)", "附图 {n} 张", { n: turn.imageCount })}</small>}</div>
      <div className="ai-reply-label">
        <Sparkles size={13}/> {tr("POTATO ASSISTANT", "音乐助手")}
        {turn.provider === "deepseek" && <em>DEEPSEEK</em>}
      </div>
      {turn.error ? (<div className="ai-response-error">
          <p>{turn.error}</p>
          {turn.imageCount && !turn.retryImages?.length ? <small>{tr("Paste the image again to retry.", "重新粘贴图片即可重试。")}</small> : <button disabled={busy} onClick={() => onRetry ? onRetry(turn.prompt, turn.retryImages) : void retry(turn.prompt, {images: turn.retryImages})}>{tr("Try again", "重新尝试")}<RotateCcw size={13}/>
          </button>}
        </div>) : turn.result ? (<>
          {turn.result.title && <h3>{turn.result.title}</h3>}
          <p className="ai-reply-explanation">{turn.result.explanation}</p>
          {turn.result.sources && turn.result.sources.length > 0 && (<div className="ai-source-list">
              <span className="ai-source-caption">
                <Compass size={12}/>{tr("Web sources", "网页来源")}</span>
              {turn.result.sources.map((source) => (<button key={source.url} type="button" title={source.url} onClick={() => void window.potato.openExternal(source.url)}>
                  <span>{source.site || sourceHost(source.url, tr("Web page", "网页"))}</span>
                  <strong>{source.title}</strong>
                  <ExternalLink size={12}/>
                </button>))}
            </div>)}
          {tracks.length > 0 && (<div className="ai-result-card">
              <div className="ai-result-heading">
                <ListMusic size={14}/>
                <span>
                  {tracks.length}{tr(" songs ·", "首 ·")}{turn.result.intent === "playlist" ? tr("Playlist draft", "歌单草案") : tr("Local songs", "本地歌曲")}
                </span>
              </div>
              {tracks.map((track) => (<button className="ai-result-track" key={track.id} aria-label={tr("Play {v0}", "播放 {v0}", { v0: track.title })} title={[track.title, track.artist, track.album].filter(Boolean).join(" · ")} onClick={() => void s.playTrack(track, tracks.map((t) => t.id))}>
                  <Cover path={track.coverPath} seed={track.id} label={track.title} radius={7}/>
                  <div>
                    <strong>{track.title}</strong>
                    <small>{[track.artist, track.album].filter(Boolean).join(" · ")}</small>
                  </div>
                  <Play size={13}/>
                </button>))}
              <div className="ai-result-actions">
                <button className="ai-primary" onClick={() => void s.playTrack(tracks[0], tracks.map((t) => t.id))}>
                  <Play size={13} fill="currentColor"/>{tr("Play all", "播放全部")}</button>
                <button aria-label={tr("Add to queue", "加入队列")} title={tr("Add to queue", "加入队列")} onClick={() => void s.enqueueMany(tracks.map((t) => t.id), false)}>
                  <ListMusic size={16}/>
                </button>
                <button aria-label={tr("Save to playlist", "保存到歌单")} title={tr("Save to playlist", "保存到歌单")} onClick={() => s.setAddToPlaylistTrackIds(tracks.map((t) => t.id))}>
                  <Plus size={17}/>
                </button>
              </div>
            </div>)}
          {tracks.length === 0 && !connected && turn.result.intent === "search" && (<button className="ai-response-link" onClick={() => (s.tracks.length ? s.navigate({ kind: "discover" }) : void s.chooseLibrary())}>
              {s.tracks.length ? <Compass size={14}/> : <Plus size={14}/>} {s.tracks.length ? tr("Open Discover", "去在线发现") : tr("Choose music folder", "选择音乐文件夹")}
            </button>)}
        </>) : (<>
          {turn.streaming ? (<p className="ai-reply-explanation">{turn.streaming}</p>) : (<p className="ai-reply-explanation">
              <AudioLines size={14}/>{tr("Connecting music and memories…", "正在连接音乐与记忆…")}</p>)}
          <p className="ai-thinking">
            <LoaderCircle size={15}/>{tr("Working…", "正在处理…")}</p>
        </>)}
      {operations.length > 0 && <div className="ai-receipts" aria-live="polite">
        <span className="ai-source-caption">{tr("Operation results", "操作结果")}</span>
        {operations.map((action, index) => {
          const status = action.status;
          const Icon = status === "done" ? Check : status === "queued" || status === "running" ? Clock3 : CircleAlert;
          return <div className="ai-receipt" key={index}>
            <div className="ai-receipt__heading"><Icon size={13}/><strong>{labels[action.name] ?? action.name}</strong><span>{statusLabels[status] ?? status}</span></div>
            {action.detail && <small>{action.detail}</small>}
            {action.jobs?.map(job => {
              const live = s.downloads.find(item => item.jobId === job.jobId);
              const jobStatus = live?.status === "running" && live.phase !== "queued" ? "running" : live?.status !== "running" && live?.status ? live.status : job.status;
              const unavailable = job.upgradeUnavailable || job.downgradeUnavailable;
              const statusText = jobStatus === "done" && unavailable ? tr("Requested quality unavailable", "目标音质不可用")
                : jobStatus === "done" && job.replaced ? tr("Audio replaced", "已替换音频")
                : jobStatus === "done" && job.duplicate ? tr("Existing file reused", "已复用已有文件")
                : statusLabels[jobStatus] ?? jobStatus;
              return <div className="ai-receipt__job" key={job.jobId}>
                <span>{job.title || job.jobId}</span>
                <small>{[statusText, job.quality, job.message].filter(Boolean).join(" · ")}</small>
              </div>;
            })}
          </div>;
        })}
      </div>}
      {turn.result?.downloadSummary && <p className="ai-download-summary" aria-live="polite"><strong>{tr("Download update", "下载反馈")}</strong> {turn.result.downloadSummary}</p>}
      {!!turn.result?.localSources?.length && <details className="ai-local-sources">
        <summary>{tr("Local sources", "本地资料来源")} · {turn.result.localSources.length}</summary>
        {turn.result.localSources.map((source, index) => {
          const label = sourceLabels[source.source] ?? source.source;
          const text = <><strong>{source.title || label}</strong> <small>{label}</small>{source.preview && <span>{source.preview}</span>}</>;
          if (source.conversationId) return <button type="button" key={index} disabled={busy} onClick={() => void loadConversation(source.conversationId!, source.turnId)}>{text}</button>;
          if (source.trackId && s.tracks.some(track => track.id === source.trackId)) return <button type="button" key={index} onClick={() => s.navigate({ kind: "editor", trackId: source.trackId })}>{text}</button>;
          return <div key={index}>{text}</div>;
        })}
      </details>}
      {turn.activity && turn.activity.length > 0 && (<details className="ai-tool-log">
          <summary>{tr("View activity (", "查看操作记录（")}{turn.activity.filter((item) => !item.startsWith("…")).length}{tr(")", "）")}</summary>
          {turn.activity.map((item, index) => (<div key={index}>{item}</div>))}
        </details>)}
    </article>);
}
