import type { Track } from "@/types";
import { documentLanguage } from "@/lib/text";

export function formatTime(seconds: number, showHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (showHours || h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatLongDuration(seconds: number): string {
  const zh = documentLanguage() === "zh";
  if (!seconds) return zh ? "0 分钟" : "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return zh ? `${minutes} 分钟` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (zh) return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function formatRelativeDate(timestamp: number): string {
  if (!timestamp) return "";
  const zh = documentLanguage() === "zh";
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return zh ? "今天" : "Today";
  if (days === 1) return zh ? "昨天" : "Yesterday";
  if (days < 7) return zh ? `${days} 天前` : `${days} days ago`;
  if (days < 30) return zh ? `${Math.floor(days / 7)} 周前` : `${Math.floor(days / 7)} weeks ago`;
  return new Date(timestamp).toLocaleDateString(zh ? "zh-CN" : undefined, { month: "short", day: "numeric" });
}

export function initials(value: string): string {
  const words = value
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "P";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function greeting(): string {
  const hour = new Date().getHours();
  const zh = documentLanguage() === "zh";
  if (hour < 5) return zh ? "还在熬夜。" : "Still awake.";
  if (hour < 12) return zh ? "早上好。" : "Good morning.";
  if (hour < 18) return zh ? "下午好。" : "Good afternoon.";
  return zh ? "晚上好。" : "Good evening.";
}

export function todayLine(): string {
  const now = new Date();
  if (documentLanguage() === "zh") {
    const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(now);
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    return `${date} · ${weekday}`;
  }
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function albumLabel(track: Track): string {
  if (track.album?.trim()) return track.album.trim();
  return `${track.artist} · ${documentLanguage() === "zh" ? "合集" : "Collection"}`;
}

export function uniqueArtists(tracks: Track[]): string[] {
  return [...new Set(tracks.map((track) => track.artist).filter(Boolean))];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function trackInitials(track: Track): string {
  return initials(track.title || track.artist || "P");
}

export function hashHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function humanBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
