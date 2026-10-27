export type ImmersiveLayout = "split" | "focus" | "minimal";
export type ImmersiveAccent = "cover" | "warm" | "cool" | "rose" | "custom";
export type ImmersiveViewMode = "classic" | "stage";
export type ImmersiveStageTheme = "cover" | "ember" | "mono" | "night";
export type ImmersiveStageLayout = "cinema" | "focus" | "minimal";
export type ImmersiveStageMotion = "drift" | "still";
export type ImmersiveStageAlign = "left" | "center";

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
  lyricScale: number;
  lyricAlign: "left" | "center";
  lyricSerif: boolean;
  backgroundBlur: number;
  backgroundDim: number;
  backgroundGrain: number;
  backgroundVeil: number;
  accent: ImmersiveAccent;
  accentColor: string;
  stageTheme: ImmersiveStageTheme;
  stageLayout: ImmersiveStageLayout;
  stageMotion: ImmersiveStageMotion;
  stageAlign: ImmersiveStageAlign;
  stageWordHighlight: boolean;
  stageContext: number;
  stageGlow: number;
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
  lyricScale: 1,
  lyricAlign: "left",
  lyricSerif: false,
  backgroundBlur: 1,
  backgroundDim: 1,
  backgroundGrain: 1,
  backgroundVeil: 1,
  accent: "cover",
  accentColor: "#e5b37d",
  stageTheme: "cover",
  stageLayout: "cinema",
  stageMotion: "drift",
  stageAlign: "center",
  stageWordHighlight: true,
  stageContext: 3,
  stageGlow: 1,
};

const KEY = "potato:immersive-preferences:v1";

const STAGE_THEMES: ImmersiveStageTheme[] = ["cover", "ember", "mono", "night"];
const STAGE_LAYOUTS: ImmersiveStageLayout[] = ["cinema", "focus", "minimal"];
const STAGE_MOTIONS: ImmersiveStageMotion[] = ["drift", "still"];

export function loadImmersivePreferences(): ImmersivePreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_IMMERSIVE;
    const parsed = JSON.parse(raw) as Partial<ImmersivePreferences>;
    // Ultra replaces the old iframe-based "3D" mode with the lyric stage. Keep
    // the choice so anyone who preferred the cinematic view lands in the new one.
    const storedView = (parsed as { lyricView?: string }).lyricView;
    const lyricView: ImmersiveViewMode = storedView === "stage" || storedView === "3d"
      ? "stage"
      : "classic";
    return {
      ...DEFAULT_IMMERSIVE,
      ...parsed,
      lyricView,
      stageTheme: STAGE_THEMES.includes(parsed.stageTheme as ImmersiveStageTheme)
        ? parsed.stageTheme as ImmersiveStageTheme
        : DEFAULT_IMMERSIVE.stageTheme,
      stageLayout: STAGE_LAYOUTS.includes(parsed.stageLayout as ImmersiveStageLayout)
        ? parsed.stageLayout as ImmersiveStageLayout
        : DEFAULT_IMMERSIVE.stageLayout,
      stageMotion: STAGE_MOTIONS.includes(parsed.stageMotion as ImmersiveStageMotion)
        ? parsed.stageMotion as ImmersiveStageMotion
        : DEFAULT_IMMERSIVE.stageMotion,
      stageAlign: parsed.stageAlign === "left" ? "left" : "center",
      lyricScale: clamp(Number(parsed.lyricScale ?? 1), 0.72, 1.6),
      backgroundBlur: clamp(Number(parsed.backgroundBlur ?? 1), 0.35, 1.7),
      backgroundDim: clamp(Number(parsed.backgroundDim ?? 1), 0.35, 1.45),
      backgroundGrain: clamp(Number(parsed.backgroundGrain ?? 1), 0, 1.8),
      backgroundVeil: clamp(Number(parsed.backgroundVeil ?? 1), 0.25, 1.5),
      stageContext: clamp(Number(parsed.stageContext ?? 3), 1, 5),
      stageGlow: clamp(Number(parsed.stageGlow ?? 1), 0, 1.6),
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
