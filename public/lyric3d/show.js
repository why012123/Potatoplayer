import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

let D = null;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const pad = (n, size = 2) => String(n).padStart(size, "0");
const fmt = (s) => {
  const value = Math.max(0, Number(s) || 0);
  return `${pad(Math.floor(value / 60))}:${pad(Math.floor(value % 60))}`;
};
const fmtCode = (s) => {
  const value = Math.max(0, Number(s) || 0);
  return `${fmt(value)}:${pad(Math.floor((value % 1) * 1000), 3)}`;
};

const app = $("#app");
const canvas = $("#stage");
const EMBED = new URLSearchParams(location.search).get("embed") === "1";
const audio = new Audio();
audio.preload = "metadata";
audio.crossOrigin = "anonymous";

const BASE_THEMES = {
  sky:   { a: 0x1c2a33, b: 0x09141b, c: 0x020609, accent: 0xa6b3b7, accent2: 0xc0a878, accent3: 0x536a73, fog: 0x03070a, bloom: 0.5 },
  cyan:  { a: 0x192830, b: 0x07131a, c: 0x020508, accent: 0x8fa9b2, accent2: 0xc0a878, accent3: 0x4b636d, fog: 0x020609, bloom: 0.55 },
  paper: { a: 0x2a2926, b: 0x11110f, c: 0x040404, accent: 0xbfb199, accent2: 0xc0a878, accent3: 0x6d6459, fog: 0x050505, bloom: 0.45 },
  white: { a: 0x25292b, b: 0x0e1214, c: 0x030506, accent: 0xb7c1c0, accent2: 0xc0a878, accent3: 0x646c6c, fog: 0x030506, bloom: 0.45 },
  sun:   { a: 0x2a211a, b: 0x110b08, c: 0x050302, accent: 0xb99465, accent2: 0xc0a878, accent3: 0x745e47, fog: 0x050403, bloom: 0.55 },
  dusk:  { a: 0x211c29, b: 0x0b0910, c: 0x030207, accent: 0x9c91a8, accent2: 0xc0a878, accent3: 0x5c5567, fog: 0x030307, bloom: 0.5 },
  box:   { a: 0x172329, b: 0x070e12, c: 0x020405, accent: 0x98abb1, accent2: 0xc0a878, accent3: 0x4c6168, fog: 0x020405, bloom: 0.5 },
  empty: { a: 0x23282a, b: 0x0c1012, c: 0x030505, accent: 0xbdc4c1, accent2: 0xc0a878, accent3: 0x686f6e, fog: 0x030505, bloom: 0.4 },
};

let THEMES = BASE_THEMES;
let COVER_PALETTE = [];
let PAPER_PALETTE = [];
let PARTICLE_PALETTE = [];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function medianCutPalette(samples, count = 6) {
  if (!samples.length) return [];
  let boxes = [samples];
  while (boxes.length < count) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (box.length < 2) continue;
      const ranges = ["r", "g", "b"].map((channel) => {
        let min = 255;
        let max = 0;
        for (const px of box) {
          min = Math.min(min, px[channel]);
          max = Math.max(max, px[channel]);
        }
        return max - min;
      });
      const score = Math.max(...ranges) * box.length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    const ranges = ["r", "g", "b"].map((channel) => {
      let min = 255;
      let max = 0;
      for (const px of box) {
        min = Math.min(min, px[channel]);
        max = Math.max(max, px[channel]);
      }
      return max - min;
    });
    const channel = ["r", "g", "b"][ranges.indexOf(Math.max(...ranges))];
    box.sort((a, b) => a[channel] - b[channel]);
    const middle = Math.floor(box.length / 2);
    boxes.splice(best, 1, box.slice(0, middle), box.slice(middle));
  }
  return boxes
    .filter((box) => box.length)
    .map((box) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const px of box) {
        r += px.r;
        g += px.g;
        b += px.b;
      }
      const n = box.length;
      return new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
    });
}

function extractCoverPalette(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 64;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(image, 0, 0, 64, 64);
        const data = g.getImageData(0, 0, 64, 64).data;
        const samples = [];
        for (let y = 0; y < 64; y += 2) {
          for (let x = 0; x < 64; x += 2) {
            const i = (y * 64 + x) * 4;
            if (data[i + 3] < 180) continue;
            const color = new THREE.Color(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
            const hsl = {};
            color.getHSL(hsl);
            if (hsl.l > 0.97) continue;
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
          }
        }
        resolve(medianCutPalette(samples, 7));
      } catch {
        resolve([]);
      }
    };
    image.onerror = () => resolve([]);
    image.src = url;
  });
}

function makeCoverThemes(palette) {
  const fallback = BASE_THEMES;
  if (!palette.length) return fallback;
  const vivid = [...palette].sort((a, b) => {
    const ah = {}; const bh = {};
    a.getHSL(ah); b.getHSL(bh);
    return bh.s * bh.l - ah.s * ah.l;
  })[0];
  const sorted = [...palette].sort((a, b) => {
    const ah = {}; const bh = {};
    a.getHSL(ah); b.getHSL(bh);
    return ah.l - bh.l;
  });
  const names = Object.keys(BASE_THEMES);
  const themes = {};
  for (let i = 0; i < names.length; i += 1) {
    const base = sorted[i % sorted.length];
    const hsl = {}; base.getHSL(hsl);
    const vividHsl = {}; vivid.getHSL(vividHsl);
    const hue = hsl.h;
    const sat = clamp01(hsl.s * 0.7);
    const accentHue = i % 3 === 0 ? vividHsl.h : (hue + 0.035 * (i % 2 ? 1 : -1) + 1) % 1;
    const accentSat = clamp01(Math.max(0.16, Math.min(0.38, vividHsl.s * 0.58)));
    const top = new THREE.Color().setHSL(hue, Math.min(0.46, sat * 0.95), 0.118 + (i % 3) * 0.012);
    const mid = new THREE.Color().setHSL(hue, Math.min(0.4, sat * 0.85), 0.062 + (i % 2) * 0.009);
    const bottom = new THREE.Color().setHSL(hue, Math.min(0.26, sat * 0.65), 0.018);
    const accent = new THREE.Color().setHSL(accentHue, accentSat, 0.6);
    const accent2 = new THREE.Color().setHSL((accentHue + 0.055) % 1, accentSat * 0.7, 0.66);
    const accent3 = new THREE.Color().setHSL((hue + 0.5) % 1, accentSat * 0.4, 0.46);
    themes[names[i]] = {
      a: top.getHex(),
      b: mid.getHex(),
      c: bottom.getHex(),
      accent: accent.getHex(),
      accent2: accent2.getHex(),
      accent3: accent3.getHex(),
      fog: bottom.getHex(),
      bloom: 0.5,
    };
  }
  return themes;
}

function applyPaletteToCurrentTheme(name) {
  const theme = THEMES[name] || THEMES.sky || BASE_THEMES.sky;
  for (const key of ["a", "b", "c", "accent", "accent2", "accent3", "fog"]) {
    themeTarget[key].setHex(theme[key]);
    themeCurrent[key].setHex(theme[key]);
  }
  themeCurrent.bloom = theme.bloom;
}

const state = {
  started: false,
  silent: false,
  playing: false,
  t: 0,
  duration: 0,
  active: -1,
  chapter: -1,
  theme: "sky",
  energy: 0.25,
  glitch: 0,
  kick: 0,
  intensity: 1,
  fx: { bloom: true, particles: true, camera: true, formations: true, wordGlow: true, audio: true },
  audioCtx: null,
  analyser: null,
  freq: null,
  wave: null,
  demoBase: 0,
  demoWall: 0,
  embed: EMBED,
  hostTime: 0,
  hostPlaying: false,
  hostAt: performance.now(),
  lastFrame: performance.now(),
  pointerX: 0,
  pointerY: 0,
  remoteBars: null,
  bass: 0.2,
  mid: 0.16,
  high: 0.1,
  bassBase: 0.12,
  lastBeatAt: 0,
  lastShots: [],
};

const themeCurrent = {
  a: new THREE.Color(THEMES.sky.a),
  b: new THREE.Color(THEMES.sky.b),
  c: new THREE.Color(THEMES.sky.c),
  accent: new THREE.Color(THEMES.sky.accent),
  accent2: new THREE.Color(THEMES.sky.accent2),
  accent3: new THREE.Color(THEMES.sky.accent3),
  fog: new THREE.Color(THEMES.sky.fog),
  bloom: THEMES.sky.bloom,
};
const themeTarget = {
  a: new THREE.Color(THEMES.sky.a),
  b: new THREE.Color(THEMES.sky.b),
  c: new THREE.Color(THEMES.sky.c),
  accent: new THREE.Color(THEMES.sky.accent),
  accent2: new THREE.Color(THEMES.sky.accent2),
  accent3: new THREE.Color(THEMES.sky.accent3),
  fog: new THREE.Color(THEMES.sky.fog),
  bloom: THEMES.sky.bloom,
};

let renderer;
let scene;
let camera;
let composer;
let bloomPass;
let finalPass;
let skyMaterial;
let boxGroup;
let boxes = [];
let papers;
let paperItems = [];
let particleSystem;
let particleUniforms;
let ringGroup;
let ringLine;
let ringWave;
let ringPositions;
let wavePositions;
let rayGroup;
let rayMaterial;
let auraGroup = new THREE.Group();
let grid;
let lineGroups = [];
let constellationGroup = null;
let constellationItems = [];
let ghostGroup = null;
let ghostItems = [];
let currentGroup = null;
let currentLine = -1;
let currentChapter = -1;
let activeFx = "bloom";
let camBase = new THREE.Vector3(0, 0, 8.4);
const cameraRig = { x: 0, y: 0, z: 9.15, tx: 0, ty: 0.08, tz: 0.7, roll: 0, ready: false };
let clockTime = 0;
const startWall = performance.now();
let raf = 0;
let toastTimer = 0;
let lastHudSecond = -1;
let introGroup = null;


const SPACE_CHARS = new Set([" ", "\u3000", "\t"]);

const fxProfiles = {
  bloom:   { height: 1.18, zSpread: 0.9, radius: 0.12, entrance: 0.82, glow: 1.2 },
  paper:   { height: 1.0, zSpread: 0.55, radius: 0.08, entrance: 0.9, glow: 0.85 },
  whisper: { height: 0.92, zSpread: 0.28, radius: 0.05, entrance: 1.15, glow: 0.65 },
  glitch:  { height: 0.96, zSpread: 0.75, radius: 0.16, entrance: 0.7, glow: 1.1 },
  drift:   { height: 1.02, zSpread: 0.55, radius: 0.1, entrance: 0.95, glow: 0.9 },
  anthem:  { height: 1.14, zSpread: 1.45, radius: 0.24, entrance: 0.62, glow: 1.3 },
  box:     { height: 0.94, zSpread: 1.1, radius: 0.14, entrance: 0.8, glow: 1.0 },
  rift:    { height: 0.9, zSpread: 1.25, radius: 0.2, entrance: 0.72, glow: 1.15 },
  shatter: { height: 0.86, zSpread: 1.0, radius: 0.2, entrance: 0.7, glow: 1.15 },
  final:   { height: 0.82, zSpread: 1.0, radius: 0.24, entrance: 0.6, glow: 1.3 },
};

function setTheme(name) {
  const t = THEMES[name] || THEMES.sky;
  state.theme = THEMES[name] ? name : "sky";
  app.dataset.theme = state.theme;
  themeTarget.a.setHex(t.a);
  themeTarget.b.setHex(t.b);
  themeTarget.c.setHex(t.c);
  themeTarget.accent.setHex(t.accent);
  themeTarget.accent2.setHex(t.accent2);
  themeTarget.accent3.setHex(t.accent3);
  themeTarget.fog.setHex(t.fog);
  themeTarget.bloom = t.bloom;
  const cssAccent = "#" + new THREE.Color(t.accent).getHexString();
  const cssAccent2 = "#" + new THREE.Color(t.accent2).getHexString();
  app.style.setProperty("--accent", cssAccent);
  app.style.setProperty("--accent-2", cssAccent2);
}

