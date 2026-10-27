import { RotateCcw, X } from "lucide-react";
import type { ImmersivePreferences } from "@/lib/immersive";
import { DEFAULT_IMMERSIVE } from "@/lib/immersive";
import { useTr } from "@/lib/i18n";

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
  const tr = useTr();
  return (
    <aside className="immersive-customizer glass-strong" role="complementary" aria-label={tr("Customize immersive mode", "自定义沉浸模式")}>
      <header className="immersive-customizer__head">
        <div>
          <span className="eyebrow">{tr("Personal space", "私人空间")}</span>
          <h2>{tr("Customize immersion", "自定义沉浸效果")}</h2>
        </div>
        <button type="button" className="immersive-customizer__close" onClick={onClose} aria-label={tr("Close customizer", "关闭自定义面板")}>
          <X size={15} />
        </button>
      </header>

      <div className="immersive-customizer__body">
        <section>
          <div className="custom-section-title">{tr("View", "视图")}</div>
          <div className="custom-segment">
            {(["classic", "3d"] as const).map((value) => (
              <button key={value} type="button" className={prefs.lyricView === value ? "is-active" : ""} onClick={() => onChange({ lyricView: value })}>
                {value === "classic" ? tr("Classic", "经典") : tr("3D stage", "3D 演出")}
              </button>
            ))}
          </div>
          <div className="custom-segment custom-segment--three">
            {(["split", "focus", "minimal"] as const).map((value) => (
              <button key={value} type="button" className={prefs.layout === value ? "is-active" : ""} onClick={() => onChange({ layout: value })}>
                {value === "split" ? tr("Split", "分栏") : value === "focus" ? tr("Lyrics focus", "歌词聚焦") : tr("Minimal", "极简")}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="custom-section-title">{tr("Show", "显示")}</div>
          <div className="custom-toggles">
            <Toggle label={tr("Cover art", "封面")} value={prefs.showCover} onChange={(value) => onChange({ showCover: value })} />
            <Toggle label={tr("Track info", "歌曲信息")} value={prefs.showInfo} onChange={(value) => onChange({ showInfo: value })} />
            <Toggle label={tr("Lyrics header", "歌词顶栏")} value={prefs.showHeader} onChange={(value) => onChange({ showHeader: value })} />
            <Toggle label={tr("Translation", "翻译")} value={prefs.showTranslation} onChange={(value) => onChange({ showTranslation: value })} />
            <Toggle label={tr("Progress", "进度条")} value={prefs.showProgress} onChange={(value) => onChange({ showProgress: value })} />
            <Toggle label={tr("Volume", "音量")} value={prefs.showVolume} onChange={(value) => onChange({ showVolume: value })} />
            <Toggle label={tr("Favorite", "收藏")} value={prefs.showFavorite} onChange={(value) => onChange({ showFavorite: value })} />
            <Toggle label={tr("Lyrics frame", "歌词框")} value={prefs.lyricsFrame} onChange={(value) => onChange({ lyricsFrame: value })} />
            <Toggle label={tr("Active line highlight", "当前行高亮")} value={prefs.lyricActiveHighlight} onChange={(value) => onChange({ lyricActiveHighlight: value })} />
          </div>
        </section>

        <section>
          <div className="custom-section-title">{tr("Lyrics panel", "歌词模块")}</div>
          <p className="custom-note custom-note--tight">
            {tr(
              "Fine-tune the surface behind the words. With the frame off, the panel disappears completely.",
              "细调文字背后的表面。关闭歌词框后，整个模块会完全消失。",
            )}
          </p>
          <Range label={tr("Fill", "填充")} value={prefs.lyricPanelOpacity} min={0} max={0.4} step={0.005} format={(value) => `${Math.round(value * 1000) / 10}%`} onChange={(value) => onChange({ lyricPanelOpacity: value })} />
          <Range label={tr("Border", "描边")} value={prefs.lyricPanelBorder} min={0} max={0.6} step={0.005} format={(value) => `${Math.round(value * 1000) / 10}%`} onChange={(value) => onChange({ lyricPanelBorder: value })} />
          <Range label={tr("Blur", "模糊")} value={prefs.lyricPanelBlur} min={0} max={60} step={1} format={(value) => `${Math.round(value)}px`} onChange={(value) => onChange({ lyricPanelBlur: value })} />
          <Range label={tr("Corners", "圆角")} value={prefs.lyricPanelRadius} min={0} max={40} step={1} format={(value) => `${Math.round(value)}px`} onChange={(value) => onChange({ lyricPanelRadius: value })} />
          <Range label={tr("Line spacing", "行距")} value={prefs.lyricLineSpacing} min={1.2} max={1.95} step={0.01} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => onChange({ lyricLineSpacing: value })} />
        </section>

        <section>
          <div className="custom-section-title">{tr("Lyrics type", "歌词样式")}</div>
          <Range label={tr("Size", "字号")} value={prefs.lyricScale} min={0.72} max={1.6} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ lyricScale: value })} />
          <div className="custom-segment">
            <button type="button" className={prefs.lyricAlign === "left" ? "is-active" : ""} onClick={() => onChange({ lyricAlign: "left" })}>{tr("Left", "左对齐")}</button>
            <button type="button" className={prefs.lyricAlign === "center" ? "is-active" : ""} onClick={() => onChange({ lyricAlign: "center" })}>{tr("Center", "居中")}</button>
          </div>
          <div className="custom-segment">
            <button type="button" className={!prefs.lyricSerif ? "is-active" : ""} onClick={() => onChange({ lyricSerif: false })}>{tr("Sans", "无衬线")}</button>
            <button type="button" className={prefs.lyricSerif ? "is-active" : ""} onClick={() => onChange({ lyricSerif: true })}>{tr("Serif", "衬线")}</button>
          </div>
        </section>

        <section>
          <div className="custom-section-title">{tr("3D stage", "3D 舞台")}</div>
          <div className="custom-toggles">
            <Toggle label={tr("Particles", "粒子")} value={prefs.stageParticles} onChange={(value) => onChange({ stageParticles: value })} />
            <Toggle label={tr("Camera drift", "镜头漂移")} value={prefs.stageCamera} onChange={(value) => onChange({ stageCamera: value })} />
          </div>
          <Range label={tr("Intensity", "强度")} value={prefs.stageIntensity} min={0.4} max={1.6} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ stageIntensity: value })} />
          <p className="custom-note">{tr("Particles, camera motion and intensity apply to the 3D performance.", "粒子、镜头运动与强度仅作用于 3D 演出。")}</p>
        </section>

        <section>
          <div className="custom-section-title">{tr("Classic scene", "经典场景")}</div>
          <Range label={tr("Blur", "模糊")} value={prefs.backgroundBlur} min={0.35} max={1.7} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundBlur: value })} />
          <Range label={tr("Dim", "暗度")} value={prefs.backgroundDim} min={0.35} max={1.45} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundDim: value })} />
          <Range label={tr("Grain", "颗粒")} value={prefs.backgroundGrain} min={0} max={1.8} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundGrain: value })} />
          <Range label={tr("Veil", "纱幕")} value={prefs.backgroundVeil} min={0.25} max={1.5} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange({ backgroundVeil: value })} />
        </section>

        <section>
          <div className="custom-section-title">{tr("Accent", "强调色")}</div>
          <div className="custom-swatches">
            {(["cover", "warm", "cool", "rose"] as const).map((value) => (
              <button key={value} type="button" className={`custom-swatch custom-swatch--${value} ${prefs.accent === value ? "is-active" : ""}`} onClick={() => onChange({ accent: value })}>
                <span />
                {value === "cover" ? tr("Cover", "封面") : value === "warm" ? tr("Warm", "暖色") : value === "cool" ? tr("Cool", "冷色") : tr("Rose", "玫瑰")}
              </button>
            ))}
            <label className={`custom-swatch custom-swatch--custom ${prefs.accent === "custom" ? "is-active" : ""}`}>
              <input type="color" value={prefs.accentColor} onChange={(event) => onChange({ accent: "custom", accentColor: event.target.value })} />
              <span style={{ background: prefs.accentColor }} />
              {tr("Custom", "自定义")}
            </label>
          </div>
        </section>
      </div>

      <footer className="immersive-customizer__foot">
        <button type="button" onClick={() => onChange(DEFAULT_IMMERSIVE)}>
          <RotateCcw size={12} /> {tr("Reset look", "重置外观")}
        </button>
        <span>{tr("Saved locally", "本地保存")}</span>
      </footer>
    </aside>
  );
}
