export type ImmersiveLayout = "split" | "focus" | "minimal";
export type ImmersiveAccent = "cover" | "warm" | "cool" | "rose" | "custom";
export type ImmersiveViewMode = "classic" | "3d";

export interface ImmersivePreferences {
  lyricView: ImmersiveViewMode;
  layout: ImmersiveLayout;
  showCover: boolean;
  showInfo: boolean;
  showHeader: boolean;
  showTranslation: boolean;
  showProgress: boolean;
  showVolume: boolean;
  showFavorite: boolean;
  lyricsFrame: boolean;
  lyricPanelOpacity: number;
  lyricPanelBorder: number;
  lyricPanelBlur: number;
  lyricPanelRadius: number;
  lyricLineSpacing: number;
  lyricActiveHighlight: boolean;
  showSpectrum: boolean;
  spectrumScale: number;
  spectrumOpacity: number;
  lyricScale: number;
  lyricAlign: "left" | "center";
  lyricSerif: boolean;
  backgroundBlur: number;
  backgroundDim: number;
  backgroundGrain: number;
  backgroundVeil: number;
  accent: ImmersiveAccent;
  accentColor: string;
  stageParticles: boolean;
  stageCamera: boolean;
  stageFormations: boolean;
  stageWordGlow: boolean;
  stageAudioReact: boolean;
  stageIntensity: number;
}

export const DEFAULT_IMMERSIVE: ImmersivePreferences = {
  lyricView: "classic",
  layout: "split",
  showCover: true,
  showInfo: true,
  showHeader: true,
  showTranslation: true,
  showProgress: true,
  showVolume: true,
  showFavorite: true,
  lyricsFrame: true,
  lyricPanelOpacity: 0.062,
  lyricPanelBorder: 0.105,
  lyricPanelBlur: 34,
  lyricPanelRadius: 22,
  lyricLineSpacing: 1.48,
  lyricActiveHighlight: true,
  showSpectrum: true,
  spectrumScale: 1,
  spectrumOpacity: 0.78,
  lyricScale: 1,
  lyricAlign: "left",
  lyricSerif: false,
  backgroundBlur: 1,
  backgroundDim: 1,
  backgroundGrain: 1,
  backgroundVeil: 1,
  accent: "cover",
  accentColor: "#e5b37d",
  stageParticles: true,
  stageCamera: true,
  stageFormations: true,
  stageWordGlow: true,
  stageAudioReact: true,
  stageIntensity: 1,
};

const KEY = "potato:immersive-preferences:v1";

export function loadImmersivePreferences(): ImmersivePreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_IMMERSIVE;
    const parsed = JSON.parse(raw) as Partial<ImmersivePreferences>;
    return {
      ...DEFAULT_IMMERSIVE,
      ...parsed,
      lyricScale: clamp(Number(parsed.lyricScale ?? 1), 0.72, 1.6),
      lyricPanelOpacity: clamp(Number(parsed.lyricPanelOpacity ?? 0.062), 0, 0.4),
      lyricPanelBorder: clamp(Number(parsed.lyricPanelBorder ?? 0.105), 0, 0.6),
      lyricPanelBlur: clamp(Number(parsed.lyricPanelBlur ?? 34), 0, 60),
      lyricPanelRadius: clamp(Number(parsed.lyricPanelRadius ?? 22), 0, 40),
      lyricLineSpacing: clamp(Number(parsed.lyricLineSpacing ?? 1.48), 1.2, 1.95),
      lyricActiveHighlight: parsed.lyricActiveHighlight !== false,
      showSpectrum: parsed.showSpectrum !== false,
      spectrumScale: clamp(Number(parsed.spectrumScale ?? 1), 0.6, 1.8),
      spectrumOpacity: clamp(Number(parsed.spectrumOpacity ?? 0.78), 0.15, 1),
      backgroundBlur: clamp(Number(parsed.backgroundBlur ?? 1), 0.35, 1.7),
      backgroundDim: clamp(Number(parsed.backgroundDim ?? 1), 0.35, 1.45),
      backgroundGrain: clamp(Number(parsed.backgroundGrain ?? 1), 0, 1.8),
      backgroundVeil: clamp(Number(parsed.backgroundVeil ?? 1), 0.25, 1.5),
      stageIntensity: clamp(Number(parsed.stageIntensity ?? 1), 0.4, 1.6),
    };
  } catch {
    return DEFAULT_IMMERSIVE;
  }
}

export function saveImmersivePreferences(value: ImmersivePreferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Optional storage; the current session still works.
  }
}

export function accentFromPreferences(value: ImmersivePreferences, coverAccent?: string | null): string | null {
  if (value.accent === "cover") return coverAccent ?? null;
  if (value.accent === "warm") return "#e5b37d";
  if (value.accent === "cool") return "#93b8ca";
  if (value.accent === "rose") return "#d69aa7";
  return value.accentColor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
