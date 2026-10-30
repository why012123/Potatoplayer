import type { Track } from "@/types";

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 416;

export interface CardPaintState {
  selected: boolean;
  playing: boolean;
  favorite: boolean;
  accent: string;
  index: string;
}

const INK = "#1d1a17";
const MUTED = "#73685e";
const FAINT = "#a0958a";
const PAPER = "#f6f1e9";
const LINE = "#d9d0c4";
const AMBER = "#a76b32";

const FONT = '"Helvetica Neue", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
const MONO = '"SF Mono", "Menlo", "Roboto Mono", monospace';

function coverGradient(seed: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  const hue = Math.abs(hash) % 360;
  return [`hsl(${hue} 22% 38%)`, `hsl(${(hue + 36) % 360} 26% 18%)`];
}

function fit(text: string, max: number): string {
  if (max <= 0) return "";
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, track: Track) {
  const [from, to] = coverGradient(track.id);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(255, 252, 246, 0.7)";
  ctx.font = `600 ${Math.round(size * 0.24)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Array.from(track.title || "?")[0] ?? "?", x + size / 2, y + size / 2 + 2);
}

export function paintCard(
  canvas: HTMLCanvasElement,
  track: Track,
  state: CardPaintState,
  image: HTMLImageElement | null,
) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Paper body. The 1px edge is drawn by hand so the card still reads at a
  // distance without a costly border material.
  ctx.save();
  roundRect(ctx, 1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, 10);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = state.selected ? AMBER : LINE;
  ctx.lineWidth = state.selected ? 3 : 1;
  ctx.stroke();
  ctx.restore();

  const pad = 18;
  const coverSize = CARD_WIDTH - pad * 2;
  ctx.save();
  roundRect(ctx, pad, pad, coverSize, coverSize, 4);
  ctx.clip();
  if (image) {
    const scale = Math.max(coverSize / image.naturalWidth, coverSize / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, pad + (coverSize - width) / 2, pad + (coverSize - height) / 2, width, height);
  } else {
    drawPlaceholder(ctx, pad, pad, coverSize, track);
  }
  // A restrained top-down glaze keeps the cover from looking like a flat square.
  const glaze = ctx.createLinearGradient(pad, pad, pad, pad + coverSize);
  glaze.addColorStop(0, "rgba(255, 252, 246, 0.16)");
  glaze.addColorStop(0.5, "rgba(255, 252, 246, 0)");
  glaze.addColorStop(1, "rgba(20, 16, 12, 0.14)");
  ctx.fillStyle = glaze;
  ctx.fillRect(pad, pad, coverSize, coverSize);
  ctx.restore();

  // File number, bottom-right of the cover.
  ctx.font = `500 13px ${MONO}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const indexWidth = ctx.measureText(state.index).width;
  ctx.fillStyle = "rgba(28, 23, 18, 0.62)";
  roundRect(ctx, pad + coverSize - indexWidth - 14, pad + coverSize - 26, indexWidth + 12, 18, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 250, 242, 0.92)";
  ctx.fillText(state.index, pad + coverSize - 8, pad + coverSize - 13);

  if (state.favorite) {
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(pad + coverSize - 18, pad + 8);
    ctx.lineTo(pad + coverSize - 8, pad + 8);
    ctx.lineTo(pad + coverSize - 8, pad + 18);
    ctx.closePath();
    ctx.fill();
  }

  // Text block.
  const textTop = pad + coverSize + 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = state.accent || MUTED;
  ctx.font = `600 10px ${MONO}`;
  ctx.fillText((track.block || "UNFILED").toUpperCase(), pad, textTop);

  const title = fit(track.title || "Untitled", 15);
  ctx.fillStyle = state.playing ? AMBER : INK;
  ctx.font = `600 25px ${FONT}`;
  ctx.fillText(title, pad, textTop + 36);

  const artist = fit(track.artist || "Unknown artist", 24);
  ctx.fillStyle = MUTED;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(artist, pad, textTop + 62);

  // Bottom rail: genre / duration / playing marker.
  const rail = CARD_HEIGHT - 20;
  ctx.strokeStyle = "rgba(29, 26, 23, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, rail - 26);
  ctx.lineTo(CARD_WIDTH - pad, rail - 26);
  ctx.stroke();

  ctx.fillStyle = FAINT;
  ctx.font = `500 9px ${MONO}`;
  const genre = (track.genre || "—").toUpperCase();
  ctx.fillText(fit(genre, 16), pad, rail);

  const minutes = Math.floor((track.duration || 0) / 60);
  const seconds = Math.floor((track.duration || 0) % 60);
  const duration = `${minutes}:${String(seconds).padStart(2, "0")}`;
  ctx.textAlign = "right";
  ctx.fillStyle = state.playing ? AMBER : FAINT;
  ctx.font = `500 9px ${MONO}`;
  ctx.fillText(state.playing ? `PLAYING  ${duration}` : duration, CARD_WIDTH - pad, rail);
  ctx.textAlign = "left";

  if (state.selected) {
    ctx.fillStyle = AMBER;
    ctx.fillRect(pad, pad + coverSize + 8, 34, 2);
  }
}
