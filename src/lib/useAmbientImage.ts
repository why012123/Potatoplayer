import { useEffect, useState } from 'react';
import { coverUrl } from './covers';

// Rasterize once per cover/detail change. No full-size artwork or live CSS blur
// is retained for the ambient layer; stale decodes cannot overwrite a new cover.
export function useAmbientImage(path: string | null, enabled: boolean, detail: 'low' | 'high') {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    setImage(null);
    if (!enabled || !path) return;
    let cancelled = false;
    const source = new Image();
    source.crossOrigin = 'anonymous';
    source.onload = () => {
      if (cancelled) return;
      const size = detail === 'high' ? 512 : 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        ctx.filter = `blur(${size / 12}px)`;
        // Overscan prevents transparent blur edges.
        ctx.drawImage(source, -size / 4, -size / 4, size * 1.5, size * 1.5);
        setImage(canvas.toDataURL('image/jpeg', .8));
      } catch { setImage(null); } // A colour-field fallback is always available.
      finally { source.onload = null; source.src = ''; canvas.width = canvas.height = 0; }
    };
    source.src = coverUrl(path)!;
    return () => { cancelled = true; source.onload = null; source.src = ''; };
  }, [path, enabled, detail]);
  return enabled ? image : null;
}
