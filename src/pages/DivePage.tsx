import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Gamepad2, LoaderCircle, Music2, Play, RotateCcw, Sparkles, Target, Zap } from "lucide-react";
import type { Track } from "@/types";
import { useAppStore } from "@/store";
import { useTr } from "@/lib/i18n";
import { formatLongDuration } from "@/lib/format";

type Phase = "setup" | "playing" | "result";
type Grade = "exact" | "great" | "good";
type DisplayGrade = Grade | "miss" | "loose";
type Counts = { exact: number; great: number; good: number; miss: number };

interface DiveNote {
  id: number;
  time: number;
  y: number;
  hit?: Grade;
  missed?: boolean;
}

const PREVIEW_SECONDS = 2.4;
const WINDOWS = { exact: 0.035, great: 0.075, good: 0.13 };
const SCORE = { exact: 1000, great: 650, good: 320 };
const EMPTY_COUNTS: Counts = { exact: 0, great: 0, good: 0, miss: 0 };

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildChart(track: Track | undefined, bpm: number): DiveNote[] {
  if (!track) return [];
  const beat = 60 / Math.max(50, Math.min(240, bpm));
  const chartStart = beat * 4;
  const duration = Math.max(30, Math.min(track.duration || 120, 210));
  const end = Math.max(chartStart + beat * 8, duration - 1.4);
  const pitches = [-16, -8, 0, 8, 16];
  const notes: DiveNote[] = [];
  let beatIndex = 0;
  for (let time = chartStart; time < end; time += beat) {
    notes.push({ id: notes.length, time, y: pitches[beatIndex % pitches.length] });
    if (beatIndex % 8 === 3 && time + beat / 2 < end) {
      notes.push({ id: notes.length, time: time + beat / 2, y: pitches[(beatIndex + 2) % pitches.length] });
    }
    beatIndex += 1;
  }
  return notes;
}

function fmtScore(value: number) {
  return Math.round(value).toLocaleString();
}

