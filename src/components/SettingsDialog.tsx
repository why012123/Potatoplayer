import { AnimatePresence } from "motion/react";
import {
  FolderOpen,
  HardDrive,
  Keyboard,
  LibraryBig,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";
import { IconButton } from "@/components/IconButton";

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function SettingsDialog() {
  const open = useAppStore((state) => state.settingsOpen);
  const setOpen = useAppStore((state) => state.setSettingsOpen);
  const libraryRoot = useAppStore((state) => state.libraryRoot);
  const dataDir = useAppStore((state) => state.dataDir);
  const version = useAppStore((state) => state.version);
  const tracks = useAppStore((state) => state.tracks);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const setReducedMotion = useAppStore((state) => state.setReducedMotion);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const rescan = useAppStore((state) => state.rescan);

  const close = () => setOpen(false);
  const pct = scanProgress?.total ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0;

  return (
    <AnimatePresence>
      {open && (
        <Modal onClose={close} className="settings-dialog" labelledBy="settings-title">
          <div className="settings-head">
            <div>
              <div className="modal__eyebrow">
                <Sparkles size={13} />
                Potatoplayer Super
              </div>
              <h2 id="settings-title">Settings</h2>
            </div>
            <IconButton label="Close settings" variant="ghost" size="sm" onClick={close}>
              <X size={18} />
            </IconButton>
          </div>

          <div className="settings-scroll">
            <section className="settings-section">
              <div className="settings-section__title">
                <LibraryBig size={16} />
                <div>
                  <strong>Music library</strong>
                  <span>Where your local files live</span>
                </div>
              </div>
              <div className="settings-path">
                <span title={libraryRoot}>{libraryRoot || "No folder selected"}</span>
                <button type="button" className="button button--glass button--small" onClick={() => void chooseLibrary()}>
                  <FolderOpen size={14} /> Change
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <strong>{tracks.length} songs indexed</strong>
                  <span>{scanning ? `Scanning · ${pct}%` : "Rescanning keeps favorites and playlists in place."}</span>
                </div>
                <button
                  type="button"
                  className="button button--glass button--small"
                  disabled={scanning}
                  onClick={() => void rescan()}
                >
                  <RefreshCw size={14} className={scanning ? "is-spinning" : undefined} />
                  Rescan
                </button>
              </div>
              {scanning && (
                <div className="settings-progress">
                  <span style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              )}
            </section>

            <section className="settings-section">
              <div className="settings-section__title">
                <Sparkles size={16} />
                <div>
                  <strong>Motion</strong>
                  <span>Make the interface feel a little quieter</span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={reducedMotion}
                className="settings-toggle-row"
                onClick={() => setReducedMotion(!reducedMotion)}
              >
                <div>
                  <strong>Reduce motion</strong>
                  <span>Shortens page transitions and disables ambient movement.</span>
                </div>
                <span className={`switch ${reducedMotion ? "is-on" : ""}`}>
                  <i />
                </span>
              </button>
            </section>

            <section className="settings-section">
              <div className="settings-section__title">
                <HardDrive size={16} />
                <div>
                  <strong>App data</strong>
                  <span>Covers, playlists and listening state</span>
                </div>
              </div>
              <div className="settings-path">
                <span title={dataDir}>{dataDir}</span>
                <button
                  type="button"
                  className="button button--glass button--small"
                  onClick={() => void window.potato.openPath(dataDir)}
                >
                  <FolderOpen size={14} /> Reveal
                </button>
              </div>
              <div className="settings-note">
                <ShieldCheck size={15} />
                Everything stays on this machine. No account, no cloud, no analytics.
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section__title">
                <Keyboard size={16} />
                <div>
                  <strong>Keyboard</strong>
                  <span>A few shortcuts worth knowing</span>
                </div>
              </div>
              <div className="shortcut-grid">
                <span>
                  <Kbd>Space</Kbd> Play / pause
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>K</Kbd> Command palette
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>F</Kbd> Search library
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>E</Kbd> Song editor
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>←</Kbd> Previous song
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>→</Kbd> Next song
                </span>
                <span>
                  <Kbd>Esc</Kbd> Close panel
                </span>
              </div>
            </section>

            <section className="settings-about">
              <div>
                <strong>Potatoplayer Super</strong>
                <span>Version {version} · Electron glass edition</span>
              </div>
              <span className="settings-about__badge">Local first</span>
            </section>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
