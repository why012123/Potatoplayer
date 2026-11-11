import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { coverGradient, coverUrl } from "@/lib/covers";
import { initials } from "@/lib/format";

interface CoverProps {
  path?: string | null;
  seed: string;
  label?: string;
  className?: string;
  radius?: number | string;
  style?: CSSProperties;
  eager?: boolean;
  children?: React.ReactNode;
}

export function Cover({ path, seed, label, className, radius = 18, style, eager, children }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const url = coverUrl(path);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [path]);

  // Cached images can already be complete before React attaches its onLoad
  // listener (this happens when a playing row re-renders). Checking after each
  // render keeps the fade-in from getting stuck at opacity: 0.
  useEffect(() => {
    const image = imgRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  });

  return (
    <div
      className={clsx("cover", !url || failed ? "cover--fallback" : "cover--image", loaded && "is-loaded", className)}
      style={{
        borderRadius: typeof radius === "number" ? `${radius}px` : radius,
        background: !url || failed ? coverGradient(seed) : undefined,
        ...style,
      }}
    >
      {url && !failed ? (
        <img
          ref={imgRef}
          src={url}
          alt={label ?? ""}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="cover__initial">{initials(label || seed)}</span>
      )}
      <span className="cover__sheen" aria-hidden="true" />
      {children}
    </div>
  );
}
