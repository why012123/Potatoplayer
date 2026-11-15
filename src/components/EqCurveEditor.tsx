import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { EqPoint } from "@/types";

export const EQ_MIN_FREQ = 20;
export const EQ_MAX_FREQ = 20000;
export const EQ_MIN_DB = -20;
export const EQ_MAX_DB = 20;
export const EQ_MAX_POINTS = 32;
export const EQ_MIN_POINTS = 2;

const LOG_MIN = Math.log10(EQ_MIN_FREQ);
const LOG_SPAN = Math.log10(EQ_MAX_FREQ) - LOG_MIN;

const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const GRID_DB = [20, 10, 0, -10, -20];

const W = 720;
const H = 260;
const PAD_X = 30;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;
const PLOT_W = W - PAD_X * 2;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

export function logEqFrequencies(low: number, high: number, count: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push(low * (high / low) ** (count <= 1 ? 0 : index / (count - 1)));
  }
  return out;
}

export function clampEqFreq(freq: number): number {
  if (!Number.isFinite(freq)) return EQ_MIN_FREQ;
  return Math.min(EQ_MAX_FREQ, Math.max(EQ_MIN_FREQ, freq));
}

export function clampEqGain(gain: number): number {
  if (!Number.isFinite(gain)) return 0;
  return Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, gain));
}

export function sortEqPoints(points: EqPoint[]): EqPoint[] {
  return [...points]
    .filter((point) => point && Number.isFinite(point.freq) && Number.isFinite(point.gain))
    .map((point) => ({ freq: clampEqFreq(point.freq), gain: clampEqGain(point.gain) }))
    .sort((a, b) => a.freq - b.freq);
}

/** Bands are the one place the legacy ten-slot view still arrives. */
export function pointsFromBands(bands: number[], frequencies: number[]): EqPoint[] {
  const count = Math.min(bands?.length ?? 0, frequencies?.length ?? 0);
  const points: EqPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push({ freq: clampEqFreq(frequencies[index]), gain: clampEqGain(bands[index] ?? 0) });
  }
  return points.length >= EQ_MIN_POINTS ? sortEqPoints(points) : flatEqPoints();
}

export function flatEqPoints(): EqPoint[] {
  return [
    { freq: EQ_MIN_FREQ, gain: 0 },
    { freq: EQ_MAX_FREQ, gain: 0 },
  ];
}

/** Replace the point at (or nearest to) {@code freq}, adding one when missing. */
export function setEqPoint(points: EqPoint[], freq: number, gain: number): EqPoint[] {
  const target = clampEqFreq(freq);
  const next = points.map((point) => ({ ...point }));
  let index = -1;
  let best = Number.POSITIVE_INFINITY;
  next.forEach((point, i) => {
    const distance = Math.abs(point.freq - target);
    if (distance < best) {
      best = distance;
      index = i;
    }
  });
  if (index >= 0 && best <= Math.max(0.5, target * 0.002)) {
    next[index] = { freq: next[index].freq, gain: clampEqGain(gain) };
    return sortEqPoints(next);
  }
  if (next.length >= EQ_MAX_POINTS) return next;
  next.push({ freq: target, gain: clampEqGain(gain) });
  return sortEqPoints(next);
}

function monotoneTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const tangents = new Array<number>(n).fill(0);
  if (n < 2) return tangents;
  const slopes = new Array<number>(n - 1).fill(0);
  for (let i = 0; i < n - 1; i += 1) {
    const dx = xs[i + 1] - xs[i];
    slopes[i] = dx <= 0 ? 0 : (ys[i + 1] - ys[i]) / dx;
  }
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum);
      tangents[i] = scale * a * slopes[i];
      tangents[i + 1] = scale * b * slopes[i];
    }
  }
  return tangents;
}

interface CurveShape {
  xs: number[];
  ys: number[];
  tangents: number[];
}

function curveShape(points: EqPoint[]): CurveShape {
  const ordered = sortEqPoints(points);
  const xs = ordered.map((point) => Math.log10(point.freq));
  const ys = ordered.map((point) => point.gain);
  return { xs, ys, tangents: monotoneTangents(xs, ys) };
}

