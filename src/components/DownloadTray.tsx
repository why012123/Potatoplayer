import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, CloudDownload, X } from "lucide-react";
import { useAppStore } from "@/store";

export function DownloadTray() {
  const downloads = useAppStore((state) => state.downloads);
  const dismiss = useAppStore((state) => state.dismissDownload);
  if (!downloads.length) return null;

  return (
    <div className="download-tray">
      <AnimatePresence>
        {downloads.map((job) => {
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
                {job.status === "done" ? (
                  <CheckCircle2 size={16} />
                ) : job.status === "error" ? (
                  <AlertCircle size={16} />
                ) : (
                  <CloudDownload size={16} />
                )}
              </span>
              <div className="download-item__copy">
                <strong>{job.title}</strong>
                <span>
                  {job.status === "error"
                    ? job.message
                    : job.status === "done"
                      ? "Added to your library"
                      : job.phase === "resolving"
                        ? "Finding the best audio…"
                        : `${pct}% of ${job.total > 0 ? `${Math.round(job.total / 1024 / 1024)} MB` : "download"}`}
                </span>
                {job.status === "running" && (
                  <div className="download-item__bar">
                    <i style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                )}
              </div>
              <button type="button" className="download-item__close" aria-label="Dismiss" onClick={() => dismiss(job.jobId)}>
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
