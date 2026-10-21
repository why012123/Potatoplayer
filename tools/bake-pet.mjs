#!/usr/bin/env node
/**
 * 把明日方舟「基建」Spine 模型烘焙成桌宠用的 PNG 帧序列。
 *
 * 为什么离线烘焙：模型是 Spine 3.5.51 二进制，而且大量使用网格（40 个 Mesh 附件），
 * JavaFX 里没有现成运行时；用官方 canvas 运行时逐帧渲染成带透明通道的 PNG，
 * 播放时只按帧率换图 —— 不需要在播放器里塞一个 WebView 或第三方解码库。
 *
 * 用法：
 *   node tools/bake-pet.mjs <rhodes-containment-protocol 目录> [输出目录]
 *
 * 默认输出到本工程的 pets/rosmontis/（.gitignore 已排除，素材版权归鹰角网络）。
 *
 * 依赖：
 *   - Node 20+
 *   - rhodes-containment-protocol 的 node_modules 里装了 playwright（Chromium 用它的）
 *   - 那个仓库的 public/assets/base/<charId>/ 下有 .skel / .atlas / .png
 *
 * 想换角色：把 CHAR_ID 改成别的基建模型（如 char_002_amiya），输出目录跟着改。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const RHO = path.resolve(process.argv[2] || '');
const OUT = path.resolve(process.argv[3] || 'pets/rosmontis');
if (!process.argv[2]) {
  console.error('用法: node tools/bake-pet.mjs <rhodes-containment-protocol 目录> [输出目录]');
  process.exit(1);
}
const RHO_PUBLIC = path.join(RHO, 'public');
const CHAR_ID = 'rosmontis';
const MODEL = `char_391_rosmon`;
const BASE = `assets/base/${MODEL}/build_${MODEL}`;
const TARGET_WIDTH = 200;
const MARGIN = 6;
const CLIPS = [
  { name: 'relax', fps: 12 },
  { name: 'move', fps: 15 },
  { name: 'interact', fps: 15 },
  { name: 'sit', fps: 15 },
  { name: 'sleep', fps: 10 },
];

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(RHO, 'node_modules', 'playwright'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.skel': 'application/octet-stream',
  '.atlas': 'text/plain; charset=utf-8',
};

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c"></canvas>
<script src="/vendor/spine-canvas-3.5.js"></script>
<script src="/js/spine-binary-3.5.js"></script>
<script>
const CFG = __CFG__;
window.__out = null;
window.__err = null;
window.__progress = '';

function applyPose(skeleton, state, name, time) {
  state.clearTracks();
  state.setAnimation(0, name, true);
  const track = state.tracks[0];
  if (track) {
    track.trackTime = time;
    track.trackLast = time;
    track.animationLast = -1;
    track.nextAnimationLast = -1;
    track.nextTrackLast = time;
  }
  skeleton.setToSetupPose();
  state.apply(skeleton);
  skeleton.updateWorldTransform();
}

function unionBounds(skeleton, state, name, duration) {
  const offset = new spine.Vector2();
  const size = new spine.Vector2();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const samples = duration > 0 ? Math.max(2, Math.ceil(duration / 0.1)) : 1;
  for (let i = 0; i < samples; i++) {
    const t = duration > 0 ? (duration * i) / samples : 0;
    applyPose(skeleton, state, name, t);
    skeleton.getBounds(offset, size);
    if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) continue;
    minX = Math.min(minX, offset.x);
    minY = Math.min(minY, offset.y);
    maxX = Math.max(maxX, offset.x + size.x);
    maxY = Math.max(maxY, offset.y + size.y);
  }
  if (!Number.isFinite(minX)) return { x: -160, y: -200, width: 320, height: 400 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

(async () => {
  try {
    const stem = '/' + CFG.base;
    const [atlasText, skelBuf, img] = await Promise.all([
      fetch(stem + '.atlas').then(r => r.text()),
      fetch(stem + '.skel').then(r => r.arrayBuffer()),
      new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = stem + '.png'; }),
    ]);
    const texture = new spine.canvas.CanvasTexture(img);
    const atlas = new spine.TextureAtlas(atlasText, () => texture);
    const data = new SpineBinary35(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skelBuf, CFG.charId);

    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const renderer = new spine.canvas.SkeletonRenderer(ctx);
    renderer.triangleRendering = true;
    const skeleton = new spine.Skeleton(data);
    const stateData = new spine.AnimationStateData(data);
    stateData.defaultMix = 0;
    const state = new spine.AnimationState(stateData);

    const durations = {};
    for (const a of data.animations) durations[a.name] = a.duration || 0;
    const clips = CFG.clips.map((c) => {
      const found = data.animations.find((a) => a.name.toLowerCase() === String(c.name).toLowerCase());
      return found ? { key: c.name.toLowerCase(), name: found.name, fps: c.fps } : null;
    }).filter(Boolean);
    if (!clips.length) throw new Error('一个目标动作都没匹配到：' + data.animations.map(a => a.name).join(','));

    const relax = clips.find((c) => c.key === 'relax') || clips[0];
    const relaxBounds = unionBounds(skeleton, state, relax.name, durations[relax.name] || 0);
    const zoom = CFG.targetWidth / relaxBounds.width;
    const result = { canvas: null, bounds: relaxBounds, zoom, clips: [] };

    for (const clip of clips) {
      const duration = durations[clip.name] || 0;
      const bounds = unionBounds(skeleton, state, clip.name, duration);
      const canvasW = Math.max(8, Math.round(bounds.width * zoom) + CFG.margin * 2);
      const canvasH = Math.max(8, Math.round(bounds.height * zoom) + CFG.margin * 2);
      canvas.width = canvasW;
      canvas.height = canvasH;
      const centerX = bounds.x + bounds.width / 2;
      const bottomY = bounds.y;
      const frameCount = Math.max(1, Math.round(duration * clip.fps));
      const frames = [];
      for (let i = 0; i < frameCount; i++) {
        const t = duration > 0 ? (i / frameCount) * duration : 0;
        applyPose(skeleton, state, clip.name, t);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.save();
        ctx.translate(canvasW / 2, canvasH - CFG.margin);
        ctx.scale(zoom, -zoom);
        ctx.translate(-centerX, -bottomY);
        renderer.draw(skeleton);
        ctx.restore();
        frames.push(canvas.toDataURL('image/png'));
        window.__progress = clip.key + ' ' + (i + 1) + '/' + frameCount;
      }
      result.clips.push({
        key: clip.key, name: clip.name, fps: clip.fps,
        frames: frames.length, duration, canvas: [canvasW, canvasH], bounds, data: frames,
      });
      if (!result.canvas) result.canvas = [canvasW, canvasH];
    }
    window.__out = result;
  } catch (e) {
    window.__err = String((e && e.stack) || e);
  }
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/bake.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(PAGE.replace('__CFG__', JSON.stringify({ base: BASE, charId: CHAR_ID, clips: CLIPS, targetWidth: TARGET_WIDTH, margin: MARGIN })));
    return;
  }
  const file = path.join(RHO_PUBLIC, decodeURIComponent(url.pathname));
  if (!file.startsWith(RHO_PUBLIC)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/bake.html`);

const t0 = Date.now();
let last = '';
while (true) {
  const s = await page.evaluate(() => ({ out: window.__out, err: window.__err, progress: window.__progress }));
  if (s.err) {
    console.error('烘焙失败：', s.err);
    await browser.close();
    server.close();
    process.exit(1);
  }
  if (s.out) break;
  if (s.progress && s.progress !== last) {
    last = s.progress;
    console.log('  ' + s.progress);
  }
  if (Date.now() - t0 > 180000) {
    console.error('超时');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}
const result = await page.evaluate(() => window.__out);
await browser.close();
server.close();

fs.mkdirSync(OUT, { recursive: true });
const meta = {
  charId: CHAR_ID,
  source: `rhodes-containment-protocol/public/assets/base/${MODEL}/build_${MODEL} (Spine 3.5.51)`,
  canvas: result.canvas,
  bounds: result.bounds,
  zoom: result.zoom,
  bakedAt: new Date().toISOString(),
  clips: {},
};
let totalFrames = 0;
let totalBytes = 0;
for (const clip of result.clips) {
  const dir = path.join(OUT, clip.key);
  fs.mkdirSync(dir, { recursive: true });
  clip.data.forEach((dataUrl, index) => {
    const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    fs.writeFileSync(path.join(dir, String(index).padStart(3, '0') + '.png'), buf);
    totalBytes += buf.length;
  });
  meta.clips[clip.key] = {
    animation: clip.name, fps: clip.fps, frames: clip.frames, duration: clip.duration,
    canvas: clip.canvas, bounds: clip.bounds,
  };
  totalFrames += clip.frames;
  console.log(`  ${clip.key}: ${clip.frames} 帧 @ ${clip.fps}fps（${clip.duration.toFixed(2)}s）画布 ${clip.canvas.join('×')}`);
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`\n完成：${totalFrames} 帧，${(totalBytes / 1024 / 1024).toFixed(1)} MB → ${OUT}`);
