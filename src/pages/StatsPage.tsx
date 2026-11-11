import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  Flame,
  Headphones,
  Moon,
  Music2,
  RefreshCw,
  Sparkles,
  Sun,
  Sunrise,
} from "lucide-react";
import type { ListeningDay, ListeningStats, ListeningTrackStat } from "@/types";
import { useAppStore } from "@/store";
import { PageHeader } from "@/components/Headers";
import { Cover } from "@/components/Cover";
import { useTr } from "@/lib/i18n";
import { documentLanguage } from "@/lib/text";
import { formatLongDuration } from "@/lib/format";

type Metric = "time" | "plays";
type HeatLevel = 0 | 1 | 2 | 3 | 4;

const METRIC_KEY = "potato:stats:metric";

function readMetric(): Metric {
  try {
    return localStorage.getItem(METRIC_KEY) === "plays" ? "plays" : "time";
  } catch {
    return "time";
  }
}

function shiftDate(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIso(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatMinutes(seconds: number): string {
  const zh = documentLanguage() === "zh";
  if (!Number.isFinite(seconds) || seconds <= 0) return zh ? "0 分钟" : "0 min";
  if (seconds < 60) return zh ? "不到 1 分钟" : "<1 min";
  return formatLongDuration(seconds);
}

function formatDayLong(date: Date): string {
  return new Intl.DateTimeFormat(documentLanguage() === "zh" ? "zh-CN" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatMonthShort(date: Date): string {
  return new Intl.DateTimeFormat(documentLanguage() === "zh" ? "zh-CN" : "en-US", {
    month: "short",
  }).format(date);
}

function formatHour(hour: number): string {
  if (documentLanguage() === "zh") return `${String(hour).padStart(2, "0")}:00`;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function levelFor(value: number, thresholds: number[]): HeatLevel {
  if (value <= 0) return 0;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

function buildWeeks(year: number): Array<Array<Date>> {
  const first = new Date(year, 0, 1);
  const start = shiftDate(first, -first.getDay());
  const end = new Date(year, 11, 31);
  const last = shiftDate(end, 6 - end.getDay());
  const weeks: Date[][] = [];
  for (let cursor = start; cursor <= last; cursor = shiftDate(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => shiftDate(cursor, index)));
  }
  return weeks;
}

function streakInfo(days: Map<string, ListeningDay>): { current: number; best: number } {
  const active = [...days.values()].filter((day) => day.seconds >= 30).sort((a, b) => a.date.localeCompare(b.date));
  if (!active.length) return { current: 0, best: 0 };
  let best = 1;
  let run = 1;
  for (let i = 1; i < active.length; i++) {
    const previous = parseIso(active[i - 1].date);
    const current = parseIso(active[i].date);
    if (shiftDate(previous, 1).getTime() === current.getTime()) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  const activeSet = new Set(active.map((day) => day.date));
  const today = new Date();
  let anchor = isoDate(today);
  if (!activeSet.has(anchor)) anchor = isoDate(shiftDate(today, -1));
  let current = 0;
  while (activeSet.has(anchor)) {
    current++;
    anchor = isoDate(shiftDate(parseIso(anchor), -1));
  }
  return { current, best };
}

function Heatmap({
  year,
  days,
  metric,
  selectedDate,
  onSelect,
}: {
  year: number;
  days: Map<string, ListeningDay>;
  metric: Metric;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const tr = useTr();
  const weeks = useMemo(() => buildWeeks(year), [year]);
  const today = isoDate(new Date());
  const thresholds = useMemo(() => {
    const values = [...days.values()]
      .map((day) => (metric === "plays" ? day.plays : day.seconds))
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (!values.length) return [0, 0, 0];
    const at = (ratio: number) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
    return [at(0.25), at(0.5), at(0.75)];
  }, [days, metric]);
  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; column: number }> = [];
    let lastMonth = -1;
    weeks.forEach((week, column) => {
      const candidate = week.find((date) => date.getFullYear() === year && date.getDate() <= 7);
      if (!candidate) return;
      const month = candidate.getMonth();
      if (month !== lastMonth) {
        labels.push({ label: formatMonthShort(candidate), column });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks, year]);

  const dayName = (index: number) => {
    if (index === 1) return tr("Mon", "一");
    if (index === 3) return tr("Wed", "三");
    if (index === 5) return tr("Fri", "五");
    return "";
  };

  return (
    <div className="stats-heatmap">
      <div className="stats-heatmap__day-labels" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>{dayName(index)}</span>
        ))}
      </div>
      <div className="stats-heatmap__body">
        <div className="stats-heatmap__months" style={{ "--week-count": weeks.length } as CSSProperties} aria-hidden="true">
          {monthLabels.map((item) => (
            <span key={`${item.label}-${item.column}`} style={{ gridColumnStart: item.column + 1 }}>
              {item.label}
            </span>
          ))}
        </div>
        <div className="stats-heatmap__weeks" style={{ "--week-count": weeks.length } as CSSProperties}>
          {weeks.map((week, column) => (
            <div className="stats-heatmap__week" key={column}>
              {week.map((date) => {
                const key = isoDate(date);
                const inYear = date.getFullYear() === year;
                const future = key > today;
                const day = days.get(key);
                const value = metric === "plays" ? day?.plays ?? 0 : day?.seconds ?? 0;
                const level = inYear && !future ? levelFor(value, thresholds) : 0;
                const label = `${formatDayLong(date)} · ${
                  day ? `${formatMinutes(day.seconds)} · ${day.plays} ${tr("plays", "次播放")}` : tr("No listening", "没有聆听")
                }`;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`stats-heatmap__cell level-${level} ${
                      inYear ? "" : "is-outside"
                    } ${future ? "is-future" : ""} ${selectedDate === key ? "is-selected" : ""}`}
                    title={label}
                    aria-label={label}
                    tabIndex={-1}
                    disabled={!inYear || future}
                    onClick={() => onSelect(key)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopTrackRow({
  item,
  index,
  coverPath,
  onOpen,
}: {
  item: ListeningTrackStat;
  index: number;
  coverPath: string | null;
  onOpen: () => void;
}) {
  const tr = useTr();
  return (
    <button type="button" className="stats-top-track" onClick={onOpen}>
      <span className="stats-top-track__rank">{String(index + 1).padStart(2, "0")}</span>
      <Cover path={coverPath} seed={item.trackId} label={item.title} radius={10} className="stats-top-track__cover" />
      <span className="stats-top-track__copy">
        <strong>{item.title}</strong>
        <em>{item.artist}</em>
      </span>
      <span className="stats-top-track__meta">
        <strong>{formatMinutes(item.seconds)}</strong>
        <em>{tr("{count} plays", "{count} 次", { count: item.plays })}</em>
      </span>
    </button>
  );
}

export function StatsPage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const navigate = useAppStore((state) => state.navigate);
  const playTrack = useAppStore((state) => state.playTrack);
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [metric, setMetric] = useState<Metric>(readMetric);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.potato.invoke<ListeningStats>("stats.get");
      setStats(result);
      const latest = [...(result.days ?? [])].reverse().find((day) => day.seconds > 0);
      if (latest) setYear(parseIso(latest.date).getFullYear());
      setSelectedDate(latest?.date ?? isoDate(new Date()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(METRIC_KEY, metric);
    } catch {
      // Preference storage is optional.
    }
  }, [metric]);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const values = new Set<number>([currentYear, year]);
    for (const day of stats?.days ?? []) {
      if (day.seconds > 0) values.add(parseIso(day.date).getFullYear());
    }
    return [...values].sort((a, b) => b - a);
  }, [stats, currentYear, year]);

  const yearDays = useMemo(() => {
    const map = new Map<string, ListeningDay>();
    for (const day of stats?.days ?? []) {
      if (day.date.startsWith(`${year}-`)) map.set(day.date, day);
    }
    return map;
  }, [stats, year]);

  const totals = useMemo(() => {
    let seconds = 0;
    let plays = 0;
    let activeDays = 0;
    const hours = Array.from({ length: 24 }, () => 0);
    for (const day of yearDays.values()) {
      seconds += day.seconds;
      plays += day.plays;
      if (day.seconds >= 30) activeDays++;
      day.hours.forEach((value, index) => {
        hours[index] += value;
      });
    }
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const elapsed = year === currentYear
      ? Math.floor((Date.now() - new Date(currentYear, 0, 1).getTime()) / 86_400_000) + 1
      : leap ? 366 : 365;
    const peakHour = hours.indexOf(Math.max(...hours));
    const periods = [
      { key: "night", value: hours.slice(0, 6).reduce((a, b) => a + b, 0) },
      { key: "morning", value: hours.slice(6, 12).reduce((a, b) => a + b, 0) },
      { key: "afternoon", value: hours.slice(12, 18).reduce((a, b) => a + b, 0) },
      { key: "evening", value: hours.slice(18, 24).reduce((a, b) => a + b, 0) },
    ];
    return {
      seconds,
      plays,
      activeDays,
      hours,
      peakHour,
      elapsed,
      periods,
      average: activeDays ? seconds / activeDays : 0,
    };
  }, [yearDays, year, currentYear]);

  const streaks = useMemo(() => {
    const all = new Map<string, ListeningDay>();
    for (const day of stats?.days ?? []) all.set(day.date, day);
    return streakInfo(all);
  }, [stats]);

  const topTracks = useMemo(() => (stats?.tracks ?? []).filter((item) => item.seconds > 0).slice(0, 6), [stats]);
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const topArtists = useMemo(() => {
    const map = new Map<string, { artist: string; seconds: number; plays: number; coverPath: string | null }>();
    for (const item of stats?.tracks ?? []) {
      if (!item.artist) continue;
      const existing = map.get(item.artist) ?? { artist: item.artist, seconds: 0, plays: 0, coverPath: null };
      existing.seconds += item.seconds;
      existing.plays += item.plays;
      if (!existing.coverPath) {
        existing.coverPath = trackById.get(item.trackId)?.coverPath ?? null;
      }
      map.set(item.artist, existing);
    }
    return [...map.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  }, [stats, trackById]);

  const selected = selectedDate ? yearDays.get(selectedDate) : undefined;
  const selectedLabel = selectedDate ? formatDayLong(parseIso(selectedDate)) : "";
  const selectedPeakHour = selected ? selected.hours.indexOf(Math.max(...selected.hours)) : 0;
  const hasData = Boolean(stats?.days.some((day) => day.seconds > 0));
  const maxHour = Math.max(...totals.hours, 1);
  const totalPeriod = totals.periods.reduce((sum, item) => sum + item.value, 0);
  const favoritePeriod = [...totals.periods].sort((a, b) => b.value - a.value)[0]?.key ?? "evening";
  const busiestDay = [...yearDays.values()].sort((a, b) => b.seconds - a.seconds)[0];
  const persona = favoritePeriod === "night"
    ? {
        icon: <Moon size={17} />,
        eyebrow: tr("Listening persona", "聆听人格"),
        title: tr("A late-night listener.", "深夜聆听者。"),
        body: tr(
          "The house is quiet and the headphones are warm. Most of your hours land after midnight.",
          "房间安静，耳机温热。你的大部分聆听时光落在午夜之后。",
        ),
      }
    : favoritePeriod === "morning"
      ? {
          icon: <Sunrise size={17} />,
          eyebrow: tr("Listening persona", "聆听人格"),
          title: tr("An early-room listener.", "清晨聆听者。"),
          body: tr(
            "You like the day before it gets loud — first light, a warm drink and a record.",
            "你喜欢世界变吵之前的时刻——晨光、热饮和一张唱片。",
          ),
        }
      : favoritePeriod === "afternoon"
        ? {
            icon: <Sun size={17} />,
            eyebrow: tr("Listening persona", "聆听人格"),
            title: tr("An afternoon listener.", "午后聆听者。"),
            body: tr(
              "Your listening settles into the long middle of the day, unhurried and steady.",
              "你的聆听落在漫长的一天中段，不慌不忙，稳定而从容。",
            ),
          }
        : {
            icon: <Moon size={17} />,
            eyebrow: tr("Listening persona", "聆听人格"),
            title: tr("An evening listener.", "夜晚聆听者。"),
            body: tr(
              "When the light goes down, the room fills up. Evening is where your listening lives.",
              "天色暗下来，房间才真正被填满。夜晚是你的聆听主场。",
            ),
          };

  const summaryCards = [
    {
      key: "time",
      icon: <Headphones size={16} />,
      label: tr("Listening time", "聆听时长"),
      value: formatMinutes(totals.seconds),
      detail: totals.activeDays
        ? tr("{time} per active day", "活跃日均 {time}", { time: formatMinutes(totals.average) })
        : tr("Play something to begin", "播放音乐开始记录"),
    },
    {
      key: "plays",
      icon: <Music2 size={16} />,
      label: tr("Songs played", "播放次数"),
      value: totals.plays.toLocaleString(documentLanguage() === "zh" ? "zh-CN" : "en-US"),
      detail: tr("{count} active days", "{count} 个活跃日", { count: totals.activeDays }),
    },
    {
      key: "days",
      icon: <CalendarDays size={16} />,
      label: tr("Active days", "活跃天数"),
      value: `${totals.activeDays}`,
      detail: tr("of {days} days in {year}", "{year} 年共 {days} 天", { days: totals.elapsed, year }),
    },
    {
      key: "streak",
      icon: <Flame size={16} />,
      label: year === currentYear ? tr("Current streak", "当前连续") : tr("Best streak", "最长连续"),
      value: `${year === currentYear ? streaks.current : streaks.best}`,
      detail: `${tr("days", "天")} · ${tr("best {count}", "最长 {count}", { count: streaks.best })}`,
    },
  ];

  return (
    <div className="page page--stats">
      <PageHeader
        eyebrow={tr("Your listening life", "你的聆听生活")}
        title={tr("Listening stats", "聆听统计")}
        description={tr(
          "A quiet record of when, what and how long you listen. Everything stays on this Mac.",
          "安静记录你何时听、听什么、听了多久。全部数据只留在这台设备上。",
        )}
        actions={
          <>
            <label className="stats-year-control">
              <CalendarDays size={14} />
              <select
                value={year}
                onChange={(event) => {
                  setYear(Number(event.target.value));
                  setSelectedDate(null);
                }}
                aria-label={tr("Choose a year", "选择年份")}
              >
                {years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="button button--glass button--compact" onClick={() => void load()} title={tr("Refresh stats", "刷新统计")} aria-label={tr("Refresh stats", "刷新统计")}>
              <RefreshCw size={15} className={loading ? "is-spinning" : undefined} />
            </button>
          </>
        }
      />

      {error ? (
        <div className="empty-stage glass empty-stage--compact">
          <BarChart3 size={28} />
          <h2>{tr("Could not read your listening history.", "无法读取聆听记录。")}</h2>
          <p>{error}</p>
          <button type="button" className="button button--dark" onClick={() => void load()}>
            <RefreshCw size={15} /> {tr("Try again", "重试")}
          </button>
        </div>
      ) : loading && !stats ? (
        <div className="stats-skeleton" aria-hidden="true">
          <div className="stats-skeleton__row">
            <span /><span /><span /><span />
          </div>
          <span className="stats-skeleton__panel" />
          <span className="stats-skeleton__panel stats-skeleton__panel--short" />
        </div>
      ) : !hasData ? (
        <motion.div className="stats-empty glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="stats-empty__art" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span />
            <BarChart3 size={29} />
          </div>
          <span className="eyebrow">{tr("Your calendar starts here", "你的日历从这里开始")}</span>
          <h2>{tr("Give it a song. It will remember the rest.", "留一首歌给它，剩下的它会记住。")}</h2>
          <p>
            {tr(
              "Listening time, your late-night hours and the records you return to will appear here as you play. No account, no upload.",
              "开始播放后，聆听时长、深夜时段和反复回到的唱片都会出现在这里。无需账号，也不会上传。",
            )}
          </p>
          <button type="button" className="button button--dark" onClick={() => navigate({ kind: "songs" })}>
            <Music2 size={15} /> {tr("Browse songs", "浏览歌曲")}
          </button>
        </motion.div>
      ) : (
        <>
          <div className="stats-summary">
            {summaryCards.map((card, index) => (
              <motion.div
                className="stats-card glass"
                key={card.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.3 }}
              >
                <span className="stats-card__icon">{card.icon}</span>
                <span className="stats-card__label">{card.label}</span>
                <strong>{card.value}</strong>
                <em>{card.detail}</em>
              </motion.div>
            ))}
          </div>

          <motion.section
            className="stats-panel stats-panel--calendar glass"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <header className="stats-panel__head">
                <div>
                  <span className="eyebrow">{tr("Consistency", "聆听足迹")}</span>
                  <h2>{tr("{year} in listening", "{year} 年的聆听", { year })}</h2>
                  <p>{tr("{count} active days · {time} total", "{count} 个活跃日 · 共 {time}", { count: totals.activeDays, time: formatMinutes(totals.seconds) })}</p>
                </div>
                <div className="stats-metric-switch" role="group" aria-label={tr("Heatmap metric", "热力图指标")}>
                  <button type="button" className={metric === "time" ? "is-active" : ""} onClick={() => setMetric("time")}>{tr("Minutes", "时长")}</button>
                  <button type="button" className={metric === "plays" ? "is-active" : ""} onClick={() => setMetric("plays")}>{tr("Plays", "次数")}</button>
                </div>
              </header>

              <div className="stats-heatmap-scroll">
                <Heatmap
                  year={year}
                  days={yearDays}
                  metric={metric}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                />
              </div>

              <div className="stats-heatmap__foot">
                <div className="stats-day-detail">
                  {selected ? (
                    <>
                      <strong>{selectedLabel}</strong>
                      <span>
                        {formatMinutes(selected.seconds)} · {tr("{count} plays", "{count} 次播放", { count: selected.plays })} · {tr("peak {hour}", "高峰 {hour}", { hour: formatHour(selectedPeakHour) })}
                      </span>
                    </>
                  ) : (
                    <span>{tr("Choose a day to see its detail.", "选择一天查看详情。")}</span>
                  )}
                </div>
                <div className="stats-heatmap__legend" aria-hidden="true">
                  <span>{tr("Less", "少")}</span>
                  {[0, 1, 2, 3, 4].map((level) => (
                    <i key={level} className={`level-${level}`} />
                  ))}
                  <span>{tr("More", "多")}</span>
                </div>
              </div>
          </motion.section>

          <div className="stats-panels">
            <motion.section
              className="stats-panel stats-panel--rhythm glass"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07, duration: 0.35 }}
            >
              <header className="stats-panel__head">
                <div>
                  <span className="eyebrow">{tr("Your clock", "你的时钟")}</span>
                  <h2>{tr("When you listen", "你何时聆听")}</h2>
                  <p>{tr("Peak around {hour}", "高峰在 {hour} 左右", { hour: formatHour(totals.peakHour) })}</p>
                </div>
                <span className="stats-clock-badge"><Clock3 size={13} /> {formatHour(totals.peakHour)}</span>
              </header>
              <div className="stats-rhythm">
                {totals.hours.map((value, hour) => {
                  const percent = (value / maxHour) * 100;
                  return (
                    <div className="stats-rhythm__bar-wrap" key={hour} title={`${formatHour(hour)} · ${formatMinutes(value)}`}>
                      <span
                        className={`stats-rhythm__bar ${hour === totals.peakHour && value > 0 ? "is-peak" : ""}`}
                        style={{ "--bar-height": `${Math.max(value > 0 ? 7 : 2, percent)}%` } as CSSProperties}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="stats-rhythm__axis" aria-hidden="true">
                {[0, 6, 12, 18, 23].map((hour) => (
                  <span key={hour} style={{ left: `${(hour / 23) * 100}%` }}>
                    {documentLanguage() === "zh" ? `${hour}时` : formatHour(hour)}
                  </span>
                ))}
              </div>
              <div className="stats-periods">
                {totals.periods.map((period) => (
                  <div key={period.key}>
                    <span>
                      {period.key === "night" ? tr("Late night", "深夜") : period.key === "morning" ? tr("Morning", "早晨") : period.key === "afternoon" ? tr("Afternoon", "下午") : tr("Evening", "夜晚")}
                    </span>
                    <strong>{totalPeriod ? Math.round((period.value / totalPeriod) * 100) : 0}%</strong>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section
              className="stats-persona glass"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35 }}
            >
              <span className="stats-persona__icon">{persona.icon}</span>
              <span className="eyebrow">{persona.eyebrow}</span>
              <h2>{persona.title}</h2>
              <p>{persona.body}</p>
              <div className="stats-persona__facts">
                <div>
                  <span>{tr("Peak hour", "高峰时段")}</span>
                  <strong>{formatHour(totals.peakHour)}</strong>
                </div>
                <div>
                  <span>{tr("Busiest day", "最活跃日")}</span>
                  <strong>{busiestDay ? formatDayLong(parseIso(busiestDay.date)) : "—"}</strong>
                </div>
                <div>
                  <span>{tr("Most played artist", "最常听艺术家")}</span>
                  <strong>{topArtists[0]?.artist ?? "—"}</strong>
                </div>
                <div>
                  <span>{tr("Average day", "日均聆听")}</span>
                  <strong>{formatMinutes(totals.average)}</strong>
                </div>
              </div>
            </motion.section>
          </div>

          <div className="stats-lists">
            <motion.section className="stats-panel glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}>
              <header className="stats-panel__head">
                <div>
                  <span className="eyebrow">{tr("On repeat", "反复聆听")}</span>
                  <h2>{tr("Most listened tracks", "听得最多的歌曲")}</h2>
                </div>
                <span className="stats-panel__hint">{tr("All time", "全部时间")}</span>
              </header>
              <div className="stats-top-list">
                {topTracks.map((item, index) => (
                  <TopTrackRow
                    key={item.trackId}
                    item={item}
                    index={index}
                    coverPath={trackById.get(item.trackId)?.coverPath ?? null}
                    onOpen={() => {
                      const track = trackById.get(item.trackId);
                      if (track) void playTrack(track, tracks.map((entry) => entry.id));
                    }}
                  />
                ))}
              </div>
            </motion.section>

            <motion.section className="stats-panel glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.35 }}>
              <header className="stats-panel__head">
                <div>
                  <span className="eyebrow">{tr("Your orbit", "你的轨道")}</span>
                  <h2>{tr("Most listened artists", "听得最多的艺术家")}</h2>
                </div>
                <span className="stats-panel__hint">{tr("All time", "全部时间")}</span>
              </header>
              <div className="stats-artist-list">
                {topArtists.map((artist, index) => (
                  <button type="button" className="stats-artist-row" key={artist.artist} onClick={() => navigate({ kind: "artist", name: artist.artist })}>
                    <span className="stats-artist-row__rank">{String(index + 1).padStart(2, "0")}</span>
                    <Cover path={artist.coverPath} seed={artist.artist} label={artist.artist} radius="50%" className="stats-artist-row__cover" />
                    <span className="stats-artist-row__copy">
                      <strong>{artist.artist}</strong>
                      <em>{tr("{count} plays", "{count} 次播放", { count: artist.plays })}</em>
                    </span>
                    <span className="stats-artist-row__time">{formatMinutes(artist.seconds)}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
              <div className="stats-lifetime">
                <Sparkles size={13} />
                {tr(
                  "History started {date}. This page grows every time you press play.",
                  "记录始于 {date}。每次按下播放，这一页都会继续生长。",
                  { date: formatDayLong(parseIso(stats?.days.find((day) => day.seconds > 0)?.date ?? isoDate(new Date()))) },
                )}
              </div>
            </motion.section>
          </div>
        </>
      )}
    </div>
  );
}
