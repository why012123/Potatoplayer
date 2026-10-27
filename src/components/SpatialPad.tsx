import { useCallback, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";

export function SpatialPad({
  x,
  y,
  enabled,
  onChange,
  onCommit,
  size = 248,
}: {
  x: number;
  y: number;
  enabled: boolean;
  onChange: (x: number, y: number) => void;
  onCommit: (x: number, y: number) => void;
  size?: number;
}) {
  const tr = useTr();
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [local, setLocal] = useState({ x, y });

  useEffect(() => {
    if (!dragging.current) setLocal({ x, y });
  }, [x, y]);

  const apply = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let nx = (clientX - cx) / (rect.width / 2);
      let ny = (cy - clientY) / (rect.height / 2);
      const r = Math.hypot(nx, ny);
      if (r > 1) {
        nx /= r;
        ny /= r;
      }
      const next = { x: Math.round(nx * 100) / 100, y: Math.round(ny * 100) / 100 };
      setLocal(next);
      onChange(next.x, next.y);
    },
    [onChange],
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    onCommit(local.x, local.y);
  }, [local.x, local.y, onCommit]);

  useEffect(() => {
    const up = () => endDrag();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [endDrag]);

  const dotLeft = 50 + local.x * 44;
  const dotTop = 50 - local.y * 44;
  const radius = Math.hypot(local.x, local.y);
  const azimuth = (Math.atan2(local.x, local.y) * 180) / Math.PI;

  return (
    <div className="spatial-pad" style={{ width: size }}>
      <div
        ref={padRef}
        role="application"
        tabIndex={0}
        aria-label={tr("Virtual sound field", "虚拟声场")}
        className={`spatial-pad__surface ${enabled ? "is-on" : ""}`}
        style={{ height: size, opacity: enabled ? 1 : 0.45 }}
        onPointerDown={(event) => {
          dragging.current = true;
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          apply(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging.current) apply(event.clientX, event.clientY);
        }}
        onDoubleClick={() => {
          setLocal({ x: 0, y: 0 });
          onChange(0, 0);
          onCommit(0, 0);
        }}
        onKeyDown={(event) => {
          const step = 0.1;
          let dx = 0;
          let dy = 0;
          if (event.key === "ArrowLeft") dx = -step;
          if (event.key === "ArrowRight") dx = step;
          if (event.key === "ArrowUp") dy = step;
          if (event.key === "ArrowDown") dy = -step;
          if (!dx && !dy) return;
          event.preventDefault();
          let nx = Math.max(-1, Math.min(1, local.x + dx));
          let ny = Math.max(-1, Math.min(1, local.y + dy));
          const r = Math.hypot(nx, ny);
          if (r > 1) {
            nx /= r;
            ny /= r;
          }
          setLocal({ x: nx, y: ny });
          onChange(nx, ny);
          onCommit(nx, ny);
        }}
      >
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="96" className="spatial-pad__rim" />
          <circle cx="100" cy="100" r="64" className="spatial-pad__ring" />
          <circle cx="100" cy="100" r="32" className="spatial-pad__ring" />
          <line x1="4" y1="100" x2="196" y2="100" className="spatial-pad__axis" />
          <line x1="100" y1="4" x2="100" y2="196" className="spatial-pad__axis" />
        </svg>
        <span className="spatial-pad__label spatial-pad__label--front">{tr("Front", "前")}</span>
        <span className="spatial-pad__label spatial-pad__label--back">{tr("Back", "后")}</span>
        <span className="spatial-pad__label spatial-pad__label--left">{tr("L", "左")}</span>
        <span className="spatial-pad__label spatial-pad__label--right">{tr("R", "右")}</span>
        <div
          className="spatial-pad__dot"
          style={{ left: `${dotLeft}%`, top: `${dotTop}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="spatial-pad__readout">
        <span>
          {tr("Azimuth", "方位")} {Math.round(azimuth)}°
        </span>
        <span>
          {tr("Distance", "距离")} {Math.round(radius * 100)}%
        </span>
      </div>
    </div>
  );
}
