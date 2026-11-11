import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";

interface SliderProps {
  value: number;
  max: number;
  step?: number;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  label: string;
  compact?: boolean;
}

export function Slider({
  value,
  max,
  step = 0.01,
  onChange,
  onCommit,
  disabled,
  className,
  label,
  compact,
}: SliderProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = dragging ?? value;
  const pct = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0;

  useEffect(() => {
    if (dragging !== null) return;
    if (inputRef.current) inputRef.current.value = String(value);
  }, [value, dragging]);

  const style = { "--slider-progress": `${pct}%` } as CSSProperties;

  return (
    <input
      ref={inputRef}
      aria-label={label}
      className={clsx("range", compact && "range--compact", className)}
      type="range"
      min={0}
      max={max || 1}
      step={step}
      value={shown}
      style={style}
      disabled={disabled}
      onPointerDown={() => setDragging(value)}
      onChange={(event) => {
        const next = Number(event.target.value);
        setDragging(next);
        onChange?.(next);
      }}
      onPointerUp={() => {
        if (dragging === null) return;
        onCommit?.(dragging);
        setDragging(null);
      }}
      onKeyUp={(event) => {
        onCommit?.(Number(event.currentTarget.value));
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") setDragging(null);
      }}
      onBlur={() => {
        if (dragging !== null) {
          onCommit?.(dragging);
          setDragging(null);
        }
      }}
    />
  );
}
