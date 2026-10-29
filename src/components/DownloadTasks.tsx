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
import { useTr } from "@/lib/i18n";

type Filter = "active" | "done" | "failed" | "all";

export function DownloadTasks() {
  const tr = useTr();
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

  const filterLabel = (item: Filter) =>
    item === "active"
      ? tr("Active", "进行中")
      : item === "done"
        ? tr("Finished", "已完成")
        : item === "failed"
          ? tr("Failed", "失败")
          : tr("All", "全部");

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
            aria-label={tr("Download tasks", "下载任务")}
          >
            <header className="download-panel__head">
              <div>
                <span className="eyebrow">{tr("Transfers", "传输")}</span>
                <h2>{tr("Download tasks", "下载任务")}</h2>
                <p>
                  {activeCount
                    ? activeCount === 1
                      ? tr("1 task in progress", "1 个任务进行中")
                      : tr("{count} tasks in progress", "{count} 个任务进行中", { count: activeCount })
                    : tr("Everything is quiet.", "一切安静。")}
                </p>
              </div>
              <button type="button" className="download-panel__close" onClick={() => setOpen(false)} aria-label={tr("Close", "关闭")}>
                <X size={16} />
              </button>
            </header>

            {(activeImports.length > 0 || finishedImports.length > 0) && (
              <section className="download-panel__imports">
                <div className="download-panel__section-label">
                  <ListPlus size={13} /> {tr("Playlist imports", "歌单导入")}
                </div>
                {[...activeImports, ...finishedImports].slice(0, 4).map((item) => (
                  <div className={clsx("download-import", !item.active && "is-finished")} key={item.id}>
                    <span className="download-import__glyph">
                      {item.active ? <LoaderCircle size={15} className="is-spinning" /> : <CheckCircle2 size={15} />}
                    </span>
                    <div className="download-import__copy">
                      <strong>{item.playlistName}</strong>
                      <span>
                        {tr("{ready} ready · {queued} queued", "{ready} 首已就绪 · {queued} 首排队中", {
                          ready: item.resolved,
                          queued: item.queued,
                        })}
                        {item.failed
                          ? ` · ${tr("{count} failed", "{count} 首失败", { count: item.failed })}`
                          : ""}
                      </span>
                      <div className="download-import__bar">
                        <i style={{ width: `${Math.max(3, (item.resolved / Math.max(1, item.total)) * 100)}%` }} />
                      </div>
                    </div>
                    {!item.active && (
                      <button type="button" className="download-row__dismiss" onClick={() => dismissImport(item.id)} aria-label={tr("Dismiss import", "忽略导入")}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}

            <div className="download-panel__tabs" role="tablist" aria-label={tr("Download filters", "下载筛选")}>
              {(["active", "done", "failed", "all"] as Filter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={filter === item}
                  className={clsx(filter === item && "is-active")}
                  onClick={() => setFilter(item)}
                >
                  {filterLabel(item)}
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
                  <strong>
                    {filter === "all"
                      ? tr("No tasks", "暂无任务")
                      : tr("No {filter} tasks", "暂无{filter}任务", { filter: filterLabel(filter) })}
                  </strong>
                  <span>
                    {tr("Downloads from Discover will appear here.", "来自“发现”页的下载会显示在这里。")}
                  </span>
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
                              ? job.updated
                                ? tr("Library info updated", "资料库信息已更新")
                                : job.duplicate
                                  ? tr("Already in your library", "已存在于资料库")
                                  : tr("Added to your library", "已添加到资料库")
                              : job.phase === "resolving"
                                ? tr("Resolving the best audio…", "正在解析最佳音质…")
                                : job.phase === "queued"
                                  ? tr("Waiting in the queue…", "正在排队…")
                                  : job.total > 0
                                    ? `${pct}% · ${Math.round(job.total / 1024 / 1024)} MB`
                                    : tr("Downloading…", "下载中…")}
                        </span>
                        {job.status === "running" && (
                          <div className="download-row__bar">
                            <i style={{ width: `${Math.max(3, pct)}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="download-row__actions">
                        {job.status === "error" && (
                          <button type="button" onClick={() => void retry(job.jobId)} title={tr("Retry download", "重试下载")} aria-label={tr("Retry download", "重试下载")}>
                            <RefreshCw size={13} />
                          </button>
                        )}
                        {job.status !== "running" && (
                          <button type="button" onClick={() => dismiss(job.jobId)} title={tr("Dismiss", "忽略")} aria-label={tr("Dismiss download", "忽略下载")}>
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
              <span>
                {tr("{count} total · stored in your library", "共 {count} 个 · 存储于资料库", {
                  count: downloads.length,
                })}
              </span>
              <button type="button" onClick={clear} disabled={!finishedCount && !imports.some((item) => !item.active)}>
                <Trash2 size={12} /> {tr("Clear finished", "清除已完成")}
              </button>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
