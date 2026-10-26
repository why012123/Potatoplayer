const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const pad = (n, size = 2) => String(n).padStart(size, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (s) => {
  const value = Math.max(0, Number(s) || 0);
  return `${pad(Math.floor(value / 60))}:${pad(Math.floor(value % 60))}`;
};

const audio = new Audio();
audio.preload = "metadata";
const app = $("#flat-app");
const state = {
  started: false,
  silent: false,
  playing: false,
  t: 0,
  duration: 0,
  line: -1,
  chapter: -1,
  demoBase: 0,
  demoWall: 0,
  lines: [],
  chapters: [],
  startedAt: 0,
};
let song = null;

function parseLrc(raw) {
  const out = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    if (!match) continue;
    const time = Number(match[1]) * 60 + Number(match[2]);
    const text = match[3].trim();
    if (text) out.push({ time: Math.round(time * 1000) / 1000, text });
  }
  return out;
}

function isCreditLine(text, time) {
  return time < 5 && /作词|作曲|编曲|lyric|music|arrange|mixing|master/i.test(text);
}

function classifyFx(text, index, total) {
  if (index === total - 1) return "final";
  if (text.length <= 4) return "short";
  if (text.length > 30) return "long";
  if (index % 7 === 0) return "stark";
  if (index % 5 === 0) return "soft";
  return index % 3 === 0 ? "warm" : "plain";
}