function showToast(message) {
  clearTimeout(toastTimer);
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  toastTimer = setTimeout(() => node.classList.remove("is-visible"), 3200);
}

function showError(message) {
  const error = $("#webglError");
  error.hidden = false;
  error.querySelector("span").textContent = message;
  $("#loading").classList.add("is-gone");
}

function makePaperTexture(stamp = false) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 640;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(239, 251, 255, 0.82)";
  g.fillRect(44, 38, 424, 564);
  g.strokeStyle = "rgba(25, 116, 160, 0.3)";
  g.lineWidth = 2;
  g.strokeRect(44, 38, 424, 564);
  g.strokeStyle = "rgba(42, 142, 184, 0.22)";
  g.lineWidth = 1;
  for (let y = 108; y < 584; y += 48) {
    g.beginPath();
    g.moveTo(72, y);
    g.lineTo(438, y);
    g.stroke();
  }
  g.strokeStyle = "rgba(255, 78, 145, 0.45)";
  g.beginPath();
  g.moveTo(78, 38);
  g.lineTo(78, 602);
  g.stroke();
  g.fillStyle = "rgba(11, 59, 83, 0.42)";
  g.font = '700 22px "SFMono-Regular", monospace';
  g.fillText("ANSWER / 空欄", 94, 88);
  if (stamp) {
    g.strokeStyle = "rgba(255, 75, 130, 0.72)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(365, 484, 65, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255, 75, 130, 0.8)";
    g.font = '800 42px "Hiragino Sans", sans-serif';
    g.textAlign = "center";
    g.fillText("空欄", 365, 499);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildSky() {
  const geometry = new THREE.SphereGeometry(48, 64, 48);
  skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: themeCurrent.a },
      uMid: { value: themeCurrent.b },
      uBottom: { value: themeCurrent.c },
      uAccent: { value: themeCurrent.accent },
      uAccent2: { value: themeCurrent.accent2 },
      uTime: { value: 0 },
      uEnergy: { value: 0.2 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      uniform vec3 uAccent;
      uniform vec3 uAccent2;
      uniform float uTime;
      uniform float uEnergy;
      varying vec3 vDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uBottom, uMid, smoothstep(0.04, 0.62, h));
        col = mix(col, uTop, smoothstep(0.58, 1.0, h));

        vec2 uv = vec2(atan(d.z, d.x) * 0.17, d.y * 1.7);
        float cloud = fbm(uv * vec2(3.1, 2.3) + vec2(uTime * 0.008, -uTime * 0.012));
        float band = smoothstep(0.38, 0.74, cloud) * smoothstep(0.12, 0.48, h);
        col += uAccent * band * (0.025 + uEnergy * 0.05);

        vec2 sunUV = vec2(atan(d.z, d.x) + 0.82, d.y - 0.23);
        float sun = exp(-dot(sunUV, sunUV) * 13.0);
        col += uAccent2 * sun * (0.09 + uEnergy * 0.08);

        float horizon = exp(-abs(d.y) * 28.0);
        col += uAccent * horizon * 0.04;

        float star = step(0.9982, hash(floor(uv * 420.0)));
        col += star * uAccent2 * (0.14 + uEnergy * 0.1);

        float vignette = smoothstep(1.25, 0.24, length(vec2(d.x, d.y * 0.72)));
        col *= vignette;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);
}

function buildBoxes() {
  boxGroup = new THREE.Group();
  const specs = [
    { size: [16, 10, 16], pos: [0, 0, -10], color: 0x7c8d93, opacity: 0.08, speed: 0.035 },
    { size: [10, 6.4, 10], pos: [1.2, 0.4, -5.6], color: 0x9a8c73, opacity: 0.1, speed: -0.055 },
    { size: [6.2, 3.8, 6.2], pos: [-0.8, -0.2, -2.4], color: 0x68777c, opacity: 0.11, speed: 0.07 },
  ];
  for (const spec of specs) {
    const geo = new THREE.BoxGeometry(...spec.size);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.LineSegments(edges, mat);
    line.position.set(...spec.pos);
    line.rotation.set(0.2, 0.4, -0.06);
    line.userData.spin = spec.speed;
    boxGroup.add(line);
    boxes.push(line);

    const faceMat = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: 0.006,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const face = new THREE.Mesh(geo, faceMat);
    face.position.set(...spec.pos);
    face.rotation.copy(line.rotation);
    face.userData.spin = spec.speed;
    boxGroup.add(face);
    boxes.push(face);
  }
  scene.add(boxGroup);

  grid = new THREE.GridHelper(44, 44, 0x50dff0, 0x14405c);
  grid.position.y = -4.9;
  grid.material.transparent = true;
  grid.material.opacity = 0.05;
  grid.material.depthWrite = false;
  scene.add(grid);
}

function buildPapers() {
  const matA = makePaperTexture(false);
  const matB = makePaperTexture(true);
  papers = new THREE.Group();
  const palette = PAPER_PALETTE.length
    ? PAPER_PALETTE.map((color) => color.getHex())
    : [0xc9d1d1, 0x9caeb1, 0xb9ad98, 0x8e9898, 0xa8a39a];
  for (let i = 0; i < 28; i += 1) {
    const geo = new THREE.PlaneGeometry(0.78, 1.02);
    const material = new THREE.MeshBasicMaterial({
      map: i % 5 === 0 ? matB : matA,
      transparent: true,
      opacity: 0.035 + Math.random() * 0.065,
      side: THREE.DoubleSide,
      depthWrite: false,
      color: palette[i % palette.length],
    });
    const plane = new THREE.Mesh(geo, material);
    plane.position.set(
      (Math.random() - 0.5) * 26,
      (Math.random() - 0.5) * 13,
      -24 + Math.random() * 20,
    );
    plane.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    plane.userData = {
      vy: 0.1 + Math.random() * 0.4,
      rot: (Math.random() - 0.5) * 0.25,
      phase: Math.random() * 8,
    };
    papers.add(plane);
    paperItems.push(plane);
  }
  scene.add(papers);
}

function buildConstellation() {
  // A persistent scatter of dot-matrix solids behind the lyric corridor. Folia's
  // Diorama reads as a sculpture garden around the words, not a single card:
  // these objects give the camera something to parallax against and the bloom
  // something to catch.
  constellationGroup = new THREE.Group();
  const palette = [themeTarget.accent2, themeTarget.accent3, themeTarget.accent];
  for (let i = 0; i < 40; i += 1) {
    const kind = i % 4;
    const near = i < 16;
    let geometry;
    if (kind === 0) geometry = new THREE.SphereGeometry(0.28, 10, 8);
    else if (kind === 1) geometry = new THREE.CylinderGeometry(0.18, 0.22, 1.1, 10, 2);
    else if (kind === 2) geometry = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    else geometry = new THREE.TorusGeometry(0.38, 0.09, 8, 18);
    const baseOpacity = (near ? 0.12 : 0.055) + (i % 5) * 0.018;
    const material = new THREE.MeshBasicMaterial({
      map: formationDot,
      color: palette[i % palette.length],
      transparent: true,
      opacity: baseOpacity,
      alphaTest: 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    let x = near
      ? (i % 2 === 0 ? -1 : 1) * (4.7 + Math.random() * 2.6)
      : (Math.random() - 0.5) * 24;
    if (!near && Math.abs(x) < 5.0) x += (x < 0 ? -1 : 1) * 5.0;
    const y = near ? (Math.random() - 0.5) * 8.8 : (Math.random() - 0.5) * 13;
    const z = near ? 3.2 + Math.random() * 3.0 : -4.0 - Math.random() * 19;
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const scale = near ? 1.2 + Math.random() * 2.0 : 0.4 + Math.random() * 0.95;
    mesh.scale.setScalar(scale);
    constellationGroup.add(mesh);
    constellationItems.push({
      mesh,
      baseOpacity,
      baseScale: scale,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.32,
      drift: 0.08 + Math.random() * 0.32,
      baseColor: palette[i % palette.length].clone(),
    });
  }
  scene.add(constellationGroup);
}

function buildParticles() {
  const count = 620;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const palette = PARTICLE_PALETTE.length
    ? PARTICLE_PALETTE
    : [new THREE.Color(0x91a7ad), new THREE.Color(0xb7ab93), new THREE.Color(0x687b82), new THREE.Color(0xc3c9c6)];
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 2] = -26 + Math.random() * 36;
    const color = palette[i % palette.length];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = 0.5 + Math.random() * 1.15;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  particleUniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0.2 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.7) },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: particleUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uEnergy;
      uniform float uPixelRatio;
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSeed;
      varying vec3 vColor;
      void main() {
        vec3 p = position;
        p.z = mod(p.z + uTime * (0.3 + aSeed * 0.75) + 26.0, 38.0) - 26.0;
        p.x += sin(uTime * 0.15 + aSeed * 21.0) * 0.7;
        p.y += cos(uTime * 0.12 + aSeed * 15.0) * 0.45;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        if (mv.z > -2.0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(5.5, aSize * (0.6 + uEnergy * 0.9) * uPixelRatio * (70.0 / -mv.z));
        vColor = aColor;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.05, d) * 0.12;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });
  particleSystem = new THREE.Points(geo, material);
  scene.add(particleSystem);
}

