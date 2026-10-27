import { useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  AudioLines,
  Check,
  Disc3,
  Feather,
  FolderOpen,
  Globe2,
  HardDrive,
  Keyboard,
  LibraryBig,
  Radar,
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
import { SpatialPad } from "@/components/SpatialPad";
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
  disabled,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  detail?: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx("settings-choice", active && "is-active")}
      aria-pressed={active}
      disabled={disabled}
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
  const playbackEngine = useAppStore((state) => state.playbackEngine);
  const setPlaybackEngine = useAppStore((state) => state.setPlaybackEngine);
  const engines = useAppStore((state) => state.engines);
  const outputMode = useAppStore((state) => state.outputMode);
  const capabilities = useAppStore((state) => state.engineCapabilities);
  const spatialEnabled = useAppStore((state) => state.spatialEnabled);
  const spatialX = useAppStore((state) => state.spatialX);
  const spatialY = useAppStore((state) => state.spatialY);
  const setSpatialEnabled = useAppStore((state) => state.setSpatialEnabled);
  const setSpatialPosition = useAppStore((state) => state.setSpatialPosition);
  const exclusive = useAppStore((state) => state.exclusive);
  const setExclusiveOutput = useAppStore((state) => state.setExclusiveOutput);
  const crossfeedEnabled = useAppStore((state) => state.crossfeedEnabled);
  const crossfeedStrength = useAppStore((state) => state.crossfeedStrength);
  const setCrossfeedEnabled = useAppStore((state) => state.setCrossfeedEnabled);
  const followSourceRate = useAppStore((state) => state.followSourceRate);
  const setFollowSourceRate = useAppStore((state) => state.setFollowSourceRate);
  const setCrossfeedStrength = useAppStore((state) => state.setCrossfeedStrength);
  const [pendingEngine, setPendingEngine] = useState<"potatohq" | "mpv" | null>(null);
  const setOutputMode = useAppStore((state) => state.setOutputMode);
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
                Potatoplayer Super
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



            {capabilities?.spatial ? (
              <Section
                icon={<Radar size={16} />}
                title={tr("Virtual sound field", "空间声场")}
                detail={tr(
                  "Drag the source anywhere on the disc. Only the native potatoHQ engine can render it.",
                  "把声源拖到圆盘上的任意位置。仅 potatoHQ 原生引擎支持。",
                )}
              >
                <div className="spatial-layout">
                  <SpatialPad
                    x={spatialX}
                    y={spatialY}
                    enabled={spatialEnabled}
                    onChange={(nx, ny) => setSpatialPosition(nx, ny, false)}
                    onCommit={(nx, ny) => setSpatialPosition(nx, ny, true)}
                  />
                  <div className="spatial-side">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={spatialEnabled}
                      className="settings-toggle-row"
                      onClick={() => void setSpatialEnabled(!spatialEnabled)}
                    >
                      <div>
                        <strong>{tr("Enable sound field", "启用空间声场")}</strong>
                        <span>
                          {tr(
                            "Adds interaural delay, level and a rear tilt. Double-click the pad to recentre.",
                            "加入双耳时差、电平差与后方高频倾斜。双击圆盘复位。",
                          )}
                        </span>
                      </div>
                      <span className={`switch ${spatialEnabled ? "is-on" : ""}`}>
                        <i />
                      </span>
                    </button>
                    {capabilities?.followSourceRate ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={followSourceRate}
                        className="settings-toggle-row"
                        onClick={() => void setFollowSourceRate(!followSourceRate)}
                      >
                        <div>
                          <strong>{tr("Follow source sample rate", "采样率跟随源")}</strong>
                          <span>
                            {tr(
                              "Switch the device to the file's rate (e.g. 96 kHz) instead of resampling. Applies on the next playback.",
                              "把设备切到文件采样率(如 96 kHz),不再由引擎重采样。下一次播放生效。",
                            )}
                          </span>
                        </div>
                        <span className={`switch ${followSourceRate ? "is-on" : ""}`}>
                          <i />
                        </span>
                      </button>
                    ) : null}
                    {capabilities?.crossfeed ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={crossfeedEnabled}
                      className="settings-toggle-row"
                      onClick={() => void setCrossfeedEnabled(!crossfeedEnabled)}
                    >
                      <div>
                        <strong>{tr("Headphone crossfeed", "耳机交叉馈电")}</strong>
                        <span>
                          {tr(
                            "Blends a delayed low-passed copy of the opposite channel. Softer hard pans.",
                            "把对侧声道延迟、低通后轻微混入,减弱硬分离的“头中效应”。",
                          )}
                        </span>
                      </div>
                      <span className={`switch ${crossfeedEnabled ? "is-on" : ""}`}>
                        <i />
                      </span>
                    </button>
                    ) : null}
                    {crossfeedEnabled ? (
                      <label className="spatial-slider">
                        <span>{tr("Amount", "强度")}</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={crossfeedStrength}
                          onChange={(event) => setCrossfeedStrength(Number(event.target.value), false)}
                          onPointerUp={(event) =>
                            setCrossfeedStrength(Number((event.target as HTMLInputElement).value), true)
                          }
                          onKeyUp={(event) =>
                            setCrossfeedStrength(Number((event.target as HTMLInputElement).value), true)
                          }
                        />
                        <em>{Math.round(crossfeedStrength * 100)}%</em>
                      </label>
                    ) : null}
                    {capabilities?.exclusive ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={exclusive}
                        className="settings-toggle-row"
                        onClick={() => void setExclusiveOutput(!exclusive)}
                      >
                        <div>
                          <strong>{tr("Exclusive output (Hog)", "独占输出(Hog)")}</strong>
                          <span>
                            {tr(
                              "Takes the device exclusively on the next playback. May silence other apps.",
                              "下一次播放时独占设备,可能会让其它应用无声。",
                            )}
                          </span>
                        </div>
                        <span className={`switch ${exclusive ? "is-on" : ""}`}>
                          <i />
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </Section>
            ) : null}

            <Section
              icon={<AudioLines size={16} />}
              title={tr("Playback engine", "播放引擎")}
              detail={tr(
                "Which backend drives playback. Switching takes effect after a restart.",
                "选择驱动播放的音频后端。切换需要重启应用后生效。",
              )}
            >
              <div className="language-choice" role="group" aria-label={tr("Playback engine", "播放引擎")}>
                {(
                  [
                    {
                      id: "vlc" as const,
                      label: "VLC",
                      en: "Compatibility first · libVLC",
                      zh: "兼容性优先 · libVLC",
                    },
                    {
                      id: "potatohq" as const,
                      label: "potatoHQ",
                      en: "Native engine · exclusive, upsampling, DSD",
                      zh: "原生引擎 · 独占、升频、DSD",
                    },
                    {
                      id: "mpv" as const,
                      label: "mpv",
                      en: "Fallback · widest format coverage",
                      zh: "备用 · 格式覆盖最广",
                    },
                  ] as const
                ).map((item) => {
                  const info = engines?.[item.id];
                  const unavailable = info ? !info.available : false;
                  return (
                    <Choice
                      key={item.id}
                      label={item.label}
                      detail={unavailable ? tr("Not available on this machine", "本机不可用") : tr(item.en, item.zh)}
                      active={playbackEngine === item.id}
                      disabled={unavailable}
                      onClick={() => {
                        if (item.id === "vlc") {
                          void setPlaybackEngine("vlc");
                        } else {
                          setPendingEngine(item.id);
                        }
                      }}
                    />
                  );
                })}
              </div>
              {playbackEngine === "potatohq" ? (
                <>
                  <div
                    className="language-choice"
                    role="group"
                    aria-label={tr("potatoHQ output mode", "potatoHQ 输出模式")}
                    style={{ marginTop: 12 }}
                  >
                    {(
                      [
                        { id: "pcm" as const, label: "PCM", en: "DAC-native PCM (default)", zh: "原生 PCM(默认)" },
                        {
                          id: "dop64" as const,
                          label: "DSD64 · DoP",
                          en: "Needs a 176.4 kHz DoP DAC",
                          zh: "需要支持 176.4 kHz 的 DoP DAC",
                        },
                        {
                          id: "dop128" as const,
                          label: "DSD128 · DoP",
                          en: "Needs a 352.8 kHz DoP DAC",
                          zh: "需要支持 352.8 kHz 的 DoP DAC",
                        },
                      ] as const
                    ).map((item) => (
                      <Choice
                        key={item.id}
                        label={item.label}
                        detail={tr(item.en, item.zh)}
                        active={outputMode === item.id}
                        onClick={() => void setOutputMode(item.id)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
              <p style={{ margin: "10px 2px 0", fontSize: 12, opacity: 0.65 }}>
                {tr(
                  "Engine changes take effect after a restart; output mode applies on the next playback. VLC stays the default.",
                  "切换引擎需重启后生效;输出模式下一次播放生效。默认仍为 VLC。",
                )}
              </p>
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
                <strong>Potatoplayer Super</strong>
                <span>{tr("Version {version} · Local listening room", "版本 {version} · 本地聆听室", { version })}</span>
              </div>
              <span className="settings-about__badge">{tr("Local first", "本地优先")}</span>
            </section>
          </div>
        </Modal>
      )}
      <AnimatePresence>
        {pendingEngine && (
          <Modal
            onClose={() => setPendingEngine(null)}
            className="engine-warning"
            labelledBy="engine-warning-title"
          >
            <div className="settings-head">
              <div>
                <div className="modal__eyebrow">{tr("Hearing safety", "听力安全")}</div>
                <h2 id="engine-warning-title">{tr("Turn your volume down first", "请先把音量调低")}</h2>
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, padding: "0 4px 4px" }}>
              <p style={{ margin: 0, lineHeight: 1.7 }}>
                {tr(
                  "potatoHQ and mpv use their own volume, EQ and output path. After switching, loudness can differ from VLC — a sudden loud passage, a boosted EQ band or clipping can cause hearing damage, especially with headphones.",
                  "potatoHQ 与 mpv 使用各自独立的音量、EQ 与输出路径。切换后响度可能与 VLC 不同:突然的高音量、被提升的 EQ 频段或削波都可能造成听力损伤,戴耳机时尤其危险。",
                )}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>{tr("Lower the volume before you press play.", "开始播放前先把音量调低。")}</li>
                <li>{tr("Reset the EQ before switching engines.", "切换引擎前先把 EQ 复位。")}</li>
                <li>{tr("Take the headphones off while you test.", "测试时先摘下耳机。")}</li>
              </ul>
              <p style={{ margin: 0, opacity: 0.7, fontSize: 12 }}>
                {tr(
                  "Switching to " + pendingEngine + " requires a restart to apply.",
                  "切换到 " + pendingEngine + " 需要重启后生效。",
                )}
              </p>
            </div>
            <div className="modal__actions">
              <button type="button" className="button button--glass" onClick={() => setPendingEngine(null)}>
                {tr("Cancel", "取消")}
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  const target = pendingEngine;
                  setPendingEngine(null);
                  if (target) void setPlaybackEngine(target);
                }}
              >
                {tr("I lowered the volume — switch", "已调低音量,切换")}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