function buildSongData(data) {
  const raw = parseLrc(data.lrc);
  const translation = new Map(parseLrc(data.translation).map((x) => [x.time, x.text]));
  const rows = raw.filter((line) => !isCreditLine(line.text, line.time));
  if (!rows.length) throw new Error("This track has no timed lyrics.");
  const count = Math.min(8, Math.max(1, Math.ceil(rows.length / 4)));
  const size = Math.ceil(rows.length / count);
  const chapters = [];
  for (let i = 0; i < count; i += 1) {
    const row = rows[i * size];
    if (!row) continue;
    chapters.push({ time: row.time, label: `MOVEMENT ${pad(i + 1)}` });
  }
  const lines = rows.map((row, index) => {
    const chapter = [...chapters].reverse().find((item) => row.time >= item.time) || chapters[0];
    return {
      time: row.time,
      text: row.text,
      translation: translation.get(row.time) || "",
      fx: classifyFx(row.text, index, rows.length),
      chapter: chapters.indexOf(chapter),
    };
  });
  const fullTitle = String(data.title || "Untitled").trim();
  const bracket = fullTitle.match(/^(.*?)\s*[（(]([^()（）]+)[)）]\s*$/);
  return {
    ...data,
    title: (bracket ? bracket[1] : fullTitle).trim(),
    titleExtra: bracket ? bracket[2].trim() : "",
    displayTitle: (bracket ? bracket[1] : fullTitle).trim(),
    duration: Number(data.duration) || lines[lines.length - 1].time + 8,
    cover: `/api/cover?id=${encodeURIComponent(data.id)}`,
    audio: `/api/audio?id=${encodeURIComponent(data.id)}`,
    lines,
    chapters,
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function toneFromCover(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 40;
        c.height = 40;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(image, 0, 0, 40, 40);
        const data = g.getImageData(0, 0, 40, 40).data;
        let best = null;
        let sum = { r: 0, g: 0, b: 0, n: 0 };
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 180) continue;
          const r = data[i];
          const g0 = data[i + 1];
          const b = data[i + 2];
          sum.r += r; sum.g += g0; sum.b += b; sum.n += 1;
          const hsl = rgbToHsl(r, g0, b);
          if (hsl.l < 0.12 || hsl.l > 0.94) continue;
          const score = hsl.s * (1 - Math.abs(hsl.l - 0.54));
          if (!best || score > best.score) best = { r, g: g0, b, hsl, score };
        }
        const average = sum.n
          ? rgbToHsl(sum.r / sum.n, sum.g / sum.n, sum.b / sum.n)
          : { h: 0.62, s: 0.1, l: 0.55 };
        const accentHsl = best?.hsl || { h: average.h, s: 0.22, l: 0.58 };
        const accent = `hsl(${Math.round(accentHsl.h * 360)} ${Math.round(clamp(accentHsl.s * 100, 42, 68))}% ${Math.round(clamp(accentHsl.l * 100, 52, 66))}%)`;
        const light = `hsla(${Math.round(average.h * 360)}, ${Math.round(clamp(average.s * 100, 7, 19))}%, 78%, 0.66)`;
        const dark = `hsla(${Math.round(average.h * 360)}, ${Math.round(clamp(average.s * 100, 9, 23))}%, 34%, 0.64)`;
        const ink = `hsl(${Math.round(average.h * 360)} ${Math.round(clamp(average.s * 100, 8, 22))}% 14%)`;
        resolve({ accent, light, dark, ink });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function applyTone(tone) {
  if (!tone) return;
  const root = document.documentElement.style;
  root.setProperty("--accent", tone.accent);
  root.setProperty("--wash-a", tone.light);
  root.setProperty("--wash-b", tone.dark);
  root.setProperty("--ink", tone.ink);
}

function fillPage(data, tracks) {
  document.title = `${data.displayTitle} — Flat Lyric`;
  $("#startTitle").textContent = data.displayTitle;
  $("#startRoman").textContent = (data.album || data.titleExtra || "FLAT LYRIC STAGE").toUpperCase();
  $("#startMeta").textContent = `${data.artist}${data.titleExtra ? ` · ${data.titleExtra}` : ""} · ${fmt(data.duration)}`;
  $("#startArtLines").textContent = data.displayTitle;
  $("#hudTitle").textContent = data.displayTitle;
  $("#hudArtist").textContent = data.artist;
  $("#hudCover").src = data.cover;
  $("#startCover").src = data.cover;
  $("#startCoverBlur").style.backgroundImage = `url("${data.cover}")`;
  $("#coverBg").style.backgroundImage = `url("${data.cover}")`;
  $("#duration").textContent = fmt(data.duration);
  $("#timeline").max = String(data.duration);
  const select = $("#trackSelect");
  select.replaceChildren();
  for (const track of tracks) {
    if (!track.hasLyrics) continue;
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = `${track.artist} — ${track.title}`;
    if (track.id === data.id) option.selected = true;
    select.appendChild(option);
  }
}

async function load() {
  const params = new URLSearchParams(location.search);
  const list = await fetch("/api/tracks").then((response) => {
    if (!response.ok) throw new Error("无法读取资料库。");
    return response.json();
  });
  const tracks = (list.tracks || []).filter((item) => item.hasLyrics);
  if (!tracks.length) throw new Error("没有带时间轴歌词的歌曲。");
  const requested = params.get("track");
  const selected = tracks.find((item) => item.id === requested) || tracks[0];
  if (selected.id !== requested) {
    params.set("track", selected.id);
    history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
  }
  const response = await fetch(`/api/song?id=${encodeURIComponent(selected.id)}`);
  if (!response.ok) throw new Error("无法读取歌曲信息。");
  const raw = await response.json();
  song = buildSongData(raw);
  state.lines = song.lines;
  state.chapters = song.chapters;
  state.duration = song.duration;
  audio.src = song.audio;
  audio.load();
  fillPage(song, tracks);
  $("#trackSelect").addEventListener("change", (event) => {
    const next = new URL(location.href);
    next.searchParams.set("track", event.target.value);
    location.href = next.toString();
  });
  const tone = await toneFromCover(song.cover);
  applyTone(tone);
}

function activeIndexAt(t) {
  let lo = 0;
  let hi = state.lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (state.lines[mid].time <= t + 0.03) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function chapterAt(t) {
  let result = state.chapters[0];
  for (const chapter of state.chapters) if (t >= chapter.time) result = chapter;
  return result;
}

function lineClass(line, index) {
  const length = Array.from(line.text).length;
  const size = length > 30 ? "len-xs" : length > 20 ? "len-sm" : length > 12 ? "len-md" : "";
  const ink = line.fx === "short" || line.fx === "stark" || index % 6 === 2;
  return `${size} ${ink ? "is-ink" : ""}`.trim();
}

function accentSet(text, fx) {
  const set = new Set();
  if (!text.length) return set;
  const every = fx === "short" || fx === "stark" ? 2 : 7;
  for (let i = 0; i < text.length; i += every) set.add(i);
  return set;
}

function renderLine(index) {
  const line = state.lines[index];
  if (!line) return;
  const previous = state.lines[index - 1];
  const ghost = $("#ghostLayer");
  ghost.textContent = previous?.text || line.text;
  ghost.style.fontSize = `clamp(100px, ${Math.max(15, 23 - Math.min(8, line.text.length / 5))}vw, 270px)`;

  const lineEl = document.createElement("div");
  lineEl.className = `lyric-line ${lineClass(line, index)}`;
  const text = document.createElement("div");
  text.className = "lyric-text";
  text.setAttribute("aria-label", line.text);
  const accents = accentSet(line.text, line.fx);
  Array.from(line.text).forEach((char, i) => {
    const span = document.createElement("span");
    span.className = "ch" + (char === " " || char === "\u3000" ? " space" : "") + (accents.has(i) ? " accent" : "");
    span.textContent = char === " " || char === "\u3000" ? "\u00a0" : char;
    span.style.setProperty("--i", String(i));
    text.appendChild(span);
  });
  lineEl.appendChild(text);
  $("#lyricStage").replaceChildren(lineEl);
  $("#translation").textContent = line.translation || "";
  $("#translation").classList.toggle("is-visible", Boolean(line.translation));
  $("#linePosition").textContent = `${pad(index + 1)} / ${pad(state.lines.length)}`;
  const chapter = state.chapters[line.chapter] || chapterAt(line.time);
  $("#chapter").textContent = chapter.label.toUpperCase();
  state.line = index;
}

function demoTime() {
  if (!state.silent) return audio.currentTime || 0;
  return clamp(state.demoBase + (state.playing ? (performance.now() - state.demoWall) / 1000 : 0), 0, state.duration);
}

function updatePlayUI() {
  const btn = $("#playBtn");
  btn.classList.toggle("is-playing", state.playing);
  btn.setAttribute("aria-label", state.playing ? "暂停" : "播放");
  $("#hudSource").textContent = state.started ? (state.silent ? "SILENT" : "AUDIO") : "READY";
}

async function start({ silent = false, seek = 0, play = true } = {}) {
  if (state.started) {
    seekTo(seek);
    if (play) await resume();
    return;
  }
  state.started = true;
  state.silent = silent;
  $("#startScreen").classList.add("is-gone");
  setTimeout(() => { $("#startScreen").style.display = "none"; }, 820);
  if (silent) {
    state.demoBase = seek;
    state.demoWall = performance.now();
    state.playing = play;
    updatePlayUI();
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      if (audio.readyState >= 1) return resolve();
      const timer = setTimeout(() => reject(new Error("metadata timeout")), 12000);
      audio.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
      audio.addEventListener("error", () => { clearTimeout(timer); reject(new Error("audio load failed")); }, { once: true });
    });
    audio.currentTime = clamp(seek, 0, state.duration - 0.01);
    if (play) { await audio.play(); state.playing = true; } else { audio.pause(); state.playing = false; }
  } catch {
    state.silent = true;
    state.demoBase = seek;
    state.demoWall = performance.now();
    state.playing = true;
    showToast("音频不可用，切换为静音预览。");
  }
  updatePlayUI();
}

