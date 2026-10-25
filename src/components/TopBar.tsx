import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Command,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useAppStore } from "@/store";
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
  const rescan = useAppStore((state) => state.rescan);
  const setCommandOpen = useAppStore((state) => state.setCommandOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const scanPct =
    scanProgress && scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0;

  return (
    <header className="topbar window-drag">
      <div className="topbar__left no-drag">
        <IconButton label="Back" variant="ghost" size="sm" disabled={!canGoBack} onClick={goBack}>
          <ChevronLeft size={18} />
        </IconButton>
        <IconButton label="Forward" variant="ghost" size="sm" disabled={!canGoForward} onClick={goForward}>
          <ChevronRight size={18} />
        </IconButton>
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
          placeholder="Songs, artists, albums…"
          aria-label="Search your library"
          spellCheck={false}
        />
        <AnimatePresence>
          {searchQuery ? (
            <motion.button
              type="button"
              className="search-clear"
              aria-label="Clear search"
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
              title={scanProgress ? `${scanProgress.done} of ${scanProgress.total} songs` : "Scanning library"}
            >
              <span className="scan-pill__ring" style={{ "--scan": `${scanPct}%` } as React.CSSProperties} />
              {scanProgress?.total ? `${scanPct}%` : "Indexing"}
            </motion.button>
          )}
        </AnimatePresence>
        <IconButton label="Command palette" variant="glass" size="sm" onClick={() => setCommandOpen(true)}>
          <Command size={15} />
        </IconButton>
        <IconButton label="Rescan library" variant="glass" size="sm" disabled={scanning} onClick={() => void rescan()}>
          <RefreshCw size={15} className={scanning ? "is-spinning" : undefined} />
        </IconButton>
        <button type="button" className="topbar-avatar" onClick={() => setSettingsOpen(true)} title="Open settings">
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
