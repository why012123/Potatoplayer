export function coverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const bytes = new TextEncoder().encode(path);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `potato-cover://local/?p=${encoded}`;
}

export function coverGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 42) % 360;
  return `radial-gradient(85% 85% at 28% 18%, hsl(${hue} 24% 38% / 78%), transparent 66%),
    linear-gradient(148deg, hsl(${hue} 22% 26%), hsl(${hue2} 28% 14%))`;
}


/**
 * NetEase still returns some cover URLs over plain HTTP. The renderer CSP only
 * permits HTTPS images, so normalise them before handing them to an <img>.
 * Protocol-relative URLs are treated as HTTPS as well.
 */
export function onlineImageUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return value;
  }
}