async function resume() {
  if (!state.started) return;
  if (state.silent) {
    let t = demoTime();
    if (t >= state.duration) t = 0;
    state.demoBase = t;
    state.demoWall = performance.now();
    state.playing = true;
  } else {
    try { await audio.play(); state.playing = true; } catch { state.playing = false; }
  }
  updatePlayUI();
}

function pause() {
  if (state.silent) {
    state.demoBase = demoTime();
    state.playing = false;
  } else {
    audio.pause();
    state.playing = false;
  }
  updatePlayUI();
}

async function toggle() {
  if (!state.started) { await start({ silent: false, seek: 0 }); return; }
  if (state.playing) pause();
  else await resume();
}

function seekTo(seconds) {
  if (!state.started) return;
  const t = clamp(Number(seconds) || 0, 0, state.duration);
  if (state.silent) {
    state.demoBase = t;
    state.demoWall = performance.now();
  } else {
    try { audio.currentTime = t; } catch {}
  }
  state.t = t;
  updateTimeline(t);
}

function updateTimeline(t) {
  $("#currentTime").textContent = fmt(t);
  $("#timeline").value = String(t);
  $("#timeline").style.setProperty("--progress", `${(t / state.duration) * 100}%`);
}

function setClean(value) {
  app.classList.toggle("is-clean", value);
}

function showToast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => node.classList.remove("is-visible"), 3000);
}

function replayLine() {
  const index = activeIndexAt(state.t);
  seekTo(index >= 0 ? state.lines[index].time + 0.01 : 0);
}

