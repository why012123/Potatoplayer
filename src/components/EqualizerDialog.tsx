import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  AlertCircle,
  LoaderCircle,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { EqState } from "@/types";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";

function formatDb(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

export function EqualizerDialog() {
  const open = useAppStore((state) => state.eqOpen);
  const setOpen = useAppStore((state) => state.setEqOpen);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const pushToast = useAppStore((state) => state.pushToast);
  const [eq, setEq] = useState<EqState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const bandTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const preampTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected("");
    window.potato
      .invoke<EqState>("eq.state")
      .then((next) => {
        if (!cancelled) setEq(next);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      for (const timer of bandTimers.current.values()) clearTimeout(timer);
      bandTimers.current.clear();
      if (preampTimer.current) clearTimeout(preampTimer.current);
    };
  }, [open]);

  const close = () => setOpen(false);

  const replaceEq = (next: EqState) => {
    setEq(next);
  };

  const call = async (method: string, params?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const next = await window.potato.invoke<EqState>(method, params);
      replaceEq(next);
      return next;
    } catch (reason) {
      pushToast("Equalizer error", String(reason), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const updateBand = (index: number, value: number) => {
    setEq((current) => {
      if (!current) return current;
      const bands = current.bands.slice();
      bands[index] = value;
      return { ...current, bands };
    });
    setSelected("");
    const previous = bandTimers.current.get(index);
    if (previous) clearTimeout(previous);
    bandTimers.current.set(
      index,
      setTimeout(() => {
        bandTimers.current.delete(index);
        void window.potato.invoke("eq.setBand", { index, value }).catch(() => undefined);
      }, 110),
    );
  };

  const commitBand = (index: number, value: number) => {
    const previous = bandTimers.current.get(index);
    if (previous) clearTimeout(previous);
    bandTimers.current.delete(index);
    void window.potato.invoke("eq.setBand", { index, value }).catch((reason) => {
      pushToast("Equalizer error", String(reason), "error");
    });
  };

  const updatePreamp = (offset: number) => {
    setEq((current) => (current ? { ...current, preamp: current.neutralPreamp + offset } : current));
    setSelected("");
    if (preampTimer.current) clearTimeout(preampTimer.current);
    preampTimer.current = setTimeout(() => {
      void window.potato
        .invoke("eq.setPreamp", { value: (eq?.neutralPreamp ?? 12) + offset })
        .catch(() => undefined);
    }, 110);
  };

  const commitPreamp = (offset: number) => {
    if (preampTimer.current) clearTimeout(preampTimer.current);
    void window.potato.invoke("eq.setPreamp", { value: (eq?.neutralPreamp ?? 12) + offset }).catch((reason) => {
      pushToast("Equalizer error", String(reason), "error");
    });
  };

  const choosePreset = async (key: string) => {
    setSelected(key);
    if (!key) return;
    if (key.startsWith("f:")) {
      await call("eq.factoryPreset", { name: key.slice(2) });
    } else if (key.startsWith("c:")) {
      await call("eq.applyPreset", { name: key.slice(2) });
    }
  };

  const reset = async () => {
    setSelected("f:Flat");
    await call("eq.reset");
  };

  const savePreset = () => {
    if (!eq) return;
    openPrompt({
      title: "Save EQ preset",
      description: "Save the current ten bands and preamp as a reusable preset.",
      placeholder: "My listening curve",
      confirmLabel: "Save preset",
      onSubmit: async (name) => {
        const next = await call("eq.savePreset", { name });
        if (next) setSelected(`c:${name.trim()}`);
      },
    });
  };

  const deletePreset = () => {
    if (!eq || !selected.startsWith("c:")) return;
    const name = selected.slice(2);
    openPrompt({
      title: `Delete “${name}”?`,
      description: "The curve will be removed, but your audio files are untouched.",
      input: false,
      confirmLabel: "Delete preset",
      destructive: true,
      onSubmit: async () => {
        const next = await call("eq.deletePreset", { name });
        if (next) setSelected("");
      },
    });
  };

  const customSelected = selected.startsWith("c:");

  return (
    <AnimatePresence>
      {open && (
        <Modal onClose={close} className="eq-dialog" labelledBy="eq-title">
          <div className="eq-head">
            <div>
              <div className="modal__eyebrow">
                <SlidersHorizontal size={13} /> Playback color
              </div>
              <h2 id="eq-title">Equalizer</h2>
              <p>Ten VLC bands and a preamp. Move a slider, hear the room change.</p>
            </div>
            <div className="eq-head__actions">
              <button
                type="button"
                role="switch"
                aria-checked={eq?.enabled ?? false}
                className={`eq-power ${eq?.enabled ? "is-on" : ""}`}
                disabled={!eq?.available || busy}
                onClick={() => eq && void call("eq.setEnabled", { enabled: !eq.enabled })}
              >
                <span className="switch">
                  <i />
                </span>
                {eq?.enabled ? "On" : "Bypass"}
              </button>
              <button type="button" className="eq-close" aria-label="Close equalizer" onClick={close}>
                <X size={18} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="eq-loading">
              <LoaderCircle size={20} className="is-spinning" />
              Reading VLC equalizer…
            </div>
          ) : error || !eq ? (
            <div className="eq-error">
              <AlertCircle size={18} />
              {error ?? "The equalizer is unavailable."}
            </div>
          ) : (
            <>
              {!eq.available && (
                <div className="eq-warning">
                  <AlertCircle size={15} />
                  VLC’s equalizer is not available in this installation. You can still prepare and save a curve.
                </div>
              )}

              <div className="eq-toolbar">
                <label className="eq-preset">
                  <span>Preset</span>
                  <select
                    value={selected}
                    onChange={(event) => void choosePreset(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">Custom curve</option>
                    <optgroup label="VLC presets">
                      {eq.factoryPresets.map((preset) => (
                        <option key={`f:${preset.name}`} value={`f:${preset.name}`}>
                          {preset.name}
                        </option>
                      ))}
                    </optgroup>
                    {eq.presets.length > 0 && (
                      <optgroup label="My presets">
                        {eq.presets.map((preset) => (
                          <option key={`c:${preset.name}`} value={`c:${preset.name}`}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <div className="eq-toolbar__actions">
                  <button type="button" className="button button--glass button--small" onClick={() => void reset()}>
                    <RotateCcw size={13} /> Flat
                  </button>
                  <button type="button" className="button button--glass button--small" onClick={savePreset}>
                    <Save size={13} /> Save preset
                  </button>
                  {customSelected && (
                    <button
                      type="button"
                      className="icon-button icon-button--ghost icon-button--sm danger-hover"
                      onClick={deletePreset}
                      title="Delete preset"
                      aria-label="Delete preset"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className={`eq-stage ${eq.enabled ? "" : "is-bypassed"}`}>
                <div className="eq-scale" aria-hidden="true">
                  <span>+20</span>
                  <span>0</span>
                  <span>−20</span>
                </div>
                <div className="eq-bands">
                  {eq.labels.map((label, index) => {
                    const value = eq.bands[index] ?? 0;
                    const magnitude = Math.min(1, Math.abs(value) / 20) * 50;
                    return (
                      <div className="eq-band" key={label}>
                        <span className="eq-band__value">{formatDb(value)}</span>
                        <div className="eq-band__rail">
                          <span className="eq-band__zero" />
                          <span
                            className="eq-band__fill"
                            style={
                              value >= 0
                                ? { bottom: "50%", height: `${magnitude}%` }
                                : { top: "50%", height: `${magnitude}%` }
                            }
                          />
                          <input
                            type="range"
                            min={-20}
                            max={20}
                            step={0.5}
                            value={value}
                            className="eq-band__input"
                            aria-label={`${label} hertz band`}
                            onChange={(event) => updateBand(index, Number(event.target.value))}
                            onPointerUp={(event) => commitBand(index, Number(event.currentTarget.value))}
                            onKeyUp={(event) => {
                              if (event.key.startsWith("Arrow")) {
                                commitBand(index, Number(event.currentTarget.value));
                              }
                            }}
                            onBlur={(event) => commitBand(index, Number(event.currentTarget.value))}
                          />
                        </div>
                        <span className="eq-band__freq">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="eq-preamp">
                <div className="eq-preamp__head">
                  <span>
                    Preamp <em>0 dB = unity</em>
                  </span>
                  <strong>{formatDb(eq.preamp - eq.neutralPreamp)} dB</strong>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={8}
                  step={0.5}
                  value={Math.max(-20, Math.min(8, eq.preamp - eq.neutralPreamp))}
                  aria-label="Equalizer preamp"
                  className="eq-preamp__range"
                  style={
                    {
                      "--preamp-progress": `${((Math.max(-20, Math.min(8, eq.preamp - eq.neutralPreamp)) + 20) / 28) * 100}%`,
                    } as React.CSSProperties
                  }
                  onChange={(event) => updatePreamp(Number(event.target.value))}
                  onPointerUp={(event) => commitPreamp(Number(event.currentTarget.value))}
                  onKeyUp={(event) => {
                    if (event.key.startsWith("Arrow")) commitPreamp(Number(event.currentTarget.value));
                  }}
                  onBlur={(event) => commitPreamp(Number(event.currentTarget.value))}
                />
              </div>

              <div className="eq-foot">
                <span>
                  <SlidersHorizontal size={13} />
                  {eq.available ? "10-band VLC equalizer" : "Curve saved; playback EQ unavailable"}
                </span>
                <button type="button" className="text-button" onClick={() => void call("eq.state")} disabled={busy}>
                  Refresh
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </AnimatePresence>
  );
}
