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
import { useTr } from "@/lib/i18n";
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
  const tr = useTr();
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
      pushToast(tr("Equalizer error", "均衡器错误"), String(reason), "error");
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
      pushToast(tr("EQ saved to this song", "均衡器已保存到当前歌曲"), eq?.currentTrack?.title, "success");
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
      pushToast(tr("EQ saved globally", "均衡器已全局保存"), undefined, "success");
    }
    setSaveMenu(false);
  };

  const saveNamed = () => {
    if (!draft) return;
    setSaveMenu(false);
    openPrompt({
      title: tr("Save EQ preset", "保存均衡器预设"),
      description: tr("Save this curve as a reusable named preset.", "将此曲线保存为可复用的命名预设。"),
      placeholder: tr("My listening curve", "我的聆听曲线"),
      confirmLabel: tr("Save preset", "保存预设"),
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
      title: tr(`Delete “${target.name}”?`, `删除“${target.name}”？`),
      description: tr(
        "Only the preset is removed. Your saved per-song presets stay intact.",
        "仅删除此预设，已保存的歌曲预设会保留。",
      ),
      input: false,
      confirmLabel: tr("Delete preset", "删除预设"),
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
    : tr("No track playing", "暂无播放歌曲");
  const currentHasSongPreset = Boolean(eq?.currentTrack?.hasSongPreset);
  const targetLabel = useMemo(() => {
    if (target.kind === "song") return tr("This song", "当前歌曲");
    if (target.kind === "global") return tr("Global preset", "全局预设");
    if (target.kind === "factory") return target.name;
    return target.name;
  }, [target, tr]);

  return (
    <AnimatePresence>
      {open && (
        <Modal onClose={close} className="eq-dialog" labelledBy="eq-title">
          <div className="eq-head">
            <div>
              <div className="modal__eyebrow">
                <SlidersHorizontal size={13} /> {tr("Playback color", "播放音色")}
              </div>
              <h2 id="eq-title">{tr("Equalizer", "均衡器")}</h2>
              <p>
                {tr(
                  "Ten VLC bands and preamp. Edit a song curve, preview it live, then save.",
                  "VLC 十段频段与前置放大。编辑歌曲曲线，实时试听，然后保存。",
                )}
              </p>
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
                {eq?.enabled ? tr("On", "开启") : tr("Bypass", "旁路")}
              </button>
              <button
                type="button"
                className="eq-close"
                aria-label={tr("Close equalizer", "关闭均衡器")}
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="eq-loading">
              <LoaderCircle size={20} className="is-spinning" /> {tr("Reading VLC equalizer…", "正在读取 VLC 均衡器…")}
            </div>
          ) : error || !eq || !draft ? (
            <div className="eq-error">
              <AlertCircle size={18} /> {error ?? tr("The equalizer is unavailable.", "均衡器当前不可用。")}
            </div>
          ) : (
            <>
              {!eq.available && (
                <div className="eq-warning">
                  <AlertCircle size={15} />
                  {tr(
                    "VLC’s equalizer is not available in this installation. Curves can still be saved.",
                    "当前安装的 VLC 不支持均衡器，但仍可保存曲线。",
                  )}
                </div>
              )}

              <div className="eq-toolbar">
                <label className="eq-preset">
                  <span>{tr("Editing", "正在编辑")}</span>
                  <select value={targetKey(target)} onChange={(event) => chooseTarget(event.target.value)} disabled={busy}>
                    <option value="song" disabled={!eq.currentTrack}>
                      {eq.currentTrack
                        ? tr("This song · {title}", "当前歌曲 · {title}", { title: eq.currentTrack.title })
                        : tr("This song (nothing playing)", "当前歌曲（无播放）")}
                    </option>
                    <option value="global">{tr("Global preset", "全局预设")}</option>
                    <optgroup label={tr("VLC presets", "VLC 预设")}>
                      {eq.factoryPresets.map((preset) => <option key={`factory:${preset.name}`} value={`factory:${preset.name}`}>{preset.name}</option>)}
                    </optgroup>
                    <optgroup label={tr("My presets", "我的预设")}>
                      {eq.presets.map((preset) => <option key={`user:${preset.name}`} value={`user:${preset.name}`}>{preset.name}</option>)}
                    </optgroup>
                  </select>
                </label>
                <div className="eq-toolbar__actions">
                  <button type="button" className="button button--glass button--small" onClick={flat}>
                    <RotateCcw size={13} /> {tr("Flat", "平直")}
                  </button>
                  <button type="button" className="button button--glass button--small" onClick={resetToBaseline}>
                    {tr("Reset", "重置")}
                  </button>
                  <div className="eq-save-wrap" ref={saveMenuRef}>
                    <button type="button" className="button button--dark button--small" onClick={() => setSaveMenu(!saveMenu)}>
                      <Save size={13} /> {tr("Save", "保存")}
                    </button>
                    {saveMenu && (
                      <div className="eq-save-menu">
                        <button type="button" disabled={!eq.currentTrack || busy} onClick={() => void saveToSong()}>
                          {tr("Save to this song", "保存到当前歌曲")}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void saveToGlobal()}>
                          {tr("Save as global", "保存为全局预设")}
                        </button>
                        <button type="button" disabled={busy} onClick={saveNamed}>
                          {tr("Save as new preset…", "另存为新预设…")}
                        </button>
                      </div>
                    )}
                  </div>
                  {target.kind === "user" && (
                    <button
                      type="button"
                      className="icon-button icon-button--ghost icon-button--sm danger-hover"
                      onClick={deletePreset}
                      title={tr("Delete preset", "删除预设")}
                      aria-label={tr("Delete preset", "删除预设")}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="eq-editing-note">
                <span><strong>{targetLabel}</strong>{target.kind === "song" ? ` · ${activeSongLabel}` : ""}</span>
                <span className={dirty ? "is-dirty" : ""}>
                  {dirty ? tr("Unsaved draft · previewing live", "未保存草稿 · 实时试听") : tr("Saved curve", "已保存曲线")}
                </span>
                {target.kind !== "song" && currentHasSongPreset && (
                  <em>
                    {target.kind === "global"
                      ? tr(
                          "This song has its own preset; editing the global preset will not affect it.",
                          "当前歌曲已有独立预设，编辑全局预设不会影响它。",
                        )
                      : tr(
                          "This song has its own preset; editing this template will not affect it.",
                          "当前歌曲已有独立预设，编辑此模板不会影响它。",
                        )}
                  </em>
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
                          <input
                            type="range"
                            min={-20}
                            max={20}
                            step={0.5}
                            value={value}
                            className="eq-band__input"
                            aria-label={tr("{label} hertz band", "{label} 赫兹频段", { label })}
                            onChange={(event) => updateBand(index, Number(event.target.value))}
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
                  <span>{tr("Preamp", "前置放大")} <em>{tr("12 dB = unity", "12 dB 为基准")}</em></span>
                  <strong>{formatDb(draft.preamp - eq.neutralPreamp)} dB</strong>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={0.5}
                  value={draft.preamp}
                  aria-label={tr("Equalizer preamp", "均衡器前置放大")}
                  className="eq-preamp__range"
                  style={{ "--preamp-progress": `${((draft.preamp + 20) / 40) * 100}%` } as React.CSSProperties}
                  onChange={(event) => updatePreamp(Number(event.target.value))}
                />
              </div>

              <div className="eq-foot">
                <span>
                  <SlidersHorizontal size={13} />{" "}
                  {eq.available
                    ? tr("10-band VLC equalizer", "VLC 十段均衡器")
                    : tr("Curve saved; playback EQ unavailable", "曲线已保存；播放均衡器不可用")}
                  <em>· {tr("{count} song presets", "{count} 个歌曲预设", { count: eq.songCount ?? 0 })}</em>
                </span>
                <button type="button" className="text-button" onClick={() => void load()} disabled={busy}>
                  {tr("Refresh", "刷新")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </AnimatePresence>
  );
}