function bind() {
  $("#startBtn").addEventListener("click", () => void start({ silent: false, seek: 0 }));
  $("#startSilentBtn").addEventListener("click", () => void start({ silent: true, seek: 0 }));
  $("#playBtn").addEventListener("click", () => void toggle());
  $("#replayBtn").addEventListener("click", replayLine);
  $("#backBtn").addEventListener("click", () => seekTo(state.t - 10));
  $("#forwardBtn").addEventListener("click", () => seekTo(state.t + 10));
  $("#chorusBtn").addEventListener("click", () => {
    const chapter = state.chapters[Math.floor(state.chapters.length / 2)];
    seekTo(chapter?.time || 0);
  });
  $("#timeline").addEventListener("input", () => seekTo(Number($("#timeline").value)));
  $("#cleanBtn").addEventListener("click", () => setClean(true));
  $("#cleanHint").addEventListener("click", () => setClean(false));
  $("#fullscreenBtn").addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  $("#fxBtn").addEventListener("click", () => $("#tonePanel").classList.toggle("is-open"));
  $("#toneClose").addEventListener("click", () => $("#tonePanel").classList.remove("is-open"));
  $("#washIntensity").addEventListener("input", (event) => {
    document.querySelector(".wash").style.opacity = String(event.target.value);
  });
  $("#ghostIntensity").addEventListener("input", (event) => {
    document.documentElement.style.setProperty("--ghost-alpha", String(event.target.value * 0.14));
  });
  $("#toneReset").addEventListener("click", () => {
    $("#washIntensity").value = "0.58";
    $("#ghostIntensity").value = "0.7";
    document.querySelector(".wash").style.opacity = "1";
    document.documentElement.style.setProperty("--ghost-alpha", "0.09");
  });
  audio.addEventListener("play", () => { state.playing = true; updatePlayUI(); });
  audio.addEventListener("pause", () => { if (!state.silent && state.started) { state.playing = false; updatePlayUI(); } });
  audio.addEventListener("ended", () => { state.playing = false; updatePlayUI(); });
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      state.duration = audio.duration;
      $("#duration").textContent = fmt(state.duration);
      $("#timeline").max = String(state.duration);
    }
  });
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) return;
    if (event.code === "Space") { event.preventDefault(); void toggle(); }
    else if (event.key === "ArrowLeft") seekTo(state.t - 5);
    else if (event.key === "ArrowRight") seekTo(state.t + 5);
    else if (event.key.toLowerCase() === "h") setClean(!app.classList.contains("is-clean"));
    else if (event.key.toLowerCase() === "l") replayLine();
    else if (event.key.toLowerCase() === "f") $("#fullscreenBtn").click();
    else if (event.key === "Escape") { $("#tonePanel").classList.remove("is-open"); setClean(false); }
  });
}

function loop() {
  requestAnimationFrame(loop);
  if (!song) return;
  if (state.started) {
    if (state.silent) {
      state.t = demoTime();
      if (state.playing && state.t >= state.duration) { state.demoBase = state.duration; state.playing = false; updatePlayUI(); }
    } else {
      state.t = audio.currentTime || 0;
    }
    const index = activeIndexAt(state.t);
    if (index !== state.line) renderLine(index);
    const chapter = chapterAt(state.t);
    $("#chapter").textContent = chapter.label.toUpperCase();
    updateTimeline(state.t);
  }
}

async function boot() {
  try {
    await load();
    bind();
    $("#loading").classList.add("is-gone");
    $("#hudSource").textContent = "READY";
    requestAnimationFrame(loop);
    const params = new URLSearchParams(location.search);
    if (params.get("autostart") === "1") {
      const silent = params.get("silent") !== "0";
      const at = Number(params.get("t") || 0);
      const paused = params.get("paused") === "1";
      start({ silent, seek: at, play: !paused });
    }
  } catch (error) {
    console.error(error);
    $("#loading").classList.add("is-gone");
    $("#startScreen").classList.add("is-gone");
    $("#fatal").hidden = false;
    $("#fatalText").textContent = error?.message || "无法加载歌曲数据。";
  }
}

window.FlatStage = {
  start: (options) => start(options || {}),
  seek: seekTo,
  play: resume,
  pause,
  toggle: () => toggle(),
  setClean,
  replayLine,
  getTime: () => state.t,
  getState: () => ({ ...state, lines: undefined }),
};

boot();
