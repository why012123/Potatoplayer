import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, AudioLines, CloudDownload, ExternalLink, Film, LoaderCircle, Play, Search, X } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/Headers";
import { onlineImageUrl } from "@/lib/covers";
import { formatTime } from "@/lib/format";
import { useTr } from "@/lib/i18n";
import { useAppStore } from "@/store";
import type { BilibiliExportFormat } from "@/types";
import "./bilibili-extract.css";

interface VideoResult {
  bvid: string;
  aid: number;
  title: string;
  author: string;
  coverUrl: string;
  duration: string;
}

interface VideoResults {
  query: string;
  page: number;
  pages: number;
  results: VideoResult[];
}

interface VideoPart {
  cid: number;
  page: number;
  title: string;
  duration: number;
}

interface VideoDetail {
  bvid: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  url: string;
  selectedPage: number;
  parts: VideoPart[];
}

function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const url = onlineImageUrl(src);
  return url && !failed
    ? <img className="bili-thumb" alt="" src={url} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <div className="bili-thumb bili-thumb--empty"><Film size={21} aria-hidden="true" /></div>;
}

export function BilibiliExtractPage() {
  const tr = useTr();
  const downloads = useAppStore(state => state.downloads);
  const libraryRoot = useAppStore(state => state.libraryRoot);
  const tracks = useAppStore(state => state.tracks);
  const playTrack = useAppStore(state => state.playTrack);
  const chooseLibrary = useAppStore(state => state.chooseLibrary);
  const cancelDownload = useAppStore(state => state.cancelDownload);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoResults | null>(null);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [cid, setCid] = useState(0);
  const [format, setFormat] = useState<BilibiliExportFormat>(() => {
    try {
      const saved = localStorage.getItem("potato:bilibili-format");
      if (saved === "flac" || saved === "mp3") return saved;
    } catch {}
    return "m4a";
  });
  const [preview, showPreview] = useState(false);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [fallbackQuery, setFallbackQuery] = useState("");
  const [error, setError] = useState("");
  const searchRequest = useRef(0);
  const videoRequest = useRef(0);
  const detailRef = useRef<HTMLElement>(null);

  const search = async (keyword: string, page = 1) => {
    const request = ++searchRequest.current;
    setSearching(true);
    setError("");
    try {
      const result = await window.potato.invoke<VideoResults>("bilibili.search", { keywords: keyword, page, limit: 20 });
      if (request === searchRequest.current) {
        setResults(result);
        setFallbackQuery("");
      }
    } catch (issue) {
      if (request === searchRequest.current) {
        setFallbackQuery(keyword);
        setError(issue instanceof Error ? issue.message : String(issue));
      }
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  };

  const openVideo = async (input: string) => {
    const request = ++videoRequest.current;
    showPreview(false);
    setVideo(null);
    setFallbackQuery("");
    setError("");
    setOpening(true);
    try {
      const detail = await window.potato.invoke<VideoDetail>("bilibili.video", { input });
      if (request !== videoRequest.current) return;
      setVideo(detail);
      setCid((detail.parts.find(part => part.page === detail.selectedPage) ?? detail.parts[0]).cid);
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest" }));
    } catch (issue) {
      if (request === videoRequest.current) setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      if (request === videoRequest.current) setOpening(false);
    }
  };

  const submit = (value: string) => {
    const input = value.trim();
    if (!input) return;
    if (/^(?:https?:\/\/|(?:www\.|m\.)?bilibili\.com\/|b23\.tv\/|(?:BV[\da-z]{10}|av\d+)\s*$)/i.test(input)) {
      void openVideo(input);
    } else {
      void search(input);
    }
  };

  const part = video?.parts.find(item => item.cid === cid);
  const job = [...downloads].reverse().find(item => item.source === "bilibili" &&
    item.bvid === video?.bvid && item.cid === cid && (item.exportFormat ?? "m4a") === format);
  const imported = job?.status === "done" ? tracks.find(track => track.path === job.path) : undefined;

  const extract = async () => {
    if (!video || !part || queueing || job?.status === "running") return;
    setQueueing(true);
    setError("");
    try {
      await window.potato.invoke("bilibili.download", { bvid: video.bvid, cid: part.cid, title: video.title, format });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setQueueing(false);
    }
  };

  const playerUrl = video && part ? `https://player.bilibili.com/player.html?${new URLSearchParams({
    bvid: video.bvid, cid: String(part.cid), p: String(part.page), autoplay: "0", danmaku: "0",
  })}` : "";

  return <div className="page page--discover bili-extract">
    <PageHeader
      eyebrow="BILIBILI"
      title={tr("Video extraction", "视频提取")}
      description={tr("Find a video, choose a part and save its original audio to your music library.", "搜索 B 站视频或打开链接，选择分 P 后把原声保存到资料库。")}
    />

    <form className="online-toolbar glass bili-search" role="search" onSubmit={event => { event.preventDefault(); submit(query); }}>
      <div className="online-search">
        <Search size={17} aria-hidden="true" />
        <input value={query} onChange={event => setQuery(event.target.value)} maxLength={2000}
          aria-label={tr("Search Bilibili videos or enter a link", "搜索 B 站视频或输入链接")}
          placeholder={tr("Video title, link or BV number", "视频标题、链接或 BV 号")} />
        <button className="button button--dark" disabled={searching || opening || !query.trim()}>
          {searching || opening ? <LoaderCircle size={15} className="is-spinning" /> : <Search size={15} />}
          {tr("Search or open", "搜索或打开")}
        </button>
      </div>
    </form>

    {error && <div className="online-error" role="alert">
      <div>{error}</div>
      {fallbackQuery && <button type="button" className="text-button bili-search-fallback"
        onClick={() => void window.potato.openExternal(`https://search.bilibili.com/all?keyword=${encodeURIComponent(fallbackQuery)}`)}>
        <ExternalLink size={14} />{tr("Search on Bilibili", "在 B 站搜索")}
      </button>}
    </div>}
    {opening && <p className="bili-hint" role="status">{tr("Loading video details…", "正在读取视频资料…")}</p>}

    {video && part && <section className="bili-video glass" ref={detailRef} aria-label={tr("Video details", "视频详情")}>
      <div className="bili-video__head">
        <Thumbnail key={video.coverUrl} src={video.coverUrl} />
        <div>
          <span className="eyebrow">{video.bvid}</span>
          <h2>{video.title}</h2>
          <p>{video.author} · {formatTime(part.duration)}</p>
        </div>
        <button type="button" className="icon-button icon-button--glass icon-button--sm bili-video__close"
          aria-label={tr("Close video", "关闭视频")} onClick={() => { setVideo(null); showPreview(false); }}>
          <X size={15} />
        </button>
      </div>
      {video.parts.length > 1 && <label className="bili-parts">
        {tr("Video part", "选择分 P")}
        <select value={cid} onChange={event => { setCid(Number(event.target.value)); setError(""); }}>
          {video.parts.map(item => <option value={item.cid} key={item.cid}>
            P{item.page} · {item.title || video.title} · {formatTime(item.duration)}
          </option>)}
        </select>
      </label>}
      {preview && <iframe className="bili-player" key={playerUrl} src={playerUrl} title={video.title}
        sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer" allowFullScreen />}
      {video.description && <details className="bili-description">
        <summary>{tr("Description", "视频简介")}</summary>
        <p>{video.description}</p>
      </details>}
      <div className="bili-format">
        <label className="bili-parts">
          {tr("Export format", "导出格式")}
          <select value={format} onChange={event => {
            const value = event.target.value as BilibiliExportFormat;
            setFormat(value);
            setError("");
            try { localStorage.setItem("potato:bilibili-format", value); } catch {}
          }}>
            <option value="m4a">{tr("M4A · Keep Bilibili's audio", "M4A · 保留 B 站音轨")}</option>
            <option value="flac">FLAC</option>
            <option value="mp3">MP3</option>
          </select>
        </label>
        {format === "flac" && <small>{tr("FLAC preserves the decoded audio. It cannot restore detail lost in the original AAC.", "FLAC 保留解码后的音频，无法恢复源 AAC 已丢失的细节。")}</small>}
      </div>
      <div className="bili-video__actions">
        <button type="button" className="button button--glass" aria-pressed={preview} onClick={() => showPreview(!preview)}>
          <Play size={14} />{preview ? tr("Close preview", "关闭预览") : tr("Play video preview", "播放视频预览")}
        </button>
        <button type="button" className="button button--glass" onClick={() => void window.potato.openExternal(`https://www.bilibili.com/video/${video.bvid}/?p=${part.page}`)}>
          <ExternalLink size={14} />{tr("Open on Bilibili", "在 B 站打开")}
        </button>
        {libraryRoot ? <button type="button" className="button button--dark" disabled={queueing || job?.status === "running"}
          onClick={() => imported ? void playTrack(imported, [imported.id]) : void extract()}>
          {queueing || job?.status === "running" ? <LoaderCircle size={15} className="is-spinning" />
            : imported ? <AudioLines size={15} /> : <CloudDownload size={15} />}
          {job?.status === "running" ? (job.phase === "queued" ? tr("Queued", "已排队") : job.phase === "converting" ? tr("Converting…", "正在转换…") : tr("Extracting…", "正在提取…"))
            : imported ? tr("Play imported audio", "播放已提取原声") : tr("Export {format}", "导出 {format}", { format: format.toUpperCase() })}
        </button> : <button type="button" className="button button--dark" onClick={() => void chooseLibrary()}>
          {tr("Choose a music folder", "选择音乐文件夹")}
        </button>}
      </div>
      {job && <div className="bili-transfer" role="status">
        {job.status === "running" && <>
          <span>{job.total > 0 ? `${Math.min(100, Math.floor(job.downloaded / job.total * 100))}%` : job.phase === "queued" ? tr("Waiting in download queue", "正在等待下载") : job.phase === "converting" ? tr("Converting to {format}", "正在转换为 {format}", { format: format.toUpperCase() }) : tr("Getting the audio stream", "正在读取音轨")}</span>
          <button type="button" className="text-button" onClick={() => void cancelDownload(job.jobId)}>{tr("Cancel", "取消")}</button>
        </>}
        {job.status === "done" && <span>{job.duplicate ? tr("Already in your library", "原声已在资料库") : tr("Saved to library · {format}", "已保存到资料库 · {format}", { format: format.toUpperCase() })}</span>}
        {job.status === "error" && <span className="bili-transfer__error">{job.message || tr("Extraction failed", "提取失败")}</span>}
        {job.status === "cancelled" && <span>{tr("Extraction cancelled", "已取消提取")}</span>}
      </div>}
    </section>}

    {results && <section className="bili-results" aria-label={tr("Video search results", "视频搜索结果")}>
      <div className="bili-results__head">
        <h2>{tr("Videos", "视频")} · {results.query}</h2>
        <div className="bili-pagination">
          <button type="button" className="icon-button icon-button--glass icon-button--sm" disabled={searching || results.page <= 1}
            aria-label={tr("Previous page", "上一页")} onClick={() => void search(results.query, results.page - 1)}><ArrowLeft size={15} /></button>
          <span>{results.page} / {results.pages}</span>
          <button type="button" className="icon-button icon-button--glass icon-button--sm" disabled={searching || results.page >= results.pages}
            aria-label={tr("Next page", "下一页")} onClick={() => void search(results.query, results.page + 1)}><ArrowRight size={15} /></button>
        </div>
      </div>
      {results.results.length ? <div className="bili-grid">
        {results.results.map(item => <button type="button" key={item.bvid || item.aid}
          className={clsx("bili-card glass", { "is-selected": video?.bvid === item.bvid })}
          onClick={() => void openVideo(item.bvid || `av${item.aid}`)}>
          <div className="bili-card__image">
            <Thumbnail src={item.coverUrl} />
            {item.duration && <span>{item.duration}</span>}
          </div>
          <div className="bili-card__copy">
            <strong>{item.title}</strong>
            <span>{item.author}</span>
          </div>
        </button>)}
      </div> : <p className="bili-hint">{tr("No videos matched this search.", "没有找到匹配的视频。")}</p>}
    </section>}
  </div>;
}
