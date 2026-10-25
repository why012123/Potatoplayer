import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";

export function PromptDialog() {
  const prompt = useAppStore((state) => state.prompt);
  const closePrompt = useAppStore((state) => state.closePrompt);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(prompt?.initialValue ?? "");
    setBusy(false);
    if (prompt?.input !== false) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [prompt]);

  const submit = async () => {
    if (!prompt || busy) return;
    if (prompt.input !== false && !value.trim()) return;
    setBusy(true);
    try {
      await prompt.onSubmit(prompt.input === false ? "" : value.trim());
      closePrompt();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {prompt && (
        <Modal
          onClose={() => {
            if (!busy) closePrompt();
          }}
          className="prompt-dialog"
          labelledBy="prompt-title"
        >
          <div className="modal__eyebrow">
            <span className="modal__dot" />
            {prompt.destructive ? "Please confirm" : "Potatoplayer Super"}
          </div>
          <h2 id="prompt-title">{prompt.title}</h2>
          {prompt.description && <p className="modal__description">{prompt.description}</p>}
          {prompt.input !== false && (
            <input
              ref={inputRef}
              className="text-field"
              value={value}
              maxLength={60}
              placeholder={prompt.placeholder ?? "Name"}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          )}
          <div className="modal__actions">
            <button type="button" className="button button--glass" disabled={busy} onClick={closePrompt}>
              Cancel
            </button>
            <button
              type="button"
              className={`button ${prompt.destructive ? "button--danger" : "button--dark"}`}
              disabled={busy || (prompt.input !== false && !value.trim())}
              onClick={() => void submit()}
            >
              {busy && <LoaderCircle size={15} className="is-spinning" />}
              {prompt.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
