import { useCallback, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from "react";

const RESUME_DELAY = 4000;

/** Suspend following only for user gestures, then return even during a long lyric. */
export function useFollowScroll(
  container: RefObject<HTMLDivElement | null>,
  row: RefObject<HTMLElement | null>,
  context: string,
  position: string | number,
  smooth: boolean,
) {
  const [browsing, setBrowsing] = useState(false);
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const center = useRef(() => {});

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const resume = useCallback(() => {
    clearTimer();
    paused.current = false;
    setBrowsing(false);
    center.current();
  }, [clearTimer]);
  const pause = useCallback(() => {
    paused.current = true;
    setBrowsing(true);
    clearTimer();
    timer.current = setTimeout(resume, RESUME_DELAY);
  }, [clearTimer, resume]);

  useLayoutEffect(() => {
    center.current = () => {
      const list = container.current;
      const active = row.current;
      if (!list || !active || paused.current) return;
      const offset = active.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTo({
        top: Math.max(0, list.scrollTop + offset - (list.clientHeight - active.clientHeight) / 2),
        behavior: smooth ? "smooth" : "auto",
      });
    };
  });

  useLayoutEffect(() => {
    clearTimer();
    paused.current = false;
    setBrowsing(false);
    const list = container.current;
    if (!list) return clearTimer;
    const resize = () => {
      // Space at both ends lets even the first and last lines reach the centre.
      list.style.setProperty("--lyric-inset", `${list.clientHeight / 2}px`);
      center.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(list);
    return () => { observer.disconnect(); clearTimer(); };
  }, [context, container, clearTimer]);

  useLayoutEffect(() => { center.current(); }, [position, smooth]);

  return {
    browsing,
    resume,
    handlers: {
      onWheel: pause,
      onTouchMove: pause,
      onScroll: () => { if (paused.current) pause(); },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        // Native scrollbar dragging targets the scrolling element itself.
        if (event.target === event.currentTarget) pause();
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pause();
      },
    },
  };
}
