import { RotateCcw, X } from "lucide-react";
import type { ImmersivePreferences } from "@/lib/immersive";
import { DEFAULT_IMMERSIVE } from "@/lib/immersive";

type Props = {
  prefs: ImmersivePreferences;
  onChange: (patch: Partial<ImmersivePreferences>) => void;
  onClose: () => void;
};

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={`custom-toggle ${value ? "is-on" : ""}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span>{label}</span>
      <i />
    </button>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="custom-range">
      <span><em>{label}</em><strong>{format(value)}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function ImmersiveCustomizer({ prefs, onChange, onClose }: Props) {
  return (
    <aside className="immersive-customizer glass-strong" role="complementary" aria-label="Customize immersive mode">
      <header className="immersive-customizer__head">
        <div>
          <span className="eyebrow">Personal space</span>
          <h2>Customize immersion</h2>
        </div>
        <button type="button" className="immersive-customizer__close" onClick={onClose} aria-label="Close customizer">
          <X size={15} />
        </button>
      </header>

      <div className="immersive-customizer__body">
        <section>
          <div className="custom-section-title">View</div>
          <div className="custom-segment">
            {(["classic", "3d"] as const).map((value) => (
              <button key={value} type="button" className={prefs.lyricView === value ? "is-active" : ""} onClick={() => onChange({ lyricView: value })}>
                {value === "classic" ? "Classic" : "3D stage"}
              </button>
            ))}
          </div>
          <div className="custom-segment custom-segment--three">
            {(["split", "focus", "minimal"] as const).map((value) => (
              <button key={value} type="button" className={prefs.layout === value ? "is-active" : ""} onClick={() => onChange({ layout: value })}>
                {value === "split" ? "Split" : value === "focus" ? "Lyrics focus" : "Minimal"}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="custom-section-title">Show</div>
          <div className="custom-toggles">
            <Toggle label="Cover art" value={prefs.showCover} onChange={(value) => onChange({ showCover: value })} />
            <Toggle label="Track info" value={prefs.showInfo} onChange={(value) => onChange({ showInfo: value })} />
            <Toggle label="Lyrics header" value={prefs.showHeader} onChange={(value) => onChange({ showHeader: value })} />
            <Toggle label="Translation" value={prefs.showTranslation} onChange={(value) => onChange({ showTranslation: value })} />
            <Toggle label="Progress" value={prefs.showProgress} onChange={(value) => onChange({ showProgress: value })} />
            <Toggle label="Volume" value={prefs.showVolume} onChange={(value) => onChange({ showVolume: value })} />
            <Toggle label="Favorite" value={prefs.showFavorite} onChange={(value) => onChange({ showFavorite: value })} />
          </div>
        </section>

        <section>
          <div className="custom-section-title">Lyrics type</div>
          <Range label="Size" value={prefs.lyricScale} min={0.72} max={1.6} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ lyricScale: value })} />
          <div className="custom-segment">
            <button type="button" className={prefs.lyricAlign === "left" ? "is-active" : ""} onClick={() => onChange({ lyricAlign: "left" })}>Left</button>
            <button type="button" className={prefs.lyricAlign === "center" ? "is-active" : ""} onClick={() => onChange({ lyricAlign: "center" })}>Center</button>
          </div>
          <div className="custom-segment">
            <button type="button" className={!prefs.lyricSerif ? "is-active" : ""} onClick={() => onChange({ lyricSerif: false })}>Sans</button>
            <button type="button" className={prefs.lyricSerif ? "is-active" : ""} onClick={() => onChange({ lyricSerif: true })}>Serif</button>
          </div>
        </section>

        <section>
          <div className="custom-section-title">3D stage</div>
          <div className="custom-toggles">
            <Toggle label="Particles" value={prefs.stageParticles} onChange={(value) => onChange({ stageParticles: value })} />
            <Toggle label="Camera drift" value={prefs.stageCamera} onChange={(value) => onChange({ stageCamera: value })} />
          </div>
          <Range label="Intensity" value={prefs.stageIntensity} min={0.4} max={1.6} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ stageIntensity: value })} />
          <p className="custom-note">Particles, camera motion and intensity apply to the 3D performance.</p>
        </section>

        <section>
          <div className="custom-section-title">Classic scene</div>
          <Range label="Blur" value={prefs.backgroundBlur} min={0.35} max={1.7} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundBlur: value })} />
          <Range label="Dim" value={prefs.backgroundDim} min={0.35} max={1.45} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundDim: value })} />
          <Range label="Grain" value={prefs.backgroundGrain} min={0} max={1.8} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundGrain: value })} />
          <Range label="Veil" value={prefs.backgroundVeil} min={0.25} max={1.5} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundVeil: value })} />
        </section>

        <section>
          <div className="custom-section-title">Accent</div>
          <div className="custom-swatches">
            {(["cover", "warm", "cool", "rose"] as const).map((value) => (
              <button key={value} type="button" className={`custom-swatch custom-swatch--${value} ${prefs.accent === value ? "is-active" : ""}`} onClick={() => onChange({ accent: value })}>
                <span />
                {value === "cover" ? "Cover" : value === "warm" ? "Warm" : value === "cool" ? "Cool" : "Rose"}
              </button>
            ))}
            <label className={`custom-swatch custom-swatch--custom ${prefs.accent === "custom" ? "is-active" : ""}`}>
              <input type="color" value={prefs.accentColor} onChange={(event) => onChange({ accent: "custom", accentColor: event.target.value })} />
              <span style={{ background: prefs.accentColor }} />
              Custom
            </label>
          </div>
        </section>
      </div>

      <footer className="immersive-customizer__foot">
        <button type="button" onClick={() => onChange(DEFAULT_IMMERSIVE)}>
          <RotateCcw size={12} /> Reset look
        </button>
        <span>Saved locally</span>
      </footer>
    </aside>
  );
}
