import { Check, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { HomePreferences, HomeSectionId } from "@/lib/home";
import { DEFAULT_HOME, HOME_SECTION_LABELS } from "@/lib/home";
import { useTr } from "@/lib/i18n";

export function HomeCustomizer({
  preferences,
  onChange,
  onClose,
}: {
  preferences: HomePreferences;
  onChange: (next: HomePreferences) => void;
  onClose: () => void;
}) {
  const tr = useTr();
  const visible = preferences.order.filter((id) => !preferences.hidden.includes(id)).length;

  const toggle = (id: HomeSectionId) => {
    const hidden = preferences.hidden.includes(id)
      ? preferences.hidden.filter((item) => item !== id)
      : [...preferences.hidden, id];
    onChange({ ...preferences, hidden });
  };

  const move = (id: HomeSectionId, direction: -1 | 1) => {
    const index = preferences.order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= preferences.order.length) return;
    const order = [...preferences.order];
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...preferences, order });
  };

  return (
    <section className="home-customizer glass" style={{ order: 1 }} aria-label={tr("Customize home", "自定义首页")}>
      <div className="home-customizer__intro">
        <span className="home-customizer__icon"><SlidersHorizontal size={15} /></span>
        <div>
          <strong>{tr("Make the front page yours.", "把首页变成你的样子。")}</strong>
          <span>{tr("Show, hide and reorder the modules. Saved on this Mac.", "显示、隐藏和排序首页模块，保存在这台设备上。")}</span>
        </div>
        <span className="home-customizer__count">{visible}/{preferences.order.length}</span>
        <button type="button" className="home-customizer__close" onClick={onClose} aria-label={tr("Close home customizer", "关闭首页自定义")}>
          <X size={14} />
        </button>
      </div>

      <div className="home-customizer__body">
        <div className="home-customizer__list">
          {preferences.order.map((id, index) => {
            const isHidden = preferences.hidden.includes(id);
            const label = HOME_SECTION_LABELS[id];
            return (
              <div className={`home-customizer__row ${isHidden ? "is-hidden" : ""}`} key={id}>
                <span className="home-customizer__grip" aria-hidden="true"><GripVertical size={13} /></span>
                <span className="home-customizer__name">{tr(label.en, label.zh)}</span>
                {isHidden && <em>{tr("hidden", "已隐藏")}</em>}
                <div className="home-customizer__actions">
                  <button
                    type="button"
                    onClick={() => move(id, -1)}
                    disabled={index === 0}
                    aria-label={tr("Move {name} up", "上移 {name}", { name: tr(label.en, label.zh) })}
                    title={tr("Move up", "上移")}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(id, 1)}
                    disabled={index === preferences.order.length - 1}
                    aria-label={tr("Move {name} down", "下移 {name}", { name: tr(label.en, label.zh) })}
                    title={tr("Move down", "下移")}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    className={`home-customizer__eye ${isHidden ? "" : "is-on"}`}
                    onClick={() => toggle(id)}
                    aria-pressed={!isHidden}
                    aria-label={tr(isHidden ? "Show {name}" : "Hide {name}", isHidden ? "显示 {name}" : "隐藏 {name}", {
                      name: tr(label.en, label.zh),
                    })}
                    title={isHidden ? tr("Show", "显示") : tr("Hide", "隐藏")}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="home-customizer__side">
          <span className="home-customizer__label">{tr("Density", "密度")}</span>
          <div className="home-customizer__density" role="group" aria-label={tr("Home density", "首页密度")}>
            {(["comfortable", "compact"] as const).map((density) => (
              <button
                type="button"
                key={density}
                className={preferences.density === density ? "is-active" : ""}
                onClick={() => onChange({ ...preferences, density })}
              >
                {preferences.density === density && <Check size={11} />}
                {density === "comfortable" ? tr("Airy", "舒展") : tr("Compact", "紧凑")}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="home-customizer__reset"
            onClick={() => onChange({ ...DEFAULT_HOME, order: [...DEFAULT_HOME.order], hidden: [] })}
          >
            <RotateCcw size={12} /> {tr("Reset home", "重置首页")}
          </button>
        </div>
      </div>
    </section>
  );
}
