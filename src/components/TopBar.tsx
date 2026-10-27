import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { IconButton } from "@/components/IconButton";

export function TopBar() {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const goBack = useAppStore((state) => state.goBack);
  const goForward = useAppStore((state) => state.goForward);
  const viewIndex = useAppStore((state) => state.viewIndex);
  const viewHistory = useAppStore((state) => state.viewHistory);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const downloads = useAppStore((state) => state.downloads);
  const setDownloadPanelOpen = useAppStore((state) => state.setDownloadPanelOpen);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const currentView = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const inputRef = useRef<HTMLInputElement>(null);
  const tr = useTr();

  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("potato:focus-search", focus);
    return () => window.removeEventListener("potato:focus-search", focus);
  }, []);

  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < viewHistory.length - 1;
  const viewLabel = (() => {
    if (searchQuery.trim()) return tr("Search", "搜索");
    switch (currentView.kind) {
      case "home":
        return tr("Home", "首页");
      case "songs":
        return tr("Songs", "歌曲");
      case "albums":
      case "album":
        return tr("Albums", "专辑");
      case "artists":
      case "artist":
        return tr("Artists", "艺术家");
      case "collections":
      case "block":
      case "genre":
        return tr("Collections", "合集");
      case "favorites":
        return tr("Favorites", "收藏");
      case "stats":
        return tr("Stats", "统计");
      case "editor":
        return tr("Editor", "编辑器");
      case "discover":
        return tr("Discover", "发现");
      case "playlist":
        return tr("Playlist", "歌单");
      default:
        return tr("Library", "资料库");
    }
  })();
  const activeDownloads = downloads.filter((job) => job.status === "running" || job.status === "error").length;
  const scanPct =
    scanProgress && scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0;
  const scanTitle = scanProgress
    ? tr(
        scanProgress.total === 1 ? "{done} of {total} song" : "{done} of {total} songs",
        "已扫描 {done}/{total} 首歌曲",
        { done: scanProgress.done, total: scanProgress.total },
      )
    : tr("Scanning library", "正在扫描资料库");

  return (
    <header className="topbar window-drag">
      <div className="topbar__left no-drag">
        <div className="topbar__nav">
          <IconButton
            label={tr("Back", "后退")}
            variant="ghost"
            size="sm"
            disabled={!canGoBack}
            onClick={goBack}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton
            label={tr("Forward", "前进")}
            variant="ghost"
            size="sm"
            disabled={!canGoForward}
            onClick={goForward}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <div
          className="topbar__context"
          aria-label={tr("Current section: {section}", "当前位置：{section}", { section: viewLabel })}
        >
          <span>{tr("Library", "资料库")}</span>
          <i aria-hidden="true">/</i>
          <strong>{viewLabel}</strong>
        </div>
      </div>

      <div className="topbar__search no-drag">
        <Search size={16} strokeWidth={2} className="search-icon" />
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearchQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder={tr("Songs, artists, albums…", "歌曲、艺术家、专辑…")}
          aria-label={tr("Search your library", "搜索资料库")}
          spellCheck={false}
        />
        <AnimatePresence>
          {searchQuery ? (
            <motion.button
              type="button"
              className="search-clear"
              aria-label={tr("Clear search", "清除搜索")}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => {
                setSearchQuery("");
                inputRef.current?.focus();
              }}
            >
              <X size={13} />
            </motion.button>
          ) : (
            <motion.span
              key="shortcut"
              className="search-shortcut"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              ⌘F
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="topbar__right no-drag">
        <AnimatePresence>
          {scanning && (
            <motion.button
              type="button"
              className="scan-pill"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              onClick={() => setScanningToast()}
              title={scanTitle}
            >
              <span className="scan-pill__ring" style={{ "--scan": `${scanPct}%` } as React.CSSProperties} />
              {scanProgress?.total ? `${scanPct}%` : tr("Indexing", "索引中")}
            </motion.button>
          )}
        </AnimatePresence>
        <div className="topbar__tools">
          <IconButton
            label={tr("Download tasks", "下载任务")}
            variant="ghost"
            size="sm"
            onClick={() => setDownloadPanelOpen(true)}
          >
            <span className="download-trigger">
              <CloudDownload size={16} />
              {activeDownloads > 0 && <i>{activeDownloads}</i>}
            </span>
          </IconButton>
          <IconButton
            label={
              theme === "dark"
                ? tr("Switch to light theme", "切换到浅色主题")
                : tr("Switch to dark theme", "切换到深色主题")
            }
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
        </div>
        <button
          type="button"
          className="topbar-avatar"
          onClick={() => setSettingsOpen(true)}
          title={tr("Open settings", "打开设置")}
        >
          P
        </button>
      </div>
    </header>
  );

  function setScanningToast() {
    // The progress itself is visible in the sidebar; clicking the pill is a
    // shortcut to the full settings surface for library changes.
    setSettingsOpen(true);
  }
}
