import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, Disc3, RefreshCw } from "lucide-react";
import { useAppStore, viewKey } from "@/store";
import { coverUrl } from "@/lib/covers";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { NowPlaying } from "@/components/NowPlaying";
import { MiniPlayer } from "@/components/MiniPlayer";
import { CommandPalette } from "@/components/CommandPalette";
import { SettingsDialog } from "@/components/SettingsDialog";
import { PromptDialog } from "@/components/PromptDialog";
import { AddToPlaylistDialog } from "@/components/AddToPlaylistDialog";
import { TrackMenu } from "@/components/TrackMenu";
import { Toasts } from "@/components/Toasts";
import { HomePage } from "@/pages/HomePage";
import { SongsPage } from "@/pages/SongsPage";
import { AlbumsPage } from "@/pages/AlbumsPage";
import { ArtistsPage } from "@/pages/ArtistsPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { PlaylistPage } from "@/pages/PlaylistPage";
import { SearchPage } from "@/pages/SearchPage";
import { AlbumDetailPage, ArtistDetailPage } from "@/pages/DetailPages";
import { SongEditorPage } from "@/pages/SongEditorPage";
import { CollectionsPage } from "@/pages/CollectionsPage";
import { TagPage } from "@/pages/TagPage";
import { DiscoverPage } from "@/pages/DiscoverPage";
import { StatsPage } from "@/pages/StatsPage";
import { BulkAssignDialog, TaxonomyManager } from "@/components/TagDialogs";
import { DownloadTray } from "@/components/DownloadTray";
import { DownloadTasks } from "@/components/DownloadTasks";
import { ImmersiveView } from "@/components/ImmersiveView";
import { EqualizerDialog } from "@/components/EqualizerDialog";
import { BilibiliMvDialog } from "@/components/BilibiliMvDialog";
import { applyTheme } from "@/lib/theme";
import { applyAppearance, resolveAccent } from "@/lib/appearance";
import { useTr } from "@/lib/i18n";
import { documentLanguage, pickText } from "@/lib/text";

