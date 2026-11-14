import { AudioLines, MessageCircle } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

/** One toggle in the existing head-actions group, immediately before collapse. */
export function RightPanelSwitch() {
  const tr = useTr();
  const mode = useAppStore((state) => state.rightPanelMode);
  const setMode = useAppStore((state) => state.setRightPanelMode);
  return <IconButton
    label={mode === "player" ? tr("Switch to AI chat", "切换到 AI 聊天") : tr("Switch to playback", "切换到播放视图")}
    variant="ghost" size="sm" aria-pressed={mode === "ai"}
    onClick={() => setMode(mode === "player" ? "ai" : "player")}
  >{mode === "player" ? <MessageCircle size={17} /> : <AudioLines size={17} />}</IconButton>;
}
