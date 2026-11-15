import { useReducedMotion } from "motion/react";
import { useAppStore } from "@/store";
import { NowPlaying } from "./NowPlaying";
import { QueueSidebar } from "./QueueSidebar";
import { AiSidebar } from "@/ai/AiSidebar";

/** Keep one glass pane in the grid. Only its contents change, never its geometry. */
export function RightPanel() {
  const open = useAppStore((s) => s.rightPanelOpen);
  const mode = useAppStore((s) => s.rightPanelMode);
  const animation = useAppStore((s) => s.appearance.animationLevel);
  const legacyReduced = useAppStore((s) => s.reducedMotion);
  const systemReduced = useReducedMotion();
  return <div className={open ? "right-panel-shell now-playing glass" : "right-panel-host"}
    data-panel-mode={mode} data-panel-motion={animation === "full" && !legacyReduced && !systemReduced ? "full" : "off"}>
    {open && mode === "player" && <NowPlaying />}
    {open && mode === "queue" && <QueueSidebar />}
    <AiSidebar />
  </div>;
}