function buildRing() {
  ringGroup = new THREE.Group();
  ringGroup.position.set(0, 0, -1.8);
  const ticks = 160;
  ringPositions = new Float32Array(ticks * 2 * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
  const ringMat = new THREE.LineBasicMaterial({
    color: themeCurrent.accent,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ringLine = new THREE.LineSegments(ringGeo, ringMat);
  ringGroup.add(ringLine);

  const wavePoints = 180;
  wavePositions = new Float32Array((wavePoints + 1) * 3);
  const waveGeo = new THREE.BufferGeometry();
  waveGeo.setAttribute("position", new THREE.BufferAttribute(wavePositions, 3));
  const waveMat = new THREE.LineBasicMaterial({
    color: themeCurrent.accent2,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ringWave = new THREE.LineLoop(waveGeo, waveMat);
  ringGroup.add(ringWave);
  scene.add(ringGroup);
}

function buildAura() {
  const auraGeo = new THREE.CircleGeometry(5.4, 72);
  const auraMat = new THREE.MeshBasicMaterial({
    map: lineGlowTexture,
    transparent: true,
    opacity: 0.11,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    color: new THREE.Color(themeCurrent.accent),
  });
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.position.z = -2.5;
  aura.scale.set(1.6, 1.05, 1);
  auraGroup.add(aura);

  const shaftGeo = new THREE.PlaneGeometry(0.8, 22);
  for (let i = 0; i < 12; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      map: lineGlowTexture,
      transparent: true,
      opacity: 0.035 + Math.random() * 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      color: new THREE.Color(themeCurrent.accent2),
    });
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.z = -3.2;
    shaft.rotation.z = (i / 12) * Math.PI;
    shaft.userData.spin = (Math.random() - 0.5) * 0.03;
    auraGroup.add(shaft);
  }
  scene.add(auraGroup);
}

function buildRays() {
  rayGroup = new THREE.Group();
  rayGroup.position.z = -2;
  const positions = [];
  for (let i = 0; i < 36; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const inner = 3.8 + Math.random() * 0.7;
    const outer = inner + 1.2 + Math.random() * 5;
    positions.push(
      Math.cos(angle) * inner, Math.sin(angle) * inner, 0,
      Math.cos(angle) * outer, Math.sin(angle) * outer, 0,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  rayMaterial = new THREE.LineBasicMaterial({
    color: themeCurrent.accent2,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  rayGroup.add(new THREE.LineSegments(geo, rayMaterial));
  scene.add(rayGroup);
}

const POST_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const POST_FRAGMENT = `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uGlitch;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float ca = (0.0008 + uEnergy * 0.0012 + uGlitch * 0.008) * smoothstep(0.0, 0.75, length(center));
    float red = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
    float green = texture2D(tDiffuse, uv).g;
    float blue = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
    vec3 color = vec3(red, green, blue);

    float flicker = sin(uv.y * uResolution.y * 1.1 + uTime * 7.0) * 0.006;
    color += flicker;

    float grain = hash(uv * uResolution + uTime * 9.0) - 0.5;
    color += grain * (0.012 + uEnergy * 0.007);

    float scan = step(0.5, sin(uv.y * uResolution.y * 0.72 + uTime * 1.5));
    color *= 1.0 - scan * 0.004;

    float vignette = smoothstep(0.9, 0.28, length(center * vec2(1.0, 0.84)));
    color *= 0.55 + vignette * 0.55;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.7, 0.34);
  composer.addPass(bloomPass);
  finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTime: { value: 0 },
        uEnergy: { value: 0.2 },
        uGlitch: { value: 0 },
      },
      vertexShader: POST_VERTEX,
      fragmentShader: POST_FRAGMENT,
    }),
  );
  composer.addPass(finalPass);
  composer.addPass(new OutputPass());
}

function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(THEMES.sky.fog, 0.022);
  camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
  camBase.set(0, 0, 9.15);
  camera.position.copy(camBase);

  scene.add(new THREE.AmbientLight(0x8fa3ad, 0.55));
  const keyLight = new THREE.PointLight(0xb4c5ca, 42, 28, 2);
  keyLight.position.set(-5, 5, 4);
  scene.add(keyLight);
  const pinkLight = new THREE.PointLight(0xb9976d, 26, 22, 2);
  pinkLight.position.set(5, -2, 3);
  scene.add(pinkLight);

  buildSky();
  buildBoxes();
  // The immersive stage keeps the ground grid but no wireframe boxes around the lyrics.
  boxGroup.visible = false;
  buildPapers();
  buildConstellation();
  buildParticles();
  buildRing();
  buildRays();
  setTheme("sky");
  buildComposer();
}

function disposeLineGroup(group) {
  if (group.userData?.entries) {
    for (const entry of group.userData.entries) {
      entry.outlineTexture?.dispose?.();
      entry.fillTexture?.dispose?.();
    }
  }
  group.traverse((obj) => {
    if (obj.isMesh || obj.isLineSegments) {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat.map && mat.userData?.ownTexture) mat.map.dispose();
        mat.dispose?.();
      }
    }
  });
  scene.remove(group);
}

function hotIndexSet(text, fx) {
  const set = new Set();
  if (!text.length) return set;
  // Purely structural accenting: never tied to a particular song or lyric.
  const step = fx === "anthem" || fx === "final" ? 3 : fx === "rift" ? 5 : 9;
  set.add(0);
  for (let i = step; i < text.length; i += step) set.add(i);
  return set;
}

const glowCanvas = document.createElement("canvas");
glowCanvas.width = 512;
glowCanvas.height = 512;
{
  const g = glowCanvas.getContext("2d");
  const grd = g.createRadialGradient(256, 256, 10, 256, 256, 255);
  grd.addColorStop(0, "rgba(255,255,255,0.8)");
  grd.addColorStop(0.28, "rgba(255,255,255,0.28)");
  grd.addColorStop(0.7, "rgba(255,255,255,0.05)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
}
const lineGlowTexture = new THREE.CanvasTexture(glowCanvas);
lineGlowTexture.colorSpace = THREE.SRGBColorSpace;

function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.9)";
  for (let y = 5; y < 64; y += 10) {
    for (let x = 5; x < 64; x += 10) {
      g.beginPath();
      g.arc(x, y, 2.05, 0, Math.PI * 2);
      g.fill();
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
const formationDot = makeDotTexture();

function makeCharTexture(char, hot, outline = false) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = '800 200px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  ctx.font = font;
  const measured = ctx.measureText(char).width;
  const width = Math.max(100, Math.ceil(measured) + 82);
  const height = 300;
  c.width = width;
  c.height = height;
  const g = c.getContext("2d");
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";

  const accent = "#" + new THREE.Color(themeTarget.accent).getHexString();
  const accent2 = "#" + new THREE.Color(themeTarget.accent2).getHexString();
  if (outline) {
    g.shadowColor = accent2;
    g.shadowBlur = 10;
    g.strokeStyle = "rgba(241, 238, 228, 0.42)";
    g.lineWidth = 6;
    g.strokeText(char, width / 2, height / 2 + 9);
    g.shadowBlur = 0;
    g.strokeStyle = "rgba(250, 247, 240, 0.9)";
    g.lineWidth = 2.2;
    g.strokeText(char, width / 2, height / 2 + 9);
    const outlineTexture = new THREE.CanvasTexture(c);
    outlineTexture.colorSpace = THREE.SRGBColorSpace;
    outlineTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    outlineTexture.minFilter = THREE.LinearFilter;
    outlineTexture.generateMipmaps = true;
    return { texture: outlineTexture, width, height };
  }
  const grad = g.createLinearGradient(0, 20, 0, height - 20);
  if (hot) {
    grad.addColorStop(0, "#f1ede3");
    grad.addColorStop(0.5, accent2);
    grad.addColorStop(1, accent);
  } else {
    grad.addColorStop(0, "#f2eee5");
    grad.addColorStop(0.72, "#dedbd2");
    grad.addColorStop(1, accent);
  }

  g.shadowColor = accent;
  g.shadowBlur = 12;
  g.fillStyle = hot ? accent : "rgba(232, 228, 217, 0.92)";
  g.fillText(char, width / 2, height / 2 + 9);

  g.shadowBlur = 0;
  g.fillStyle = grad;
  g.fillText(char, width / 2, height / 2 + 9);
  g.strokeStyle = hot ? "rgba(232, 228, 217, 0.36)" : "rgba(232, 228, 217, 0.15)";
  g.lineWidth = 2;
  g.strokeText(char, width / 2, height / 2 + 9);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return { texture, width, height };
}


// ── Folia-inspired timing and staging ──────────────────────────────────────
// Folia's Diorama treats each line as a timed 3D set-piece: grapheme-level
// karaoke, a deliberate camera move, off-centre text and a formation grown
// around it. These helpers adapt that grammar to Potatoplayer's LRC-only data.
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const WORD_CHAR = /[A-Za-z0-9'’\-]/;
const WHITE = new THREE.Color(0xffffff);

function seededUnit(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hashSeed(value) {
  const str = String(value ?? "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 100000;
  return hash || 1;
}

function finalizeLineTimings(lines, fallbackDuration) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    const raw = next ? next.time - line.time : (fallbackDuration ? fallbackDuration - line.time : 6);
    line.end = line.time + clamp(raw, 0.8, 9);
  }
}

/**
 * Builds grapheme/word timings from only an LRC line timestamp. CJK glyphs
 * reveal one by one, Latin words reveal as words, and punctuation buys a
 * small breath. This is not a substitute for TTML word timing, but it gives
 * every local LRC file the same follow-the-voice vocabulary.
 */
function buildKaraokePlan(text, start, end) {
  const chars = Array.from(text);
  const revealAt = new Array(chars.length).fill(start);
  const endAt = new Array(chars.length).fill(end);
  const groups = [];
  let i = 0;
  while (i < chars.length) {
    if (SPACE_CHARS.has(chars[i])) { i += 1; continue; }
    let j = i + 1;
    if (CJK_CHAR.test(chars[i])) {
      // one CJK grapheme per unit
    } else if (WORD_CHAR.test(chars[i])) {
      while (j < chars.length && WORD_CHAR.test(chars[j])) j += 1;
    }
    const textUnit = chars.slice(i, j).join("");
    let weight = 0;
    for (const ch of textUnit) {
      if (CJK_CHAR.test(ch)) weight += 1;
      else if (WORD_CHAR.test(ch)) weight += 0.42;
      else weight += 0.88;
    }
    groups.push({
      from: i,
      to: j,
      weight: Math.max(0.42, weight),
      pause: /[、，。！？!?…,.]$/.test(textUnit) ? 0.7 : 0,
    });
    i = j;
  }
  if (!groups.length) return { revealAt, endAt };
  const span = Math.max(0.35, end - start);
  const total = groups.reduce((sum, group) => sum + group.weight + group.pause, 0) || 1;
  let cursor = 0;
  for (const group of groups) {
    const unitStart = start + (cursor / total) * span;
    const unitEnd = start + ((cursor + group.weight) / total) * span;
    for (let k = group.from; k < group.to; k += 1) {
      revealAt[k] = unitStart;
      endAt[k] = unitEnd;
    }
    cursor += group.weight + group.pause;
  }
  return { revealAt, endAt };
}

function linePlacement(index, line, shot) {
  const seed = hashSeed(`${index}:${line.text}:${shot}`);
  return {
    x: (seededUnit(seed + 1) - 0.5) * 0.9,
    y: (seededUnit(seed + 2) - 0.5) * 0.42,
    z: (seededUnit(seed + 3) - 0.5) * 0.6,
    roll: (seededUnit(seed + 4) - 0.5) * 0.055,
    yaw: (seededUnit(seed + 5) - 0.5) * 0.035,
    dir: seededUnit(seed + 6) < 0.5 ? -1 : 1,
  };
}

const SHOT_KINDS = ["pushIn", "pullBack", "orbit", "track", "crane", "hold", "swell", "spiral", "pendulum", "flyby", "arc", "float", "glide"];

function pickShot(index, line) {
  const seed = hashSeed(`${index}:${line.text}:shot`);
  const short = line.text.length <= 6;
  const long = line.text.length >= 20;
  const weights = {
    pushIn: 1 + (short ? 1.5 : 0), pullBack: 1 + (long ? 0.4 : 0), orbit: 1 + (short ? 0.8 : 0),
    track: 0.75 + (long ? 1.2 : 0), crane: 1, hold: 0.7 + (short ? 0.6 : 0),
    swell: 0.85, spiral: 0.85 + (index % 5 === 0 ? 0.8 : 0), pendulum: 0.85,
    flyby: 0.7 + (index % 7 === 0 ? 0.9 : 0), arc: 0.9, float: 0.8, glide: 0.8,
  };
  const total = SHOT_KINDS.reduce((sum, kind) => sum + (weights[kind] || 0), 0);
  let choice = "hold";
  let roll = seededUnit(seed) * total;
  for (const kind of SHOT_KINDS) {
    roll -= weights[kind] || 0;
    if (roll <= 0) { choice = kind; break; }
  }
  const previous = state.lastShots;
  if (previous.includes(choice)) {
    const pool = SHOT_KINDS.filter((kind) => !previous.includes(kind));
    if (pool.length) choice = pool[Math.floor(seededUnit(seed + 11) * pool.length) % pool.length];
  }
  state.lastShots = [choice, ...previous].slice(0, 2);
  return choice;
}

function addFormationPart(parent, items, geometry, color, x, y, z, opacity, scale = 1) {
  const material = new THREE.MeshBasicMaterial({
    color,
    map: formationDot,
    alphaTest: 0.04,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(scale);
  parent.add(mesh);
  items.push({ mesh, baseOpacity: opacity, baseScale: scale, phase: Math.random() * Math.PI * 2 });
  return mesh;
}

/** A sparse, shot-matched architectural set around the words (Folia's formation grammar). */
function createFormation(index, line, shot, stage) {
  const group = new THREE.Group();
  const items = [];
  const seed = hashSeed(`${index}:${line.text}:formation`);
  const rnd = (slot) => seededUnit(seed + slot);
  const addBox = (x, y, z, w, h, d, opacity) =>
    addFormationPart(group, items, new THREE.BoxGeometry(w, h, d), themeTarget.accent3, x, y, z, opacity);
  const addOrb = (x, y, z, size, opacity) =>
    addFormationPart(group, items, new THREE.SphereGeometry(size, 12, 8), themeTarget.accent2, x, y, z, opacity);
  const addGate = (side) => {
    addBox(side * (3.6 + rnd(side + 1) * 0.5), -0.2, -1.2, 0.07, 3.8 + rnd(side + 2) * 0.7, 0.07, 0.2);
    addBox(side * (4.8 + rnd(side + 3) * 0.4), 0.2, -4.4, 0.055, 2.8, 0.055, 0.12);
  };
  switch (shot) {
    case "pushIn":
      addGate(-1); addGate(1);
      break;
    case "track":
      for (const side of [-1, 1]) for (let j = 0; j < 3; j += 1) {
        addBox(side * (3.5 + rnd(side * 9 + j) * 0.6), -0.5 + j * 0.25, -0.8 - j * 1.6, 0.06, 2.3 - j * 0.25, 0.06, 0.15 - j * 0.03);
      }
      break;
    case "crane":
      for (let j = 0; j < 5; j += 1) {
        const a = Math.PI * (0.12 + 0.76 * (j / 4));
        addBox(Math.cos(a) * (3.2 + rnd(j) * 0.7), 2.0 + Math.sin(a) * 2.4, -1.2 - j * 0.35, 0.07, 1.2, 0.07, 0.16);
      }
      break;
    case "spiral":
      for (let j = 0; j < 7; j += 1) {
        const a = (j / 6) * Math.PI * 2.2;
        addOrb(Math.cos(a) * (3.9 + rnd(j) * 0.4), -2.0 + (j / 6) * 4.8, -1.0 - (j / 6) * 1.8, 0.12 + rnd(j + 9) * 0.08, 0.24);
      }
      break;
    case "pendulum":
      for (let j = 0; j < 4; j += 1) addBox(-3.2 + j * 2.1, 2.6 + rnd(j) * 0.6, -1.4 - j * 0.25, 0.05, 2.5 + rnd(j + 4) * 0.7, 0.05, 0.15);
      break;
    case "flyby":
      for (const side of [-1, 1]) for (let j = 0; j < 3; j += 1) {
        addBox(side * (3.8 + rnd(j) * 0.4), -0.7 + j * 0.55, -1.0 - j * 1.2, 0.055, 2.0, 0.055, 0.14);
      }
      break;
    case "pullBack":
      addOrb(-4.3, 1.0, -5.8, 0.36, 0.2); addOrb(4.3, 1.0, -5.8, 0.36, 0.2);
      addGate(-1); addGate(1);
      break;
    case "orbit":
      for (let j = 0; j < 6; j += 1) {
        const a = (j / 6) * Math.PI * 2;
        addOrb(Math.cos(a) * 4.3, Math.sin(a) * 2.3, -1.4 - rnd(j) * 1.2, 0.1 + rnd(j + 4) * 0.06, 0.25);
      }
      break;
    case "hold":
      addOrb(-3.8, -0.8, -3.2, 0.16, 0.14); addOrb(3.8, -0.8, -3.2, 0.16, 0.14);
      break;
    default:
      addOrb(-3.8, 0.8, -2.8, 0.13, 0.16); addOrb(3.8, -0.6, -3.4, 0.1, 0.13);
      break;
  }
  group.position.set(stage.x * 0.45, stage.y * 0.35, 0);
  group.userData.items = items;
  return { group, items };
}

function makeGhostTexture(text) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 512;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const font = '600 128px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  g.font = font;
  let size = 128;
  while (size > 48 && g.measureText(text).width > 1880) {
    size -= 6;
    g.font = `600 ${size}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
  }
  g.strokeStyle = "rgba(246, 241, 230, 0.5)";
  g.lineWidth = 3;
  g.strokeText(text, c.width / 2, c.height / 2 + 4);
  g.strokeStyle = "rgba(255, 252, 246, 0.18)";
  g.lineWidth = 8;
  g.strokeText(text, c.width / 2, c.height / 2 + 4);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function disposeGhosts() {
  if (!ghostGroup) return;
  for (const item of ghostItems) {
    item.mesh.geometry?.dispose?.();
    item.mesh.material?.map?.dispose?.();
    item.mesh.material?.dispose?.();
  }
  scene.remove(ghostGroup);
  ghostGroup = null;
  ghostItems = [];
}

function buildGhostLines(index) {
  disposeGhosts();
  const group = new THREE.Group();
  for (let k = 1; k <= 2; k += 1) {
    const line = D.lines[index + k];
    if (!line) continue;
    const texture = makeGhostTexture(line.text);
    const height = 1.15;
    const width = height * (2048 / 512);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: k === 1 ? 0.16 : 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
      color: new THREE.Color(themeTarget.accent2),
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(k === 1 ? -2.5 : 2.9, k === 1 ? 1.25 : -1.5, 1.1 - k * 6.4);
    mesh.rotation.z = k === 1 ? -0.035 : 0.028;
    group.add(mesh);
    ghostItems.push({ mesh, baseOpacity: material.opacity, phase: k * 1.7 });
  }
  ghostGroup = group;
  scene.add(group);
}

function createShockwave() {
  const material = new THREE.MeshBasicMaterial({
    color: themeTarget.accent2,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 64), material);
  mesh.position.z = -0.7;
  return mesh;
}

function createLineGroup(line, index) {
  const profile = fxProfiles[line.fx] || fxProfiles.bloom;
  const chars = Array.from(line.text);
  const hot = hotIndexSet(line.text, line.fx);
  const lineEnd = Number(line.end) || (D.lines[index + 1]?.time ?? line.time + 5.4);
  const karaoke = buildKaraokePlan(line.text, line.time, lineEnd);
  const shot = pickShot(index, line);
  const stage = linePlacement(index, line, shot);
  let height = 1.08;
  if (chars.length > 10) height = 0.94;
  if (chars.length > 16) height = 0.78;
  if (chars.length > 24) height = 0.66;
  if (chars.length > 34) height = 0.58;
  height *= profile.height / 1.18;
  const maxWidth = line.fx === "whisper" ? 9.6 : 8.35;
  const rowGap = height * 1.04;

  const tokens = [];
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (SPACE_CHARS.has(char)) {
      tokens.push({ char, space: true, width: height * 0.44 });
      continue;
    }
    const tex = makeCharTexture(char, hot.has(i));
    const outline = makeCharTexture(char, hot.has(i), true);
    const width = height * (tex.width / tex.height);
    tokens.push({ char, texture: tex, outline, width, space: false, index: i });
  }

  const rows = [];
  let row = [];
  let rowWidth = 0;
  for (const token of tokens) {
    if (token.space) {
      if (row.length) {
        rows.push({ tokens: row, width: rowWidth });
        row = [];
        rowWidth = 0;
      }
      continue;
    }
    if (row.length && rowWidth + token.width > maxWidth) {
      rows.push({ tokens: row, width: rowWidth });
      row = [];
      rowWidth = 0;
    }
    row.push(token);
    rowWidth += token.width;
  }
  if (row.length) rows.push({ tokens: row, width: rowWidth });

  const group = new THREE.Group();
  group.position.set(stage.x, stage.y, 1.1 + stage.z);
  group.rotation.set(0, stage.yaw, stage.roll);
  const entries = [];
  const lineGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 4.2),
    new THREE.MeshBasicMaterial({
      map: lineGlowTexture,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      color: new THREE.Color(themeTarget.accent2),
    }),
  );
  lineGlow.position.z = -0.42;
  lineGlow.scale.setScalar(1.2);
  group.add(lineGlow);

  const formation = createFormation(index, line, shot, stage);
  group.add(formation.group);
  const shock = createShockwave();
  group.add(shock);

  for (let r = 0; r < rows.length; r += 1) {
    const rowData = rows[r];
    let cursor = -rowData.width / 2;
    const y = ((rows.length - 1) / 2 - r) * rowGap;
    for (const token of rowData.tokens) {
      if (token.space) {
        cursor += token.width;
        continue;
      }
      const { texture, width, height: texHeight } = token.texture;
      const outlineTexture = token.outline.texture;
      const boxWidth = token.width;
      const boxHeight = height;
      const planeGeo = new THREE.PlaneGeometry(boxWidth, boxHeight);
      const front = new THREE.MeshBasicMaterial({
        map: outlineTexture,
        transparent: true,
        opacity: 0,
        alphaTest: 0.015,
        depthWrite: true,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      front.userData.ownTexture = true;
      const charGroup = new THREE.Group();
      const frontMesh = new THREE.Mesh(planeGeo, front);
      charGroup.add(frontMesh);

      // Instead of a rectangular glass card, offset glyph layers build a
      // shallow 3D silhouette while every transparent pixel stays empty.
      const layers = [];
      for (let d = 1; d <= 3; d += 1) {
        const layer = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          alphaTest: 0.02,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
          color: new THREE.Color(0x0b0b0e),
        });
        const mesh = new THREE.Mesh(planeGeo, layer);
        mesh.position.z = -0.04 * d;
        charGroup.add(mesh);
        layers.push(layer);
      }

      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(boxWidth * 1.22, boxHeight * 1.16),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          color: new THREE.Color(themeTarget.accent2),
        }),
      );
      glow.position.z = -0.18;
      charGroup.add(glow);

      const soul = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          color: new THREE.Color(themeTarget.accent2),
        }),
      );
      soul.position.z = -0.1;
      soul.visible = false;
      charGroup.add(soul);

      const z = (Math.random() - 0.5) * profile.zSpread;
      const target = new THREE.Vector3(cursor + boxWidth / 2, y, z);
      charGroup.position.copy(target).add(new THREE.Vector3((Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 2.2, -5 - Math.random() * 5));
      charGroup.scale.setScalar(0.55);
      charGroup.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.4);
      const targetRot = new THREE.Euler(
        (Math.random() - 0.5) * profile.radius,
        (Math.random() - 0.5) * profile.radius * 1.7,
        (Math.random() - 0.5) * profile.radius,
      );
      const entry = {
        mesh: charGroup,
        front,
        layers,
        glow,
        soul,
        fillTexture: texture,
        outlineTexture,
        filled: false,
        target,
        start: charGroup.position.clone(),
        targetRot,
        phase: Math.random() * Math.PI * 2,
        delay: token.index * (line.fx === "whisper" ? 0.035 : 0.018),
        width: boxWidth,
        height: boxHeight,
        charIndex: token.index,
        revealAt: karaoke.revealAt[token.index] ?? line.time,
        endAt: karaoke.endAt[token.index] ?? lineEnd,
        sungState: false,
      };
      entries.push(entry);
      group.add(charGroup);
      cursor += token.width;
    }
  }

  group.userData = {
    entries,
    birth: clockTime,
    fx: line.fx,
    line,
    index,
    lineGlow,
    formation,
    shock,
    stage,
    shot,
    lineEnd,
    hotX: 0,
    exiting: false,
    exitStart: 0,
    baseOpacity: line.fx === "whisper" ? 0.64 : 1,
  };
  return group;
}

