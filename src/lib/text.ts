export type Language = "zh" | "en";

export type TextVars = Record<string, string | number>;

export function interpolate(template: string, vars?: TextVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/** A tiny, dependency-free translator usable from React and non-React code. */
export function pickText(language: Language, en: string, zh: string, vars?: TextVars): string {
  return interpolate(language === "zh" ? zh : en, vars);
}

export function systemLanguage(): Language {
  try {
    return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function documentLanguage(): Language {
  try {
    return document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}
