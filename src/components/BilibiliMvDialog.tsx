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
    if (!opened) pushToast("Could not open Bilibili", "The link was blocked by the desktop shell.", "error");
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
              <h2 id="mv-title">Find a music video</h2>
              <p>
                Searching Bilibili for <strong>{track.title}</strong> · {track.artist}
              </p>
            </div>
            <button type="button" className="mv-close" aria-label="Close MV search" onClick={close}>
              <X size={18} />
            </button>
          </header>

          <form className="mv-search" onSubmit={submit}>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Bilibili for a song, artist or MV"
              aria-label="Search Bilibili for an MV"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="button button--dark button--small" disabled={loading || !query.trim()}>
              {loading ? <LoaderCircle size={14} className="is-spinning" /> : <Search size={14} />}
              Search
            </button>
          </form>

          <div className="mv-meta">
            <span>
              {loading
                ? "Searching Bilibili…"
                : error
                  ? "Search unavailable"
                  : results.length
                    ? `${results.length} shown · ${formatCount(total)} results`
                    : "No results yet"}
            </span>
            <button type="button" onClick={() => void openUrl(searchUrl)}>
              Open full search <ExternalLink size={12} />
            </button>
          </div>

          <div className="mv-results">
            {loading ? (
              <div className="mv-skeleton-list" aria-label="Searching Bilibili">
                <span />
                <span />
                <span />
              </div>
            ) : error ? (
              <div className="mv-empty">
                <AlertCircle size={23} />
                <strong>Bilibili could not be reached.</strong>
                <p>{error}</p>
                <div className="mv-empty__actions">
                  <button type="button" className="button button--glass button--small" onClick={() => void runSearch(query)}>
                    <RefreshCw size={13} /> Try again
                  </button>
                  <button type="button" className="button button--glass button--small" onClick={() => void openUrl(searchUrl)}>
                    Search on Bilibili <ExternalLink size={13} />
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
                  title={`Open “${video.title}” on Bilibili`}
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
                      {formatCount(video.playCount)} views
                      {video.publishedAt ? ` · ${formatDate(video.publishedAt)}` : ""}
                    </em>
                  </span>
                  <ExternalLink size={15} className="mv-result__open" />
                </button>
              ))
            ) : (
              <div className="mv-empty">
                <Clapperboard size={23} />
                <strong>No videos found for this search.</strong>
                <p>Try a shorter title, add the artist name, or open Bilibili’s full search.</p>
                <button type="button" className="button button--glass button--small" onClick={() => void openUrl(searchUrl)}>
                  Search on Bilibili <ExternalLink size={13} />
                </button>
              </div>
            )}
          </div>

          <footer className="mv-foot">
            <span>No Bilibili login required.</span>
            <span>Videos open in your system browser.</span>
          </footer>
        </Modal>
      )}
    </AnimatePresence>
  );
}
