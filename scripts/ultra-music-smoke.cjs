const { _electron: electron } = require('playwright-core');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
 const root = path.resolve(__dirname, '..'), home = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-ultra-music-'));
 fs.copyFileSync(path.join(os.homedir(), '.potatoplayer-super/library.json'), path.join(home, 'library.json'));
 const archives = JSON.parse(fs.readFileSync(path.join(root, 'ultra-rhine/content/archives.json'), 'utf8')).records;
 const startupTrack = archives[Math.min(20, archives.length - 1)].trackId;
 fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ lastTrackId: startupTrack, lastQueue: archives.map(r => r.trackId), volume: 0 }));
 const env = { ...process.env, POTATOMUSIC_HOME: home, POTATO_HIDDEN: '1', POTATO_ALLOW_SECOND_INSTANCE: '1', POTATO_ULTRA: '1' }; delete env.ELECTRON_RUN_AS_NODE;
 const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--ultra'], cwd: root, env });
 try {
  const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && /Shader Error|VALIDATE_STATUS|Error compiling/i.test(m.text())) errors.push(m.text()); });
  await page.waitForFunction(() => window.rhine?.stats().ready && document.querySelector('.music-transport'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'archive');
  await page.waitForFunction(id => rhine.stats().selectedTrackId === id, startupTrack);
  console.log('[ultra] startup located current track');
  await page.locator('#three-scene canvas').focus();
  const spineStats = await page.evaluate(() => rhine.stats());
  assert.equal(spineStats.persistentSpines, true);
  assert.equal(spineStats.residentSpineCount, spineStats.archiveCount);
  assert.ok(spineStats.residentSpineCount > 72, 'Spines must extend beyond cover slots');
  console.log('[ultra] resident spines:', spineStats.residentSpineCount);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('rhine-settings')));
  assert.equal(prefs.rendering.aoSamples, 0); assert.equal(prefs.rendering.depthOfField, 0); assert.equal(prefs.frameRate, 30);
  await page.waitForFunction(() => { const c = rhine.stats().covers; return c.visible > 0 && c.ready + c.unavailable === c.visible && c.selectedReady; }, null, { timeout: 20000 }).catch(async e => { console.log(await page.evaluate(() => rhine.stats().covers)); throw e; });
  // The isolated home intentionally cannot access the real app's downloaded
  // covers. Account for those explicit failures, never for pending requests.
  const coverSamples = [];
  // Exercise the shared main-view geometry during rapid selection and orbit.
  for (let i=0;i<24;i++) {
   await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
   const scene = await page.evaluate(() => rhine.stats());
   assert.equal(scene.spineDataMatches, true, 'Spine text and colors match the current cells on rapid moves');
   assert.equal(scene.genreColorCount, scene.archiveCount, 'Genre colors cover all drawn boxes immediately');
   const covers = scene.covers;
   assert.ok(covers.loading <= 4, 'Cover decoding must be bounded');
   coverSamples.push((covers.visible - covers.unavailable) ? covers.ready / (covers.visible - covers.unavailable) : 1);
  }
  await page.waitForFunction(() => { const c = rhine.stats().covers; return c.ready + c.unavailable === c.visible && c.selectedReady; }, null, { timeout: 20000 }).catch(async e => { console.log(await page.evaluate(() => rhine.stats().covers)); throw e; });
  console.log('[ultra] rapid-switch cover readiness:', { min: Math.min(...coverSamples), average: coverSamples.reduce((a,b)=>a+b,0)/coverSamples.length, final: await page.evaluate(() => rhine.stats().covers) });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(root, 'ultra-rhine/dist/cd-array.png') });
  // Cross columns of different lengths in both directions without moving vertically.
  const rowBefore = await page.evaluate(() => rhine.stats().selectedCell.row);
  for (const key of [...Array(10).fill('ArrowRight'), ...Array(10).fill('ArrowLeft')]) {
   await page.keyboard.press(key); await page.waitForTimeout(60);
   const stats = await page.evaluate(() => rhine.stats());
   assert.equal(stats.selectedCell.row, rowBefore);
   assert.equal(stats.spineDataMatches, true);
   assert.equal(stats.genreColorCount, stats.archiveCount);
  }
  // Enter on a column button keeps its native action instead of opening details.
  await page.locator('[data-action="column-next"]').focus();
  const laneBefore = await page.evaluate(() => rhine.stats().selectedCell.lane);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'archive');
  assert.equal(await page.evaluate(() => rhine.stats().selectedCell.lane), laneBefore + 1);
  await page.evaluate(() => rhine.select(0)); await page.waitForTimeout(1000);
  // Actual pointer clicks select/open; a drag must never open details.
  const clickPoint = await page.evaluate(() => {
   const s = rhine.stats(), el = document.querySelector('#three-scene'), r = el.getBoundingClientRect();
   return { x: r.left + (s.topLeft[0] + s.topRight[0]) / 2 * r.width / el.clientWidth,
    y: r.top + ((s.topLeft[1] + s.topRight[1]) / 2 + 35) * r.height / el.clientHeight };
  });
  console.log('[ultra] pointer target:', await page.evaluate(p => ({ point: p, tag: document.elementFromPoint(p.x, p.y)?.tagName }), clickPoint));
  await page.mouse.click(clickPoint.x, clickPoint.y);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'archive');
  await page.waitForTimeout(500);
  await page.mouse.dblclick(clickPoint.x, clickPoint.y, { delay: 80 });
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'detail', 'Double-click opens the selected CD');
  await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
  await page.mouse.move(clickPoint.x, clickPoint.y); await page.mouse.down();
  await page.mouse.move(clickPoint.x + 70, clickPoint.y + 30, { steps: 10 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'archive', 'Dragging does not open details');
  await page.evaluate(() => rhine.select(0)); await page.waitForTimeout(800);
  const before = await page.evaluate(async () => (await potato.invoke('bootstrap')).playback);
  await page.locator('.read-file').click(); await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'detail');
  const detailSelection = await page.evaluate(() => rhine.stats().selected);
  await page.locator('#detail-content').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'detail');
  assert.equal(await page.evaluate(() => rhine.stats().selected), detailSelection);
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
  await page.getByLabel('盒脊常驻显示', { exact: true }).uncheck();
  assert.equal(await page.evaluate(() => rhine.stats().residentSpineCount), 0);
  await page.getByLabel('三维帧率上限').selectOption('60');
  await page.getByLabel('画质预设', { exact: true }).selectOption('performance');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rhine-settings')).frameRate), 60);
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('.music-transport', { timeout: 90000 });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rhine-settings')).frameRate), 60);
  assert.equal(await page.evaluate(() => rhine.stats().persistentSpines), false);
  await page.locator('[data-action="settings"]').click();
  await page.getByLabel('盒脊常驻显示', { exact: true }).check();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => rhine.stats().residentSpineCount === rhine.stats().archiveCount && rhine.stats().archiveCount > 0);
  await page.evaluate(() => potato.invoke('playback.mute', { muted: true }));
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.transport-track strong').textContent !== '选择一首音乐', null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const playback = await page.evaluate(async () => (await potato.invoke('bootstrap')).playback);
  assert.ok(playback.trackId); assert.equal(await page.locator('.transport-track strong').textContent(), (await page.evaluate(async () => { const b = await potato.invoke('bootstrap'); return b.tracks.find(t => t.id === b.playback.trackId)?.title; })));
  // Reload while a different song is playing: locate it without restarting audio.
  const playingId = playback.trackId;
  await page.evaluate(() => rhine.select(0));
  await page.reload();
  await page.waitForFunction(id => rhine?.stats().ready && rhine.stats().selectedTrackId === id, playingId, { timeout: 90000 });
  assert.equal((await page.evaluate(() => potato.invoke('bootstrap'))).playback.playing, true);
  // Exercise actual VLC EOF twice, not just a mocked controller callback.
  await page.evaluate(() => potato.invoke('playback.repeat', { mode: 'one' }));
  for (let loop = 0; loop < 2; loop++) {
   await page.evaluate(async () => { const b = await potato.invoke('bootstrap'); await potato.invoke('playback.seek', { seconds: b.playback.duration - .8 }); });
   await page.waitForTimeout(1200);
   await page.waitForFunction(async id => { const p = (await potato.invoke('bootstrap')).playback; return p.trackId === id && p.playing && p.time > .05 && p.time < 5; }, playingId, { timeout: 10000 });
  }
  await page.evaluate(() => potato.invoke('playback.repeat', { mode: 'off' }));
  console.log('[ultra] real-engine repeat-one passed twice');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-command="toggle"]').getAttribute('aria-label') === '播放');
  // Native range arrows must not browse the CD field; held global Space toggles once.
  const beforeRange = await page.evaluate(() => rhine.stats().selected);
  await page.getByLabel('音量', { exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => rhine.stats().selected), beforeRange);
  await page.locator('#three-scene canvas').focus();
  await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
  await page.waitForFunction(() => document.querySelector('[data-command="toggle"]').getAttribute('aria-label') === '暂停');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('[data-command="toggle"]').getAttribute('aria-label') === '播放');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => rhine.stats().mode), 'detail');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
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