function activateLine(index) {
  const line = D.lines[index];
  if (!line) return;
  if (currentGroup) {
    currentGroup.userData.exiting = true;
    currentGroup.userData.exitStart = clockTime;
    currentGroup = null;
  }
  setTheme(line.theme || "sky");
  const group = createLineGroup(line, index);
  scene.add(group);
  lineGroups.push(group);
  currentGroup = group;
  currentLine = index;
  buildGhostLines(index);
  activeFx = line.fx;
  state.kick = 1;
  state.glitch = line.fx === "glitch" ? 0.85 : ["shatter", "final"].includes(line.fx) ? 0.7 : 0.25;
  $("#translation").textContent = line.translation || "";
  $("#lineIndex").textContent = `${pad(index + 1)} / ${pad(D.lines.length)}`;
  $("#timecode").textContent = fmtCode(line.time);
  triggerRay(line.fx);
}

function triggerRay(fx) {
  if (!rayMaterial) return;
  const hit = ["anthem", "shatter", "final", "rift"].includes(fx);
  rayMaterial.opacity = hit ? 0.1 : 0.035;
  rayGroup.rotation.z = Math.random() * Math.PI;
}

function updateLineGroup(group, now, dt) {
  const data = group.userData;
  if (data.exiting) {
    const age = now - data.exitStart;
    group.position.z -= dt * 2.8;
    group.scale.multiplyScalar(1 - dt * 0.2);
    const fade = clamp(1 - age / 1.15, 0, 1);
    for (const entry of data.entries) {
      entry.front.opacity = fade * data.baseOpacity;
      for (const layer of entry.layers) layer.opacity = fade * 0.2;
      if (entry.glow) entry.glow.material.opacity = fade * 0.025;
      if (entry.soul) entry.soul.visible = false;
      entry.mesh.position.z -= dt * 1.8;
    }
    if (data.formation) {
      for (const item of data.formation.items) item.mesh.material.opacity = item.baseOpacity * fade * 0.7;
    }
    if (data.shock) {
      data.shock.material.opacity = fade * 0.06;
      data.shock.scale.setScalar(1 + (1 - fade) * 2.4);
    }
    if (age > 1.2) {
      const at = lineGroups.indexOf(group);
      if (at >= 0) lineGroups.splice(at, 1);
      disposeLineGroup(group);
    }
    return;
  }

  const age = now - data.birth;
  const duration = 0.82;
  const drift = data.fx === "shatter" || data.fx === "final" ? clamp((age - 1.25) / 3.6, 0, 1) : 0;
  const glitch = data.fx === "glitch";
  const whisper = data.fx === "whisper";
  const local = state.t - data.line.time;
  const clock = state.t;
  const energy = state.energy;
  let hotX = 0;

  for (let i = 0; i < data.entries.length; i += 1) {
    const entry = data.entries[i];
    const p = smoothstep((age - entry.delay) / duration);
    const revealAt = Number.isFinite(entry.revealAt) ? entry.revealAt : data.line.time;
    const endAt = Number.isFinite(entry.endAt) ? entry.endAt : revealAt + 0.2;
    const sungMix = clamp((clock - revealAt) / 0.24, 0, 1);
    const sung = clock >= revealAt;
    const current = clock >= revealAt && clock < endAt;
    const float = Math.sin(now * 0.9 + entry.phase) * 0.035;
    const float2 = Math.cos(now * 0.72 + entry.phase * 1.3) * 0.025;
    const beatLift = current ? state.kick * 0.045 + state.bass * 0.028 : 0;
    const target = entry.target;
    const x = lerp(entry.start.x, target.x, p) + float2 * (whisper ? 1.8 : 1);
    const y = lerp(entry.start.y, target.y, p) + float + beatLift;
    const z = lerp(entry.start.z, target.z, p) + Math.sin(now * 0.55 + entry.phase) * 0.035;
    let driftX = 0;
    let driftY = 0;
    let driftZ = 0;
    if (drift > 0) {
      const seed = Math.sin(entry.phase * 12.7);
      driftX = seed * 2.6 * drift;
      driftY = (0.5 + Math.cos(entry.phase * 7.1)) * 1.8 * drift;
      driftZ = (0.4 + Math.sin(entry.phase * 5.3)) * 1.2 * drift;
    }
    entry.mesh.position.set(x + driftX, y + driftY, z + driftZ);
    entry.mesh.rotation.x = lerp(entry.mesh.rotation.x, entry.targetRot.x + float * 0.5, 0.08);
    entry.mesh.rotation.y = lerp(entry.mesh.rotation.y, entry.targetRot.y + float2 * 0.6, 0.08);
    entry.mesh.rotation.z = lerp(entry.mesh.rotation.z, entry.targetRot.z + float * 0.3, 0.08);
    if (glitch && p > 0.2) {
      const j = (Math.sin(now * 21 + entry.phase * 3.1) + Math.sin(now * 7.7 + entry.phase)) * 0.012;
      entry.mesh.position.x += j;
    }
    const currentScale = current ? 1.055 + state.kick * 0.035 : 1;
    entry.mesh.scale.setScalar(lerp(0.55, 1, p) * (1 - drift * 0.25) * currentScale);
    const karaokeOpacity = 0.38 + 0.62 * smoothstep(sungMix);
    entry.front.opacity = p * data.baseOpacity * (1 - drift * 0.88) * karaokeOpacity;
    if (sung !== entry.filled) {
      entry.filled = sung;
      entry.front.map = sung ? entry.fillTexture : entry.outlineTexture;
      entry.front.needsUpdate = true;
    }
    entry.front.color.copy(current ? themeCurrent.accent2 : WHITE);
    if (current) entry.front.color.lerp(WHITE, 0.18);
    for (let li = 0; li < entry.layers.length; li += 1) {
      entry.layers[li].opacity = sung ? p * (0.14 - li * 0.03) * (1 - drift * 0.8) : 0;
    }
    if (entry.glow) {
      entry.glow.visible = state.fx.bloom && state.fx.wordGlow;
      const glowLevel = current ? 0.12 + state.kick * 0.06 : sung ? 0.055 : 0.035;
      entry.glow.material.opacity = p * (1 - drift * 0.9) * (glowLevel + energy * 0.028);
      entry.glow.material.color.copy(current ? themeCurrent.accent2 : themeCurrent.accent2);
    }
    if (entry.soul) {
      const since = clock - revealAt;
      const alive = sung && since >= 0 && since < 0.95;
      entry.soul.visible = alive && p > 0.35 && state.fx.bloom && state.fx.wordGlow;
      if (alive) {
        entry.soul.material.opacity = p * (1 - since / 0.95) * (0.12 + state.energy * 0.1);
        entry.soul.material.color.copy(themeCurrent.accent2);
        entry.soul.position.y = 0.03 + since * 0.22;
        entry.soul.position.z = -0.12 - since * 0.1;
        entry.soul.scale.setScalar(1 + since * 0.28);
      }
    }
    if (current) hotX = entry.mesh.position.x;
  }
  data.hotX = hotX;

  if (data.formation) {
    const form = data.formation;
    form.group.visible = state.fx.formations;
    const formLife = smoothstep((age - 0.05) / 0.9);
    form.group.rotation.y += dt * 0.055 * data.stage.dir;
    form.group.rotation.z = Math.sin(now * 0.18) * 0.018;
    const pulse = 1 + state.energy * 0.06 + state.kick * 0.025;
    for (const item of form.items) {
      item.mesh.material.opacity = item.baseOpacity * formLife * (0.9 + state.energy * 1.25);
      item.mesh.material.color.copy(item.mesh.geometry.type === "SphereGeometry" ? themeCurrent.accent2 : themeCurrent.accent3);
      item.mesh.scale.setScalar(item.baseScale * pulse * (1 + Math.sin(now * 0.7 + item.phase) * 0.012));
    }
  }

  if (data.shock) {
    const shockAge = clamp(age / 0.85, 0, 1);
    data.shock.scale.setScalar(1 + shockAge * 3.8);
    data.shock.material.opacity = (1 - shockAge) * 0.14 * data.baseOpacity;
    data.shock.material.color.copy(themeCurrent.accent2);
  }

  if (data.lineGlow) {
    data.lineGlow.visible = state.fx.bloom;
    data.lineGlow.material.opacity = (0.012 + energy * 0.018) * (0.8 + state.kick * 0.3);
    data.lineGlow.scale.setScalar(1 + energy * 0.08 + state.kick * 0.03);
  }
  group.position.x = lerp(group.position.x, data.stage.x, 0.055);
  group.position.y = lerp(group.position.y, data.stage.y, 0.055);
  group.position.z = 1.1 + data.stage.z - state.kick * 0.28;
  group.rotation.y = lerp(group.rotation.y, data.stage.yaw + state.pointerX * 0.11 + Math.sin(now * 0.23) * 0.024, 0.035);
  group.rotation.x = lerp(group.rotation.x, state.pointerY * 0.07 + Math.cos(now * 0.18) * 0.016, 0.035);
  group.rotation.z = lerp(group.rotation.z, data.stage.roll + state.pointerX * 0.012, 0.04);
}

