import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudDownload,
  Disc3,
  KeyRound,
  ListMusic,
  ListPlus,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  SlidersHorizontal,
  WifiOff,
} from "lucide-react";
import type { DownloadQuality, NeteasePlaylist, NeteaseSong, NeteaseStatus, OnlineSource } from "@/types";
import { downloadQualityLabel, downloadQualityRank, useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { isCommitEnter } from "@/lib/keyboard";
import { PageHeader } from "@/components/Headers";
import { Modal } from "@/components/Modal";
import { coverGradient, onlineImageUrl } from "@/lib/covers";
import { formatTime, initials } from "@/lib/format";

import { connectOnline, onlineStatus, rememberOnlineStatus } from "@/lib/online-session";
import "./discover.css";

type Mode = "search" | "daily" | "playlists";

/** Snapshot of a library song's current tier, used to warn before a lower-tier replacement. */
interface TrackQualityInfo {
  currentQuality: DownloadQuality;
}

/** A queued single-song downgrade waiting for the user's confirmation. */
interface PendingDowngrade {
  song: NeteaseSong;
  currentQuality: DownloadQuality;
  targetQuality: DownloadQuality;
}

function Artwork({
  src,
  alt = "",
  fallback,
  className,
}: {
  src: string | null | undefined;
  alt?: string;
  fallback: ReactNode;
  className?: string;
}) {
  const safe = onlineImageUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!safe || failed) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={safe}
      alt={alt}
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function SongRow({
  song,
  onDownload,
  downloading,
  owned,
}: {
  song: NeteaseSong;
  onDownload: () => void;
  downloading?: boolean;
  owned?: boolean;
}) {
  const tr = useTr();
  return (
    <div className="online-song">
      <div className="online-song__cover online-cover">
        <Artwork
          src={song.coverUrl}
          fallback={
            <div
              className="online-song__cover--fallback"
              style={{ background: coverGradient(song.album || song.artists || song.name) }}
            >
              <span>{initials(song.album || song.artists || song.name)}</span>
            </div>
          }
        />
      </div>
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
        title={
          owned
            ? tr(
                "Already downloaded — a higher tier replaces the file; a lower tier asks for confirmation first",
                "已下载过；更高档位会直接替换文件，更低档位会先征求确认",
              )
            : tr("Download and add to your library", "下载并添加到资料库")
        }
      >
        {downloading ? <LoaderCircle size={14} className="is-spinning" /> : <CloudDownload size={14} />}
        {owned ? tr("Update", "更新") : tr("Download", "下载")}
      </button>
    </div>
  );
}

type DiscoverView = {
  mode: Mode;
  query: string;
  results: NeteaseSong[];
  daily: NeteaseSong[];
  playlists: NeteasePlaylist[];
  activePlaylist: { id: string; name: string; coverUrl: string; tracks: NeteaseSong[] } | null;
};
const views = new Map<OnlineSource, DiscoverView>();

export function DiscoverPage() {
  const source = useAppStore((state) => state.onlineSource);
  return <DiscoverContent key={source} />;
}

function DiscoverContent() {
  const tr = useTr();
  const libraryRoot = useAppStore((state) => state.libraryRoot);
  const pushToast = useAppStore((state) => state.pushToast);
  const downloads = useAppStore((state) => state.downloads);
  const imports = useAppStore((state) => state.imports);
  const onlineSource = useAppStore((state) => state.onlineSource);
  const tracks = useAppStore((state) => state.tracks);
  const blocks = useAppStore((state) => state.blocks);
  const genres = useAppStore((state) => state.genres);
  const quality = useAppStore((state) => state.downloadQuality);
  const setQuality = useAppStore((state) => state.setDownloadQuality);
  const importNeteasePlaylist = useAppStore((state) => state.importNeteasePlaylist);
  const syncNeteaseAliases = useAppStore((state) => state.syncNeteaseAliases);
  const neteaseAliases = useAppStore((state) => state.neteaseAliases);
  const ownedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const track of tracks) {
      const id = onlineSource === "qq" ? track.qqId : track.neteaseId;
      if (id) ids.add(id);
    }
    return ids;
  }, [tracks, onlineSource]);
  const saved = views.get(onlineSource);
  const [status, updateStatus] = useState<NeteaseStatus | null>(() => onlineStatus(onlineSource));
  const setStatus = useCallback((next: NeteaseStatus) => {
    rememberOnlineStatus(onlineSource, next);
    updateStatus(next);
  }, [onlineSource]);
  const [loading, setLoading] = useState(() => !onlineStatus(onlineSource));
  const [starting, setStarting] = useState(false);
  const [aliasSyncing, setAliasSyncing] = useState(false);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "search");
  const [query, setQuery] = useState(saved?.query ?? "");
  const [downloadBlock, setDownloadBlockState] = useState(() => {
    try {
      return localStorage.getItem("potato:download-block") ?? "";
    } catch {
      return "";
    }
  });
  const [downloadGenre, setDownloadGenreState] = useState(() => {
    try {
      return localStorage.getItem("potato:download-genre") ?? "";
    } catch {
      return "";
    }
  });
  const setDownloadBlock = (value: string) => {
    setDownloadBlockState(value);
    try {
      localStorage.setItem("potato:download-block", value);
    } catch {
      // Storage is optional.
    }
  };
  const setDownloadGenre = (value: string) => {
    setDownloadGenreState(value);
    try {
      localStorage.setItem("potato:download-genre", value);
    } catch {
      // Storage is optional.
    }
  };
  const [results, setResults] = useState<NeteaseSong[]>(saved?.results ?? []);
  const [searching, setSearching] = useState(false);
  const [daily, setDaily] = useState<NeteaseSong[]>(saved?.daily ?? []);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>(saved?.playlists ?? []);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState<{
    id: string;
    name: string;
    coverUrl: string;
    tracks: NeteaseSong[];
  } | null>(saved?.activePlaylist ?? null);
  const [qr, setQr] = useState<{ key: string; qrImage: string | null } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrMessage, setQrMessage] = useState("");
  const [cookieMode, setCookieMode] = useState(false);
  const [cookie, setCookie] = useState("");
  const [cookieBusy, setCookieBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityCheck, setQualityCheck] = useState<string | null>(null);
  const [pendingDowngrade, setPendingDowngrade] = useState<PendingDowngrade | null>(null);
  const [downgradeBusy, setDowngradeBusy] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    views.set(onlineSource, { mode, query, results, daily, playlists, activePlaylist });
  }, [onlineSource, mode, query, results, daily, playlists, activePlaylist]);
  const sourceName = onlineSource === "qq" ? "QQ Music" : "NetEase Cloud Music";
  const sourceShort = onlineSource === "qq" ? "QQ MUSIC" : "NETEASE";
  const invokeOnline = <T,>(method: string, params?: Record<string, unknown>) =>
    window.potato.invoke<T>(`${onlineSource}.${method}`, params);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      updateStatus(await connectOnline(onlineSource, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onlineSource, setStatus]);

  useEffect(() => {
    let active = true;
    void connectOnline(onlineSource).then((next) => {
      if (active) updateStatus(next);
    }).catch((e) => {
      if (active) {
        updateStatus(onlineStatus(onlineSource));
        setError(e instanceof Error ? e.message : String(e));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [onlineSource, setStatus]);

  const syncAliases = async () => {
    setAliasSyncing(true);
    try {
      await syncNeteaseAliases();
    } finally {
      setAliasSyncing(false);
    }
  };

  const startService = async () => {
    setStarting(true);
    setError(null);
    try {
      const next = await invokeOnline<NeteaseStatus>("startService");
      setStatus(next);
      if (next.service) {
        pushToast(tr("{source} service connected", "{source} 服务已连接", { source: sourceName }), undefined, "success");
      }
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
      const data = await invokeOnline<{ key: string; qrImage: string | null }>("qrKey");
      setQr(data);
    } catch (e) {
      pushToast(
        tr("Could not create login code", "无法生成登录二维码"),
        e instanceof Error ? e.message : String(e),
        "error",
      );
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (!qr?.key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await invokeOnline<{ code: number; loggedIn?: boolean; message: string }>("qrCheck", {
          key: qr.key,
        });
        if (cancelled) return;
        setQrMessage(result.message);
        if (result.loggedIn || result.code === 803) {
          setQr(null);
          await refresh();
          pushToast(
            tr("Signed in to {source}", "已登录 {source}", { source: sourceName }),
            status?.nickname ?? undefined,
            "success",
          );
          return;
        }
        if (result.code === 800) {
          setQr(null);
          setQrMessage(tr("Code expired. Create a new one.", "二维码已过期，请重新生成。"));
          return;
        }
      } catch {
        // Keep polling quietly; transient API hiccups are common.
      }
      if (!cancelled) timer = setTimeout(poll, 2200);
    };

    timer = setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [qr?.key, refresh, pushToast, status?.nickname, onlineSource, sourceName, tr]);

  const loginCookie = async () => {
    if (!cookie.trim()) return;
    setCookieBusy(true);
    try {
      const next = await window.potato.invoke<NeteaseStatus>("netease.loginCookie", { cookie });
      setStatus(next);
      setCookie("");
      setCookieMode(false);
      if (next.loggedIn) pushToast(tr("Signed in to NetEase", "已登录 NetEase"), next.nickname, "success");
    } catch (e) {
      pushToast(tr("Cookie login failed", "Cookie 登录失败"), e instanceof Error ? e.message : String(e), "error");
    } finally {
      setCookieBusy(false);
    }
  };

  const logout = async () => {
    try {
      const next = await invokeOnline<NeteaseStatus>("logout");
      setStatus(next);
      setResults([]);
      setDaily([]);
      setPlaylists([]);
      setActivePlaylist(null);
      setQr(null);
      pushToast(
        tr("Signed out of {source}", "已退出 {source}", {
          source: onlineSource === "qq" ? "QQ Music" : "NetEase",
        }),
      );
    } catch (e) {
      pushToast(tr("Could not sign out", "无法退出登录"), e instanceof Error ? e.message : String(e), "error");
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
      const list = await invokeOnline<NeteaseSong[]>("search", { keywords, limit: 40 });
      setResults(list);
      document.querySelector(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      if (!list.length) pushToast(tr("No songs found", "未找到歌曲"), keywords, "error");
    } catch (e) {
      pushToast(tr("Search failed", "搜索失败"), e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSearching(false);
    }
  };

  const loadDaily = async () => {
    if (daily.length) return;
    setDailyLoading(true);
    try {
      setDaily(await invokeOnline<NeteaseSong[]>("daily"));
    } catch (e) {
      pushToast(tr("Could not load recommendations", "无法加载推荐"), e instanceof Error ? e.message : String(e), "error");
    } finally {
      setDailyLoading(false);
    }
  };

  const loadPlaylists = async () => {
    if (playlists.length) return;
    setPlaylistLoading(true);
    try {
      setPlaylists(await invokeOnline<NeteasePlaylist[]>("playlists"));
    } catch (e) {
      pushToast(
        onlineSource === "qq"
          ? tr("Could not load QQ Music picks", "无法加载 QQ Music 精选")
          : tr("Could not load playlists", "无法加载歌单"),
        e instanceof Error ? e.message : String(e),
        "error",
      );
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
      }>(`${onlineSource}.playlistDetail`, { playlistId: playlist.id });
      setActivePlaylist(detail);
    } catch (e) {
      pushToast(tr("Could not open playlist", "无法打开歌单"), e instanceof Error ? e.message : String(e), "error");
    } finally {
      setPlaylistLoading(false);
    }
  };

  const queueDownload = async (song: NeteaseSong, allowDowngrade = false) => {
    try {
      await invokeOnline("download", {
        id: song.id,
        title: song.name,
        quality: quality,
        block: downloadBlock,
        genre: downloadGenre,
        ...(allowDowngrade ? { allowDowngrade: true } : {}),
      });
      if (!ownedIds.has(song.id)) {
        pushToast(tr("Download queued", "已加入下载队列"), `${song.artists} — ${song.name}`);
      }
      return true;
    } catch (e) {
      pushToast(tr("Could not queue download", "无法加入下载队列"), e instanceof Error ? e.message : String(e), "error");
      return false;
    }
  };

  const download = async (song: NeteaseSong) => {
    const targetRank = downloadQualityRank(quality);
    const ownedTrack = ownedIds.has(song.id)
      ? tracks.find((track) => (onlineSource === "qq" ? track.qqId : track.neteaseId) === song.id)
      : undefined;
    // A lower tier may only replace the file once the user has confirmed it; the
    // highest tier can never be a downgrade, so it skips the extra probe.
    if (ownedTrack && targetRank >= 0 && targetRank < downloadQualityRank("jymaster")) {
      setQualityCheck(song.id);
      try {
        const info = await window.potato.invoke<TrackQualityInfo>("track.qualityOptions", { trackId: ownedTrack.id });
        const currentRank = downloadQualityRank(info.currentQuality);
        if (currentRank >= 0 && targetRank < currentRank) {
          setPendingDowngrade({ song, currentQuality: info.currentQuality, targetQuality: quality });
          return;
        }
      } catch {
        // Probing only decides whether to warn first; fall back to the upgrade-only path.
      } finally {
        setQualityCheck(null);
      }
    }
    await queueDownload(song);
  };

  const confirmDowngrade = async () => {
    if (!pendingDowngrade || downgradeBusy) return;
    setDowngradeBusy(true);
    try {
      if (await queueDownload(pendingDowngrade.song, true)) setPendingDowngrade(null);
    } finally {
      setDowngradeBusy(false);
    }
  };

  const downloadAll = async () => {
    const tracks = activePlaylist?.tracks ?? [];
    if (!tracks.length) return;
    for (const song of tracks) {
      try {
        await invokeOnline("download", {
          id: song.id,
          title: song.name,
          quality: quality,
          block: downloadBlock,
          genre: downloadGenre,
        });
      } catch {
        // Continue the batch; individual failures are surfaced by the backend.
      }
    }
    pushToast(
      tr("Downloads queued", "下载已排队"),
      tr("{count} songs will arrive one by one.", "{count} 首歌曲将逐一加入。", { count: tracks.length }),
      "success",
    );
  };

  const importPlaylist = async () => {
    if (!activePlaylist) return;
    await importNeteasePlaylist(
      { name: activePlaylist.name, tracks: activePlaylist.tracks.map((song) => ({ id: song.id, name: song.name, artists: song.artists })) },
      quality,
      downloadBlock,
      downloadGenre,
    );
  };

  const importingPlaylist = activePlaylist
    ? imports.some((item) => item.playlistName === activePlaylist.name && item.active)
    : false;

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
        <PageHeader
          eyebrow={tr("Online", "在线")}
          title={tr("Discover", "发现")}
          description={tr("Connecting to your {source} account…", "正在连接你的 {source} 账号…", {
            source: sourceName,
          })}
        />
        <div className="online-loading glass">
          <LoaderCircle size={22} className="is-spinning" />
          <span>{tr("Waking the local {source} bridge", "正在唤醒本地 {source} 桥接服务", { source: sourceName })}</span>
        </div>
      </div>
    );
  }

  if (!status?.service) {
    return (
      <div className="page page--discover">
        <PageHeader
          eyebrow={tr("Online", "在线")}
          title={tr("Discover", "发现")}
          description={tr(
            "Search {source} and bring new music into the same blocks, genres and playlists you already use.",
            "在 {source} 中搜索，把新音乐融入你现有的区块、流派与歌单。",
            { source: sourceName },
          )}
        />
        <div className="online-gate glass">
          <div className="online-gate__icon">
            <WifiOff size={27} />
          </div>
          <h2>
            {tr("The local {source} bridge is asleep.", "本地 {source} 桥接服务未启动。", {
              source: onlineSource === "qq" ? "QQ Music" : "NetEase",
            })}
          </h2>
          <p>
            {tr("Potatoplayer Super talks to", "Potatoplayer Super 通过")}{" "}
            <code>{onlineSource === "qq" ? "qq-music-api" : "api-enhanced"}</code>{" "}
            {tr("on", "连接")} <strong>{status?.apiBase}</strong>
            {tr(". Start it once and the connection stays local.", "。启动一次后，连接会保持本地。")}
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
              {starting
                ? tr("Starting…", "正在启动…")
                : tr("Start {service} service", "启动 {service} 服务", {
                    service: sourceShort === "QQ MUSIC" ? "QQ Music" : "NetEase",
                  })}
            </button>
            <button type="button" className="button button--glass" onClick={() => void refresh()}>
              <RefreshCw size={15} /> {tr("Check again", "重新检查")}
            </button>
          </div>
          <div className="online-path">
            <span>{status?.apiDir ?? tr("api-enhanced not found", "未找到 api-enhanced")}</span>
            {!status?.canStart && (
              <em>
                {onlineSource === "qq"
                  ? tr(
                      "Install @yakult-green-tea/qq-music-api in ~/.potatoplayer-super/api/qq-music-api",
                      "请在 ~/.potatoplayer-super/api/qq-music-api 中安装 @yakult-green-tea/qq-music-api",
                    )
                  : tr(
                      "Set -Dpotatomusic.apiDir or place api-enhanced in ~/.potatoplayer-super/api/",
                      "设置 -Dpotatomusic.apiDir，或将 api-enhanced 放入 ~/.potatoplayer-super/api/",
                    )}
              </em>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!status.loggedIn) {
    return (
      <div className="page page--discover">
        <PageHeader
          eyebrow={tr("Online", "在线")}
          title={tr("Discover", "发现")}
          description={tr(
            "Sign in once to {source}. Your library, blocks and genres remain the centre of the app.",
            "登录一次 {source}。你的资料库、区块与流派仍是应用的核心。",
            { source: sourceName },
          )}
          actions={
            <button type="button" className="button button--glass" onClick={() => void refresh()}>
              <RefreshCw size={15} /> {tr("Refresh", "刷新")}
            </button>
          }
        />
        <div className="login-stage">
          <div className="login-card glass">
            <div className="login-card__head">
              <span className="online-badge">
                <Cloud size={13} /> {sourceName}
              </span>
              <h2>{tr("Bring your account along.", "带上你的账号。")}</h2>
              <p>
                {onlineSource === "qq"
                  ? tr(
                      "Scan the code with the QQ Music app. Nothing is sent anywhere except {source}.",
                      "用 QQ Music App 扫码登录。除 {source} 外，不会向任何地方发送数据。",
                      { source: sourceName },
                    )
                  : tr(
                      "Scan the code with the NetEase app. You can also paste a MUSIC_U cookie. Nothing is sent anywhere except {source}.",
                      "用 NetEase App 扫码登录，也可以粘贴 MUSIC_U cookie。除 {source} 外，不会向任何地方发送数据。",
                      { source: sourceName },
                    )}
              </p>
            </div>
            {!qr ? (
              <button type="button" className="qr-placeholder" onClick={() => void beginQr()} disabled={qrLoading}>
                {qrLoading ? <LoaderCircle size={25} className="is-spinning" /> : <ScanLine size={27} />}
                <strong>{qrLoading ? tr("Creating code…", "正在生成二维码…") : tr("Show login QR code", "显示登录二维码")}</strong>
                <span>{tr("Opens in a moment", "稍等片刻")}</span>
              </button>
            ) : (
              <motion.div className="qr-box" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                {qr.qrImage ? (
                  <img
                    src={qr.qrImage}
                    alt={tr("{source} login QR code", "{source} 登录二维码", {
                      source: onlineSource === "qq" ? "QQ Music" : "NetEase",
                    })}
                  />
                ) : (
                  <ScanLine size={48} />
                )}
                <span>
                  {qrMessage ||
                    (onlineSource === "qq"
                      ? tr("Scan with the QQ Music app", "请用 QQ Music App 扫码")
                      : tr("Scan with the NetEase app", "请用 NetEase App 扫码"))}
                </span>
              </motion.div>
            )}
            {onlineSource === "netease" && (
              <div className="login-alt">
                <button type="button" className="text-button" onClick={() => setCookieMode(!cookieMode)}>
                  <KeyRound size={13} /> {cookieMode ? tr("Use QR code instead", "改用二维码") : tr("Use a cookie instead", "改用 Cookie 登录")}
                </button>
              </div>
            )}
            <AnimatePresence>
              {onlineSource === "netease" && cookieMode && (
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
                      if (isCommitEnter(event)) void loginCookie();
                    }}
                  />
                  <button type="button" className="button button--dark" disabled={cookieBusy || !cookie.trim()} onClick={() => void loginCookie()}>
                    {cookieBusy ? <LoaderCircle size={15} className="is-spinning" /> : <CheckCircle2 size={15} />}
                    {tr("Sign in", "登录")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="login-foot">
              <span>
                <Cloud size={13} /> {status.apiBase}
              </span>
              {onlineSource !== "qq" && (
                <button type="button" className="text-button" onClick={() => void syncAliases()} disabled={aliasSyncing}>
                  {aliasSyncing ? <LoaderCircle size={13} className="is-spinning" /> : null}
                  {aliasSyncing
                    ? tr("Syncing aliases…", "正在同步别名…")
                    : tr("Sync aliases ({count})", "同步别名（{count}）", {
                        count: Object.keys(neteaseAliases).length,
                      })}
                </button>
              )}
              <button type="button" className="text-button" onClick={() => void startService()} disabled={starting}>
                {starting ? tr("Starting…", "正在启动…") : tr("Restart service", "重启服务")}
              </button>
            </div>
          </div>

          <div className="login-aside glass">
            <span className="eyebrow">{tr("Why connect?", "为什么连接？")}</span>
            <h3>{tr("One library. Two sources.", "一个资料库，两个来源。")}</h3>
            <ul>
              <li>
                <CloudDownload size={15} />
                {tr("Download into your local folder, with cover and lyrics.", "下载到本地文件夹，并带上封面与歌词。")}
              </li>
              <li>
                <ListMusic size={15} />
                {tr("Open your {source} playlists without leaving the room.", "无需离开房间，即可打开你的 {source} 歌单。", {
                  source: sourceName,
                })}
              </li>
              <li>
                <Sparkles size={15} />
                {tr("Then sort new songs into your own blocks and genres.", "再把新歌归入你自己的区块与流派。")}
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
        eyebrow={tr("Online", "在线")}
        title={tr("Discover", "发现")}
        description={tr(
          "Find your next favourite. Keep it in your library.",
          "遇见下一首喜欢的歌，收藏进自己的音乐世界。",
          { source: sourceName },
        )}
        actions={
          <>
            <span className="online-source-pill"><span className="online-connected-dot" />{sourceShort}</span>
            <span className="online-user">
              <Artwork
                src={status.avatarUrl}
                fallback={<span>{(status.nickname ?? "N").slice(0, 1)}</span>}
              />
              <em>{status.nickname}</em>
            </span>
            <button type="button" className="icon-button icon-button--glass icon-button--sm" title={tr("Refresh connection", "刷新连接")} onClick={() => void refresh()}><RefreshCw size={15} /></button>
            <button
              type="button"
              className="icon-button icon-button--glass icon-button--sm"
              title={tr("Sign out", "退出登录")}
              onClick={() => void logout()}
            >
              <LogOut size={15} />
            </button>
          </>
        }
      />

      {error && <div className="online-error" role="alert">{error}</div>}
      <div className="discover-search-panel">
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
            placeholder={tr("Search {source}: songs, artists, albums…", "在 {source} 中搜索歌曲、歌手、专辑…", {
              source: sourceName,
            })}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="button button--dark button--small" disabled={searching || !query.trim()}>
            {searching ? <LoaderCircle size={14} className="is-spinning" /> : tr("Search", "搜索")}
          </button>
        </form>
      </div>

      <details className="discover-settings">
        <summary><SlidersHorizontal size={14} /><span>{tr("Download settings", "下载设置")}</span><em>{quality === "hires" ? "Hi-Res" : quality === "jymaster" ? tr("Master", "母带") : quality === "lossless" ? tr("Lossless", "无损") : quality === "standard" ? tr("Standard", "标准") : "320 kbps"}</em></summary>
      <div className="download-target">
        <label className="quality-control download-target__control">
          <span>{tr("Quality", "音质")}</span>
          <select value={quality} onChange={(event) => setQuality(event.target.value as DownloadQuality)}>
            <option value="standard">{tr("Standard", "标准")}</option>
            <option value="high">{tr("High 320k", "高品质 320k")}</option>
            <option value="lossless">{tr("Lossless", "无损")}</option>
            <option
              value="hires"
              title={tr(
                "Needs a signed-in account with Hi-Res access, and only for songs that have a Hi-Res master.",
                "需要已登录且有 Hi-Res 权限的账号，且仅限有 Hi-Res 母带的歌曲。",
              )}
            >
              {tr("Hi-Res 96k/24", "Hi-Res 96k/24")}
            </option>
            <option
              value="jymaster"
              title={tr(
                "Master quality (up to 192 kHz/24-bit) needs a membership; files are roughly 4–6× larger than lossless.",
                "超清母带（最高 192kHz/24bit）需要会员；文件约为无损的 4–6 倍。",
              )}
            >
              {tr("Master 192k/24", "超清母带 192k/24")}
            </option>
          </select>
        </label>
        <label className="quality-control download-target__control">
          <span>{tr("Block", "区块")}</span>
          <select value={downloadBlock} onChange={(event) => setDownloadBlock(event.target.value)}>
            <option value="">{tr("Not set — keep existing", "不指定（沿用）")}</option>
            <option value="__none__">{tr("None — clear it", "无（清空）")}</option>
            {blocks.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label className="quality-control download-target__control">
          <span>{tr("Genre", "流派")}</span>
          <select value={downloadGenre} onChange={(event) => setDownloadGenre(event.target.value)}>
            <option value="">{tr("Not set — keep existing", "不指定（沿用）")}</option>
            <option value="__none__">{tr("None — clear it", "无（清空）")}</option>
            {genres.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <em className="download-target__hint">
          {tr(
            "A higher tier replaces the file directly; a lower tier asks first and shrinks it. Ratings and favourites are kept either way. Availability depends on the source and account.",
            "更高档位会直接替换文件；更低档位会先征求确认并减小文件体积。两种情况都会保留评分与收藏。实际音质以音源和账号权限为准。",
          )}
        </em>
      </div>

      </details>
      </div>

      <div className="online-tabs">
        <button type="button" className={clsx(mode === "search" && "is-active")} onClick={() => chooseMode("search")}>
          <Search size={14} /> {tr("Search", "搜索")}
        </button>
        <button type="button" className={clsx(mode === "daily" && "is-active")} onClick={() => chooseMode("daily")}>
          <Sparkles size={14} /> {tr("For you", "为你推荐")}
        </button>
        <button type="button" className={clsx(mode === "playlists" && "is-active")} onClick={() => chooseMode("playlists")}>
          <ListMusic size={14} /> {tr("Playlists", "歌单")}
        </button>
      </div>

      {mode === "search" && (
        <section className="online-section" aria-busy={searching}>
          {searching && <div className="discover-search-status"><LoaderCircle size={16} className="is-spinning" />{tr("Searching…", "正在搜索…")}</div>}
          {!results.length && !searching ? (
            <div className="online-empty glass">
              <div className="online-empty__disc">
                <Disc3 size={28} />
              </div>
              <h2>{tr("What would you like to hear?", "今天，想听点什么？")}</h2>
              <p>
                {tr(
                  "Find a song, download it with artwork and lyrics, then assign it into your blocks and genres.",
                  "搜索喜欢的歌手、歌曲或专辑。封面与歌词，会随音乐一起留下。",
                )}
              </p>
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
                <span>
                  {tr("{count} songs from {source}", "来自 {source} 的 {count} 首歌曲", {
                    count: results.length,
                    source: sourceName,
                  })}
                </span>
                <em>
                  {quality === "jymaster"
                    ? tr("Master quality download", "超清母带下载")
                    : quality === "hires"
                      ? tr("Hi-Res download", "Hi-Res 下载")
                      : quality === "lossless"
                        ? tr("Lossless download", "无损下载")
                        : quality === "standard"
                          ? tr("Standard download", "标准音质下载")
                          : tr("High quality download", "高品质下载")}
                </em>
              </div>
              {results.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  onDownload={() => void download(song)}
                  downloading={isDownloading(song.id) || qualityCheck === song.id}
                  owned={ownedIds.has(song.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {mode === "daily" && (
        <section className="online-section">
          {dailyLoading ? (
            <div className="online-loading glass">
              <LoaderCircle size={20} className="is-spinning" />{" "}
              {tr("Loading today’s recommendations…", "正在加载今日推荐…")}
            </div>
          ) : daily.length ? (
            <div className="online-list">
              <div className="online-list__head">
                <span>
                  {onlineSource === "qq"
                    ? tr("New on QQ Music", "QQ Music 新歌")
                    : status.nickname
                      ? tr("Made for {name}", "为 {name} 推荐", { name: status.nickname })
                      : tr("Made for you", "为你推荐")}
                </span>
                <em>
                  {onlineSource === "qq"
                    ? tr("Latest releases from QQ Music", "QQ Music 最新发行")
                    : tr("Updated by NetEase every day", "由 NetEase 每日更新")}
                </em>
              </div>
              {daily.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  onDownload={() => void download(song)}
                  downloading={isDownloading(song.id) || qualityCheck === song.id}
                  owned={ownedIds.has(song.id)}
                />
              ))}
            </div>
          ) : (
            <button type="button" className="online-empty glass" onClick={() => void loadDaily()}>
              <Sparkles size={23} />
              <h2>{tr("Load today’s picks", "加载今日推荐")}</h2>
              <p>
                {tr("Recommendations are fetched from {source} and never leave this machine.", "推荐内容来自 {source}，不会离开这台设备。", {
                  source: sourceName,
                })}
              </p>
            </button>
          )}
        </section>
      )}

      {mode === "playlists" && (
        <section className="online-section">
          {activePlaylist ? (
            <>
              <button type="button" className="back-link" onClick={() => setActivePlaylist(null)}>
                <ArrowLeft size={15} />{" "}
                {onlineSource === "qq" ? tr("QQ Music picks", "QQ Music 精选") : tr("Your playlists", "你的歌单")}
              </button>
              <div className="online-playlist-head glass">
                <Artwork
                  src={activePlaylist.coverUrl}
                  fallback={
                    <span className="online-playlist-head__blank">
                      <ListMusic size={25} />
                    </span>
                  }
                />
                <div className="online-playlist-head__meta">
                  <span className="eyebrow">
                    {tr("{source} playlist", "{source} 歌单", { source: sourceName })}
                  </span>
                  <h2>{activePlaylist.name}</h2>
                  <p>
                    {tr("{count} songs", "{count} 首歌曲", { count: activePlaylist.tracks.length })}
                  </p>
                </div>
                <div className="online-playlist-head__actions">
                  <button type="button" className="button button--glass" onClick={() => void importPlaylist()} disabled={importingPlaylist}>
                    {importingPlaylist ? <LoaderCircle size={15} className="is-spinning" /> : <ListPlus size={15} />}
                    {importingPlaylist ? tr("Importing…", "正在导入…") : tr("Import to playlist", "导入到歌单")}
                  </button>
                  <button
                    type="button"
                    className="button button--dark"
                    title={tr("Batch downloads only replace files with a higher tier", "批量下载只会用更高档位替换文件")}
                    onClick={() => void downloadAll()}
                  >
                    <CloudDownload size={15} /> {tr("Download all", "全部下载")}
                  </button>
                </div>
              </div>
              <div className="online-list">
                {activePlaylist.tracks.map((song) => (
                  <SongRow
                  key={song.id}
                  song={song}
                  onDownload={() => void download(song)}
                  downloading={isDownloading(song.id) || qualityCheck === song.id}
                  owned={ownedIds.has(song.id)}
                />
                ))}
              </div>
            </>
          ) : playlistLoading ? (
            <div className="online-loading glass">
              <LoaderCircle size={20} className="is-spinning" /> {tr("Loading your playlists…", "正在加载你的歌单…")}
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
                  <Artwork
                    src={playlist.coverUrl}
                    fallback={
                      <span className="online-playlist-card__blank">
                        <ListMusic size={22} />
                      </span>
                    }
                  />
                  <strong>{playlist.name}</strong>
                  <span>
                    {tr("{count} songs · {creator}", "{count} 首歌曲 · {creator}", {
                      count: playlist.trackCount,
                      creator: playlist.creator,
                    })}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="online-empty glass" onClick={() => void loadPlaylists()}>
              <ListMusic size={23} />
              <h2>{tr("Open your playlists", "打开你的歌单")}</h2>
              <p>
                {tr("Bring your saved {source} collections into view.", "查看你在 {source} 收藏的歌单。", {
                  source: sourceName,
                })}
              </p>
            </button>
          )}
        </section>
      )}

      <div className="online-footnote">
        <Cloud size={13} />
        {tr("Downloads land in", "下载将存入")} <strong>{libraryRoot}</strong>{" "}
        {tr("and are indexed automatically.", "并自动加入索引。")}
        {status.vipType ? <span className="vip-chip">{tr("VIP active", "VIP 已生效")}</span> : null}
      </div>

      <AnimatePresence>
        {pendingDowngrade && (
          <Modal className="delete-track-dialog" labelledBy="discover-downgrade-title" onClose={() => setPendingDowngrade(null)}>
            <div className="modal__eyebrow">
              <AlertTriangle size={12} /> {tr("Confirm lower quality", "确认降低音质")}
            </div>
            <h2 id="discover-downgrade-title">{tr("Replace with a lower-quality copy?", "替换为更低音质？")}</h2>
            <p className="modal__description">
              {tr(
                "“{title}” is already in your library at a higher tier. Downloading the {quality} version replaces that file: it takes less space, but audio quality drops. Ratings, favourites and playlists stay unchanged.",
                "《{title}》已在资料库中且音质更高。下载 {quality} 版本会替换该文件：体积更小，但音质会降低。评分、收藏与歌单保持不变。",
                {
                  title: pendingDowngrade.song.name,
                  quality: downloadQualityLabel(pendingDowngrade.targetQuality),
                },
              )}
            </p>
            <div className="delete-track-target">
              <div
                className="online-song__cover online-cover"
                style={{ width: 46, height: 46, flex: "none", borderRadius: 9 }}
              >
                <Artwork
                  src={pendingDowngrade.song.coverUrl}
                  alt={pendingDowngrade.song.name}
                  fallback={
                    <div
                      className="online-song__cover--fallback"
                      style={{ width: "100%", height: "100%", background: coverGradient(pendingDowngrade.song.name) }}
                    >
                      <span>{initials(pendingDowngrade.song.name)}</span>
                    </div>
                  }
                />
              </div>
              <div>
                <strong>{pendingDowngrade.song.name}</strong>
                <span>
                  {`${downloadQualityLabel(pendingDowngrade.currentQuality)} → ${downloadQualityLabel(pendingDowngrade.targetQuality)}`}
                </span>
              </div>
            </div>
            <div className="delete-track-warning">
              <AlertTriangle size={14} />
              {tr(
                "The lower quality cannot be undone without downloading the higher tier again.",
                "除非重新下载更高档位，否则无法恢复当前音质。",
              )}
            </div>
            <div className="modal__actions">
              <button type="button" className="button button--glass" disabled={downgradeBusy} onClick={() => setPendingDowngrade(null)}>
                {tr("Cancel", "取消")}
              </button>
              <button type="button" className="button button--dark" disabled={downgradeBusy} onClick={() => void confirmDowngrade()}>
                {downgradeBusy ? <LoaderCircle size={15} className="is-spinning" /> : <CloudDownload size={15} />}
                {tr("Download lower quality", "下载更低音质")}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
