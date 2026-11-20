import { useCallback, useEffect, useRef, useState } from "react";

/** How long the list stays under the listener's control after the last gesture. */
export const LYRIC_AUTO_SCROLL_RESUME_MS = 3000;

/** Keys that scroll a focused scroll container without a wheel/touch gesture. */
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

/**
 * Smoothly centres the active lyric line, but steps out of the way as soon as
 * the listener scrolls the list by hand. Auto-centring pauses immediately on
 * wheel / touch / scrollbar-drag / keyboard scrolling and resumes 3 s after the
 * last interaction, smoothly returning to the current active line.
 *
 * Programmatic `scrollTo` is never observed: the `scroll` event is deliberately
 * not a manual-interaction source, so the auto-scroll cannot feed back into the
 * paused state.
 *
 * `scrollRef` is a callback ref (the lyric body is re-mounted when the track
 * changes, so the hook must learn about the new container), and `lineRefs` is
 * indexed by lyric line, exactly like the refs the two views used before.
 */
export function useLyricAutoScroll(trackId: string | null | undefined, activeIndex: number) {
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [manual, setManual] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResumeTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Callback ref: keeps a ref for synchronous reads (effects run after commit)
  // and state so the listener effect re-binds whenever the container mounts.
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollNodeRef.current = node;
    setScrollNode(node);
  }, []);

  // A new track starts from a clean slate: no stale line nodes, no pending
  // resume and no lingering paused state.
  useEffect(() => {
    lineRefs.current = [];
    clearResumeTimer();
    setManual(false);
  }, [trackId, clearResumeTimer]);

  // Manual scrolling sources. Note the absence of `scroll`: programmatic smooth
  // scrolling fires it and must not count as a user gesture.
  useEffect(() => {
    const node = scrollNode;
    if (!node) return;
    const markManual = () => {
      setManual(true);
      clearResumeTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setManual(false);
      }, LYRIC_AUTO_SCROLL_RESUME_MS);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) markManual();
    };
    node.addEventListener("wheel", markManual, { passive: true });
    node.addEventListener("touchstart", markManual, { passive: true });
    node.addEventListener("pointerdown", markManual);
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("wheel", markManual);
      node.removeEventListener("touchstart", markManual);
      node.removeEventListener("pointerdown", markManual);
      node.removeEventListener("keydown", onKeyDown);
    };
  }, [scrollNode, clearResumeTimer]);

  // Centre whenever the active line moves, the paused state ends (including the
  // 3 s resume when the line itself did not change) or a new track/container
  // appears.
  useEffect(() => {
    if (manual || activeIndex < 0) return;
    const node = lineRefs.current[activeIndex];
    const box = scrollNodeRef.current;
    if (!node || !box) return;
    const offset = node.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const top = offset - box.clientHeight / 2 + node.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeIndex, manual, trackId, scrollNode]);

  // Drop the pending resume timer with the component.
  useEffect(() => clearResumeTimer, [clearResumeTimer]);

  return { scrollRef, lineRefs, manual };
}
