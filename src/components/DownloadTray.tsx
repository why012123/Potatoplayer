import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, X } from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

export function DownloadTray() {
  const tr = useTr();
  const downloads = useAppStore((state) => state.downloads);
  const dismiss = useAppStore((state) => state.cancelDownload);
  const setPanelOpen = useAppStore((state) => state.setDownloadPanelOpen);
  const [visible, setVisible] = useState(false);
  const previousJobs = useRef(new Set<string>());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = downloads.filter((job) => job.status === "running");
  const jobIds = JSON.stringify(running.map(job => job.jobId));
  const stopTimer = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const scheduleHide = useCallback(() => {
    stopTimer();
    hideTimer.current = setTimeout(() => setVisible(false), 8000);
  }, [stopTimer]);
  useEffect(() => {
    const current = new Set<string>(JSON.parse(jobIds));
    if ([...current].some(id => !previousJobs.current.has(id))) {
      setVisible(true);
      scheduleHide();
    }
    previousJobs.current = current;
    if (!current.size) { stopTimer(); setVisible(false); }
  }, [jobIds, scheduleHide, stopTimer]);
  useEffect(() => stopTimer, [stopTimer]);
  return (
    <AnimatePresence>
    {running.length > 0 && visible && <motion.div className="download-tray"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }} onMouseEnter={stopTimer} onMouseLeave={scheduleHide}
      onFocusCapture={stopTimer} onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleHide();
      }}>
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
        {running.slice(0, 3).map((job) => {
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
                      : job.phase === "verifying"
                        ? tr("Checking audio quality…", "正在校验音频与音质…")
                      : job.phase === "finalizing"
                        ? tr("Preparing library files…", "正在整理封面、歌词与文件…")
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
              <button type="button" className="download-item__close" aria-label={tr("Cancel download", "取消下载")} onClick={() => dismiss(job.jobId)}>
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>}
    </AnimatePresence>
  );
}
