export type HomeSectionId = "hero" | "overview" | "taxonomy" | "recent" | "onRepeat" | "artists";
export type HomeDensity = "comfortable" | "compact";

export interface HomePreferences {
  order: HomeSectionId[];
  hidden: HomeSectionId[];
  density: HomeDensity;
}

export const HOME_SECTION_LABELS: Record<HomeSectionId, { en: string; zh: string }> = {
  hero: { en: "Featured record", zh: "精选唱片" },
  overview: { en: "Library overview", zh: "资料库概览" },
  taxonomy: { en: "Blocks & genres", zh: "区块与流派" },
  recent: { en: "Recently added", zh: "最近添加" },
  onRepeat: { en: "On repeat", zh: "反复聆听" },
  artists: { en: "Artists in orbit", zh: "常听艺术家" },
};

export const DEFAULT_HOME_ORDER: HomeSectionId[] = [
  "hero",
  "overview",
  "taxonomy",
  "recent",
  "onRepeat",
  "artists",
];

export const DEFAULT_HOME: HomePreferences = {
  order: DEFAULT_HOME_ORDER,
  hidden: [],
  density: "comfortable",
};

const KEY = "potato:home:v1";
const ids = new Set<HomeSectionId>(DEFAULT_HOME_ORDER);

export function loadHomePreferences(): HomePreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_HOME, order: [...DEFAULT_HOME.order], hidden: [] };
    const parsed = JSON.parse(raw) as Partial<HomePreferences>;
    return normalizeHomePreferences(parsed);
  } catch {
    return { ...DEFAULT_HOME, order: [...DEFAULT_HOME.order], hidden: [] };
  }
}

export function saveHomePreferences(preferences: HomePreferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional.
  }
}

export function normalizeHomePreferences(input?: Partial<HomePreferences> | null): HomePreferences {
  const value = input ?? {};
  const seen = new Set<HomeSectionId>();
  const order: HomeSectionId[] = [];
  for (const item of Array.isArray(value.order) ? value.order : []) {
    if (ids.has(item) && !seen.has(item)) {
      seen.add(item);
      order.push(item);
    }
  }
  for (const item of DEFAULT_HOME_ORDER) {
    if (!seen.has(item)) order.push(item);
  }
  const hidden = Array.isArray(value.hidden)
    ? [...new Set(value.hidden.filter((item): item is HomeSectionId => ids.has(item)))]
    : [];
  return {
    order,
    hidden,
    density: value.density === "compact" ? "compact" : "comfortable",
  };
}