export function DivePage() {
  const tr = useTr();
  const tracks = useAppStore((state) => state.tracks);
  const playback = useAppStore((state) => state.playback);
  const playTrack = useAppStore((state) => state.playTrack);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const previewTrackId = useAppStore((state) => state.previewTrackId);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.title.localeCompare(b.title)),
    [tracks],
  );
  const initialId = useMemo(() => {
    const current = tracks.find((track) => track.id === playback?.trackId || track.id === previewTrackId);
    return current?.id ?? sortedTracks[0]?.id ?? "";
  }, [tracks, playback?.trackId, previewTrackId, sortedTracks]);

  const [phase, setPhase] = useState<Phase>("setup");
  const [trackId, setTrackId] = useState(initialId);
  const [bpm, setBpm] = useState(120);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<DiveNote[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [judgement, setJudgement] = useState<{ grade: DisplayGrade; offset: number | null } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; maxCombo: number; counts: Counts; total: number } | null>(null);

  const selectedTrack = tracks.find((track) => track.id === trackId);
  const stageRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("setup");
  const notesRef = useRef<DiveNote[]>([]);
  const noteEls = useRef(new Map<number, HTMLDivElement>());
  const clockRef = useRef({ audio: 0, at: performance.now() });
  const rafRef = useRef<number | null>(null);
  const endTimeRef = useRef(0);
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const maxComboRef = useRef(0);
  const countsRef = useRef<Counts>(EMPTY_COUNTS);
  const countdownRef = useRef<number | null>(null);
  const judgeTimer = useRef<number | null>(null);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    if (initialId) setTrackId((current) => (tracks.some((track) => track.id === current) ? current : initialId));
  }, [initialId, tracks]);

  const now = useCallback(() => {
    const clock = clockRef.current;
    return clock.audio + (performance.now() - clock.at) / 1000;
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const flash = useCallback((grade: DisplayGrade, offset: number | null) => {
    setJudgement({ grade, offset });
    if (judgeTimer.current !== null) window.clearTimeout(judgeTimer.current);
    judgeTimer.current = window.setTimeout(() => setJudgement(null), 620);
  }, []);

  const finish = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    stopLoop();
    phaseRef.current = "result";
    setPhase("result");
    const state = useAppStore.getState().playback;
    setResult({
      score: scoreRef.current,
      maxCombo: maxComboRef.current,
      counts: countsRef.current,
      total: notesRef.current.length,
    });
    if (state?.playing) void togglePlay();
  }, [stopLoop, togglePlay]);

  const exit = useCallback(() => {
    stopLoop();
    phaseRef.current = "setup";
    setPhase("setup");
    setCountdown(null);
    setJudgement(null);
    const state = useAppStore.getState().playback;
    if (state?.playing) void togglePlay();
  }, [stopLoop, togglePlay]);

  useEffect(() => {
    if (phase !== "playing" || !playback) return;
    clockRef.current = { audio: playback.time, at: performance.now() };
  }, [phase, playback?.time]);

  useEffect(() => {
    if (phase !== "playing") return;
    let active = true;
    const tick = () => {
      if (!active) return;
      const current = now();
      const stage = stageRef.current;
      if (stage) {
        const width = stage.clientWidth;
        const hitX = width * 0.72;
        for (const note of notesRef.current) {
          const element = noteEls.current.get(note.id);
          if (!element) continue;
          if (note.hit || note.missed) {
            element.style.opacity = "0";
            continue;
          }
          const until = note.time - current;
          const x = hitX + (until / PREVIEW_SECONDS) * (width - hitX + 72);
          const visible = until <= PREVIEW_SECONDS && until >= -0.25;
          element.style.opacity = visible ? "1" : "0";
          element.style.transform = `translate3d(${x}px, ${note.y}px, 0)`;
          element.classList.toggle("is-hot", Math.abs(until) < 0.06);
        }
      }

      const missed = notesRef.current.filter((note) => !note.hit && !note.missed && current > note.time + 0.16);
      if (missed.length) {
        const ids = new Set(missed.map((note) => note.id));
        notesRef.current = notesRef.current.map((note) => (ids.has(note.id) ? { ...note, missed: true } : note));
        setNotes([...notesRef.current]);
        comboRef.current = 0;
        setCombo(0);
        countsRef.current = { ...countsRef.current, miss: countsRef.current.miss + missed.length };
        setCounts(countsRef.current);
        flash("miss", null);
      }

      const first = notesRef.current[0];
      if (first && current < first.time) {
        const next = Math.max(1, Math.min(4, Math.ceil((first.time - current) / (60 / bpm))));
        if (countdownRef.current !== next) {
          countdownRef.current = next;
          setCountdown(next);
        }
      } else if (countdownRef.current !== null) {
        countdownRef.current = null;
        setCountdown(null);
      }

      if (current > endTimeRef.current || (!useAppStore.getState().playback?.playing && current > 1.4)) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      stopLoop();
    };
  }, [phase, bpm, finish, flash, now, stopLoop]);

  const attemptHit = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    const current = now();
    let best: DiveNote | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const note of notesRef.current) {
      if (note.hit || note.missed) continue;
      const distance = Math.abs(note.time - current);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = note;
      }
    }
    if (!best || bestDistance > WINDOWS.good) {
      flash("loose", null);
      return;
    }
    const grade: Grade = bestDistance <= WINDOWS.exact ? "exact" : bestDistance <= WINDOWS.great ? "great" : "good";
    notesRef.current = notesRef.current.map((note) => (note.id === best.id ? { ...note, hit: grade } : note));
    setNotes([...notesRef.current]);
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);
    const multiplier = 1 + Math.min(1, comboRef.current / 60);
    scoreRef.current += Math.round(SCORE[grade] * multiplier);
    setScore(scoreRef.current);
    countsRef.current = { ...countsRef.current, [grade]: countsRef.current[grade] + 1 };
    setCounts(countsRef.current);
    flash(grade, Math.round((current - best.time) * 1000));
  }, [flash, now]);

  const start = async () => {
    if (!selectedTrack || starting) return;
    setStarting(true);
    setError(null);
    setResult(null);
    setCounts(EMPTY_COUNTS);
    setCombo(0);
    setMaxCombo(0);
    setScore(0);
    comboRef.current = 0;
    scoreRef.current = 0;
    maxComboRef.current = 0;
    countsRef.current = EMPTY_COUNTS;
    setJudgement(null);
    setCountdown(null);
    try {
      await playTrack(selectedTrack, [selectedTrack.id], 0);
      let state = useAppStore.getState().playback;
      for (let attempt = 0; attempt < 40 && !(state?.playing && state.trackId === selectedTrack.id); attempt += 1) {
        await delay(100);
        state = useAppStore.getState().playback;
      }
      if (!state?.playing || state.trackId !== selectedTrack.id) {
        setError(tr("The engine did not start this track. Check the output device in Settings.", "播放引擎没有启动这首歌曲，请检查设置里的输出设备。"));
        return;
      }
      const chart = buildChart(selectedTrack, bpm);
      notesRef.current = chart;
      noteEls.current.clear();
      setNotes(chart);
      clockRef.current = { audio: state.time, at: performance.now() };
      endTimeRef.current = chart.length ? chart[chart.length - 1].time + 1.2 : 0;
      phaseRef.current = "playing";
      setPhase("playing");
      requestAnimationFrame(() => stageRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (event: KeyboardEvent) => {
      // The app-level Space shortcut toggles playback. Dive owns every key
      // while the stage is open, so stop the event before it reaches it.
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        exit();
        return;
      }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
      attemptHit();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [attemptHit, exit, phase]);

  useEffect(() => () => {
    stopLoop();
    if (judgeTimer.current !== null) window.clearTimeout(judgeTimer.current);
    if (phaseRef.current === "playing" && useAppStore.getState().playback?.playing) {
      void togglePlay();
    }
  }, [stopLoop, togglePlay]);

  const tapTempo = () => {
    const at = performance.now();
    const taps = tapsRef.current.filter((time) => at - time < 2500);
    taps.push(at);
    if (taps.length > 5) taps.shift();
    tapsRef.current = taps;
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((time, index) => time - taps[index]);
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      setBpm(Math.max(50, Math.min(240, Math.round(60000 / average))));
    }
  };

  const total = notes.length;
  const judged = counts.exact + counts.great + counts.good;
  const sync = total ? (counts.exact * 100 + counts.great * 70 + counts.good * 40) / total : 0;
  const progress = total ? (judged + counts.miss) / total : 0;

  if (!tracks.length) {
    return (
      <div className="page page--dive">
        <div className="empty-stage glass empty-stage--compact">
          <div className="empty-stage__icon empty-stage__icon--plain"><Gamepad2 size={28} /></div>
          <h2>{tr("Dive needs a few songs first.", "Dive 还需要几首歌。")}</h2>
          <p>{tr("Add music to your library, then come back to play.", "先向资料库添加音乐，再回来开始。")}</p>
        </div>
      </div>
    );
  }

  if (phase === "playing") {
    return (
      <div className="page page--dive page--dive-game">
        <div
          ref={stageRef}
          className="dive-stage"
          tabIndex={0}
          role="application"
          aria-label={tr("Dive rhythm stage", "Dive 节奏舞台")}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            attemptHit();
          }}
        >
          <div className="dive-stage__top">
            <div className="dive-stage__track">
              <Music2 size={14} />
              <div>
                <strong>{selectedTrack?.title}</strong>
                <span>{selectedTrack?.artist}</span>
              </div>
            </div>
            <div className="dive-stage__score">
              <span>{tr("Score", "分数")}</span>
              <strong>{fmtScore(score)}</strong>
            </div>
            <div className="dive-stage__sync">
              <span>{tr("Sync", "同步率")}</span>
              <strong>{sync.toFixed(1)}%</strong>
            </div>
          </div>

          <div className="dive-stage__combo">
            <strong>{combo}</strong>
            <span>COMBO</span>
          </div>

          <div className="dive-staff" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((line) => <i key={line} />)}
          </div>
          <div className="dive-hitline" aria-hidden="true" />
          <div className="dive-notes" aria-hidden="true">
            {notes.map((note) => (
              <div
                key={note.id}
                ref={(element) => {
                  if (element) noteEls.current.set(note.id, element);
                  else noteEls.current.delete(note.id);
                }}
                className="dive-note"
                style={{ top: `calc(50% + ${note.y}px)` }}
              >
                <span />
              </div>
            ))}
          </div>

          {judgement && (
            <div className={`dive-judgement is-${judgement.grade}`}>
              <strong>{judgement.grade.toUpperCase()}</strong>
              {judgement.offset !== null && (
                <span>{judgement.offset > 0 ? "+" : ""}{judgement.offset} ms</span>
              )}
            </div>
          )}
          {countdown !== null && <div className="dive-countdown">{countdown}</div>}

          <div className="dive-stage__bottom">
            <div className="dive-progress" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
            </div>
            <div className="dive-stage__hint">{tr("Any key · follow the pulse", "任意键 · 跟着拍子按")}</div>
            <button type="button" className="button button--glass button--small" onClick={exit}>
              <ArrowLeft size={14} /> {tr("Exit", "退出")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    const accuracy = result.total ? (result.counts.exact * 100 + result.counts.great * 70 + result.counts.good * 40) / result.total : 0;
    return (
      <div className="page page--dive">
        <div className="dive-result glass">
          <span className="eyebrow"><Sparkles size={12} /> {tr("Dive complete", "Dive 完成")}</span>
          <h1>{tr("You found the pulse.", "你找到了拍子。")}</h1>
          <p>{selectedTrack?.title} · {selectedTrack?.artist}</p>
          <div className="dive-result__score">{fmtScore(result.score)}</div>
          <span className="dive-result__caption">{tr("SCORE", "总分")}</span>
          <div className="dive-result__stats">
            <div><strong>{result.maxCombo}</strong><span>{tr("Max combo", "最高连击")}</span></div>
            <div><strong>{accuracy.toFixed(1)}%</strong><span>{tr("Accuracy", "准确率")}</span></div>
            <div><strong>{result.counts.exact}</strong><span>EXACT</span></div>
            <div><strong>{result.counts.miss}</strong><span>{tr("Misses", "失误")}</span></div>
          </div>
          <div className="dive-result__actions">
            <button type="button" className="button button--dark" onClick={() => void start()}>
              <RotateCcw size={15} /> {tr("Play again", "再来一次")}
            </button>
            <button type="button" className="button button--glass" onClick={() => { setPhase("setup"); phaseRef.current = "setup"; setResult(null); }}>
              <ArrowLeft size={15} /> {tr("Change track", "换一首")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--dive">
      <header className="dive-hero glass">
        <div className="dive-hero__copy">
          <span className="eyebrow"><Gamepad2 size={12} /> DIVE · BETA</span>
          <h1>{tr("Dive into the pulse.", "潜入节拍。")}</h1>
          <p>
            {tr(
              "Pick a track. Any key, any click. Follow the line and keep the combo alive.",
              "选一首歌。任意键、任意点击。跟着判定线，把连击接下去。",
            )}
          </p>
          <div className="dive-hero__steps">
            <span><b>01</b> {tr("Any key", "任意键")}</span>
            <span><b>02</b> {tr("Follow the pulse", "跟拍子")}</span>
            <span><b>03</b> {tr("Aim for EXACT", "尽量 EXACT")}</span>
            <span><b>04</b> {tr("Keep the combo", "保持连击")}</span>
          </div>
        </div>
        <div className="dive-orbit" aria-hidden="true">
          <span className="dive-orbit__ring dive-orbit__ring--one" />
          <span className="dive-orbit__ring dive-orbit__ring--two" />
          <span className="dive-orbit__ring dive-orbit__ring--three" />
          <span className="dive-orbit__center">DIVE<em>BEAT</em></span>
        </div>
      </header>

      <section className="dive-setup glass">
        <div className="dive-setup__head">
          <div>
            <span className="eyebrow">{tr("Set the room", "布置舞台")}</span>
            <h2>{tr("Choose a track and a tempo.", "选一首歌，定一个速度。")}</h2>
          </div>
          <div className="dive-setup__badge"><Zap size={14} /> {tr("Local chart · no upload", "本地谱面 · 不上传")}</div>
        </div>
        {error && <div className="online-error">{error}</div>}
        <div className="dive-setup__form">
          <label className="dive-field">
            <span>{tr("Track", "歌曲")}</span>
            <select value={trackId} onChange={(event) => setTrackId(event.target.value)}>
              {sortedTracks.map((track) => (
                <option key={track.id} value={track.id}>{track.title} — {track.artist}</option>
              ))}
            </select>
          </label>
          <label className="dive-field dive-field--bpm">
            <span>{tr("Tempo", "速度")} <em>BPM</em></span>
            <input
              type="number"
              min={50}
              max={240}
              value={bpm}
              onChange={(event) => setBpm(Math.max(50, Math.min(240, Number(event.target.value) || 120)))}
            />
          </label>
          <button type="button" className="button button--glass dive-tap" onClick={tapTempo} aria-label={tr("Tap tempo", "点击测速")}>
            <Target size={14} /> {tr("Tap", "点击测速")}
          </button>
        </div>
        <div className="dive-setup__foot">
          <div>
            <span>{selectedTrack ? `${selectedTrack.album || selectedTrack.artist} · ${formatLongDuration(selectedTrack.duration)}` : ""}</span>
            <em>{tr("The chart is generated from this tempo. Adjust it until the pulse matches.", "谱面会按这个速度生成。调到和歌曲拍子一致再开始。")}</em>
          </div>
          <button type="button" className="button button--dark dive-start" disabled={!selectedTrack || starting} onClick={() => void start()}>
            {starting ? <LoaderCircle size={16} className="is-spinning" /> : <Play size={16} fill="currentColor" />}
            {starting ? tr("Starting…", "正在开始…") : tr("Start dive", "开始 Dive")}
          </button>
        </div>
      </section>

      <div className="dive-note-hint">
        <Gamepad2 size={15} />
        {tr("Keyboard, mouse or touch. Dive has no lanes and no holds — every tap is judged by timing.", "键盘、鼠标或触屏都可以。Dive 没有轨道，也没有长按，只看你按得准不准。")}
      </div>
    </div>
  );
}
