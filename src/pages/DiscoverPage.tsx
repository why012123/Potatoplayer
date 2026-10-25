import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudDownload,
  Disc3,
  KeyRound,
  ListMusic,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  WifiOff,
} from "lucide-react";
import type { NeteasePlaylist, NeteaseSong, NeteaseStatus } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { coverGradient } from "@/lib/covers";
import { formatTime, initials } from "@/lib/format";

type Mode = "search" | "daily" | "playlists";

function SongRow({
  song,
  onDownload,
  downloading,
}: {
  song: NeteaseSong;
  onDownload: () => void;
  downloading?: boolean;
}) {
  return (
    <div className="online-song">
      {song.coverUrl ? (
        <div className="online-song__cover online-cover">
          <img src={song.coverUrl} alt="" loading="lazy" draggable={false} />
        </div>
      ) : (
        <div
          className="online-song__cover online-song__cover--fallback"
          style={{ background: coverGradient(song.album || song.artists || song.name) }}
        >
          <span>{initials(song.album || song.artists || song.name)}</span>
        </div>
      )}
      <div className="online-song__copy">
        <strong>{song.name}</strong>
        <span>
          {song.artists}
          {song.album ? ` · ${song.album}` : ""}
        </span>
      </div>
      <div className="online-song__meta">
        {song.fee > 0 && <span className="online-fee">{song.fee === 1 ? "VIP" : "HQ"}</span>}
        <em>{formatTime(song.durationMs / 1000)}</em>
      </div>
      <button
        type="button"
        className="button button--glass button--small online-download"
        onClick={onDownload}
        disabled={downloading}
        title="Download and add to your library"
      >
        {downloading ? <LoaderCircle size={14} className="is-spinning" /> : <CloudDownload size={14} />}
        Download
      </button>
    </div>
  );
}