function updateRing(now) {
  if (!ringLine) return;
  const ticks = 160;
  const attr = ringLine.geometry.attributes.position;
  const base = 4.28 + state.energy * 0.18;
  const color = themeCurrent.accent;
  ringLine.material.color.copy(color);
  ringWave.material.color.copy(themeCurrent.accent2);
  for (let i = 0; i < ticks; i += 1) {
    const angle = (i / ticks) * Math.PI * 2;
    let value;
    if (state.fx.audio && state.remoteBars?.length) {
      const bin = Math.max(0, Math.floor(Math.pow(i / ticks, 1.45) * state.remoteBars.length * 0.82));
      value = state.remoteBars[Math.min(state.remoteBars.length - 1, bin)];
    } else if (state.freq) {
      const bin = Math.max(1, Math.floor(Math.pow(i / ticks, 1.45) * state.freq.length * 0.72));
      value = state.freq[Math.min(state.freq.length - 1, bin)] / 255;
    } else {
      value = 0.12 + Math.abs(Math.sin(i * 0.27 + now * 0.9)) * 0.18;
    }
    const inner = base - 0.12;
    const outer = base + 0.06 + value * (0.42 + state.energy * 0.6) * state.intensity;
    attr.setXYZ(i * 2, Math.cos(angle) * inner, Math.sin(angle) * inner, 0);
    attr.setXYZ(i * 2 + 1, Math.cos(angle) * outer, Math.sin(angle) * outer, 0);
  }
  attr.needsUpdate = true;

  const waveCount = 180;
  const waveAttr = ringWave.geometry.attributes.position;
  if (state.analyser && state.wave) state.analyser.getByteTimeDomainData(state.wave);
  for (let i = 0; i < waveCount; i += 1) {
    const angle = (i / waveCount) * Math.PI * 2 - Math.PI / 2;
    let sample = 128;
    if (state.wave) sample = state.wave[Math.floor((i / waveCount) * state.wave.length)] || 128;
    const value = (sample - 128) / 128;
    const radius = base - 0.26 + value * 0.18;
    waveAttr.setXYZ(i, Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }
  waveAttr.needsUpdate = true;
  ringGroup.rotation.z = now * 0.016;
  ringGroup.rotation.x = Math.sin(now * 0.12) * 0.1;
  ringGroup.rotation.y = Math.cos(now * 0.1) * 0.06;
  ringGroup.scale.setScalar(1 + state.energy * 0.035);
}

function updateEnvironment(now, dt) {
  const k = 0.035;
  themeCurrent.a.lerp(themeTarget.a, k);
  themeCurrent.b.lerp(themeTarget.b, k);
  themeCurrent.c.lerp(themeTarget.c, k);
  themeCurrent.accent.lerp(themeTarget.accent, k);
  themeCurrent.accent2.lerp(themeTarget.accent2, k);
  themeCurrent.accent3.lerp(themeTarget.accent3, k);
  themeCurrent.fog.lerp(themeTarget.fog, k);
  themeCurrent.bloom = lerp(themeCurrent.bloom, themeTarget.bloom, k);

  skyMaterial.uniforms.uTop.value.copy(themeCurrent.a);
  skyMaterial.uniforms.uMid.value.copy(themeCurrent.b);
  skyMaterial.uniforms.uBottom.value.copy(themeCurrent.c);
  skyMaterial.uniforms.uAccent.value.copy(themeCurrent.accent);
  skyMaterial.uniforms.uAccent2.value.copy(themeCurrent.accent2);
  skyMaterial.uniforms.uTime.value = now;
  skyMaterial.uniforms.uEnergy.value = state.energy;
  scene.fog.color.copy(themeCurrent.fog);

  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    box.rotation.y += box.userData.spin * dt;
    box.rotation.x += box.userData.spin * 0.32 * dt;
    box.rotation.z += box.userData.spin * 0.18 * dt;
    const pulse = 1 + Math.sin(now * 0.44 + i) * 0.012 + state.energy * 0.018;
    box.scale.setScalar(pulse);
    if (box.material) {
      box.material.color.copy(i % 2 === 0 ? themeCurrent.accent : themeCurrent.accent3);
      if (box.type === "LineSegments") box.material.opacity = 0.1 + state.energy * 0.2;
      else box.material.opacity = 0.01 + state.energy * 0.012;
    }
  }
  grid.rotation.y += dt * 0.004;
  grid.material.opacity = 0.1 + state.energy * 0.12;

  for (const plane of paperItems) {
    plane.position.z += dt * (plane.userData.vy + state.energy * 0.55);
    plane.position.y += Math.sin(now * 0.5 + plane.userData.phase) * dt * 0.025;
    plane.rotation.z += plane.userData.rot * dt;
    plane.rotation.y += plane.userData.rot * 0.55 * dt;
    if (plane.position.z > -2.5) {
      plane.position.z = -27;
      plane.position.x = (Math.random() - 0.5) * 26;
      plane.position.y = (Math.random() - 0.5) * 13;
    }
  }

  if (ghostGroup) {
    ghostGroup.visible = state.fx.wordGlow !== false;
    for (const item of ghostItems) {
      item.mesh.material.opacity = item.baseOpacity * (0.7 + state.energy * 0.7);
      item.mesh.material.color.copy(themeCurrent.accent2);
      item.mesh.position.y += Math.sin(now * 0.24 + item.phase) * dt * 0.025;
    }
    ghostGroup.position.z = -state.energy * 0.25;
  }

  if (constellationGroup) {
    constellationGroup.visible = state.fx.formations;
    for (const item of constellationItems) {
      const mesh = item.mesh;
      mesh.rotation.x += item.spin * dt;
      mesh.rotation.y += item.spin * 1.35 * dt;
      mesh.rotation.z += item.spin * 0.65 * dt;
      mesh.position.z += item.drift * dt * (0.45 + state.energy);
      mesh.position.y += Math.sin(now * 0.3 + item.phase) * dt * 0.05;
      if (mesh.position.z > -2.0) mesh.position.z = -23;
      mesh.scale.setScalar(item.baseScale * (1 + Math.sin(now * 0.5 + item.phase) * 0.018 + state.energy * 0.05));
      mesh.material.opacity = item.baseOpacity * (0.55 + state.energy * 0.9);
      mesh.material.color.copy(item.baseColor).lerp(themeCurrent.accent2, 0.28);
    }
  }

  particleUniforms.uTime.value = now;
  particleUniforms.uEnergy.value = state.energy;
  particleSystem.visible = state.fx.particles;

  rayMaterial.opacity = Math.max(0, rayMaterial.opacity - dt * 0.65);
  rayGroup.rotation.z += dt * 0.04;

  for (const child of auraGroup.children) {
    if (child.userData.spin) child.rotation.z += child.userData.spin * dt;
    if (child.material) {
      child.material.color.copy(themeCurrent.accent2);
      child.material.opacity = (child.geometry.type === "CircleGeometry" ? 0.07 : 0.022) + state.energy * 0.06;
    }
  }
  auraGroup.rotation.z += dt * 0.008;
  updateRing(now);
}

