import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Enter that commits an IME candidate is not a confirmation shortcut.
 * Chromium reports both `isComposing` and keyCode 229 while composing.
 */
export function isCommitEnter(event: ReactKeyboardEvent): boolean {
  const native = event.nativeEvent;
  return event.key === "Enter" && !native.isComposing && native.keyCode !== 229;
}
