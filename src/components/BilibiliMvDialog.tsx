import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  AlertCircle,
  Clapperboard,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { BilibiliSearchResult, BilibiliVideo, Track } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { Modal } from "@/components/Modal";

function defaultQuery(track: Track | undefined): string {
  if (!track) return "";
  const title = track.title.replace(/\s*[;；]\s*$/, "").trim();
  return `${title} ${track.artist} MV`.replace(/\s+/g, " ").trim().slice(0, 120);
}

function searchPage(query: string): string {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}`;
}

function formatCount(value: number): string {
  if (!value) return "0";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: number): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function friendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "");
}

export function BilibiliMvDialog() {
  const tr = useTr();
  const trackId = useAppStore((state) => state.mvTrackId);
  const setMvTrackId = useAppStore((state) => state.setMvTrackId);
  const pushToast = useAppStore((state) => state.pushToast);
  const tracks = useAppStore((state) => state.tracks);
  const track = trackId ? tracks.find((item) => item.id === trackId) : undefined;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BilibiliVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [searchUrl, setSearchUrl] = useState("https://search.bilibili.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  const runSearch = async (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const id = ++sequence.current;
    setLoading(true);
    setError(null);
    setSearchUrl(searchPage(clean));
    try {
      const data = await window.potato.invoke<BilibiliSearchResult>("bilibili.search", {
        keywords: clean,
        limit: 20,
      });
      if (id !== sequence.current) return;
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
      setSearchUrl(data.searchUrl || searchPage(clean));
    } catch (reason) {
      if (id !== sequence.current) return;
      setResults([]);
      setTotal(0);
      setError(friendlyError(reason));
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!track) return;
    const initial = defaultQuery(track);
    setQuery(initial);
    setResults([]);
    setTotal(0);
    setError(null);
    setSearchUrl(searchPage(initial));
    void runSearch(initial);
    return () => {
      sequence.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  const close = () => {
    sequence.current++;
    setMvTrackId(null);
  };

  const openUrl = async (url: string) => {
    if (!url) return;
    const opened = await window.potato.openExternal(url);
    if (!opened) {
      pushToast(
        tr("Could not open Bilibili", "无法打开 Bilibili"),
        tr("The link was blocked by the desktop shell.", "桌面外壳阻止了该链接。"),
        "error",
      );
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim() || defaultQuery(track);
    if (!value) return;
    setQuery(value);
    void runSearch(value);
  };

  return (
    <AnimatePresence>
      {track && (
        <Modal onClose={close} className="mv-dialog" labelledBy="mv-title">
          <header className="mv-head">
            <div>
              <div className="modal__eyebrow">
                <Clapperboard size={13} /> Bilibili
              </div>
              <h2 id="mv-title">{tr("Find a music video", "查找音乐视频")}</h2>
              <p>
                {tr("Searching Bilibili for", "正在 Bilibili 搜索")} <strong>{track.title}</strong> ·{" "}
                {track.artist}
              </p>
            </div>
            <button
              type="button"
              className="mv-close"
              aria-label={tr("Close MV search", "关闭 MV 搜索")}
              onClick={close}
            >
              <X size={18} />
            </button>
          </header>

          <form className="mv-search" onSubmit={submit}>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("Search Bilibili for a song, artist or MV", "在 Bilibili 搜索歌曲、歌手或 MV")}
              aria-label={tr("Search Bilibili for an MV", "在 Bilibili 搜索 MV")}
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="button button--dark button--small" disabled={loading || !query.trim()}>
              {loading ? <LoaderCircle size={14} className="is-spinning" /> : <Search size={14} />}
              {tr("Search", "搜索")}
            </button>
          </form>

          <div className="mv-meta">
            <span>
              {loading
                ? tr("Searching Bilibili…", "正在搜索 Bilibili…")
                : error
                  ? tr("Search unavailable", "搜索暂不可用")
                  : results.length
                    ? tr("{shown} shown · {total} results", "显示 {shown} 个 · 共 {total} 个结果", {
                        shown: results.length,
                        total: formatCount(total),
                      })
                    : tr("No results yet", "暂无结果")}
            </span>
            <button type="button" onClick={() => void openUrl(searchUrl)}>
              {tr("Open full search", "打开完整搜索")} <ExternalLink size={12} />
            </button>
          </div>

          <div className="mv-results">
            {loading ? (
              <div className="mv-skeleton-list" aria-label={tr("Searching Bilibili", "正在搜索 Bilibili")}>
                <span />
                <span />
                <span />
              </div>
            ) : error ? (
              <div className="mv-empty">
                <AlertCircle size={23} />
                <strong>{tr("Bilibili could not be reached.", "无法连接 Bilibili。")}</strong>
                <p>{error}</p>
                <div className="mv-empty__actions">
                  <button type="button" className="button button--glass button--small" onClick={() => void runSearch(query)}>
                    <RefreshCw size={13} /> {tr("Try again", "重试")}
                  </button>
                  <button type="button" className="button button--glass button--small" onClick={() => void openUrl(searchUrl)}>
                    {tr("Search on Bilibili", "在 Bilibili 搜索")} <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            ) : results.length ? (
              results.map((video) => (
                <button
                  key={video.bvid || video.url}
                  type="button"
                  className="mv-result"
                  onClick={() => void openUrl(video.url)}
                  title={tr("Open “{title}” on Bilibili", "在 Bilibili 打开“{title}”", {
                    title: video.title,
                  })}
                >
                  <span className="mv-result__thumb">
                    {video.coverUrl ? (
                      <img src={video.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <Clapperboard size={22} />
                    )}
                    {video.duration && <em>{video.duration}</em>}
                  </span>
                  <span className="mv-result__copy">
                    <strong>{video.title}</strong>
                    <span>
                      {video.author}
                      {video.typeName ? ` · ${video.typeName}` : ""}
                    </span>
                    <em>
                      {tr("{count} views", "{count} 次播放", { count: formatCount(video.playCount) })}
                      {video.publishedAt ? ` · ${formatDate(video.publishedAt)}` : ""}
                    </em>
                  </span>
                  <ExternalLink size={15} className="mv-result__open" />
                </button>
              ))
            ) : (
              <div className="mv-empty">
                <Clapperboard size={23} />
                <strong>{tr("No videos found for this search.", "没有找到相关视频。")}</strong>
                <p>
                  {tr(
                    "Try a shorter title, add the artist name, or open Bilibili’s full search.",
                    "试试更短的标题、加上歌手名，或打开 Bilibili 的完整搜索。",
                  )}
                </p>
                <button type="button" className="button button--glass button--small" onClick={() => void openUrl(searchUrl)}>
                  {tr("Search on Bilibili", "在 Bilibili 搜索")} <ExternalLink size={13} />
                </button>
              </div>
            )}
          </div>

          <footer className="mv-foot">
            <span>{tr("No Bilibili login required.", "无需登录 Bilibili。")}</span>
            <span>{tr("Videos open in your system browser.", "视频将在系统浏览器中打开。")}</span>
          </footer>
        </Modal>
      )}
    </AnimatePresence>
  );
}
