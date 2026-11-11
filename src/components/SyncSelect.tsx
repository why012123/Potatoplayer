import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { useTr } from "@/lib/i18n";

type Option = { value: string; label: string; detail?: string };

/** A compact glass picker with an anchored, keyboard-accessible search menu. */
export function SyncSelect({ label, value, options, placeholder, icon: Icon, disabled, searchable = true, onChange }: {
  label: string; value: string; options: Option[]; placeholder: string; icon: LucideIcon;
  disabled?: boolean; searchable?: boolean; onChange: (value: string) => void;
}) {
  const tr = useTr();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280, maxHeight: 300 });
  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus(); };
  const choose = (option: Option) => { onChange(option.value); close(true); };
  const show = () => { setQuery(""); setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, searchable ? 270 : 180), window.innerWidth - 24);
      const height = Math.min(330, (searchable ? 56 : 12) + Math.max(1, filtered.length) * 48);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const flip = below < height && above > below;
      const maxHeight = Math.max(80, Math.min(height, flip ? above : below));
      setPosition({ left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
        top: flip ? rect.top - maxHeight - 6 : rect.bottom + 6, width, maxHeight });
    };
    place();
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) place(); };
    window.addEventListener("resize", place); document.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", scroll, true); };
  }, [open, filtered.length, searchable]);
  useEffect(() => {
    if (!open) return;
    if (searchable) search.current?.focus(); else menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, searchable]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  return <div className="sync-field"><span id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className={`sync-select ${open ? "is-open" : ""}`} disabled={disabled}
      aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
      }}><Icon size={16} /><span className={selected ? "" : "is-placeholder"}>{selected?.label ?? placeholder}</span>
      {selected?.detail && <small>{selected.detail}</small>}<ChevronDown size={14} className="sync-select__chevron" /></button>
    {open && createPortal(<div ref={menu} className="sync-select-menu glass-strong" style={position} tabIndex={-1}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === "Tab") { close(true); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
        }
        if (event.key === "Enter") { event.preventDefault(); if (filtered[active]) choose(filtered[active]); }
      }}>
      {searchable && <div className="sync-select-search"><Search size={14} /><input ref={search} value={query}
        role="combobox" aria-label={tr("Search {label}", "搜索{label}", { label })} aria-expanded="true" aria-controls={`${id}-list`}
        aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined}
        placeholder={tr("Search…", "搜索名称…")} onChange={event => { setQuery(event.target.value); setActive(0); }} /></div>}
      <div className="sync-select-options" role="listbox" id={`${id}-list`} aria-labelledby={`${id}-label`}
        aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined}>
        {filtered.map((option, index) => <button type="button" role="option" key={option.value} id={`${id}-option-${index}`}
          tabIndex={-1} data-index={index} aria-selected={value === option.value}
          className={`sync-select-option ${index === active ? "is-focused" : ""}`}
          onPointerMove={() => setActive(index)} onClick={() => choose(option)}>
          <span>{option.label}</span>{option.detail && <small>{option.detail}</small>}<Check size={14} style={{ opacity: value === option.value ? 1 : 0 }} />
        </button>)}
        {!filtered.length && <p className="sync-select-empty">{tr("No matching options", "没有匹配的选项")}</p>}
      </div>
    </div>, document.querySelector(".app") ?? document.body)}
  </div>;
}
