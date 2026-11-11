import clsx from "clsx";

export function EqualizerBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span className={clsx("eq-bars", playing && "is-playing", className)} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
