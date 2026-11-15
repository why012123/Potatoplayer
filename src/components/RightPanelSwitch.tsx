import { AudioLines, ListMusic, MessageCircle } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

/** One toggle in the existing head-actions group, immediately before collapse. */
export function RightPanelSwitch() {
  const tr = useTr();
  const mode = useAppStore((state) => state.rightPanelMode);
  const setMode = useAppStore((state) => state.setRightPanelMode);
  const next = mode === "player" ? "ai" : mode === "ai" ? "queue" : "player";
  return <IconButton
    label={next === "ai" ? tr("Switch to AI chat", "切换到 AI 聊天") : next === "queue" ? tr("Switch to play queue", "切换到播放列表") : tr("Switch to playback", "切换到播放视图")}
    variant="ghost" size="sm" data-panel-switch="true"
    onClick={() => {
      setMode(next);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-panel-switch="true"]')?.focus({ preventScroll: true }));
    }}
  >{next === "ai" ? <MessageCircle size={17} /> : next === "queue" ? <ListMusic size={17} /> : <AudioLines size={17} />}</IconButton>;
}
