import { AnimatePresence } from "motion/react";
import {
  Check,
  Disc3,
  Feather,
  FolderOpen,
  Globe2,
  HardDrive,
  Keyboard,
  LibraryBig,
  Moon,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Type,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "@/store";
import { Modal } from "@/components/Modal";
import { IconButton } from "@/components/IconButton";
import { useTr } from "@/lib/i18n";
import type { AppearancePreferences, Density, DisplayFont, CornerStyle, Atmosphere } from "@/lib/appearance";
import { ACCENT_CHOICES } from "@/lib/appearance";
import type { Language } from "@/lib/text";

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

function Section({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section__title">
        {icon}
        <div>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function Choice({
  icon,
  label,
  detail,
  active,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  detail?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx("settings-choice", active && "is-active")}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      <span>
        <strong>{label}</strong>
        {detail && <em>{detail}</em>}
      </span>
      {active && <Check size={14} className="settings-choice__check" />}
    </button>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="studio-segment" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx(value === option.value && "is-active")}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsDialog() {
  const open = useAppStore((state) => state.settingsOpen);
  const setOpen = useAppStore((state) => state.setSettingsOpen);
  const libraryRoot = useAppStore((state) => state.libraryRoot);
  const dataDir = useAppStore((state) => state.dataDir);
  const version = useAppStore((state) => state.version);
  const tracks = useAppStore((state) => state.tracks);
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const setReducedMotion = useAppStore((state) => state.setReducedMotion);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const appearance = useAppStore((state) => state.appearance);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const setStylePreset = useAppStore((state) => state.setStylePreset);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const resetAppearance = useAppStore((state) => state.resetAppearance);
  const chooseLibrary = useAppStore((state) => state.chooseLibrary);
  const rescan = useAppStore((state) => state.rescan);
  const tr = useTr();

  const close = () => setOpen(false);
  const pct = scanProgress?.total ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0;
  const accent = ACCENT_CHOICES.find((item) => item.id === appearance.accent) ?? ACCENT_CHOICES[0];

  const patch = <K extends keyof AppearancePreferences>(key: K, value: AppearancePreferences[K]) => {
    setAppearance({ [key]: value } as Pick<AppearancePreferences, K>);
  };

  return (
    <AnimatePresence>
      {open && (
        <Modal onClose={close} className="settings-dialog" labelledBy="settings-title">
          <div className="settings-head">
            <div>
              <div className="modal__eyebrow">
                <Sparkles size={13} />
                Potatoplayer Ultra
              </div>
              <h2 id="settings-title">{tr("Settings", "设置")}</h2>
              <p className="settings-subtitle">{tr("Tune the room, the language, and the way things move.", "调整你的房间、语言与动效。")}</p>
            </div>
            <IconButton label={tr("Close settings", "关闭设置")} variant="ghost" size="sm" onClick={close}>
              <X size={18} />
            </IconButton>
          </div>

          <div className="settings-scroll">
            <Section
              icon={<Globe2 size={16} />}
              title={tr("Language", "语言")}
              detail={tr("The interface language changes instantly.", "界面语言会立即切换。")}
            >
              <div className="language-choice" role="group" aria-label={tr("Language", "语言")}>
                <Choice
                  label="English"
                  detail={tr("Default interface language", "英文界面")}
                  active={appearance.language === "en"}
                  onClick={() => setLanguage("en")}
                />
                <Choice
                  label="中文"
                  detail={tr("Simplified Chinese", "简体中文界面")}
                  active={appearance.language === "zh"}
                  onClick={() => setLanguage("zh")}
                />
              </div>
            </Section>

            <Section
              icon={<Palette size={16} />}
              title={tr("Appearance", "外观")}
              detail={tr("A visual language of glass, paper and light.", "玻璃、纸张与光线的视觉语言。")}
            >
              <div className="studio-preview" aria-hidden="true">
                <span className="studio-preview__disc"><Disc3 size={22} /></span>
                <div className="studio-preview__copy">
                  <span>{tr("YOUR LISTENING ROOM", "你的聆听室")}</span>
                  <strong>{tr("Make it feel like yours.", "让它更像你。")}</strong>
                  <em>
                    {tr(
                      `${appearance.style === "editorial" ? "Editorial" : "Classic"} · ${theme === "dark" ? "Dark" : "Light"} · ${accent.en}`,
                      `${appearance.style === "editorial" ? "编辑纸感" : "经典玻璃"} · ${theme === "dark" ? "深色" : "浅色"} · ${accent.zh}`,
                    )}
                  </em>
                </div>
                <span className="studio-preview__play"><Play size={14} fill="currentColor" strokeWidth={0} /></span>
              </div>

              <div className="theme-choice" role="group" aria-label={tr("Theme", "主题")}>
                <button
                  type="button"
                  className={theme === "light" ? "is-active" : ""}
                  aria-pressed={theme === "light"}
                  onClick={() => setTheme("light")}
                >
                  <Sun size={17} />
                  <span>
                    <strong>{tr("Light", "浅色")}</strong>
                    <em>{tr("Warm paper and daylight glass", "暖纸与日光玻璃")}</em>
                  </span>
                </button>
                <button
                  type="button"
                  className={theme === "dark" ? "is-active" : ""}
                  aria-pressed={theme === "dark"}
                  onClick={() => setTheme("dark")}
                >
                  <Moon size={17} />
                  <span>
                    <strong>{tr("Dark", "深色")}</strong>
                    <em>{tr("Soft charcoal and low light", "暖炭与低光")}</em>
                  </span>
                </button>
              </div>

              <div className="style-preset-grid">
                <button
                  type="button"
                  className={clsx("style-preset", appearance.style === "editorial" && "is-active")}
                  aria-pressed={appearance.style === "editorial"}
                  onClick={() => setStylePreset("editorial")}
                >
                  <span className="style-preset__art style-preset__art--editorial">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="style-preset__copy">
                    <span className="style-preset__eyebrow">
                      {tr("ATELIER", "编辑")}
                      <em>{tr("NEW", "新")}</em>
                    </span>
                    <strong>{tr("Editorial", "新版视图")}</strong>
                    <em>{tr("Paper surfaces, serif headlines, quieter chrome.", "暖纸表面、衬线标题、克制的界面。")}</em>
                  </span>
                  {appearance.style === "editorial" && <Check size={15} className="style-preset__check" />}
                </button>
                <button
                  type="button"
                  className={clsx("style-preset", appearance.style === "classic" && "is-active")}
                  aria-pressed={appearance.style === "classic"}
                  onClick={() => setStylePreset("classic")}
                >
                  <span className="style-preset__art style-preset__art--classic">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="style-preset__copy">
                    <span className="style-preset__eyebrow">
                      {tr("CLASSIC GLASS", "经典")}
                      <em>{tr("ORIGINAL", "原版")}</em>
                    </span>
                    <strong>{tr("Classic", "经典视图")}</strong>
                    <em>{tr("The original warm iOS glass and pill controls.", "原来的暖色 iOS 玻璃与胶囊控件。")}</em>
                  </span>
                  {appearance.style === "classic" && <Check size={15} className="style-preset__check" />}
                </button>
              </div>

              <div className="studio-panel">
                <div className="studio-row">
                  <div className="studio-row__label">
                    <Palette size={14} />
                    <span>
                      <strong>{tr("Accent", "强调色")}</strong>
                      <em>{tr("Follow the cover or pick a fixed note.", "跟随封面，或选择一个固定色调。")}</em>
                    </span>
                  </div>
                  <div className="accent-swatches" role="group" aria-label={tr("Accent", "强调色")}>
                    {ACCENT_CHOICES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={clsx("accent-swatch", appearance.accent === item.id && "is-active")}
                        style={
                          item.id === "cover"
                            ? { background: "conic-gradient(from 220deg, var(--cover-primary), var(--cover-secondary), var(--accent), var(--cover-primary))" }
                            : { background: `linear-gradient(135deg, ${item.primary}, ${item.secondary})` }
                        }
                        title={tr(item.en, item.zh)}
                        aria-label={tr(item.en, item.zh)}
                        aria-pressed={appearance.accent === item.id}
                        onClick={() => patch("accent", item.id)}
                      >
                        {appearance.accent === item.id && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="studio-row">
                  <div className="studio-row__label">
                    <Type size={14} />
                    <span>
                      <strong>{tr("Headline font", "标题字体")}</strong>
                      <em>{tr("The voice of page titles and the featured record.", "页面标题与精选唱片的字体气质。")}</em>
                    </span>
                  </div>
                  <Segment<DisplayFont>
                    label={tr("Headline font", "标题字体")}
                    value={appearance.display}
                    options={[
                      { value: "serif", label: tr("Serif", "衬线") },
                      { value: "sans", label: tr("Sans", "无衬线") },
                    ]}
                    onChange={(value) => patch("display", value)}
                  />
                </div>

                <div className="studio-row">
                  <div className="studio-row__label">
                    <SlidersHorizontal size={14} />
                    <span>
                      <strong>{tr("Corners", "圆角")}</strong>
                      <em>{tr("Soft edges or a more precise outline.", "柔和的边缘，或更利落的轮廓。")}</em>
                    </span>
                  </div>
                  <Segment<CornerStyle>
                    label={tr("Corners", "圆角")}
                    value={appearance.corners}
                    options={[
                      { value: "soft", label: tr("Soft", "柔和") },
                      { value: "crisp", label: tr("Crisp", "利落") },
                    ]}
                    onChange={(value) => patch("corners", value)}
                  />
                </div>

                <div className="studio-row">
                  <div className="studio-row__label">
                    <Feather size={14} />
                    <span>
                      <strong>{tr("Density", "密度")}</strong>
                      <em>{tr("More air, or more music on screen.", "更多留白，或一屏放下更多音乐。")}</em>
                    </span>
                  </div>
                  <Segment<Density>
                    label={tr("Density", "密度")}
                    value={appearance.density}
                    options={[
                      { value: "comfortable", label: tr("Airy", "舒展") },
                      { value: "compact", label: tr("Compact", "紧凑") },
                    ]}
                    onChange={(value) => patch("density", value)}
                  />
                </div>

                <div className="studio-row">
                  <div className="studio-row__label">
                    <Sparkles size={14} />
                    <span>
                      <strong>{tr("Atmosphere", "氛围")}</strong>
                      <em>{tr("How much of the album cover bleeds into the room.", "封面色彩渗入界面的程度。")}</em>
                    </span>
                  </div>
                  <Segment<Atmosphere>
                    label={tr("Atmosphere", "氛围")}
                    value={appearance.atmosphere}
                    options={[
                      { value: "rich", label: tr("Rich", "浓郁") },
                      { value: "still", label: tr("Still", "安静") },
                    ]}
                    onChange={(value) => patch("atmosphere", value)}
                  />
                </div>
              </div>

              <div className="studio-foot">
                <span>
                  {tr(
                    "Every choice is saved automatically on this machine.",
                    "每一项选择都会自动保存在这台设备上。",
                  )}
                </span>
                <button type="button" className="text-button" onClick={resetAppearance}>
                  <RotateCcw size={13} /> {tr("Reset style", "恢复默认风格")}
                </button>
              </div>
            </Section>

            <Section
              icon={<Sparkles size={16} />}
              title={tr("Motion", "动效")}
              detail={tr("Make the interface feel a little quieter.", "让界面安静一点。")}
            >
              <button
                type="button"
                role="switch"
                aria-checked={reducedMotion}
                className="settings-toggle-row"
                onClick={() => setReducedMotion(!reducedMotion)}
              >
                <div>
                  <strong>{tr("Reduce motion", "减少动态效果")}</strong>
                  <span>
                    {tr(
                      "Shortens page transitions and disables ambient movement.",
                      "缩短页面转场，并关闭环境动画。",
                    )}
                  </span>
                </div>
                <span className={`switch ${reducedMotion ? "is-on" : ""}`}>
                  <i />
                </span>
              </button>
            </Section>

            <Section
              icon={<LibraryBig size={16} />}
              title={tr("Music library", "音乐资料库")}
              detail={tr("Where your local files live.", "本地音乐文件所在的位置。")}
            >
              <div className="settings-path">
                <span title={libraryRoot}>{libraryRoot || tr("No folder selected", "尚未选择文件夹")}</span>
                <button type="button" className="button button--glass button--small" onClick={() => void chooseLibrary()}>
                  <FolderOpen size={14} /> {tr("Change", "更改")}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <strong>{tr("{count} songs indexed", "已索引 {count} 首歌曲", { count: tracks.length })}</strong>
                  <span>
                    {scanning
                      ? tr("Scanning · {pct}%", "扫描中 · {pct}%", { pct })
                      : tr("Rescanning keeps favorites and playlists in place.", "重新扫描会保留收藏与歌单。")}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button--glass button--small"
                  disabled={scanning}
                  onClick={() => void rescan()}
                >
                  <RefreshCw size={14} className={scanning ? "is-spinning" : undefined} />
                  {tr("Rescan", "重新扫描")}
                </button>
              </div>
              {scanning && (
                <div className="settings-progress">
                  <span style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              )}
            </Section>

            <Section
              icon={<HardDrive size={16} />}
              title={tr("App data", "应用数据")}
              detail={tr("Covers, playlists and listening state.", "封面、歌单与播放状态。")}
            >
              <div className="settings-path">
                <span title={dataDir}>{dataDir}</span>
                <button
                  type="button"
                  className="button button--glass button--small"
                  onClick={() => void window.potato.openPath(dataDir)}
                >
                  <FolderOpen size={14} /> {tr("Reveal", "打开位置")}
                </button>
              </div>
              <div className="settings-note">
                <ShieldCheck size={15} />
                {tr(
                  "Everything stays on this machine. No account, no cloud, no analytics.",
                  "一切数据都留在这台设备上。没有账号、云同步或分析。",
                )}
              </div>
            </Section>

            <Section
              icon={<Keyboard size={16} />}
              title={tr("Keyboard", "键盘快捷键")}
              detail={tr("A few shortcuts worth knowing.", "几个值得记住的快捷键。")}
            >
              <div className="shortcut-grid">
                <span>
                  <Kbd>Space</Kbd> {tr("Play / pause", "播放 / 暂停")}
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>K</Kbd> {tr("Command palette", "命令面板")}
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>F</Kbd> {tr("Search library", "搜索资料库")}
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>E</Kbd> {tr("Song editor", "歌曲编辑")}
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>←</Kbd> {tr("Previous song", "上一首")}
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>→</Kbd> {tr("Next song", "下一首")}
                </span>
                <span>
                  <Kbd>Esc</Kbd> {tr("Close panel", "关闭面板")}
                </span>
              </div>
            </Section>

            <section className="settings-about">
              <div>
                <strong>Potatoplayer Ultra</strong>
                <span>{tr("Version {version} · Local listening room", "版本 {version} · 本地聆听室", { version })}</span>
              </div>
              <span className="settings-about__badge">{tr("Local first", "本地优先")}</span>
            </section>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
