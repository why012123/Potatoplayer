import { useCallback } from "react";
import { useAppStore } from "@/store";
import type { Language, TextVars } from "@/lib/text";
import { interpolate } from "@/lib/text";

export function useLanguage(): Language {
  return useAppStore((state) => state.appearance.language);
}

/**
 * Components call `tr("English", "中文", vars)`.
 *
 * Keeping both strings next to their markup makes the small, product-specific
 * copy easy to tune without maintaining a detached key catalogue. All callers
 * re-render when the language changes because `useLanguage` is a store hook.
 */
export function useTr(): (en: string, zh: string, vars?: TextVars) => string {
  const language = useLanguage();
  return useCallback(
    (en: string, zh: string, vars?: TextVars) => interpolate(language === "zh" ? zh : en, vars),
    [language],
  );
}
