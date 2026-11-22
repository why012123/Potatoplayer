import { useEffect, useState, type ClipboardEvent } from "react";
import { X } from "lucide-react";
import { useTr } from "@/lib/i18n";

export function useClipboardImages(connected: boolean) {
  const tr = useTr();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
    if (!pasted.length) return;
    event.preventDefault();
    if (!connected) return setError(tr("Connect DeepSeek to send images.", "连接 DeepSeek 后即可发送图片。"));
    if (pasted.some(file => !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)))
      return setError(tr("Use PNG, JPEG, GIF or WebP.", "请粘贴 PNG、JPEG、GIF 或 WebP 图片。"));
    const all = [...files, ...pasted];
    if (all.length > 4 || all.reduce((size, file) => size + file.size, 0) > 24 * 1024 * 1024)
      return setError(tr("Up to 4 images, 24 MiB total.", "每条消息最多 4 张图片，合计 24 MiB。"));
    setFiles(all);
    setError("");
  }
  function clear() { setFiles([]); setError(""); }
  const preview = (files.length > 0 || error) && <section className="ai-pasted-images" aria-live="polite">
    {files.map((file, index) => <ImageChip key={index} file={file} onRemove={() => {
      setFiles(files.filter((_, i) => i !== index)); setError("");
    }} />)}
    {error && <small role="alert">{error}</small>}
  </section>;
  return { files, paste, clear, preview };
}

function ImageChip({ file, onRemove }: {file: File; onRemove: () => void}) {
  const tr = useTr();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return <button type="button" onClick={onRemove} title={tr("Remove image", "移除图片")} aria-label={tr("Remove image", "移除图片")}>
    {url && <img src={url} alt="" />}<X size={12} />
  </button>;
}

export function encodeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
