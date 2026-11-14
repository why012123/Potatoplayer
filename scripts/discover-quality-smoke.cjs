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
  const makeMp3 = (name, bitrate) => {
    const target = path.join(home, name + '.mp3');
    const result = spawnSync('ffmpeg', ['-v','error','-f','lavfi','-i','anoisesrc=sample_rate=44100:duration=1:seed=42','-c:a','libmp3lame','-b:a',bitrate,target]);
    assert.equal(result.status, 0, result.stderr?.toString() || 'ffmpeg libmp3lame required for real MP3 fixtures');
    return fs.readFileSync(target);
  };
  const cd = makeFlac('cd', 44100, 's16'), hires = makeFlac('hires', 96000, 's32');
  const mp3High = makeMp3('mp3-320', '320k'), mp3Standard = makeMp3('mp3-128', '128k');
  const bindings = {};
  for (const [id, content, quality] of [['101', cd, 'hires'], ['102', hires, 'lossless'], ['103', cd, 'lossless'], ['105', cd, 'lossless'], ['106', hires, 'hires'], ['107', hires, 'hires']]) {
    const file = path.join(music, `Studio - Song ${id}.flac`); fs.writeFileSync(file, content);
    bindings[file] = { path: file, neteaseId: id, title: `Song ${id}`, artist: 'Studio', album: 'Quality fixtures', quality, block: '测试区块', genre: 'Ambient' };
  }
  fs.writeFileSync(path.join(home, 'netease_bindings.json'), JSON.stringify(bindings));
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ libraryRoot: music, volume: 0, playbackEngine: 'vlc' }));
  fs.writeFileSync(path.join(home, 'netease_cookie.txt'), 'MUSIC_U=isolated-fixture');
  let accountRequests = 0; const audioRequests = [];
  const song = id => ({ id: Number(id), name: `Song ${id}`, ar: [{ name: 'Studio' }], al: { name: 'Quality fixtures', picUrl: '' }, dt: 180000 });
  const typeForLevel = level => (level === 'standard' || level === 'exhigh') ? 'mp3' : 'flac';
  const bytesFor = (id, level) => {
    // These ids simulate a provider that cannot actually serve the requested tier.
    if (id === '103' || id === '104' || id === '105') return cd;
    if (level === 'standard') return mp3Standard;
    if (level === 'exhigh') return mp3High;
    if (level === 'lossless') return cd;
    return hires;
  };
  const servedLevelFor = (id, level) => id === '105' ? 'lossless'
    : ({ standard: 'standard', exhigh: 'high', lossless: 'lossless', hires: 'hires', jymaster: 'jymaster' }[level] || 'hires');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'); const id = url.searchParams.get('id');
    const level = url.searchParams.get('level') || 'hires';
    if (url.pathname === '/audio') {
      audioRequests.push(id); const bytes = bytesFor(id, level); const type = typeForLevel(level);
      res.writeHead(200, { 'Content-Type': type === 'mp3' ? 'audio/mpeg' : 'audio/flac', 'Content-Length': bytes.length }); res.end(bytes); return;
    }
    let data = { code: 200 };
    if (url.pathname === '/user/account') { accountRequests++; data.profile = { userId: 1, nickname: 'Potato Listener', avatarUrl: '' }; }
    if (url.pathname === '/search') data.result = { songs: ['101','102','103'].map(song) };
    if (url.pathname === '/song/detail') data.songs = url.searchParams.get('ids').split(',').map(song);
    if (url.pathname === '/song/url/v1') data.data = [{
      url: `http://127.0.0.1:${server.address().port}/audio?id=${id}&level=${level}`,
      type: typeForLevel(level),
      level: servedLevelFor(id, level),
    }];
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
    const discover = () => page.locator('.ai-sidebar .nav-item').filter({ hasText: /^(发现|Discover)/ }).first().click();
    await discover(); await page.waitForSelector('.online-search');
    await delay(400); await page.screenshot({ path: path.join(screenshotDir, 'light.png') });
    const search = page.locator('.online-search input'); await search.fill('Studio'); await search.press('Enter');
    await page.waitForSelector('.online-song'); assert.equal(await page.locator('.online-song').count(), 3);
    const count = accountRequests;
    await page.locator('.ai-sidebar .nav-item').filter({ hasText: /^歌曲/ }).first().click(); await page.waitForSelector('.page--songs');
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
    const waitJob = async jobId => {
      await page.waitForFunction(id => window.downloadEvents.some(e => ['download.done','download.error'].includes(e.event) && e.data.jobId === id), jobId, { timeout: 25000 });
      const event = await page.evaluate(id => window.downloadEvents.find(e => ['download.done','download.error'].includes(e.event) && e.data.jobId === id), jobId);
      assert.equal(event.event, 'download.done', JSON.stringify(event)); return event.data;
    };
    const finished = async (id, quality, extra = {}) => {
      const job = await invoke('netease.download', { id, quality, title: `Song ${id}`, ...extra });
      return waitJob(job.jobId);
    };
    const upgraded = await finished('101', 'hires');
    assert.equal(upgraded.replaced, true); assert.equal(upgraded.quality, 'hires'); assert.equal(upgraded.previousQuality, 'lossless');
    assert.deepEqual(fs.readFileSync(track.path), hires, 'actual 96 kHz FLAC replaces stale-labelled 44.1 kHz file');
    const skipped = await finished('102', 'lossless'); assert.equal(skipped.replaced, false); assert.equal(skipped.quality, 'hires'); assert(!audioRequests.includes('102'));
    const unavailable = await finished('103', 'hires'); assert.equal(unavailable.upgradeUnavailable, true); assert.equal(unavailable.quality, 'lossless');
    assert.deepEqual(fs.readFileSync(path.join(music, 'Studio - Song 103.flac')), cd, 'false provider Hi-Res never replaces file');
    const preflight = await finished('105', 'hires');
    assert.equal(preflight.upgradeUnavailable, true); assert(!audioRequests.includes('105'), 'explicit lower tier is rejected before downloading');
    const downloadedEvents = await page.evaluate(() => window.downloadEvents);
    const firstDone = downloadedEvents.findIndex(e => e.event === 'download.done' && e.data.neteaseId === '101');
    for (const phase of ['verifying', 'finalizing']) assert(downloadedEvents.slice(0, firstDone).some(e => e.data.neteaseId === '101' && e.data.phase === phase), `${phase} precedes completion`);
    const downgraded = await finished('104', 'hires'); assert.equal(downgraded.quality, 'lossless', 'new download reports measured quality');
    // ── Explicit downgrades ────────────────────────────────────────────────
    const track106 = boot.tracks.find(t => t.neteaseId === '106'); assert(track106);
    await invoke('library.patchMetadata', { trackId: track106.id, patch: { rating: 8.5, note: 'downgrade keep', block: '测试区块', genre: 'Ambient' } });
    await invoke('library.toggleFavorite', { trackId: track106.id });
    const { playlist: downgradePlaylist } = await invoke('playlist.create', { name: 'Downgrade regression' });
    await invoke('playlist.addTracks', { playlistId: downgradePlaylist.id, trackIds: [track106.id] });
    const audioBeforeDefault = audioRequests.filter(id => id === '106').length;
    const blockedDowngrade = await finished('106', 'high');
    assert.equal(blockedDowngrade.replaced, false);
    assert.equal(blockedDowngrade.downgradeUnavailable, true, 'lower tier without explicit consent stays upgrade-only');
    assert.equal(blockedDowngrade.quality, 'hires', 'kept copy reports its existing tier');
    assert.equal(audioRequests.filter(id => id === '106').length, audioBeforeDefault, 'blocked downgrade never transfers audio');
    assert.deepEqual(fs.readFileSync(track106.path), hires, 'blocked downgrade keeps the original FLAC');
    const changed = await invoke('track.qualityOptions', { trackId: track106.id });
    assert.equal(changed.downgradeAvailable, true);
    assert(changed.downgrades.some(row => row.quality === 'lossless'), 'qualityOptions probes the lower FLAC tier');
    assert(changed.downgrades.some(row => row.quality === 'high'), 'qualityOptions probes the lower MP3 tier');
    const beforeSize = fs.statSync(track106.path).size;
    const explicitDowngrade = await finished('106', 'high', { allowDowngrade: true });
    assert.equal(explicitDowngrade.replaced, true);
    assert.equal(explicitDowngrade.direction, 'downgrade');
    assert.equal(explicitDowngrade.quality, 'high');
    assert.equal(explicitDowngrade.previousQuality, 'hires');
    assert(fs.statSync(explicitDowngrade.path).size < beforeSize, 'downgraded file is smaller');
    assert(!fs.existsSync(track106.path), 'old FLAC container removed after cross-container downgrade');
    assert.deepEqual(fs.readFileSync(explicitDowngrade.path), mp3High, 'provider MP3 replaces the Hi-Res FLAC');
    const afterDowngrade = await invoke('bootstrap');
    const kept106 = afterDowngrade.tracks.find(t => t.neteaseId === '106'); assert(kept106);
    assert.equal(kept106.rating, 8.5); assert.equal(kept106.note, 'downgrade keep');
    assert.equal(kept106.block, '测试区块'); assert.equal(kept106.genre, 'Ambient');
    assert(afterDowngrade.favorites.includes(kept106.id), 'favorite follows the downgraded file');
    assert(afterDowngrade.playlists.find(p => p.id === downgradePlaylist.id).trackIds.includes(kept106.id), 'playlist membership follows the downgraded file');
    const track107 = boot.tracks.find(t => t.neteaseId === '107'); assert(track107);
    await invoke('library.patchMetadata', { trackId: track107.id, patch: { rating: 7.5, note: 'change keep' } });
    const change = await invoke('track.changeQuality', { trackId: track107.id, quality: 'lossless' });
    assert.equal(change.queued, true);
    assert.equal(change.direction, 'downgrade');
    assert.equal(change.previousQuality, 'hires');
    const changeDone = await waitJob(change.jobId);
    assert.equal(changeDone.replaced, true);
    assert.equal(changeDone.direction, 'downgrade');
    assert.equal(changeDone.quality, 'lossless');
    assert.equal(changeDone.path, track107.path, 'same-container downgrade replaces bytes in place');
    assert.deepEqual(fs.readFileSync(track107.path), cd, 'in-place FLAC downgrade carries the lower-tier bytes');
    const sameTier = await invoke('track.changeQuality', { trackId: track107.id, quality: 'lossless' });
    assert.equal(sameTier.queued, false);
    assert.equal(sameTier.direction, 'same');
    const afterChange = await invoke('bootstrap');
    const kept107 = afterChange.tracks.find(t => t.id === track107.id); assert(kept107);
    assert.equal(kept107.rating, 7.5); assert.equal(kept107.note, 'change keep');
    const after = await invoke('bootstrap'); const kept = after.tracks.find(t => t.id === track.id);
    assert.equal(kept.rating, 9.5); assert.equal(kept.note, 'keep this'); assert.equal(kept.block, '测试区块'); assert.equal(kept.genre, 'Ambient');
    assert(after.favorites.includes(track.id)); assert(after.playlists.find(p => p.id === playlist.id).trackIds.includes(track.id));
    assert(!fs.readdirSync(music).some(name => name.endsWith('.part')), 'staged files cleaned');
    await page.getByRole('button', { name: '退出登录', exact: true }).click(); await page.waitForSelector('.login-stage');
    await page.waitForSelector('.toast', { state: 'detached', timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotDir, 'login.png') });
    assert.deepEqual(errors, []);
    console.log('Discover navigation/cache, search/settings, light/dark/compact layout, real FLAC upgrade, explicit downgrade (blocked without consent, replaced with consent, in-place FLAC) and metadata preservation passed.');
    console.log(`Screenshots: ${screenshotDir}`);
  } finally {
    if (app) await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