export function DiscoverPage() {
  const libraryRoot = useAppStore((state) => state.libraryRoot);
  const pushToast = useAppStore((state) => state.pushToast);
  const downloads = useAppStore((state) => state.downloads);
  const [status, setStatus] = useState<NeteaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState("high");
  const [results, setResults] = useState<NeteaseSong[]>([]);
  const [searching, setSearching] = useState(false);
  const [daily, setDaily] = useState<NeteaseSong[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState<{
    id: string;
    name: string;
    coverUrl: string;
    tracks: NeteaseSong[];
  } | null>(null);
  const [qr, setQr] = useState<{ key: string; qrImage: string | null } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrMessage, setQrMessage] = useState("");
  const [cookieMode, setCookieMode] = useState(false);
  const [cookie, setCookie] = useState("");
  const [cookieBusy, setCookieBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.potato.invoke<NeteaseStatus>("netease.status");
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startService = async () => {
    setStarting(true);
    setError(null);
    try {
      const next = await window.potato.invoke<NeteaseStatus>("netease.startService");
      setStatus(next);
      if (next.service) pushToast("NetEase service connected", undefined, "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const beginQr = async () => {
    setQrLoading(true);
    setQrMessage("");
    try {
      const data = await window.potato.invoke<{ key: string; qrImage: string | null }>("netease.qrKey");
      setQr(data);
    } catch (e) {
      pushToast("Could not create login code", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (!qr?.key) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const result = await window.potato.invoke<{ code: number; loggedIn?: boolean; message: string }>(
          "netease.qrCheck",
          { key: qr.key },
        );
        if (cancelled) return;
        setQrMessage(result.message);
        if (result.loggedIn || result.code === 803) {
          clearInterval(timer);
          setQr(null);
          await refresh();
          pushToast("Signed in to NetEase", status?.nickname ?? undefined, "success");
        } else if (result.code === 800) {
          clearInterval(timer);
          setQr(null);
          setQrMessage("Code expired. Create a new one.");
        }
      } catch {
        // Keep polling quietly; transient API hiccups are common.
      }
    }, 2200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [qr?.key, refresh, pushToast, status?.nickname]);

  const loginCookie = async () => {
    if (!cookie.trim()) return;
    setCookieBusy(true);
    try {
      const next = await window.potato.invoke<NeteaseStatus>("netease.loginCookie", { cookie });
      setStatus(next);
      setCookie("");
      setCookieMode(false);
      if (next.loggedIn) pushToast("Signed in to NetEase", next.nickname, "success");
    } catch (e) {
      pushToast("Cookie login failed", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setCookieBusy(false);
    }
  };

  const logout = async () => {
    try {
      const next = await window.potato.invoke<NeteaseStatus>("netease.logout");
      setStatus(next);
      setResults([]);
      setDaily([]);
      setPlaylists([]);
      setActivePlaylist(null);
      setQr(null);
      pushToast("Signed out of NetEase");
    } catch (e) {
      pushToast("Could not sign out", e instanceof Error ? e.message : String(e), "error");
    }
  };

  const search = async (value?: string) => {
    const keywords = (value ?? query).trim();
    if (!keywords) {
      searchInputRef.current?.focus();
      return;
    }
    setQuery(keywords);
    setSearching(true);
    setActivePlaylist(null);
    try {
      const list = await window.potato.invoke<NeteaseSong[]>("netease.search", { keywords, limit: 40 });
      setResults(list);
      document.querySelector(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      if (!list.length) pushToast("No songs found", keywords, "error");
    } catch (e) {
      pushToast("Search failed", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSearching(false);
    }
  };

  const loadDaily = async () => {
    if (daily.length) return;
    setDailyLoading(true);
    try {
      setDaily(await window.potato.invoke<NeteaseSong[]>("netease.daily"));
    } catch (e) {
      pushToast("Could not load recommendations", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setDailyLoading(false);
    }
  };

  const loadPlaylists = async () => {
    if (playlists.length) return;
    setPlaylistLoading(true);
    try {
      setPlaylists(await window.potato.invoke<NeteasePlaylist[]>("netease.playlists"));
    } catch (e) {
      pushToast("Could not load playlists", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setPlaylistLoading(false);
    }
  };

  const openPlaylist = async (playlist: NeteasePlaylist) => {
    setPlaylistLoading(true);
    try {
      const detail = await window.potato.invoke<{
        id: string;
        name: string;
        coverUrl: string;
        tracks: NeteaseSong[];
      }>("netease.playlistDetail", { playlistId: playlist.id });
      setActivePlaylist(detail);
    } catch (e) {
      pushToast("Could not open playlist", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setPlaylistLoading(false);
    }
  };

  const download = async (song: NeteaseSong) => {
    try {
      await window.potato.invoke("netease.download", { id: song.id, quality });
      pushToast("Download queued", `${song.artists} — ${song.name}`);
    } catch (e) {
      pushToast("Could not queue download", e instanceof Error ? e.message : String(e), "error");
    }
  };

  const downloadAll = async () => {
    const tracks = activePlaylist?.tracks ?? [];
    if (!tracks.length) return;
    for (const song of tracks.slice(0, 30)) {
      try {
        await window.potato.invoke("netease.download", { id: song.id, quality });
      } catch {
        // Continue the batch; individual failures are surfaced by the backend.
      }
    }
    pushToast("Downloads queued", `${Math.min(tracks.length, 30)} songs will arrive one by one.`, "success");
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === "daily") void loadDaily();
    if (next === "playlists") void loadPlaylists();
  };

  const isDownloading = (id: string) =>
    downloads.some((job) => job.neteaseId === id && job.status === "running");

  if (loading) {
    return (
      <div className="page page--discover">
        <PageHeader eyebrow="Online" title="Discover" description="Connecting to your NetEase account…" />
        <div className="online-loading glass">
          <LoaderCircle size={22} className="is-spinning" />
          <span>Waking the local NetEase bridge</span>
        </div>
      </div>
    );
  }

  if (!status?.service) {
    return (
      <div className="page page--discover">
        <PageHeader
          eyebrow="Online"
          title="Discover"
          description="Search and bring new music into the same blocks, genres and playlists you already use."
        />
        <div className="online-gate glass">
          <div className="online-gate__icon">
            <WifiOff size={27} />
          </div>
          <h2>The local NetEase bridge is asleep.</h2>
          <p>
            Potatoplayer Super talks to <code>api-enhanced</code> on <strong>{status?.apiBase}</strong>. Start it once
            and the connection stays local.
          </p>
          {error && <div className="online-error">{error}</div>}
          <div className="online-gate__actions">
            <button
              type="button"
              className="button button--dark"
              disabled={!status?.canStart || starting}
              onClick={() => void startService()}
            >
              {starting ? <LoaderCircle size={15} className="is-spinning" /> : <Cloud size={15} />}
              {starting ? "Starting…" : "Start NetEase service"}
            </button>
            <button type="button" className="button button--glass" onClick={() => void refresh()}>
              <RefreshCw size={15} /> Check again
            </button>
          </div>
          <div className="online-path">
            <span>{status?.apiDir ?? "api-enhanced not found"}</span>
            {!status?.canStart && <em>Set -Dpotatomusic.apiDir or place api-enhanced in ~/.potatoplayer-super/api/</em>}
          </div>
        </div>
      </div>
    );
  }

  if (!status.loggedIn) {
    return (
      <div className="page page--discover">
        <PageHeader
          eyebrow="Online"
          title="Discover"
          description="Sign in once. Your library, blocks and genres remain the centre of the app."
          actions={
            <button type="button" className="button button--glass" onClick={() => void refresh()}>
              <RefreshCw size={15} /> Refresh
            </button>
          }
        />
        <div className="login-stage">
          <div className="login-card glass">
            <div className="login-card__head">
              <span className="online-badge">
                <Cloud size={13} /> NetEase Cloud Music
              </span>
              <h2>Bring your account along.</h2>
              <p>Scan the code with the NetEase app, or paste a MUSIC_U cookie. Nothing is sent anywhere except NetEase.</p>
            </div>
            {!qr ? (
              <button type="button" className="qr-placeholder" onClick={() => void beginQr()} disabled={qrLoading}>
                {qrLoading ? <LoaderCircle size={25} className="is-spinning" /> : <ScanLine size={27} />}
                <strong>{qrLoading ? "Creating code…" : "Show login QR code"}</strong>
                <span>Opens in a moment</span>
              </button>
            ) : (
              <motion.div className="qr-box" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                {qr.qrImage ? <img src={qr.qrImage} alt="NetEase login QR code" /> : <ScanLine size={48} />}
                <span>{qrMessage || "Scan with the NetEase app"}</span>
              </motion.div>
            )}
            <div className="login-alt">
              <button type="button" className="text-button" onClick={() => setCookieMode(!cookieMode)}>
                <KeyRound size={13} /> {cookieMode ? "Use QR code instead" : "Use a cookie instead"}
              </button>
            </div>
            <AnimatePresence>
              {cookieMode && (
                <motion.div
                  className="cookie-row"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <input
                    className="text-field"
                    value={cookie}
                    placeholder="MUSIC_U=…"
                    onChange={(event) => setCookie(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loginCookie();
                    }}
                  />
                  <button type="button" className="button button--dark" disabled={cookieBusy || !cookie.trim()} onClick={() => void loginCookie()}>
                    {cookieBusy ? <LoaderCircle size={15} className="is-spinning" /> : <CheckCircle2 size={15} />}
                    Sign in
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="login-foot">
              <span>
                <Cloud size={13} /> {status.apiBase}
              </span>
              <button type="button" className="text-button" onClick={() => void startService()} disabled={starting}>
                {starting ? "Starting…" : "Restart service"}
              </button>
            </div>
          </div>

          <div className="login-aside glass">
            <span className="eyebrow">Why connect?</span>
            <h3>One library. Two sources.</h3>
            <ul>
              <li>
                <CloudDownload size={15} />
                Download into your local folder, with cover and lyrics.
              </li>
              <li>
                <ListMusic size={15} />
                Open your NetEase playlists without leaving the room.
              </li>
              <li>
                <Sparkles size={15} />
                Then sort new songs into your own blocks and genres.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--discover">
      <PageHeader
        eyebrow="Online"
        title="Discover"
        description="Search NetEase, download into your local library, and keep your own taxonomy intact."
        actions={
          <>
            <span className="online-user">
              {status.avatarUrl ? <img src={status.avatarUrl} alt="" /> : <span>{(status.nickname ?? "N").slice(0, 1)}</span>}
              <em>{status.nickname}</em>
            </span>
            <button type="button" className="icon-button icon-button--glass icon-button--sm" title="Sign out" onClick={() => void logout()}>
              <LogOut size={15} />
            </button>
          </>
        }
      />

      <div className="online-toolbar glass">
        <form
          className="online-search"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <Search size={16} />
          <input
            ref={searchInputRef}
            value={query}
            placeholder="Search NetEase: songs, artists, albums…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="button button--dark button--small" disabled={searching || !query.trim()}>
            {searching ? <LoaderCircle size={14} className="is-spinning" /> : "Search"}
          </button>
        </form>
        <label className="quality-control">
          <span>Quality</span>
          <select value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="standard">Standard</option>
            <option value="high">High 320k</option>
            <option value="lossless">Lossless</option>
          </select>
        </label>
      </div>

      <div className="online-tabs">
        <button type="button" className={clsx(mode === "search" && "is-active")} onClick={() => chooseMode("search")}>
          <Search size={14} /> Search
        </button>
        <button type="button" className={clsx(mode === "daily" && "is-active")} onClick={() => chooseMode("daily")}>
          <Sparkles size={14} /> For you
        </button>
        <button type="button" className={clsx(mode === "playlists" && "is-active")} onClick={() => chooseMode("playlists")}>
          <ListMusic size={14} /> Playlists
        </button>
      </div>

      {mode === "search" && (
        <section className="online-section">
          {!results.length && !searching ? (
            <div className="online-empty glass">
              <div className="online-empty__disc">
                <Disc3 size={28} />
              </div>
              <h2>Search outside your shelves.</h2>
              <p>Find a song, download it with artwork and lyrics, then assign it into your blocks and genres.</p>
              <div className="quick-searches">
                {["Mili", "Aimer", "宇多田ヒカル", "YOASOBI"].map((term) => (
                  <button type="button" key={term} className="tag-chip" onClick={() => void search(term)}>
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="online-list">
              <div className="online-list__head">
                <span>{results.length} songs from NetEase</span>
                <em>{quality === "lossless" ? "Lossless download" : quality === "standard" ? "Standard download" : "High quality download"}</em>
              </div>
              {results.map((song) => (
                <SongRow key={song.id} song={song} onDownload={() => void download(song)} downloading={isDownloading(song.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {mode === "daily" && (
        <section className="online-section">
          {dailyLoading ? (
            <div className="online-loading glass">
              <LoaderCircle size={20} className="is-spinning" /> Loading today’s recommendations…
            </div>
          ) : daily.length ? (
            <div className="online-list">
              <div className="online-list__head">
                <span>Made for {status.nickname}</span>
                <em>Updated by NetEase every day</em>
              </div>
              {daily.map((song) => (
                <SongRow key={song.id} song={song} onDownload={() => void download(song)} downloading={isDownloading(song.id)} />
              ))}
            </div>
          ) : (
            <button type="button" className="online-empty glass" onClick={() => void loadDaily()}>
              <Sparkles size={23} />
              <h2>Load today’s picks</h2>
              <p>Recommendations are fetched from your account and never leave this machine.</p>
            </button>
          )}
        </section>
      )}

      {mode === "playlists" && (
        <section className="online-section">
          {activePlaylist ? (
            <>
              <button type="button" className="back-link" onClick={() => setActivePlaylist(null)}>
                <ArrowLeft size={15} /> Your playlists
              </button>
              <div className="online-playlist-head glass">
                {activePlaylist.coverUrl ? (
                  <img src={activePlaylist.coverUrl} alt="" />
                ) : (
                  <span className="online-playlist-head__blank">
                    <ListMusic size={25} />
                  </span>
                )}
                <div>
                  <span className="eyebrow">NetEase playlist</span>
                  <h2>{activePlaylist.name}</h2>
                  <p>{activePlaylist.tracks.length} songs</p>
                </div>
                <button type="button" className="button button--dark" onClick={() => void downloadAll()}>
                  <CloudDownload size={15} /> Download all
                </button>
              </div>
              <div className="online-list">
                {activePlaylist.tracks.map((song) => (
                  <SongRow key={song.id} song={song} onDownload={() => void download(song)} downloading={isDownloading(song.id)} />
                ))}
              </div>
            </>
          ) : playlistLoading ? (
            <div className="online-loading glass">
              <LoaderCircle size={20} className="is-spinning" /> Loading your playlists…
            </div>
          ) : playlists.length ? (
            <div className="playlist-gallery">
              {playlists.map((playlist) => (
                <button
                  type="button"
                  key={playlist.id}
                  className="online-playlist-card"
                  onClick={() => void openPlaylist(playlist)}
                >
                  {playlist.coverUrl ? <img src={playlist.coverUrl} alt="" /> : <ListMusic size={22} />}
                  <strong>{playlist.name}</strong>
                  <span>
                    {playlist.trackCount} songs · {playlist.creator}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="online-empty glass" onClick={() => void loadPlaylists()}>
              <ListMusic size={23} />
              <h2>Open your playlists</h2>
              <p>Bring your saved NetEase collections into view.</p>
            </button>
          )}
        </section>
      )}

      <div className="online-footnote">
        <Cloud size={13} />
        Downloads land in <strong>{libraryRoot}</strong> and are indexed automatically.
        {status.vipType ? <span className="vip-chip">VIP active</span> : null}
      </div>
    </div>
  );
}