// ── audio + timeline ───────────────────────────────────────────────────────
function activeIndexAt(t) {
  let lo = 0;
  let hi = D.lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (D.lines[mid].time <= t + 0.035) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function chapterAt(t) {
  let result = D.chapters[0];
  for (const chapter of D.chapters) {
    if (t >= chapter.time) result = chapter;
  }
  return result;
}

function demoTime() {
  if (!state.silent) return audio.currentTime || 0;
  const elapsed = state.playing ? (performance.now() - state.demoWall) / 1000 : 0;
  return clamp(state.demoBase + elapsed, 0, state.duration);
}

async function setupAudio() {
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio is not available.");
    state.audioCtx = new Ctx();
    const source = state.audioCtx.createMediaElementSource(audio);
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    state.analyser.smoothingTimeConstant = 0.82;
    state.freq = new Uint8Array(state.analyser.frequencyBinCount);
    state.wave = new Uint8Array(state.analyser.fftSize);
    source.connect(state.analyser);
    state.analyser.connect(state.audioCtx.destination);
  }
  if (state.audioCtx.state === "suspended") await state.audioCtx.resume();
  audio.volume = Number($("#volume").value);
  if (audio.readyState < 1) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Audio metadata timed out.")), 12000);
      audio.addEventListener("loadedmetadata", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      audio.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Audio could not be loaded."));
      }, { once: true });
    });
  }
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    state.duration = audio.duration;
    $("#timeline").max = String(state.duration);
    $("#duration").textContent = fmt(state.duration);
  }
}

function hideStart() {
  $("#startScreen").classList.add("is-gone");
  setTimeout(() => { $("#startScreen").style.display = "none"; }, 820);
}

async function start({ silent = false, seek = 0, play = true } = {}) {
  if (state.started) {
    seekTo(seek);
    if (play) await resume();
    return;
  }
  state.started = true;
  state.silent = silent;
  hideStart();
  $("#stageStatusText").textContent = silent ? "SILENT 3D PREVIEW" : "AUDIO REACTIVE / 3D STAGE";
  $("#hudSource").textContent = silent ? "SILENT" : "AUDIO";

  if (silent) {
    state.demoBase = seek;
    state.demoWall = performance.now();
    state.playing = play;
    updatePlayUI();
    return;
  }

  try {
    await setupAudio();
    audio.currentTime = clamp(seek, 0, state.duration - 0.01);
    if (play) {
      await audio.play();
      state.playing = true;
    } else {
      audio.pause();
      state.playing = false;
    }
  } catch (reason) {
    console.warn(reason);
    state.silent = true;
    state.demoBase = seek;
    state.demoWall = performance.now();
    state.playing = true;
    $("#startNote").textContent = "Audio could not load. Use the silent visual preview or start the local server.";
    showToast("Audio unavailable — switching to the silent 3D preview.");
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
    try {
      await audio.play();
      state.playing = true;
    } catch {
      state.playing = false;
    }
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
  if (!state.started) {
    await start({ silent: false, seek: 0 });
    return;
  }
  if (state.playing) pause();
  else await resume();
}

function seekTo(seconds) {
  const t = clamp(Number(seconds) || 0, 0, state.duration);
  if (!state.started) return;
  if (state.silent) {
    state.demoBase = t;
    state.demoWall = performance.now();
  } else {
    try {
      audio.currentTime = t;
    } catch {
      // metadata may not be ready
    }
  }
  state.t = t;
  updateTimeline(t);
}

function updatePlayUI() {
  const btn = $("#playBtn");
  btn.classList.toggle("is-playing", state.playing);
  btn.setAttribute("aria-label", state.playing ? "暂停" : "播放");
  $("#hudSource").textContent = state.started ? (state.silent ? "SILENT" : "AUDIO") : "READY";
}

function updateTimeline(t) {
  const current = $("#currentTime");
  current.textContent = fmt(t);
  const input = $("#timeline");
  input.value = String(t);
  input.style.setProperty("--progress", `${(t / state.duration) * 100}%`);
  $("#timecode").textContent = fmtCode(t);
}

function updateChapter(t) {
  const chapter = chapterAt(t);
  const index = D.chapters.indexOf(chapter);
  if (index === currentChapter) return;
  currentChapter = index;
  $("#chapterNumber").textContent = pad(index + 1);
  $("#chapterName").textContent = chapter.label.toUpperCase();
  $("#hudSection").textContent = `SECTION ${pad(index + 1)} / ${chapter.label.toUpperCase()}`;
  if (!currentGroup) setTheme(chapter.theme);
}

function updateEnvironmentMusic(dt, now) {
  state.kick = Math.max(0, state.kick - dt * 2.3);
  state.glitch = Math.max(0, state.glitch - dt * 2.2);
  let target = 0.2;
  if (state.analyser && state.freq) {
    state.analyser.getByteFrequencyData(state.freq);
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let i = 1; i < Math.min(18, state.freq.length); i += 1) low += state.freq[i];
    for (let i = 18; i < Math.min(64, state.freq.length); i += 1) mid += state.freq[i];
    for (let i = 64; i < state.freq.length; i += 1) high += state.freq[i];
    state.bass = clamp(low / Math.max(1, 17) / 255, 0, 1);
    state.mid = clamp(mid / Math.max(1, 46) / 255, 0, 1);
    state.high = clamp(high / Math.max(1, state.freq.length - 64) / 255, 0, 1);
    target = clamp(state.bass * 0.62 + state.mid * 0.28 + state.high * 0.1, 0, 1);
  } else if (state.fx.audio && state.remoteBars?.length) {
    const bars = state.remoteBars;
    const span = (from, to) => {
      let sum = 0;
      let count = 0;
      for (let i = from; i < Math.min(to, bars.length); i += 1) { sum += bars[i]; count += 1; }
      return count ? sum / count : 0;
    };
    const bass = span(0, 8);
    const mid = span(8, 28);
    const high = span(28, 48);
    state.bass = lerp(state.bass, bass, 0.3);
    state.mid = lerp(state.mid, mid, 0.3);
    state.high = lerp(state.high, high, 0.3);
    target = clamp(bass * 0.58 + mid * 0.28 + high * 0.14, 0, 1);
    state.bassBase = lerp(state.bassBase, state.bass, 0.025);
    const nowMs = performance.now();
    if (state.playing && state.bass > Math.max(0.08, state.bassBase + 0.045) && nowMs - state.lastBeatAt > 190) {
      state.lastBeatAt = nowMs;
      state.kick = Math.min(1, 0.65 + (state.bass - state.bassBase) * 3.2);
    }
  } else {
    target = 0.2 + Math.abs(Math.sin(state.t * 1.7)) * 0.18;
    state.bass = lerp(state.bass, target * 0.75, 0.1);
    state.mid = lerp(state.mid, target * 0.45, 0.1);
    state.high = lerp(state.high, target * 0.22, 0.1);
  }
  state.energy = lerp(state.energy, target, state.fx.audio && state.remoteBars?.length ? 0.2 : 0.15);
  state.energy = clamp(state.energy, 0, 1.1);
  updateEnvironment(now, dt);
  /* The direct render path keeps colour management stable. Glow is rendered
     in-scene through additive text halos and the line aura. */
}

function resolveCameraShot(shot, p, dir, hotX, move) {
  const e = smoothstep(p);
  let x = 0;
  let y = 0.08;
  let z = 9.15;
  let roll = 0;
  switch (shot) {
    case "pushIn":
      z = 9.15 - 1.35 * e;
      y = 0.08 + 0.18 * e;
      break;
    case "pullBack":
      z = 8.15 + 1.7 * e;
      y = 0.08 + 0.48 * e;
      break;
    case "orbit":
      x = Math.sin((2 * e - 1) * 0.72) * 1.9;
      z = 8.95 - 0.45 * Math.cos((2 * e - 1) * 0.72);
      y = 0.22;
      roll = -x * 0.012;
      break;
    case "track":
      x = hotX * 0.24;
      z = 8.7;
      y = 0.12;
      break;
    case "crane":
      y = -1.15 + 2.35 * e;
      z = 8.95;
      roll = (e - 0.5) * 0.018;
      break;
    case "hold":
      y = 0.08 + 0.18 * Math.sin(Math.PI * e);
      z = 9.15;
      break;
    case "swell":
      x = Math.sin(e * 0.62) * 1.0;
      y = 0.08 + 1.45 * e;
      z = 8.85 + 0.75 * e;
      break;
    case "spiral":
      x = Math.sin((2 * e - 1) * 0.72) * 1.6;
      y = -0.7 + 2.2 * e;
      z = 8.85;
      roll = x * 0.02;
      break;
    case "pendulum":
      x = dir * Math.sin((2 * e - 1) * 0.58) * 1.45;
      y = 0.45 - 0.62 * Math.sin(Math.PI * e);
      z = 8.95;
      roll = -x * 0.024;
      break;
    case "flyby":
      x = dir * (2.25 - 4.5 * e);
      z = 8.0 + 0.28 * Math.sin(Math.PI * e);
      y = 0.12;
      roll = -dir * 0.018 * Math.sin(Math.PI * e);
      break;
    case "arc":
      x = dir * Math.sin(Math.PI * e) * 1.45;
      y = 0.08 + 0.58 * Math.sin(Math.PI * e);
      z = 8.95;
      roll = -x * 0.012;
      break;
    case "float":
      x = 0.35 * Math.sin(2 * Math.PI * e);
      y = 0.3 + 0.42 * Math.sin(2 * Math.PI * e);
      z = 9.0;
      break;
    case "glide":
      x = dir * 0.55 * e;
      y = 0.08 + 1.35 * e;
      z = 9.0 - 0.6 * e;
      break;
    default:
      break;
  }
  const m = clamp(move, 0, 1.8);
  return {
    x: x * m,
    y: 0.08 + (y - 0.08) * m,
    z: 9.15 + (z - 9.15) * m,
    roll: roll * m,
  };
}

