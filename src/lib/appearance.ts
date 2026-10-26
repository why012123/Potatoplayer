import type { Language } from "@/lib/text";

export type UiStyle = "editorial" | "classic";
export type AccentChoice = "cover" | "coral" | "sage" | "ocean" | "plum" | "gold";
export type DisplayFont = "serif" | "sans";
export type CornerStyle = "soft" | "crisp";
export type Density = "comfortable" | "compact";
export type Atmosphere = "rich" | "still";

export interface AppearancePreferences {
  style: UiStyle;
  accent: AccentChoice;
  display: DisplayFont;
  corners: CornerStyle;
  density: Density;
  atmosphere: Atmosphere;
  language: Language;
}

export const APPEARANCE_KEY = "potato:appearance:v1";

export const EDITORIAL_PRESET: Omit<AppearancePreferences, "language" | "accent"> = {
  style: "editorial",
  display: "serif",
  corners: "soft",
  density: "comfortable",
  atmosphere: "rich",
};

export const CLASSIC_PRESET: Omit<AppearancePreferences, "language" | "accent"> = {
  style: "classic",
  display: "sans",
  corners: "soft",
  density: "comfortable",
  atmosphere: "rich",
};

// Preserve the familiar Potatoplayer room for existing and new listeners.
// The editorial system is one click away in Settings → Appearance.
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  ...CLASSIC_PRESET,
  accent: "cover",
  language: "en",
};

export const ACCENT_CHOICES: Array<{ id: AccentChoice; en: string; zh: string; primary: string; secondary: string }> = [
  { id: "cover", en: "Cover", zh: "封面", primary: "#e7684e", secondary: "#e4a063" },
  { id: "coral", en: "Coral", zh: "珊瑚", primary: "#df654b", secondary: "#e4a063" },
  { id: "sage", en: "Sage", zh: "鼠尾草", primary: "#738a66", secondary: "#b3a06a" },
  { id: "ocean", en: "Ocean", zh: "海蓝", primary: "#547e96", secondary: "#8bb4be" },
  { id: "plum", en: "Plum", zh: "梅子", primary: "#8a5a73", secondary: "#d3a09e" },
  { id: "gold", en: "Gold", zh: "琥珀", primary: "#ab7938", secondary: "#d8ad67" },
];

const styles = new Set<UiStyle>(["editorial", "classic"]);
const accents = new Set<AccentChoice>(ACCENT_CHOICES.map((item) => item.id));
const displays = new Set<DisplayFont>(["serif", "sans"]);
const corners = new Set<CornerStyle>(["soft", "crisp"]);
const densities = new Set<Density>(["comfortable", "compact"]);
const atmospheres = new Set<Atmosphere>(["rich", "still"]);
const languages = new Set<Language>(["zh", "en"]);

export function normalizeAppearance(input?: Partial<AppearancePreferences> | null): AppearancePreferences {
  const value = input ?? {};
  return {
    style: styles.has(value.style as UiStyle) ? (value.style as UiStyle) : DEFAULT_APPEARANCE.style,
    accent: accents.has(value.accent as AccentChoice) ? (value.accent as AccentChoice) : DEFAULT_APPEARANCE.accent,
    display: displays.has(value.display as DisplayFont) ? (value.display as DisplayFont) : DEFAULT_APPEARANCE.display,
    corners: corners.has(value.corners as CornerStyle) ? (value.corners as CornerStyle) : DEFAULT_APPEARANCE.corners,
    density: densities.has(value.density as Density) ? (value.density as Density) : DEFAULT_APPEARANCE.density,
    atmosphere: atmospheres.has(value.atmosphere as Atmosphere)
      ? (value.atmosphere as Atmosphere)
      : DEFAULT_APPEARANCE.atmosphere,
    language: languages.has(value.language as Language) ? (value.language as Language) : DEFAULT_APPEARANCE.language,
  };
}

export function loadAppearance(): AppearancePreferences {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return normalizeAppearance(DEFAULT_APPEARANCE);
    return normalizeAppearance(JSON.parse(raw) as Partial<AppearancePreferences>);
  } catch {
    return normalizeAppearance(DEFAULT_APPEARANCE);
  }
}

export function saveAppearance(value: AppearancePreferences): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value));
  } catch {
    // Optional storage; the current session still works.
  }
}

export function applyAppearance(value: AppearancePreferences): void {
  try {
    const root = document.documentElement;
    root.dataset.style = value.style;
    root.dataset.accent = value.accent;
    root.dataset.display = value.display;
    root.dataset.corners = value.corners;
    root.dataset.density = value.density;
    root.dataset.atmosphere = value.atmosphere;
    root.lang = value.language === "zh" ? "zh-CN" : "en";
  } catch {
    // The document is always available in the desktop renderer, but a missing
    // DOM should never prevent the app from booting.
  }
}

export function resolveAccent(
  choice: AccentChoice,
  coverPalette: { primary: string; secondary: string } | null,
): { primary: string; secondary: string } {
  if (choice === "cover" && coverPalette) return coverPalette;
  const found = ACCENT_CHOICES.find((item) => item.id === choice) ?? ACCENT_CHOICES[0];
  return { primary: found.primary, secondary: found.secondary };
}

export function presetFor(style: UiStyle): Omit<AppearancePreferences, "language" | "accent"> {
  return style === "classic" ? CLASSIC_PRESET : EDITORIAL_PRESET;
}