class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page rendering failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-stage glass empty-stage--compact">
          <h2>{pickText(documentLanguage(), "This page could not be rendered.", "这个页面暂时无法显示。")}</h2>
          <p>{this.state.error.message}</p>
          <button type="button" className="button button--dark" onClick={() => this.setState({ error: null })}>
            {pickText(documentLanguage(), "Try again", "重试")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingScreen() {
  const tr = useTr();
  return (
    <div className="boot-screen">
      <div className="boot-orb boot-orb--one" />
      <div className="boot-orb boot-orb--two" />
      <motion.div
        className="boot-card glass-strong"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="boot-mark">
          <Disc3 size={26} />
          <span />
        </div>
        <div className="boot-word">
          <strong>potato</strong>
          <em>super</em>
        </div>
        <div className="boot-loader">
          <span />
        </div>
        <p>{tr("Opening your listening room…", "正在打开你的聆听室…")}</p>
      </motion.div>
    </div>
  );
}

function FatalScreen({ message }: { message: string }) {
  const tr = useTr();
  return (
    <div className="boot-screen">
      <motion.div className="fatal-card glass-strong" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="fatal-card__icon">
          <AlertTriangle size={25} />
        </span>
        <h1>{tr("The player could not start.", "播放器未能启动。")}</h1>
        <p>{message}</p>
        <div className="fatal-card__steps">
          <strong>{tr("Try this", "可以试试")}</strong>
          <code>npm run build:backend</code>
          <span>{tr("Then reopen Potatoplayer Super.", "然后重新打开 Potatoplayer Super。")}</span>
        </div>
        <button type="button" className="button button--dark" onClick={() => window.location.reload()}>
          <RefreshCw size={15} /> {tr("Try again", "重试")}
        </button>
      </motion.div>
    </div>
  );
}

export default function App() {
  const initialize = useAppStore((state) => state.initialize);
  const loading = useAppStore((state) => state.loading);
  const fatalError = useAppStore((state) => state.fatalError);
  const initialized = useAppStore((state) => state.initialized);
  const scanning = useAppStore((state) => state.scanning);
  const viewHistory = useAppStore((state) => state.viewHistory);
  const viewIndex = useAppStore((state) => state.viewIndex);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const playback = useAppStore((state) => state.playback);
  const previewTrackId = useAppStore((state) => state.previewTrackId);
  const tracks = useAppStore((state) => state.tracks);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const immersive = useAppStore((state) => state.immersive);
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const theme = useAppStore((state) => state.theme);
  const appearance = useAppStore((state) => state.appearance);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<{ primary: string; secondary: string } | null>(null);
  const captureNotified = useRef(false);
  const view = viewHistory[viewIndex] ?? { kind: "home" as const };
  const pageKey = `${searchQuery.trim() ? "search" : viewKey(view)}:${appearance.language}`;
  const activeCover =
    tracks.find((track) => track.id === (playback?.trackId ?? previewTrackId))?.coverPath ?? null;

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    if (!activeCover) {
      setPalette(null);
      return;
    }
    let cancelled = false;
    void window.potato
      ?.coverPalette(activeCover)
      .then((colors) => {
        if (!cancelled && colors) setPalette(colors);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeCover]);

  useEffect(() => {
    const root = document.documentElement;
    const resolved = resolveAccent(appearance.accent, palette);
    root.style.setProperty("--accent", resolved.primary);
    root.style.setProperty("--accent-secondary", resolved.secondary);
    root.style.setProperty("--cover-primary", palette?.primary ?? "#d8b6a5");
    root.style.setProperty("--cover-secondary", palette?.secondary ?? "#b8c7d6");
  }, [palette, appearance.accent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pageKey]);

  useEffect(() => {
    if (captureNotified.current || !initialized || scanning || loading) return;
    const timer = window.setTimeout(() => {
      if (captureNotified.current) return;
      captureNotified.current = true;
      window.potato?.rendererReady();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [initialized, scanning, loading, tracks.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const command = event.metaKey || event.ctrlKey;
      const state = useAppStore.getState();

      if (command && event.key.toLowerCase() === "k") {
        event.preventDefault();
        state.setCommandOpen(!state.commandOpen);
        return;
      }
      if (command && event.key.toLowerCase() === "f") {
        event.preventDefault();
        window.dispatchEvent(new Event("potato:focus-search"));
        return;
      }
      if (event.key === "Escape") {
        if (state.commandOpen) state.setCommandOpen(false);
        else if (state.settingsOpen) state.setSettingsOpen(false);
        else if (state.prompt) state.closePrompt();
        else if (state.eqOpen) state.setEqOpen(false);
        else if (state.mvTrackId) state.setMvTrackId(null);
        else if (state.addToPlaylistTrackId) state.setAddToPlaylistTrackId(null);
        else if (state.trackMenu) state.setTrackMenu(null);
        else if (state.immersive) state.setImmersive(false);
        else if (state.searchQuery) state.setSearchQuery("");
        return;
      }
      if (typing) return;

      if (command && event.key === "ArrowRight") {
        event.preventDefault();
        void state.next();
        return;
      }
      if (command && event.key === "ArrowLeft") {
        event.preventDefault();
        void state.previous();
        return;
      }
      if (command && event.key.toLowerCase() === "e") {
        event.preventDefault();
        const current = state.viewHistory[state.viewIndex];
        if (current.kind !== "editor") {
          state.navigate({ kind: "editor", trackId: state.playback?.trackId ?? state.previewTrackId ?? undefined });
        }
        return;
      }
      if (command && /^[1-8]$/.test(event.key)) {
        event.preventDefault();
        const views = [
          { kind: "home" as const },
          { kind: "songs" as const },
          { kind: "albums" as const },
          { kind: "artists" as const },
          { kind: "collections" as const },
          { kind: "favorites" as const },
          { kind: "stats" as const },
          { kind: "discover" as const },
        ];
        state.navigate(views[Number(event.key) - 1]);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void state.togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [windowActive, setWindowActive] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const focus = () => setWindowActive(true);
    const blur = () => setWindowActive(false);
    const visibility = () => setWindowActive(document.visibilityState !== "hidden");
    const unsubscribe = window.potato.onWindowFocus((active) => {
      setWindowActive(active);
      window.dispatchEvent(new CustomEvent("potato:window-focus", { detail: active }));
    });
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
    };
  }, []);

  if (loading) return <LoadingScreen />;
  if (fatalError) return <FatalScreen message={fatalError} />;

  const page = (() => {
    if (searchQuery.trim()) return <SearchPage />;
    switch (view.kind) {
      case "songs":
        return <SongsPage />;
      case "albums":
        return <AlbumsPage />;
      case "artists":
        return <ArtistsPage />;
      case "favorites":
        return <FavoritesPage />;
      case "stats":
        return <StatsPage />;
      case "editor":
        return <SongEditorPage />;
      case "collections":
        return <CollectionsPage />;
      case "block":
      case "genre":
        return <TagPage />;
      case "discover":
        return <DiscoverPage />;
      case "playlist":
        return <PlaylistPage />;
      case "album":
        return <AlbumDetailPage />;
      case "artist":
        return <ArtistDetailPage />;
      default:
        return <HomePage />;
    }
  })();

  return (
    <div className={clsx("app", theme === "dark" && "theme-dark", reducedMotion && "reduce-motion", !windowActive && "is-window-blurred")}>
      <div className="ambient" aria-hidden="true">
        <AnimatePresence>
          {activeCover && (
            <motion.div
              key={activeCover}
              className="ambient__art"
              style={{ backgroundImage: `url("${coverUrl(activeCover)}")` }}
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 0.7, scale: 1.16 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.15, ease: "easeInOut" }}
            />
          )}
        </AnimatePresence>
        <div className="ambient__wash" />
        <div className="ambient__blob ambient__blob--a" />
        <div className="ambient__blob ambient__blob--b" />
        <div className="ambient__grain" />
      </div>

      <div className="app-grid">
        <Sidebar />
        <div className="workspace">
          <TopBar />
          <div className={clsx("workspace-body", !rightPanelOpen && "workspace-body--solo")}>
            <main className="page-shell glass">
              <div className="page-scroll" ref={scrollRef}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={pageKey}
                    className="page-motion"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <PageBoundary>{page}</PageBoundary>
                  </motion.div>
                </AnimatePresence>
              </div>
            </main>
            <AnimatePresence initial={false}>
              {rightPanelOpen && <NowPlaying key="now-playing" />}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>{!rightPanelOpen && <MiniPlayer key="mini-player" />}</AnimatePresence>

      <AnimatePresence>{immersive && <ImmersiveView key="immersive" palette={palette} />}</AnimatePresence>

      <CommandPalette />
      <SettingsDialog />
      <TaxonomyManager />
      <EqualizerDialog />
      <BilibiliMvDialog />
      <PromptDialog />
      <AddToPlaylistDialog />
      <BulkAssignDialog />
      <TrackMenu />
      <DownloadTray />
      <DownloadTasks />
      <Toasts />
    </div>
  );
}
