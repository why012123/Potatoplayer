import { Command, Gamepad2, Home, MessageCircle, Music2, Settings2, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { View } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";

const items: { en: string; zh: string; view: View; icon: typeof Home }[] = [
  { en: "Home", zh: "首页", view: { kind: "home" }, icon: Home },
  { en: "Songs", zh: "歌曲", view: { kind: "songs" }, icon: Music2 },
  { en: "Daily", zh: "每日", view: { kind: "daily" }, icon: Sparkles },
  { en: "Dive", zh: "Dive", view: { kind: "dive" }, icon: Gamepad2 },
  { en: "Comments", zh: "评论", view: { kind: "comments" }, icon: MessageCircle },
];

export function BriefDock() {
  const tr = useTr();
  const brief = useAppStore((state) => state.brief);
  const current = useAppStore((state) => state.viewHistory[state.viewIndex]);
  const navigate = useAppStore((state) => state.navigate);
  const setCommandOpen = useAppStore((state) => state.setCommandOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  if (!brief) return null;

  return (
    <nav className="brief-dock glass-strong" aria-label={tr("Brief navigation", "Brief 导航")}>
      <span className="brief-dock__label">{tr("BRIEF", "BRIEF")}</span>
      <div className="brief-dock__items">
        {items.map((item) => {
          const Icon = item.icon;
          const active = current?.kind === item.view.kind;
          return (
            <button
              key={item.en}
              type="button"
              className={clsx("brief-dock__item", active && "is-active")}
              title={tr(item.en, item.zh)}
              aria-label={tr(item.en, item.zh)}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (!active) navigate(item.view);
              }}
            >
              <Icon size={16} strokeWidth={1.9} />
              <span>{tr(item.en, item.zh)}</span>
            </button>
          );
        })}
      </div>
      <span className="brief-dock__rule" aria-hidden="true" />
      <div className="brief-dock__tools">
        <button
          type="button"
          className="brief-dock__tool"
          title={tr("Command palette (⌘K)", "命令面板（⌘K）")}
          aria-label={tr("Open command palette", "打开命令面板")}
          onClick={() => setCommandOpen(true)}
        >
          <Command size={15} />
        </button>
        <button
          type="button"
          className="brief-dock__tool"
          title={tr("Settings", "设置")}
          aria-label={tr("Open settings", "打开设置")}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 size={15} />
        </button>
      </div>
    </nav>
  );
}
