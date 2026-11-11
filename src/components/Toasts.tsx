import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

export function Toasts() {
  const tr = useTr();
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);

  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`toast toast--${toast.tone ?? "default"}`}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          >
            <span className="toast__icon">
              {toast.tone === "success" ? (
                <CheckCircle2 size={17} />
              ) : toast.tone === "error" ? (
                <AlertCircle size={17} />
              ) : (
                <Info size={17} />
              )}
            </span>
            <span className="toast__text">
              <strong>{toast.title}</strong>
              {toast.detail && <em>{toast.detail}</em>}
            </span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label={tr("Dismiss", "关闭提示")}
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
