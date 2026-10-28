import { AnimatePresence, motion } from "motion/react";
import { CloudDownload, X } from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

export function DownloadTray() {
  const tr = useTr();
  const downloads = useAppStore((state) => state.downloads);
  const dismiss = useAppStore((state) => state.dismissDownload);
  const setPanelOpen = useAppStore((state) => state.setDownloadPanelOpen);
  const running = downloads.filter((job) => job.status === "running");
  if (!running.length) return null;

  return (
    <div className="download-tray">
      <button type="button" className="download-tray__head" onClick={() => setPanelOpen(true)}>
        <span>
          <CloudDownload size={13} />{" "}
          {running.length === 1
            ? tr("1 download", "1 项下载")
            : tr("{count} downloads", "{count} 项下载", { count: running.length })}
        </span>
        <em>{tr("View all tasks", "查看全部任务")}</em>
      </button>
      <AnimatePresence>
        {running.map((job) => {
          const pct = job.total > 0 ? Math.min(100, Math.round((job.downloaded / job.total) * 100)) : 0;
          return (
            <motion.div
              key={job.jobId}
              className={`download-item glass-strong download-item--${job.status}`}
              initial={{ opacity: 0, x: -14, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <span className="download-item__icon">
                <CloudDownload size={16} />
              </span>
              <div className="download-item__copy">
                <strong>{job.title}</strong>
                <span>
                  {job.phase === "resolving"
                    ? tr("Finding the best audio…", "正在查找最佳音质…")
                    : job.phase === "queued"
                      ? tr("Waiting in the queue…", "正在排队…")
                      : job.total > 0
                        ? tr("{pct}% of {size}", "已下载 {pct}% · {size}", {
                            pct,
                            size: `${Math.round(job.total / 1024 / 1024)} MB`,
                          })
                        : tr("{pct}% downloaded", "已下载 {pct}%", { pct })}
                </span>
                <div className="download-item__bar">
                  <i style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, pct / 100))})` }} />
                </div>
              </div>
              <button type="button" className="download-item__close" aria-label={tr("Dismiss", "忽略")} onClick={() => dismiss(job.jobId)}>
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
