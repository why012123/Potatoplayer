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
  fx: { bloom: true, particles: true, camera: true },
  audioCtx: null,
  analyser: null,
  freq: null,
  wave: null,
  demoBase: 0,
  demoWall: 0,
  lastFrame: performance.now(),
  pointerX: 0,
  pointerY: 0,
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
let currentGroup = null;
let currentLine = -1;
let currentChapter = -1;
let activeFx = "bloom";
let camBase = new THREE.Vector3(0, 0, 8.4);
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
      -24 + Math.random() * 30,
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
    color += grain * (0.035 + uEnergy * 0.018);

    float scan = step(0.5, sin(uv.y * uResolution.y * 0.72 + uTime * 1.5));
    color *= 1.0 - scan * 0.012;

    float vignette = smoothstep(0.9, 0.28, length(center * vec2(1.0, 0.84)));
    color *= 0.55 + vignette * 0.55;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.65, 0.18);
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
  buildPapers();
  buildParticles();
  buildRing();
  buildRays();
  setTheme("sky");
}

function disposeLineGroup(group) {
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

function makeCharTexture(char, hot) {
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

function createLineGroup(line, index) {
  const profile = fxProfiles[line.fx] || fxProfiles.bloom;
  const chars = Array.from(line.text);
  const hot = hotIndexSet(line.text, line.fx);
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
    const width = height * (tex.width / tex.height);
    tokens.push({ char, texture: tex, width, space: false, index: i });
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
  group.position.set(0, 0, 1.1);
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
      const boxWidth = token.width;
      const boxHeight = height;
      const planeGeo = new THREE.PlaneGeometry(boxWidth, boxHeight);
      const front = new THREE.MeshBasicMaterial({
        map: texture,
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
          color: new THREE.Color(d === 1 ? themeTarget.accent3 : 0x090b0c),
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
        target,
        start: charGroup.position.clone(),
        targetRot,
        phase: Math.random() * Math.PI * 2,
        delay: token.index * (line.fx === "whisper" ? 0.035 : 0.018),
        width: boxWidth,
        height: boxHeight,
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
      entry.mesh.position.z -= dt * 1.8;
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
  for (let i = 0; i < data.entries.length; i += 1) {
    const entry = data.entries[i];
    const p = smoothstep((age - entry.delay) / duration);
    const float = Math.sin(now * 0.9 + entry.phase) * 0.035;
    const float2 = Math.cos(now * 0.72 + entry.phase * 1.3) * 0.025;
    const target = entry.target;
    const x = lerp(entry.start.x, target.x, p) + float2 * (whisper ? 1.8 : 1);
    const y = lerp(entry.start.y, target.y, p) + float;
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
    entry.mesh.scale.setScalar(lerp(0.55, 1, p) * (1 - drift * 0.25));
    entry.front.opacity = p * data.baseOpacity * (1 - drift * 0.88);
    for (let li = 0; li < entry.layers.length; li += 1) {
      entry.layers[li].opacity = p * (0.2 - li * 0.035) * (1 - drift * 0.8);
    }
    if (entry.glow) {
      entry.glow.visible = state.fx.bloom;
      entry.glow.material.opacity = p * (1 - drift * 0.9) * (0.038 + state.energy * 0.028);
    }
  }

  if (data.lineGlow) {
    data.lineGlow.visible = state.fx.bloom;
    data.lineGlow.material.opacity = 0.012 + state.energy * 0.018;
    data.lineGlow.scale.setScalar(1 + state.energy * 0.08);
  }
  group.rotation.y = lerp(group.rotation.y, state.pointerX * 0.14 + Math.sin(now * 0.23) * 0.028, 0.035);
  group.rotation.x = lerp(group.rotation.x, state.pointerY * 0.08 + Math.cos(now * 0.18) * 0.018, 0.035);
  group.position.z = 1.1 - state.kick * 0.28;
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
    if (state.freq) {
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
    if (plane.position.z > 5) {
      plane.position.z = -27;
      plane.position.x = (Math.random() - 0.5) * 26;
      plane.position.y = (Math.random() - 0.5) * 13;
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
  if (state.analyser && state.freq) {
    state.analyser.getByteFrequencyData(state.freq);
    let low = 0;
    for (let i = 1; i < Math.min(18, state.freq.length); i += 1) low += state.freq[i];
    low /= Math.max(1, Math.min(18, state.freq.length) - 1);
    const target = clamp(low / 255, 0, 1);
    state.energy = lerp(state.energy, target, 0.22);
  } else {
    const synthetic = 0.2 + Math.abs(Math.sin(state.t * 1.7)) * 0.18;
    state.energy = lerp(state.energy, synthetic, 0.08);
  }
  state.energy = clamp(state.energy, 0, 1.1);
  updateEnvironment(now, dt);
  /* The direct render path keeps colour management stable. Glow is rendered
     in-scene through additive text halos and the line aura. */
}

function updateCamera(now, dt) {
  if (!camera) return;
  const t = state.t;
  const drift = state.fx.camera ? 1 : 0;
  const shake = state.fx.camera ? (state.energy * 0.012 + state.kick * 0.045) * state.intensity : 0;
  const px = state.pointerX * drift;
  const py = state.pointerY * drift;
  camera.position.set(
    Math.sin(t * 0.17 + 0.4) * 0.58 + px * 0.6 + (Math.random() - 0.5) * shake,
    Math.cos(t * 0.14) * 0.34 + py * 0.32 + (Math.random() - 0.5) * shake,
    9.15 + Math.sin(t * 0.12) * 0.26 - state.kick * 0.52 + state.energy * 0.08,
  );
  camera.lookAt(px * 0.15, py * 0.1, 0.7);
  camera.rotateZ(Math.sin(t * 0.1) * 0.022 + px * 0.014);
}

function animate(nowMs) {
  raf = requestAnimationFrame(animate);
  const dt = Math.min(0.05, (nowMs - state.lastFrame) / 1000 || 0.016);
  state.lastFrame = nowMs;
  clockTime = (nowMs - startWall) / 1000;

  if (state.started) {
    if (state.silent) {
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

  if (renderer) renderer.render(scene, camera);
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

async function boot() {
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
  particleSystem, papers, boxGroup, ringGroup, lineGroups,
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
