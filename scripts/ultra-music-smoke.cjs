const { _electron: electron } = require('playwright-core');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
 const root = path.resolve(__dirname, '..'), home = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-ultra-music-'));
 fs.copyFileSync(path.join(os.homedir(), '.potatoplayer-super/library.json'), path.join(home, 'library.json'));
 const env = { ...process.env, POTATOMUSIC_HOME: home, POTATO_HIDDEN: '1', POTATO_ALLOW_SECOND_INSTANCE: '1', POTATO_ULTRA: '1' }; delete env.ELECTRON_RUN_AS_NODE;
 const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--ultra'], cwd: root, env });
 try {
  const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => window.rhine?.stats().ready && document.querySelector('.music-transport'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'archive');
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('rhine-settings')));
  assert.equal(prefs.rendering.aoSamples, 0); assert.equal(prefs.rendering.depthOfField, 0); assert.equal(prefs.frameRate, 30);
  // Exercise the shared main-view geometry during rapid selection and orbit.
  for (let i=0;i<6;i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(140); }
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/cd-array.png') });
  await page.evaluate(() => rhine.select(0)); await page.waitForTimeout(1000);
  const before = await page.evaluate(async () => (await potato.invoke('bootstrap')).playback);
  await page.locator('.read-file').click(); await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'detail');
  const after = await page.evaluate(async () => (await potato.invoke('bootstrap')).playback);
  assert.equal(after.trackId, before.trackId); assert.equal(after.playing, before.playing);
  const layout = await page.evaluate(() => {
   const detail = document.querySelector('.detail-content');
   const dock = document.querySelector('.music-transport');
   detail.scrollTop = detail.scrollHeight;
   return { bottom: detail.getBoundingClientRect().bottom, dockTop: dock.getBoundingClientRect().top,
    actionsBottom: document.querySelector('.detail-actions').getBoundingClientRect().bottom };
  });
  assert.ok(layout.bottom < layout.dockTop, 'Details must clear the playback dock');
  assert.ok(layout.actionsBottom <= layout.bottom + 1, 'Detail actions must remain accessible');
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/music-detail.png') });
  await page.locator('[data-action="model-viewer"]').click();
  await page.waitForFunction(() => { const el=document.querySelector('.model-viewer'); return el && JSON.parse(el.dataset.stats || '{}').ready; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/cd-closed.png') });
  await page.locator('[data-viewer="explode"]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('.model-viewer').dataset.stats).spread > .99);
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/cd-open.png') });
  const canvas = page.locator('.viewer-canvas canvas'); const box = await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:24}); await page.mouse.up();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/cd-orbit.png') });
  await page.locator('[data-viewer="assemble"]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('.model-viewer').dataset.stats).spread < .01);
  await page.locator('[data-viewer="close"]').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
  await page.locator('[data-action="settings"]').click();
  await page.getByLabel('三维帧率上限').selectOption('60');
  await page.getByLabel('画质预设', { exact: true }).selectOption('performance');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rhine-settings')).frameRate), 60);
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('.music-transport', { timeout: 90000 });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rhine-settings')).frameRate), 60);
  await page.evaluate(() => potato.invoke('playback.mute', { muted: true }));
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.transport-track strong').textContent !== '选择一首音乐', null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const playback = await page.evaluate(async () => (await potato.invoke('bootstrap')).playback);
  assert.ok(playback.trackId); assert.equal(await page.locator('.transport-track strong').textContent(), (await page.evaluate(async () => { const b = await potato.invoke('bootstrap'); return b.tracks.find(t => t.id === b.playback.trackId)?.title; })));
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-command="toggle"]').getAttribute('aria-label') === '播放');
  await page.getByLabel('播放进度', { exact: true }).fill('12'); await page.getByLabel('播放进度', { exact: true }).dispatchEvent('change');
  await page.waitForTimeout(400);
  assert.ok(Math.abs((await page.evaluate(async () => (await potato.invoke('bootstrap')).playback.time)) - 12) < 2);
  await page.getByLabel('音量', { exact: true }).fill('0.25'); await page.getByLabel('音量', { exact: true }).dispatchEvent('change');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(async () => (await potato.invoke('bootstrap')).playback.volume), .25);
  await page.waitForTimeout(5500);
  const metrics = await page.evaluate(() => ({ fps: document.querySelector('#three-scene').dataset.fps, quality: document.querySelector('#three-scene').dataset.renderQuality, stats: rhine.stats() }));
  assert.ok(Number(metrics.fps) <= 12); console.log('[ultra] idle update FPS:', metrics.fps);
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/music-library.png') });
  assert.deepEqual(errors, []); console.log('[ultra] browse without playback, transport, volume, presets, persistence, idle throttling passed');
 } finally { await app.close(); fs.rmSync(home, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
