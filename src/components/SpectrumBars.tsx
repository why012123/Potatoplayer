import { memo } from "react";
import clsx from "clsx";

/**
 * Real spectrum bars from the potatoHQ visualization tap.
 * Pure presentation: data arrives at ~20 Hz via the engine.spectrum event.
 */
export const SpectrumBars = memo(function SpectrumBars({
  bars,
  className,
}: {
  bars: number[];
  className?: string;
}) {
  return (
    <span className={clsx("spectrum-bars", className)} aria-hidden="true">
      {bars.map((value, index) => (
        <i
          key={index}
          style={{ transform: `scaleY(${Math.max(0.06, Math.min(1, value))})` }}
        />
      ))}
    </span>
  );
});