export function sampleEqCurve(points: EqPoint[], freq: number): number {
  const shape = curveShape(points);
  const { xs, ys, tangents } = shape;
  const n = xs.length;
  if (n === 0) return 0;
  if (n === 1) return ys[0];
  const x = Math.log10(clampEqFreq(freq));
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i += 1;
  const h = xs[i + 1] - xs[i];
  if (h <= 0) return ys[i];
  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const value =
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * tangents[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * tangents[i + 1];
  return clampEqGain(value);
}

export function sampleEqCurveList(points: EqPoint[], frequencies: number[]): number[] {
  const shape = curveShape(points);
  const n = shape.xs.length;
  return frequencies.map((freq) => {
    if (n === 0) return 0;
    if (n === 1) return shape.ys[0];
    const x = Math.log10(clampEqFreq(freq));
    if (x <= shape.xs[0]) return shape.ys[0];
    if (x >= shape.xs[n - 1]) return shape.ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > shape.xs[i + 1]) i += 1;
    const h = shape.xs[i + 1] - shape.xs[i];
    if (h <= 0) return shape.ys[i];
    const t = (x - shape.xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const value =
      (2 * t3 - 3 * t2 + 1) * shape.ys[i] +
      (t3 - 2 * t2 + t) * h * shape.tangents[i] +
      (-2 * t3 + 3 * t2) * shape.ys[i + 1] +
      (t3 - t2) * h * shape.tangents[i + 1];
    return clampEqGain(value);
  });
}

function freqToX(freq: number): number {
  return PAD_X + ((Math.log10(clampEqFreq(freq)) - LOG_MIN) / LOG_SPAN) * PLOT_W;
}

function gainToY(gain: number): number {
  return PAD_TOP + ((EQ_MAX_DB - clampEqGain(gain)) / (EQ_MAX_DB - EQ_MIN_DB)) * PLOT_H;
}

function xToFreq(x: number): number {
  const ratio = (x - PAD_X) / PLOT_W;
  return clampEqFreq(10 ** (LOG_MIN + ratio * LOG_SPAN));
}

function yToGain(y: number): number {
  const ratio = (y - PAD_TOP) / PLOT_H;
  return clampEqGain(EQ_MAX_DB - ratio * (EQ_MAX_DB - EQ_MIN_DB));
}

function formatFreqLabel(freq: number): string {
  if (freq >= 1000) {
    const k = freq / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(freq));
}

function roundGain(gain: number): number {
  const snapped = Math.abs(gain) < 0.6 ? 0 : gain;
  return Math.round(snapped * 10) / 10;
}

function roundFreq(freq: number): number {
  if (freq >= 1000) return Math.round(freq / 5) * 5;
  if (freq >= 100) return Math.round(freq);
  return Math.round(freq * 10) / 10;
}

const PATH_SAMPLES = 220;

interface Props {
  points: EqPoint[];
  disabled?: boolean;
  onChange: (points: EqPoint[]) => void;
  /** Engine resolution dots drawn on the curve (e.g. potatoHQ's 31 bands). */
  bandFrequencies?: number[];
  className?: string;
}

export function EqCurveEditor({ points, disabled = false, onChange, bandFrequencies, className }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const ordered = useMemo(() => sortEqPoints(points), [points]);
  const samples = useMemo(() => {
    const freqs: number[] = [];
    for (let i = 0; i < PATH_SAMPLES; i += 1) {
      const ratio = i / (PATH_SAMPLES - 1);
      freqs.push(10 ** (LOG_MIN + ratio * LOG_SPAN));
    }
    const gains = sampleEqCurveList(ordered, freqs);
    return freqs.map((freq, index) => ({ freq, gain: gains[index] }));
  }, [ordered]);
  const bandDots = useMemo(() => {
    if (!bandFrequencies || bandFrequencies.length === 0) return [];
    const gains = sampleEqCurveList(ordered, bandFrequencies);
    return bandFrequencies.map((freq, index) => ({ freq, gain: gains[index] }));
  }, [bandFrequencies, ordered]);

  const curvePath = useMemo(
    () => samples.map((point, index) => `${index === 0 ? "M" : "L"}${freqToX(point.freq).toFixed(2)},${gainToY(point.gain).toFixed(2)}`).join(" "),
    [samples],
  );
  const areaPath = useMemo(() => {
    const zero = gainToY(0).toFixed(2);
    return `M${PAD_X},${zero} ${curvePath.replace(/^M/, "L")} L${(PAD_X + PLOT_W).toFixed(2)},${zero} Z`;
  }, [curvePath]);

  const pointFromEvent = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    return { freq: xToFreq(x), gain: yToGain(y) };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || dragIndex === null) return;
    const local = pointFromEvent(event.clientX, event.clientY);
    if (!local) return;
    const lower = dragIndex > 0 ? ordered[dragIndex - 1].freq * 1.02 : EQ_MIN_FREQ;
    const upper = dragIndex < ordered.length - 1 ? ordered[dragIndex + 1].freq / 1.02 : EQ_MAX_FREQ;
    const freq = roundFreq(Math.min(upper, Math.max(lower, local.freq)));
    const gain = roundGain(local.gain);
    const original = ordered[dragIndex];
    if (original.freq === freq && original.gain === gain) return;
    const next = ordered.map((point, index) => (index === dragIndex ? { freq, gain } : point));
    onChange(next);
  };

  const handlePointerUp = () => {
    setDragIndex(null);
  };

  const addPoint = (event: React.MouseEvent<SVGSVGElement>) => {
    if (disabled || ordered.length >= EQ_MAX_POINTS) return;
    const local = pointFromEvent(event.clientX, event.clientY);
    if (!local) return;
    const target = roundFreq(local.freq);
    if (ordered.some((point) => Math.abs(point.freq - target) < Math.max(0.5, target * 0.002))) return;
    onChange(sortEqPoints([...ordered, { freq: target, gain: roundGain(local.gain) }]));
  };

  const removePoint = (index: number) => {
    if (disabled || ordered.length <= EQ_MIN_POINTS) return;
    onChange(ordered.filter((_, i) => i !== index));
  };

  const zeroY = gainToY(0);
  const strokeWidth = 2.4;

  return (
    <div className={clsx("eq-curve", disabled && "is-disabled", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="eq-curve__svg"
        role="img"
        aria-label="EQ curve editor"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={addPoint}
      >
        <rect x={PAD_X} y={PAD_TOP} width={PLOT_W} height={PLOT_H} rx={10} className="eq-curve__plot" />

        {GRID_DB.map((db) => (
          <g key={`db-${db}`} className={clsx("eq-curve__grid", db === 0 && "is-zero")}>
            <line x1={PAD_X} y1={gainToY(db)} x2={PAD_X + PLOT_W} y2={gainToY(db)} />
            <text x={PAD_X - 8} y={gainToY(db) + 4} textAnchor="end" className="eq-curve__axis-label">
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        ))}
        {GRID_FREQS.map((freq) => (
          <g key={`f-${freq}`} className="eq-curve__grid">
            <line x1={freqToX(freq)} y1={PAD_TOP} x2={freqToX(freq)} y2={PAD_TOP + PLOT_H} />
            <text x={freqToX(freq)} y={H - 8} textAnchor="middle" className="eq-curve__axis-label">
              {formatFreqLabel(freq)}
            </text>
          </g>
        ))}

        <path d={areaPath} className="eq-curve__area" />
        <path d={curvePath} className="eq-curve__line" strokeWidth={strokeWidth} />

        {bandDots.map((dot, index) => (
          <circle
            key={`band-${index}`}
            cx={freqToX(dot.freq)}
            cy={gainToY(dot.gain)}
            r={2}
            className="eq-curve__band-dot"
          />
        ))}

        {ordered.map((point, index) => (
          <g key={`point-${index}`}>
            <circle
              cx={freqToX(point.freq)}
              cy={gainToY(point.gain)}
              r={hoverIndex === index || dragIndex === index ? 14 : 11}
              className="eq-curve__hit"
              onPointerDown={(event) => {
                if (disabled) return;
                event.stopPropagation();
                svgRef.current?.setPointerCapture(event.pointerId);
                setDragIndex(index);
              }}
              onPointerEnter={() => setHoverIndex(index)}
              onPointerLeave={() => setHoverIndex(null)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                removePoint(index);
              }}
            />
            <circle
              cx={freqToX(point.freq)}
              cy={gainToY(point.gain)}
              r={dragIndex === index ? 8 : 6.5}
              className={clsx("eq-curve__point", dragIndex === index && "is-dragging")}
              pointerEvents="none"
            />
          </g>
        ))}

        <line x1={PAD_X} y1={zeroY} x2={PAD_X + PLOT_W} y2={zeroY} className="eq-curve__zero" />
      </svg>
      <div className="eq-curve__hint">
        <span>拖动控制点 · 双击加点 / 删点</span>
        <span>{ordered.length} / {EQ_MAX_POINTS} 点</span>
      </div>
    </div>
  );
}
