import { useEffect, useMemo, useRef, useState } from "react";
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
import type { EqPresetData, EqState } from "@/types";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";

function formatDb(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

type Target =
  | { kind: "song" }
  | { kind: "global" }
  | { kind: "factory"; name: string }
  | { kind: "user"; name: string };

function targetKey(target: Target): string {
  if (target.kind === "factory") return `factory:${target.name}`;
  if (target.kind === "user") return `user:${target.name}`;
  return target.kind;
}

function parseTarget(value: string): Target {
  if (value.startsWith("factory:")) return { kind: "factory", name: value.slice(8) };
  if (value.startsWith("user:")) return { kind: "user", name: value.slice(5) };
  if (value === "song") return { kind: "song" };
  return { kind: "global" };
}

function copyPreset(preset: EqPresetData): EqPresetData {
  return { name: preset.name, preamp: preset.preamp, bands: [...preset.bands] };
}

export function EqualizerDialog() {
  const open = useAppStore((state) => state.eqOpen);
  const setOpen = useAppStore((state) => state.setEqOpen);
  const playbackTrackId = useAppStore((state) => state.playback?.trackId ?? null);
  const openPrompt = useAppStore((state) => state.openPrompt);
  const pushToast = useAppStore((state) => state.pushToast);

  const [eq, setEq] = useState<EqState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Target>({ kind: "global" });
  const [draft, setDraft] = useState<EqPresetData | null>(null);
  const [baseline, setBaseline] = useState<EqPresetData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveMenu, setSaveMenu] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.potato.invoke<EqState>("eq.state");
      setEq(next);
      const hasSong = Boolean(next.currentTrack?.hasSongPreset && next.songPreset);
      const initialTarget: Target = hasSong ? { kind: "song" } : { kind: "global" };
      const initial = hasSong ? next.songPreset! : next.global ?? { name: "Global", preamp: next.preamp, bands: next.bands };
      setTarget(initialTarget);
      setBaseline(copyPreset(initial));
      setDraft(copyPreset(initial));
      setDirty(false);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // Reload when the playing track changes; the old player discards an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playbackTrackId]);

  useEffect(() => {
    if (!saveMenu) return;
    const onDown = (event: PointerEvent) => {
      if (!saveMenuRef.current?.contains(event.target as Node)) setSaveMenu(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [saveMenu]);

  const baselineFor = (value: Target, state = eq): EqPresetData | null => {
    if (!state) return null;
    if (value.kind === "song") return state.songPreset ?? state.global ?? null;
    if (value.kind === "global") return state.global ?? { name: "Global", preamp: state.preamp, bands: state.bands };
    if (value.kind === "factory") return state.factoryPresets.find((item) => item.name === value.name) ?? null;
    return state.presets.find((item) => item.name === value.name) ?? null;
  };

  const replaceState = (next: EqState) => {
    setEq(next);
    const base = baselineFor(target, next);
    if (base && !dirty) {
      setBaseline(copyPreset(base));
      setDraft(copyPreset(base));
    }
  };

  const preview = (preset: EqPresetData) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      void window.potato
        .invoke("eq.preview", { bands: preset.bands, preamp: preset.preamp })
        .catch(() => undefined);
    }, 70);
  };

  const applyDraftChange = (next: EqPresetData) => {
    setDraft(next);
    setDirty(true);
    preview(next);
  };

  const chooseTarget = (value: string) => {
    const nextTarget = parseTarget(value);
    const nextBaseline = baselineFor(nextTarget);
    if (!nextBaseline) return;
    setTarget(nextTarget);
    setBaseline(copyPreset(nextBaseline));
    setDraft(copyPreset(nextBaseline));
    setDirty(false);
    preview(nextBaseline);
  };

  const call = async (method: string, params?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const next = await window.potato.invoke<EqState>(method, params);
      replaceState(next);
      return next;
    } catch (reason) {
      pushToast("Equalizer error", String(reason), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const updateBand = (index: number, value: number) => {
    if (!draft) return;
    const bands = draft.bands.slice();
    bands[index] = value;
    applyDraftChange({ ...draft, bands });
  };

  const updatePreamp = (value: number) => {
    if (!draft) return;
    applyDraftChange({ ...draft, preamp: value });
  };

  const resetToBaseline = () => {
    if (!baseline) return;
    setDraft(copyPreset(baseline));
    setDirty(false);
    preview(baseline);
  };

  const flat = () => {
    if (!draft) return;
    const next = { ...draft, preamp: eq?.neutralPreamp ?? 12, bands: draft.bands.map(() => 0) };
    applyDraftChange(next);
  };

  const saveToSong = async () => {
    if (!draft) return;
    const next = await call("eq.saveSong", { bands: draft.bands, preamp: draft.preamp });
    if (next) {
      setTarget({ kind: "song" });
      setBaseline(copyPreset(draft));
      setDirty(false);
      pushToast("EQ saved to this song", eq?.currentTrack?.title, "success");
    }
    setSaveMenu(false);
  };

  const saveToGlobal = async () => {
    if (!draft) return;
    const next = await call("eq.saveGlobal", { bands: draft.bands, preamp: draft.preamp });
    if (next) {
      setTarget({ kind: "global" });
      setBaseline(copyPreset(draft));
      setDirty(false);
      pushToast("EQ saved globally", undefined, "success");
    }
    setSaveMenu(false);
  };

  const saveNamed = () => {
    if (!draft) return;
    setSaveMenu(false);
    openPrompt({
      title: "Save EQ preset",
      description: "Save this curve as a reusable named preset.",
      placeholder: "My listening curve",
      confirmLabel: "Save preset",
      onSubmit: async (name) => {
        const next = await call("eq.saveNamed", { name, bands: draft.bands, preamp: draft.preamp });
        if (next) {
          setTarget({ kind: "user", name: name.trim() });
          setBaseline(copyPreset(draft));
          setDirty(false);
        }
      },
    });
  };

  const deletePreset = () => {
    if (target.kind !== "user") return;
    openPrompt({
      title: `Delete “${target.name}”?`,
      description: "Only the preset is removed. Your saved per-song presets stay intact.",
      input: false,
      confirmLabel: "Delete preset",
      destructive: true,
      onSubmit: async () => {
        const next = await call("eq.deletePreset", { name: target.name });
        if (next) setTarget({ kind: "global" });
      },
    });
  };

  const close = () => {
    void window.potato.invoke("eq.restore").catch(() => undefined);
    setSaveMenu(false);
    setOpen(false);
  };

  const power = async () => {
    if (!eq) return;
    const next = await call("eq.setEnabled", { enabled: !eq.enabled });
    if (next && next.enabled && draft) preview(draft);
  };

  const activeSongLabel = eq?.currentTrack
    ? `${eq.currentTrack.title} · ${eq.currentTrack.artist}`
    : "No track playing";
  const currentHasSongPreset = Boolean(eq?.currentTrack?.hasSongPreset);
  const targetLabel = useMemo(() => {
    if (target.kind === "song") return "This song";
    if (target.kind === "global") return "Global preset";
    if (target.kind === "factory") return target.name;
    return target.name;
  }, [target]);

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
              <p>Ten VLC bands and preamp. Edit a song curve, preview it live, then save.</p>
            </div>
            <div className="eq-head__actions">
              <button
                type="button"
                role="switch"
                aria-checked={eq?.enabled ?? false}
                className={`eq-power ${eq?.enabled ? "is-on" : ""}`}
                disabled={!eq?.available || busy}
                onClick={() => void power()}
              >
                <span className="switch"><i /></span>
                {eq?.enabled ? "On" : "Bypass"}
              </button>
              <button type="button" className="eq-close" aria-label="Close equalizer" onClick={close}>
                <X size={18} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="eq-loading"><LoaderCircle size={20} className="is-spinning" /> Reading VLC equalizer…</div>
          ) : error || !eq || !draft ? (
            <div className="eq-error"><AlertCircle size={18} /> {error ?? "The equalizer is unavailable."}</div>
          ) : (
            <>
              {!eq.available && (
                <div className="eq-warning">
                  <AlertCircle size={15} />
                  VLC’s equalizer is not available in this installation. Curves can still be saved.
                </div>
              )}

              <div className="eq-toolbar">
                <label className="eq-preset">
                  <span>Editing</span>
                  <select value={targetKey(target)} onChange={(event) => chooseTarget(event.target.value)} disabled={busy}>
                    <option value="song" disabled={!eq.currentTrack}>{eq.currentTrack ? `This song · ${eq.currentTrack.title}` : "This song (nothing playing)"}</option>
                    <option value="global">Global preset</option>
                    <optgroup label="VLC presets">
                      {eq.factoryPresets.map((preset) => <option key={`factory:${preset.name}`} value={`factory:${preset.name}`}>{preset.name}</option>)}
                    </optgroup>
                    <optgroup label="My presets">
                      {eq.presets.map((preset) => <option key={`user:${preset.name}`} value={`user:${preset.name}`}>{preset.name}</option>)}
                    </optgroup>
                  </select>
                </label>
                <div className="eq-toolbar__actions">
                  <button type="button" className="button button--glass button--small" onClick={flat}><RotateCcw size={13} /> Flat</button>
                  <button type="button" className="button button--glass button--small" onClick={resetToBaseline}>Reset</button>
                  <div className="eq-save-wrap" ref={saveMenuRef}>
                    <button type="button" className="button button--dark button--small" onClick={() => setSaveMenu(!saveMenu)}>
                      <Save size={13} /> Save
                    </button>
                    {saveMenu && (
                      <div className="eq-save-menu">
                        <button type="button" disabled={!eq.currentTrack || busy} onClick={() => void saveToSong()}>Save to this song</button>
                        <button type="button" disabled={busy} onClick={() => void saveToGlobal()}>Save as global</button>
                        <button type="button" disabled={busy} onClick={saveNamed}>Save as new preset…</button>
                      </div>
                    )}
                  </div>
                  {target.kind === "user" && (
                    <button type="button" className="icon-button icon-button--ghost icon-button--sm danger-hover" onClick={deletePreset} title="Delete preset" aria-label="Delete preset">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="eq-editing-note">
                <span><strong>{targetLabel}</strong>{target.kind === "song" ? ` · ${activeSongLabel}` : ""}</span>
                <span className={dirty ? "is-dirty" : ""}>{dirty ? "Unsaved draft · previewing live" : "Saved curve"}</span>
                {target.kind !== "song" && currentHasSongPreset && (
                  <em>This song has its own preset; editing {target.kind === "global" ? "global" : "this template"} will not affect it.</em>
                )}
              </div>

              <div className={`eq-stage ${eq.enabled ? "" : "is-bypassed"}`}>
                <div className="eq-scale" aria-hidden="true"><span>+20</span><span>0</span><span>−20</span></div>
                <div className="eq-bands">
                  {eq.labels.map((label, index) => {
                    const value = draft.bands[index] ?? 0;
                    const magnitude = Math.min(1, Math.abs(value) / 20) * 50;
                    return (
                      <div className="eq-band" key={label}>
                        <span className="eq-band__value">{formatDb(value)}</span>
                        <div className="eq-band__rail">
                          <span className="eq-band__zero" />
                          <span className="eq-band__fill" style={value >= 0 ? { bottom: "50%", height: `${magnitude}%` } : { top: "50%", height: `${magnitude}%` }} />
                          <input type="range" min={-20} max={20} step={0.5} value={value} className="eq-band__input" aria-label={`${label} hertz band`} onChange={(event) => updateBand(index, Number(event.target.value))} />
                        </div>
                        <span className="eq-band__freq">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="eq-preamp">
                <div className="eq-preamp__head">
                  <span>Preamp <em>12 dB = unity</em></span>
                  <strong>{formatDb(draft.preamp - eq.neutralPreamp)} dB</strong>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={0.5}
                  value={draft.preamp}
                  aria-label="Equalizer preamp"
                  className="eq-preamp__range"
                  style={{ "--preamp-progress": `${((draft.preamp + 20) / 40) * 100}%` } as React.CSSProperties}
                  onChange={(event) => updatePreamp(Number(event.target.value))}
                />
              </div>

              <div className="eq-foot">
                <span>
                  <SlidersHorizontal size={13} /> {eq.available ? "10-band VLC equalizer" : "Curve saved; playback EQ unavailable"}
                  <em>· {eq.songCount ?? 0} song presets</em>
                </span>
                <button type="button" className="text-button" onClick={() => void load()} disabled={busy}>Refresh</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </AnimatePresence>
  );
}