function updateCamera(now, dt) {
  if (!camera) return;
  const t = state.t;
  const data = currentGroup?.userData || null;
  const line = data?.line || null;
  const stage = data?.stage || { x: 0, y: 0, z: 0, dir: 1 };
  const shot = data?.shot || "hold";
  const span = line ? Math.max(0.8, (data.lineEnd || line.time + 4) - line.time) : 1;
  const p = line ? clamp((t - line.time) / span, 0, 1) : 0;
  const drift = state.fx.camera ? 1 : 0;
  const shotPose = resolveCameraShot(shot, p, stage.dir, data?.hotX || 0, drift * state.intensity);
  const px = state.pointerX * drift;
  const py = state.pointerY * drift;
  const targetX = shotPose.x + stage.x * 0.2 + Math.sin(t * 0.17 + 0.4) * 0.16 * drift + px * 0.5;
  const targetY = shotPose.y + stage.y * 0.2 + Math.cos(t * 0.14) * 0.1 * drift + py * 0.28;
  const targetZ = shotPose.z + Math.sin(t * 0.12) * 0.1 * drift + state.energy * 0.08;
  const lookX = stage.x * 0.62 + (data?.hotX || 0) * 0.13 + px * 0.12;
  const lookY = stage.y * 0.5 + py * 0.07;
  const lambda = state.fx.camera ? 3.4 : 1.15;
  if (!cameraRig.ready) {
    cameraRig.x = targetX; cameraRig.y = targetY; cameraRig.z = targetZ;
    cameraRig.tx = lookX; cameraRig.ty = lookY; cameraRig.tz = 0.7;
    cameraRig.roll = shotPose.roll; cameraRig.ready = true;
  } else {
    const k = 1 - Math.exp(-dt * lambda);
    cameraRig.x = lerp(cameraRig.x, targetX, k);
    cameraRig.y = lerp(cameraRig.y, targetY, k);
    cameraRig.z = lerp(cameraRig.z, targetZ, k);
    cameraRig.tx = lerp(cameraRig.tx, lookX, k * 1.15);
    cameraRig.ty = lerp(cameraRig.ty, lookY, k * 1.15);
    cameraRig.tz = lerp(cameraRig.tz, 0.7, k);
    cameraRig.roll = lerp(cameraRig.roll, shotPose.roll, k);
  }
  const shake = state.fx.camera ? (state.energy * 0.012 + state.kick * 0.04) * state.intensity : 0;
  const sx = Math.sin(now * 38.7) * shake;
  const sy = Math.cos(now * 41.3) * shake;
  camera.position.set(cameraRig.x + sx, cameraRig.y + sy, cameraRig.z - state.kick * 0.3);
  camera.lookAt(cameraRig.tx, cameraRig.ty, cameraRig.tz);
  camera.rotateZ(cameraRig.roll + Math.sin(t * 0.1) * 0.012 + px * 0.012);
}

function animate(nowMs) {
  raf = requestAnimationFrame(animate);
  const dt = Math.min(0.05, (nowMs - state.lastFrame) / 1000 || 0.016);
  state.lastFrame = nowMs;
  clockTime = (nowMs - startWall) / 1000;

  if (state.started) {
    if (state.embed) {
      state.t = state.hostTime + (state.hostPlaying ? (performance.now() - state.hostAt) / 1000 : 0);
      state.playing = state.hostPlaying;
    } else if (state.silent) {
      state.t = demoTime();
      if (state.playing && state.t >= state.duration) {
        state.demoBase = state.duration;
        state.playing = false;
        updatePlayUI();
      }
    } else {
      state.t = audio.currentTime || 0;
      if (audio.ended) state.playing = false;
    }
    state.t = clamp(state.t, 0, state.duration);
    const idx = activeIndexAt(state.t);
    if (idx !== currentLine) {
      if (idx >= 0) {
        activateLine(idx);
      } else if (currentGroup) {
        currentGroup.userData.exiting = true;
        currentGroup.userData.exitStart = clockTime;
        currentGroup = null;
        currentLine = -1;
      }
    }
    updateChapter(state.t);
    updateTimeline(state.t);
    if (state.t - lastHudSecond > 1) lastHudSecond = state.t;
  }

  updateCamera(nowMs / 1000, dt);
  updateEnvironmentMusic(dt, nowMs / 1000);
  for (const group of [...lineGroups]) updateLineGroup(group, clockTime, dt);
  if (currentGroup) currentGroup.visible = true;

  if (composer) {
    if (bloomPass) {
      bloomPass.enabled = state.fx.bloom;
      bloomPass.strength = state.fx.bloom ? 0.42 + state.energy * 0.22 + state.kick * 0.06 : 0;
    }
    if (finalPass) {
      finalPass.uniforms.uTime.value = nowMs / 1000;
      finalPass.uniforms.uEnergy.value = state.energy;
      finalPass.uniforms.uGlitch.value = state.glitch * 0.45;
    }
    composer.render();
  } else if (renderer) {
    renderer.render(scene, camera);
  }
}

// ── UI bindings ────────────────────────────────────────────────────────────
function buildChapterMarks() {
  const wrap = $("#chapterMarks");
  wrap.replaceChildren();
  for (const chapter of D.chapters) {
    const mark = document.createElement("i");
    mark.className = "chapter-mark-tick";
    mark.style.left = `${(chapter.time / state.duration) * 100}%`;
    mark.dataset.label = chapter.label.toUpperCase();
    mark.title = `${chapter.label} · ${fmt(chapter.time)}`;
    wrap.appendChild(mark);
  }
}

function setClean(value) {
  app.classList.toggle("is-clean", value);
  $$(".mode-btn").forEach((btn) => {
    const active = (btn.dataset.ui === "clean") === value;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  if (value) openFx(false);
}

function openFx(value) {
  const next = typeof value === "boolean" ? value : !$("#fxPanel").classList.contains("is-open");
  $("#fxPanel").classList.toggle("is-open", next);
  $("#fxBtn").classList.toggle("is-active", next);
}

function replayLine() {
  if (!state.started) return;
  const idx = activeIndexAt(state.t);
  seekTo(idx >= 0 ? D.lines[idx].time + 0.01 : 0);
}

function updateFxFromUI() {
  state.fx.bloom = $("#fxBloom").checked;
  state.fx.particles = $("#fxParticles").checked;
  state.fx.camera = $("#fxCamera").checked;
  state.intensity = Number($("#fxIntensity").value);
  $("#fxIntensityValue").textContent = state.intensity.toFixed(1);
  if (particleSystem) particleSystem.visible = state.fx.particles;
}

function resetFx() {
  $("#fxBloom").checked = true;
  $("#fxParticles").checked = true;
  $("#fxCamera").checked = true;
  $("#fxIntensity").value = "1";
  updateFxFromUI();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
  else document.exitFullscreen?.().catch(() => undefined);
}

function bindUI() {
  $("#startBtn").addEventListener("click", () => void start({ silent: false, seek: 0 }));
  $("#startChorusBtn").addEventListener("click", () => void start({ silent: false, seek: 52.207 }));
  $("#startSilentBtn").addEventListener("click", () => void start({ silent: true, seek: 0 }));
  $("#playBtn").addEventListener("click", () => void toggle());
  $("#replayBtn").addEventListener("click", replayLine);
  $("#backBtn").addEventListener("click", () => seekTo(state.t - 10));
  $("#forwardBtn").addEventListener("click", () => seekTo(state.t + 10));
  $("#chorusBtn").addEventListener("click", () => seekTo(52.207));
  $("#timeline").addEventListener("input", () => seekTo(Number($("#timeline").value)));
  $("#volume").addEventListener("input", () => {
    audio.volume = Number($("#volume").value);
    audio.muted = false;
  });
  $("#muteBtn").addEventListener("click", () => {
    audio.muted = !audio.muted;
    showToast(audio.muted ? "Muted." : "Sound on.");
  });
  $$(".mode-btn").forEach((btn) => btn.addEventListener("click", () => setClean(btn.dataset.ui === "clean")));
  $("#cleanBtn").addEventListener("click", () => setClean(true));
  $("#cleanHint").addEventListener("click", () => setClean(false));
  $("#fxBtn").addEventListener("click", () => openFx());
  $("#fxClose").addEventListener("click", () => openFx(false));
  $("#fxBloom").addEventListener("change", updateFxFromUI);
  $("#fxParticles").addEventListener("change", updateFxFromUI);
  $("#fxCamera").addEventListener("change", updateFxFromUI);
  $("#fxIntensity").addEventListener("input", updateFxFromUI);
  $("#fxReplay").addEventListener("click", replayLine);
  $("#fxChorus").addEventListener("click", () => seekTo(52.207));
  $("#fxClean").addEventListener("click", () => { setClean(true); openFx(false); });
  $("#fxReset").addEventListener("click", resetFx);
  $("#fullscreenBtn").addEventListener("click", toggleFullscreen);
  $("#stage").addEventListener("pointerdown", (event) => {
    if (event.button === 0) void toggle();
  });

  $$(".fx-cues button").forEach((button) => {
    button.addEventListener("click", () => seekTo(Number(button.dataset.cue)));
  });

  window.addEventListener("pointermove", (event) => {
    state.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    state.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.setSize(window.innerWidth, window.innerHeight);
    finalPass?.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    if (particleUniforms) particleUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.7);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) return;
    if (event.code === "Space") {
      event.preventDefault();
      void toggle();
    } else if (event.key === "ArrowLeft") {
      seekTo(state.t - 5);
    } else if (event.key === "ArrowRight") {
      seekTo(state.t + 5);
    } else if (event.key.toLowerCase() === "h") {
      setClean(!app.classList.contains("is-clean"));
    } else if (event.key.toLowerCase() === "f") {
      toggleFullscreen();
    } else if (event.key.toLowerCase() === "l") {
      replayLine();
    } else if (event.key === "Escape") {
      openFx(false);
    }
  });

  audio.addEventListener("play", () => { state.playing = true; updatePlayUI(); });
  audio.addEventListener("pause", () => {
    if (!state.silent && state.started) { state.playing = false; updatePlayUI(); }
  });
  audio.addEventListener("ended", () => { state.playing = false; updatePlayUI(); });
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      state.duration = audio.duration;
      $("#timeline").max = String(state.duration);
      $("#duration").textContent = fmt(state.duration);
    }
  });
  audio.addEventListener("error", () => {
    $("#startNote").textContent = "Audio could not load. Start serve.py, or use the silent preview.";
  });
}

function parseLrc(raw) {
  const out = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    if (!match) continue;
    const at = Number(match[1]) * 60 + Number(match[2]);
    const text = match[3].trim();
    if (text) out.push({ time: Math.round(at * 1000) / 1000, text });
  }
  return out;
}

function isCreditLine(text, time) {
  return time < 5 && /作词|作曲|编曲|lyric|music|arrange|mixing|master/i.test(text);
}

