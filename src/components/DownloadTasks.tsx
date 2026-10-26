import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  CloudDownload,
  LoaderCircle,
  ListPlus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "@/store";

type Filter = "active" | "done" | "failed" | "all";

export function DownloadTasks() {
  const open = useAppStore((state) => state.downloadPanelOpen);
  const setOpen = useAppStore((state) => state.setDownloadPanelOpen);
  const downloads = useAppStore((state) => state.downloads);
  const imports = useAppStore((state) => state.imports);
  const retry = useAppStore((state) => state.retryDownload);
  const clear = useAppStore((state) => state.clearFinishedDownloads);
  const dismiss = useAppStore((state) => state.dismissDownload);
  const dismissImport = useAppStore((state) => state.dismissImport);
  const [filter, setFilter] = useState<Filter>("active");

  const activeCount = downloads.filter((job) => job.status === "running").length;
  const finishedCount = downloads.filter((job) => job.status !== "running").length;
  const doneCount = downloads.filter((job) => job.status === "done").length;
  const failedCount = downloads.filter((job) => job.status === "error").length;

  const visible = useMemo(() => {
    const sorted = [...downloads].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (filter === "active") return sorted.filter((job) => job.status === "running");
    if (filter === "done") return sorted.filter((job) => job.status === "done");
    if (filter === "failed") return sorted.filter((job) => job.status === "error");
    return sorted;
  }, [downloads, filter]);

  const activeImports = imports.filter((item) => item.active);
  const finishedImports = imports.filter((item) => !item.active);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="download-panel-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.aside
            className="download-panel glass-strong"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            role="dialog"
            aria-label="Download tasks"
          >
            <header className="download-panel__head">
              <div>
                <span className="eyebrow">Transfers</span>
                <h2>Download tasks</h2>
                <p>{activeCount ? `${activeCount} task${activeCount === 1 ? "" : "s"} in progress` : "Everything is quiet."}</p>
              </div>
              <button type="button" className="download-panel__close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </header>

            {(activeImports.length > 0 || finishedImports.length > 0) && (
              <section className="download-panel__imports">
                <div className="download-panel__section-label">
                  <ListPlus size={13} /> Playlist imports
                </div>
                {[...activeImports, ...finishedImports].slice(0, 4).map((item) => (
                  <div className={clsx("download-import", !item.active && "is-finished")} key={item.id}>
                    <span className="download-import__glyph">
                      {item.active ? <LoaderCircle size={15} className="is-spinning" /> : <CheckCircle2 size={15} />}
                    </span>
                    <div className="download-import__copy">
                      <strong>{item.playlistName}</strong>
                      <span>
                        {item.resolved} ready · {item.queued} queued
                        {item.failed ? ` · ${item.failed} failed` : ""}
                      </span>
                      <div className="download-import__bar">
                        <i style={{ width: `${Math.max(3, (item.resolved / Math.max(1, item.total)) * 100)}%` }} />
                      </div>
                    </div>
                    {!item.active && (
                      <button type="button" className="download-row__dismiss" onClick={() => dismissImport(item.id)} aria-label="Dismiss import">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}

            <div className="download-panel__tabs" role="tablist" aria-label="Download filters">
              {(["active", "done", "failed", "all"] as Filter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={filter === item}
                  className={clsx(filter === item && "is-active")}
                  onClick={() => setFilter(item)}
                >
                  {item === "active" ? "Active" : item === "done" ? "Finished" : item === "failed" ? "Failed" : "All"}
                  <em>
                    {item === "active"
                      ? activeCount
                      : item === "done"
                        ? doneCount
                        : item === "failed"
                          ? failedCount
                          : downloads.length}
                  </em>
                </button>
              ))}
            </div>

            <div className="download-panel__list">
              {visible.length === 0 ? (
                <div className="download-panel__empty">
                  <CloudDownload size={24} />
                  <strong>No {filter === "all" ? "" : filter} tasks</strong>
                  <span>Downloads from Discover will appear here.</span>
                </div>
              ) : (
                visible.map((job) => {
                  const pct = job.total > 0 ? Math.min(100, Math.round((job.downloaded / job.total) * 100)) : 0;
                  return (
                    <div className={clsx("download-row", `download-row--${job.status}`)} key={job.jobId}>
                      <span className="download-row__icon">
                        {job.status === "done" ? (
                          <CheckCircle2 size={16} />
                        ) : job.status === "error" ? (
                          <AlertCircle size={16} />
                        ) : (
                          <CloudDownload size={16} />
                        )}
                      </span>
                      <div className="download-row__copy">
                        <strong>{job.title}</strong>
                        <span>
                          {job.status === "error"
                            ? job.message
                            : job.status === "done"
                              ? "Added to your library"
                              : job.phase === "resolving"
                                ? "Resolving the best audio…"
                                : job.phase === "queued"
                                  ? "Waiting in the queue…"
                                  : job.total > 0
                                    ? `${pct}% · ${Math.round(job.total / 1024 / 1024)} MB`
                                    : "Downloading…"}
                        </span>
                        {job.status === "running" && (
                          <div className="download-row__bar">
                            <i style={{ width: `${Math.max(3, pct)}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="download-row__actions">
                        {job.status === "error" && (
                          <button type="button" onClick={() => void retry(job.jobId)} title="Retry download" aria-label="Retry download">
                            <RefreshCw size={13} />
                          </button>
                        )}
                        {job.status !== "running" && (
                          <button type="button" onClick={() => dismiss(job.jobId)} title="Dismiss" aria-label="Dismiss download">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <footer className="download-panel__foot">
              <span>{downloads.length} total · stored in your library</span>
              <button type="button" onClick={clear} disabled={!finishedCount && !imports.some((item) => !item.active)}>
                <Trash2 size={12} /> Clear finished
              </button>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
