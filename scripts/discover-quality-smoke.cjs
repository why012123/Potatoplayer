// Isolated desktop + local HTTP fixture. Never uses the user's library or account.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { _electron: electron } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-discover-quality-'));
  const music = path.join(home, 'music'); fs.mkdirSync(music);
  const screenshotDir = path.join(root, 'dist', 'review-discover'); fs.mkdirSync(screenshotDir, { recursive: true });
  const makeFlac = (name, rate, format) => {
    const target = path.join(home, name + '.flac');
    const result = spawnSync('ffmpeg', ['-v','error','-f','lavfi','-i',`anoisesrc=sample_rate=${rate}:duration=1:seed=42`,'-sample_fmt',format,'-c:a','flac',target]);
    assert.equal(result.status, 0, result.stderr?.toString() || 'ffmpeg required for real FLAC fixtures');
    return fs.readFileSync(target);
  };
  const cd = makeFlac('cd', 44100, 's16'), hires = makeFlac('hires', 96000, 's32');
  const bindings = {};
  for (const [id, content, quality] of [['101', cd, 'hires'], ['102', hires, 'lossless'], ['103', cd, 'lossless']]) {
    const file = path.join(music, `Studio - Song ${id}.flac`); fs.writeFileSync(file, content);
    bindings[file] = { path: file, neteaseId: id, title: `Song ${id}`, artist: 'Studio', album: 'Quality fixtures', quality, block: '测试区块', genre: 'Ambient' };
  }
  fs.writeFileSync(path.join(home, 'netease_bindings.json'), JSON.stringify(bindings));
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ libraryRoot: music, volume: 0, playbackEngine: 'vlc' }));
  fs.writeFileSync(path.join(home, 'netease_cookie.txt'), 'MUSIC_U=isolated-fixture');
  let accountRequests = 0; const audioRequests = [];
  const song = id => ({ id: Number(id), name: `Song ${id}`, ar: [{ name: 'Studio' }], al: { name: 'Quality fixtures', picUrl: '' }, dt: 180000 });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'); const id = url.searchParams.get('id');
    if (url.pathname === '/audio') {
      audioRequests.push(id); const bytes = id === '101' ? hires : cd;
      res.writeHead(200, { 'Content-Type': 'audio/flac', 'Content-Length': bytes.length }); res.end(bytes); return;
    }
    let data = { code: 200 };
    if (url.pathname === '/user/account') { accountRequests++; data.profile = { userId: 1, nickname: 'Potato Listener', avatarUrl: '' }; }
    if (url.pathname === '/search') data.result = { songs: ['101','102','103'].map(song) };
    if (url.pathname === '/song/detail') data.songs = url.searchParams.get('ids').split(',').map(song);
    if (url.pathname === '/song/url/v1') data.data = [{ url: `http://127.0.0.1:${server.address().port}/audio?id=${id}`, type: 'flac', ...(id === '101' ? {} : { level: 'hires' }) }];
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let app;
  try {
    const env = { ...process.env, POTATOMUSIC_HOME: home, POTATOMUSIC_IMPORT_SUPER: '0', POTATO_HIDDEN: '1', POTATO_ALLOW_SECOND_INSTANCE: '1', POTATOMUSIC_API_BASE: `http://127.0.0.1:${server.address().port}` }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env, timeout: 40000 });
    const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('.ai-sidebar', { timeout: 40000 });
    await page.evaluate(() => { localStorage.setItem('potato:appearance:v1', JSON.stringify({ language: 'zh', style: 'editorial' })); localStorage.setItem('potato:theme', 'light'); });
    await page.reload(); await page.waitForSelector('.ai-sidebar');
    await page.setViewportSize({ width: 1440, height: 960 });
    const invoke = (method, params = {}) => page.evaluate(([m,p]) => window.potato.invoke(m,p), [method,params]);
    const discover = () => page.locator('.ai-nav-item').filter({ hasText: '在线发现' }).click();
    await discover(); await page.waitForSelector('.online-search');
    await delay(400); await page.screenshot({ path: path.join(screenshotDir, 'light.png') });
    const search = page.locator('.online-search input'); await search.fill('Studio'); await search.press('Enter');
    await page.waitForSelector('.online-song'); assert.equal(await page.locator('.online-song').count(), 3);
    const count = accountRequests;
    await page.locator('.ai-nav-item').filter({ hasText: '所有歌曲' }).click(); await page.waitForSelector('.page--songs');
    await delay(8200); // Exceed the backend's old 8-second cache to expose remount checks.
    await discover(); await page.waitForSelector('.online-song');
    assert.equal(await search.inputValue(), 'Studio', 'search survives navigation');
    assert.equal(accountRequests, count, 'navigation does not reconnect/revalidate account');
    assert.equal(await page.locator('.online-loading').count(), 0);
    await page.locator('.discover-settings summary').click();
    await page.locator('.download-target select').first().selectOption('hires');
    await page.screenshot({ path: path.join(screenshotDir, 'results.png') });
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await page.screenshot({ path: path.join(screenshotDir, 'dark.png') });
    await page.getByRole('button', { name: '收起助手', exact: true }).click();
    await page.setViewportSize({ width: 980, height: 740 });
    await page.screenshot({ path: path.join(screenshotDir, 'compact.png') });
    assert(await page.locator('.page--discover').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'no horizontal overflow');
    await page.evaluate(() => { window.downloadEvents = []; window.potato.onEvent(e => { if (e.event.startsWith('download.')) window.downloadEvents.push(e); }); });
    const boot = await invoke('bootstrap'); const track = boot.tracks.find(t => t.neteaseId === '101'); assert(track);
    await invoke('library.patchMetadata', { trackId: track.id, patch: { rating: 9.5, note: 'keep this', block: '测试区块', genre: 'Ambient' } });
    await invoke('library.toggleFavorite', { trackId: track.id });
    const { playlist } = await invoke('playlist.create', { name: 'Quality regression' });
    await invoke('playlist.addTracks', { playlistId: playlist.id, trackIds: [track.id] });
    const finished = async (id, quality) => {
      const job = await invoke('netease.download', { id, quality, title: `Song ${id}` });
      await page.waitForFunction(jobId => window.downloadEvents.some(e => ['download.done','download.error'].includes(e.event) && e.data.jobId === jobId), job.jobId, { timeout: 25000 });
      const event = await page.evaluate(jobId => window.downloadEvents.find(e => ['download.done','download.error'].includes(e.event) && e.data.jobId === jobId), job.jobId);
      assert.equal(event.event, 'download.done', JSON.stringify(event)); return event.data;
    };
    const upgraded = await finished('101', 'hires');
    assert.equal(upgraded.replaced, true); assert.equal(upgraded.quality, 'hires'); assert.equal(upgraded.previousQuality, 'lossless');
    assert.deepEqual(fs.readFileSync(track.path), hires, 'actual 96 kHz FLAC replaces stale-labelled 44.1 kHz file');
    const skipped = await finished('102', 'lossless'); assert.equal(skipped.replaced, false); assert.equal(skipped.quality, 'hires'); assert(!audioRequests.includes('102'));
    const unavailable = await finished('103', 'hires'); assert.equal(unavailable.upgradeUnavailable, true); assert.equal(unavailable.quality, 'lossless');
    assert.deepEqual(fs.readFileSync(path.join(music, 'Studio - Song 103.flac')), cd, 'false provider Hi-Res never replaces file');
    const downgraded = await finished('104', 'hires'); assert.equal(downgraded.quality, 'lossless', 'new download reports measured quality');
    const after = await invoke('bootstrap'); const kept = after.tracks.find(t => t.id === track.id);
    assert.equal(kept.rating, 9.5); assert.equal(kept.note, 'keep this'); assert.equal(kept.block, '测试区块'); assert.equal(kept.genre, 'Ambient');
    assert(after.favorites.includes(track.id)); assert(after.playlists.find(p => p.id === playlist.id).trackIds.includes(track.id));
    assert(!fs.readdirSync(music).some(name => name.endsWith('.part')), 'staged files cleaned');
    await page.getByRole('button', { name: '退出登录', exact: true }).click(); await page.waitForSelector('.login-stage');
    await page.waitForSelector('.toast', { state: 'detached', timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotDir, 'login.png') });
    assert.deepEqual(errors, []);
    console.log('Discover navigation/cache, search/settings, light/dark/compact layout, real FLAC upgrade/downgrade protection and metadata preservation passed.');
    console.log(`Screenshots: ${screenshotDir}`);
  } finally {
    if (app) await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