function classifyFx(text, index, total) {
  if (index === total - 1) return "final";
  if (text.length <= 4) return "slash";
  if (text.length > 30) return "whisper";
  if (index % 7 === 0) return "glitch";
  if (index % 5 === 0) return "anthem";
  if (index % 3 === 0) return "rift";
  if (index % 2 === 0) return "paper";
  return "bloom";
}

function buildSongData(song) {
  const raw = parseLrc(song.lrc);
  const trans = new Map(parseLrc(song.translation).map((line) => [line.time, line.text]));
  const rows = raw.filter((line) => !isCreditLine(line.text, line.time));
  if (!rows.length) throw new Error("This track has no timed lyrics.");
  const themeCycle = ["sky", "cyan", "paper", "white", "sun", "dusk", "box", "empty"];
  const count = Math.min(8, Math.max(1, Math.ceil(rows.length / 4)));
  const size = Math.ceil(rows.length / count);
  const chapters = [];
  for (let i = 0; i < count; i += 1) {
    const first = rows[i * size];
    if (!first) continue;
    chapters.push({ time: first.time, label: `MOVEMENT ${pad(i + 1)}`, theme: themeCycle[i % themeCycle.length] });
  }
  const lines = rows.map((line, index) => {
    const chapter = [...chapters].reverse().find((item) => line.time >= item.time) || chapters[0];
    return {
      time: line.time,
      text: line.text,
      translation: trans.get(line.time) || "",
      theme: chapter.theme,
      fx: classifyFx(line.text, index, rows.length),
    };
  });
  finalizeLineTimings(lines, Number(song.duration) || 0);
  const fullTitle = String(song.title || "Untitled").trim();
  const bracket = fullTitle.match(/^(.*?)\s*[（(]([^()（）]+)[)）]\s*$/);
  const displayTitle = (bracket ? bracket[1] : fullTitle).trim();
  return {
    id: song.id,
    title: fullTitle,
    displayTitle,
    titleExtra: bracket ? bracket[2].trim() : "",
    artist: song.artist,
    album: song.album || "",
    duration: Number(song.duration) || lines[lines.length - 1].time + 8,
    audio: `/api/audio?id=${encodeURIComponent(song.id)}`,
    cover: `/api/cover?id=${encodeURIComponent(song.id)}`,
    lines,
    chapters,
  };
}

function fillPage(song, tracks) {
  document.title = `${song.displayTitle} — 3D Lyric Stage`;
  $("#startTitle").textContent = song.displayTitle;
  $("#startRoman").textContent = (song.album || song.titleExtra || "3D LYRIC STAGE").toUpperCase();
  $("#startMeta").textContent = `${song.artist}${song.titleExtra ? ` · ${song.titleExtra}` : ""} · ${fmt(song.duration)}`;
  $("#hudTitle").textContent = song.displayTitle;
  $("#hudArtist").textContent = song.artist;
  $("#chapterMark").textContent = song.artist;
  $("#duration").textContent = fmt(song.duration);
  $("#timeline").max = String(song.duration);
  $("#startCover").src = song.cover;
  $("#hudCover").src = song.cover;
  $("#startBg").style.backgroundImage = `url("${song.cover}")`;
  const select = $("#trackSelect");
  select.replaceChildren();
  for (const track of tracks) {
    if (!track.hasLyrics) continue;
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = `${track.artist} — ${track.title}`;
    if (track.id === song.id) option.selected = true;
    select.appendChild(option);
  }
}

async function loadTrack() {
  const params = new URLSearchParams(window.location.search);
  const list = await fetch("/api/tracks").then((response) => {
    if (!response.ok) throw new Error("Could not read the library.");
    return response.json();
  });
  const tracks = (list.tracks || []).filter((track) => track.hasLyrics);
  if (!tracks.length) throw new Error("No tracks with timed lyrics were found.");
  const requested = params.get("track");
  const selected = tracks.find((track) => track.id === requested) || tracks[0];
  if (selected.id !== requested) {
    params.set("track", selected.id);
    history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
  }
  const response = await fetch(`/api/song?id=${encodeURIComponent(selected.id)}`);
  if (!response.ok) throw new Error("Could not load the selected track.");
  const song = await response.json();
  D = buildSongData(song);
  COVER_PALETTE = await extractCoverPalette(D.cover);
  if (COVER_PALETTE.length) {
    THEMES = makeCoverThemes(COVER_PALETTE);
    PAPER_PALETTE = COVER_PALETTE.map((color) => color.clone().lerp(new THREE.Color(0x9b9b95), 0.46));
    PARTICLE_PALETTE = COVER_PALETTE.slice(0, 4).map((color) => color.clone().lerp(new THREE.Color(0x9a9b98), 0.35));
  } else {
    THEMES = BASE_THEMES;
  }
  applyPaletteToCurrentTheme(D.chapters[0]?.theme || "sky");
  state.duration = D.duration;
  audio.src = D.audio;
  audio.load();
  fillPage(D, tracks);
  $("#trackSelect").addEventListener("change", (event) => {
    const next = new URL(location.href);
    next.searchParams.set("track", event.target.value);
    location.href = next.toString();
  });
  return D;
}

function buildHostSong(payload) {
  const rows = (payload.lines || [])
    .map((line) => ({ time: Number(line.time) || 0, text: String(line.text || "").trim(), translation: String(line.translation || "") }))
    .filter((line) => line.text);
  if (!rows.length) throw new Error("No timed lyrics.");
  const themes = ["sky", "cyan", "paper", "white", "sun", "dusk", "box", "empty"];
  const count = Math.min(8, Math.max(1, Math.ceil(rows.length / 4)));
  const size = Math.ceil(rows.length / count);
  const chapters = [];
  for (let i = 0; i < count; i += 1) {
    const first = rows[i * size];
    if (!first) continue;
    chapters.push({ time: first.time, label: `MOVEMENT ${pad(i + 1)}`, theme: themes[i % themes.length] });
  }
  const lines = rows.map((row, index) => {
    const chapter = [...chapters].reverse().find((item) => row.time >= item.time) || chapters[0];
    return {
      time: row.time,
      text: row.text,
      translation: row.translation,
      theme: chapter.theme,
      fx: classifyFx(row.text, index, rows.length),
    };
  });
  finalizeLineTimings(lines, Number(payload.duration) || 0);
  return {
    title: payload.title || "Untitled",
    artist: payload.artist || "",
    duration: Number(payload.duration) || lines[lines.length - 1].time + 8,
    lines,
    chapters,
  };
}

function applyHostPalette(palette) {
  if (!palette || !palette.primary) return;
  try {
    COVER_PALETTE = [new THREE.Color(palette.primary), new THREE.Color(palette.secondary || palette.primary)];
    document.documentElement.style.setProperty("--embed-a", palette.primary);
    document.documentElement.style.setProperty("--embed-b", palette.secondary || palette.primary);
    THEMES = makeCoverThemes(COVER_PALETTE);
    PAPER_PALETTE = COVER_PALETTE.map((color) => color.clone().lerp(new THREE.Color(0x9b9b95), 0.46));
    PARTICLE_PALETTE = COVER_PALETTE.slice(0, 2).map((color) => color.clone().lerp(new THREE.Color(0x9a9b98), 0.35));
    applyPaletteToCurrentTheme(D?.chapters?.[0]?.theme || "sky");
  } catch (error) {
    console.warn("[lyric3d] palette", error);
  }
}

function onHostMessage(event) {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "lyric3d:init") {
    try {
      for (const group of [...lineGroups]) disposeLineGroup(group);
      lineGroups = [];
      currentGroup = null;
      currentLine = -1;
      D = buildHostSong(data.payload || {});
      state.duration = D.duration;
      state.embed = true;
      state.started = true;
      state.lastShots = [];
      state.remoteBars = null;
      state.bass = 0.2;
      state.mid = 0.16;
      state.high = 0.1;
      state.bassBase = 0.12;
      state.lastBeatAt = 0;
      cameraRig.ready = false;
      state.hostTime = Number(data.payload?.time) || 0;
      state.hostPlaying = Boolean(data.payload?.playing);
      state.hostAt = performance.now();
      applyHostPalette(data.payload?.palette);
      if (data.payload?.fx) {
        state.fx.particles = data.payload.fx.particles !== false;
        state.fx.camera = data.payload.fx.camera !== false;
        state.fx.formations = data.payload.fx.formations !== false;
        state.fx.wordGlow = data.payload.fx.wordGlow !== false;
        state.fx.audio = data.payload.fx.audioReact !== false;
        state.intensity = clamp(Number(data.payload.fx.intensity) || 1, 0.35, 1.8);
        if (particleSystem) particleSystem.visible = state.fx.particles;
      }
      setTheme(D.chapters[0]?.theme || "sky");
      $("#startScreen").style.display = "none";
      $("#loading").classList.add("is-gone");
      updatePlayUI();
      window.parent.postMessage({ type: "lyric3d:ready", duration: state.duration }, "*");
    } catch (error) {
      console.error(error);
      window.parent.postMessage({ type: "lyric3d:error", message: error?.message || "3D stage failed" }, "*");
    }
  } else if (data.type === "lyric3d:fx") {
    state.fx.particles = data.particles !== false;
    state.fx.camera = data.camera !== false;
    state.fx.formations = data.formations !== false;
    state.fx.wordGlow = data.wordGlow !== false;
    state.fx.audio = data.audioReact !== false;
    state.intensity = clamp(Number(data.intensity) || 1, 0.35, 1.8);
    if (particleSystem) particleSystem.visible = state.fx.particles;
  } else if (data.type === "lyric3d:ping") {
    window.parent.postMessage({ type: "lyric3d:booted" }, "*");
  } else if (data.type === "lyric3d:audio") {
    if (Array.isArray(data.bars) && data.bars.length) {
      state.remoteBars = data.bars.slice(0, 48).map((value) => clamp(Number(value) || 0, 0, 1));
    } else {
      state.remoteBars = null;
    }
  } else if (data.type === "lyric3d:time") {
    state.hostTime = Number(data.time) || 0;
    state.hostPlaying = Boolean(data.playing);
    state.hostAt = performance.now();
    if (Number(data.duration) > 0) state.duration = Number(data.duration);
  }
}

async function boot() {
  if (EMBED) {
    try {
      document.body.classList.add("is-embed");
      $("#startScreen").style.display = "none";
      initThree();
      setTheme("sky");
      $("#loading").classList.add("is-gone");
      requestAnimationFrame(animate);
      window.addEventListener("message", onHostMessage);
      window.parent.postMessage({ type: "lyric3d:booted" }, "*");
    } catch (error) {
      console.error(error);
      window.parent.postMessage({ type: "lyric3d:error", message: error?.message || "WebGL unavailable" }, "*");
    }
    return;
  }
  try {
    const song = await loadTrack();
    initThree();
    setTheme(song.chapters[0]?.theme || "sky");
    buildChapterMarks();
    bindUI();
    $("#loading").classList.add("is-gone");
    $("#stageStatusText").textContent = "AWAITING START";
    requestAnimationFrame(animate);

    const params = new URLSearchParams(window.location.search);
    if (params.get("autostart") === "1") {
      const at = Number(params.get("t") || 0);
      const silent = params.get("silent") !== "0";
      const paused = params.get("paused") === "1";
      start({ silent, seek: at, play: !paused });
    }
  } catch (error) {
    console.error(error);
    showError(error?.message || "The WebGL stage could not start.");
    $("#startScreen").classList.add("is-gone");
  }
}

window.LyricDebug = () => ({
  renderer, scene, camera, composer, bloomPass, finalPass, skyMaterial,
  particleSystem, papers, boxGroup, ringGroup, lineGroups, cameraRig, state,
  data: D,
});
window.LyricStage = {
  start: (options) => start(options || {}),
  seek: seekTo,
  play: resume,
  pause,
  toggle: () => toggle(),
  setClean,
  replayLine,
  getTime: () => state.t,
  getState: () => ({ ...state, audioCtx: undefined, analyser: undefined, freq: undefined, wave: undefined }),
};

boot();
