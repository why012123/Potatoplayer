// Isolated Electron + real Java backend + local api-enhanced fixture. Never touches a real account.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, message) { for (let i = 0; i < 240; i++) { if (await fn()) return; await delay(100); } throw Error(message); }
function wav() { const b = Buffer.alloc(176444); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(176400, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40); return b; }
(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-sync-'));
  const music = path.join(home, 'music'); fs.mkdirSync(music); fs.mkdirSync(path.join(home, 'covers'));
  const tracks = ['1', '2', '3'].map((id, i) => {
    const file = path.join(music, `Potato - Song ${id}.wav`); fs.writeFileSync(file, wav());
    return { id: crypto.createHash('sha256').update(file).digest('hex').slice(0, 24), path: file, neteaseId: id,
      title: `曲目 ${id}`, artist: 'Potato', album: '同步测试', duration: 180, block: i === 0 ? 'Air' : '', genre: i === 1 ? 'Anime' : '', playCount: 0, rating: 0 };
  });
  fs.writeFileSync(path.join(home, 'library.json'), JSON.stringify({ schemaVersion: 2, libraryRoot: music, tracks,
    playlists: [{ id: 'local', name: '夜间漫游', trackIds: [tracks[0].id, tracks[1].id], createdAt: Date.now() }], favorites: [], blocks: [{ name: 'Air', color: '#799588' }], genres: [{ name: 'Anime', color: '#9a83b1' }] }));
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ libraryRoot: music, volume: 0, playbackEngine: 'vlc' }));
  fs.writeFileSync(path.join(home, 'netease_cookie.txt'), 'MUSIC_U=test-only');
  let remote = ['2', '3'], account = '42', owner = '42', fail = false, malformed = false, audio = [], onWrite = null, cloudReads = 0;
  const writes = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let body = ''; for await (const part of req) body += part;
    const params = new URLSearchParams(body);
    let data = { code: 200 };
    const playlist = { id: 99, name: '月光与回声', trackCount: remote.length, creator: { userId: Number(owner), nickname: 'Potato' }, trackIds: remote.map(id => ({ id: Number(id) })) };
    if (url.pathname === '/user/account') data = { code: 200, profile: { userId: Number(account), nickname: 'Potato', avatarUrl: '' } };
    if (url.pathname === '/user/playlist') data = { code: 200, playlist: [playlist], more: false };
    if (url.pathname === '/playlist/detail') { cloudReads++; data = { code: 200, playlist: malformed ? { ...playlist, trackIds: [] } : playlist }; }
    if (url.pathname === '/playlist/tracks') {
      writes.push([params.get('op'), params.get('tracks')]);
      if (fail) data = { code: 403, message: 'fixture: permission denied' };
      else { const ids = params.get('tracks').split(','); remote = params.get('op') === 'add' ? [...new Set([...remote, ...ids])] : remote.filter(id => !ids.includes(id)); }
    }
    if (url.pathname === '/playlist/tracks' && onWrite) { const hook = onWrite; onWrite = null; await hook(); }
    if (url.pathname === '/song/order/update') remote = JSON.parse(params.get('ids')).map(String);
    if (url.pathname === '/song/detail') data = { code: 200, songs: [{ id: Number(url.searchParams.get('ids')), name: 'Cloud Song ' + url.searchParams.get('ids'), ar: [{ name: 'Potato' }], al: { name: 'Sync', picUrl: '' } }] };
    if (url.pathname === '/song/url/v1') data = { code: 200, data: [{ url: `http://127.0.0.1:${server.address().port}/audio?id=${url.searchParams.get('id')}`, type: 'wav' }] };
    if (url.pathname === '/audio') { audio.push(url.searchParams.get('id')); res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav()); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let app;
  try {
    const env = { ...process.env, POTATOMUSIC_HOME: home, POTATOMUSIC_LIBRARY: music, POTATO_HIDDEN: '1', POTATO_ALLOW_SECOND_INSTANCE: '1', POTATOMUSIC_API_BASE: `http://127.0.0.1:${server.address().port}` };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = async () => {
      app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env, timeout: 40000 });
      const page = await app.firstWindow(); await page.waitForSelector('.sidebar', { timeout: 30000 }); return page;
    };
    let page = await launch();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const rpc = (method, params) => page.evaluate(({ method, params }) => window.potato.invoke(method, params), { method, params });
    for (const t of tracks) await rpc('library.updateTrack', { trackId: t.id, neteaseId: t.neteaseId, block: t.block, genre: t.genre, rating: 0, note: '' });
    const bindings = async () => (await rpc('sync.list')).bindings;
    const members = async () => (await rpc('bootstrap')).playlists.find(p => p.id === 'local').trackIds;
    const success = async () => until(async () => (await bindings())[0]?.status === 'success', 'sync should succeed: ' + JSON.stringify(await bindings()));
    const unbind = async () => { for (const b of await bindings()) await rpc('sync.unbind', { id: b.id }); };
    const setMembers = async ids => {
      for (const id of await members()) await rpc('playlist.removeTrack', { playlistId: 'local', trackId: id });
      await rpc('playlist.addTracks', { playlistId: 'local', trackIds: ids.map(id => tracks[Number(id) - 1].id) });
    };
    const bind = async (direction, strategy, kind = 'playlist', target = 'local') => rpc('sync.save', { kind, target, cloudId: '99', direction, strategy });
    await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('potato:appearance:v1') || '{}'); Object.assign(raw, { language: 'zh', style: 'editorial' }); localStorage.setItem('potato:appearance:v1', JSON.stringify(raw)); });
    await page.reload(); await page.waitForSelector('.sidebar');
    await page.getByRole('button', { name: '同步', exact: true }).click();
    await page.getByRole('button', { name: '新建绑定', exact: true }).click();
    await page.screenshot({ path: path.join(root, 'dist/review-sync-editor-before.png') });
    await page.getByRole('button', { name: '云端歌单', exact: true }).click();
    await page.getByRole('combobox', { name: '搜索云端歌单' }).fill('月光');
    await page.screenshot({ path: path.join(root, 'dist/review-sync-dropdown.png') });
    await page.getByRole('option', { name: /月光与回声/ }).click();
    await page.getByRole('button', { name: '本地绑定目标', exact: true }).click();
    await page.getByRole('combobox', { name: '搜索本地绑定目标' }).press('Enter');
    await page.screenshot({ path: path.join(root, 'dist/review-sync-editor.png') });
    if (process.argv.includes('--visual-only')) return;
    await page.getByRole('button', { name: '保存绑定', exact: true }).click(); await success();
    assert.deepEqual(new Set(remote), new Set(['1', '2', '3']));
    await page.locator('.sync-card').waitFor();
    await page.screenshot({ path: path.join(root, 'dist/review-sync-light.png') });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: path.join(root, 'dist/review-sync-dark.png') });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.getByRole('button', { name: '编辑 月光与回声', exact: true }).click();
    await page.locator('input[name=direction][value=push]').check();
    await page.locator('input[name=strategy][value=replace]').check();
    await page.getByRole('button', { name: '保存绑定', exact: true }).click(); await success();
    assert.equal((await bindings())[0].direction, 'push', 'UI edits direction');
    assert.equal((await bindings())[0].strategy, 'replace', 'UI edits strategy');
    await page.getByRole('button', { name: '解绑', exact: true }).click();
    await page.getByRole('button', { name: '确认解绑', exact: true }).click();
    await until(async () => !(await bindings()).length, 'UI unbind removes binding');
    assert.equal((await members()).length, 3, 'unbind retains local songs'); assert.equal(remote.length, 3, 'unbind retains cloud songs');
    for (const direction of ['push', 'pull', 'both']) for (const strategy of ['replace', 'add']) {
      await setMembers(['1', '2']); remote = ['2', '3'];
      await bind(direction, strategy); await success();
      const wantedLocal = direction === 'push' ? ['1', '2'] : strategy === 'replace' && direction === 'pull' ? ['2', '3'] : ['1', '2', '3'];
      const wantedCloud = direction === 'pull' ? ['2', '3'] : direction === 'push' && strategy === 'replace' ? ['1', '2'] : ['1', '2', '3'];
      assert.deepEqual(new Set(await members()), new Set(wantedLocal.map(id => tracks[Number(id) - 1].id)), direction + '/' + strategy + ' local');
      assert.deepEqual(new Set(remote), new Set(wantedCloud), direction + '/' + strategy + ' cloud');
      await unbind();
    }
    console.log('[sync] UI binding/unbinding and all six transfer combinations passed');
    await setMembers(['1', '2']); remote = ['1', '2']; await bind('both', 'replace'); await success();
    await rpc('playlist.removeTrack', { playlistId: 'local', trackId: tracks[0].id });
    await until(() => remote.join(',') === '2', 'local edits sync automatically'); await success();
    remote = ['3']; await rpc('sync.run');
    await until(async () => (await members()).join(',') === tracks[2].id, 'three-way cloud deletion and addition'); await success();
    const saved = (await bindings())[0];
    const beforeStartup = cloudReads;
    await app.close(); page = await launch();
    await until(() => cloudReads > beforeStartup, "startup checks the cloud once"); await success();
    assert.equal(cloudReads, beforeStartup + 1, "exactly one startup check");
    assert.equal((await bindings())[0].id, saved.id, 'binding survives backend restart');
    assert.deepEqual((await bindings())[0].baseline, ['3'], 'baseline survives backend restart');
    await unbind();
    await setMembers(['1']); remote = ['1']; await bind('push', 'replace'); await success();
    const previousTime = (await bindings())[0].lastSyncedAt;
    fail = true; await rpc('playlist.addTrack', { playlistId: 'local', trackId: tracks[1].id }); await rpc('sync.run');
    await until(async () => (await bindings())[0].status === 'error', 'write failures visible');
    assert.equal((await bindings())[0].lastSyncedAt, previousTime, 'failed write cannot advance baseline'); assert.deepEqual(remote, ['1']);
    fail = false; await rpc('sync.run'); await until(() => remote.length === 2, 'retry succeeds'); await success();
    const beforeWrites = writes.length; account = '43'; await rpc('sync.run');
    await until(async () => (await bindings())[0].status === 'error', 'account mismatch detected'); assert.equal(writes.length, beforeWrites);
    account = '42'; await unbind();
    owner = '77'; await assert.rejects(() => bind('push', 'add'), /自己创建/);
    await bind('pull', 'replace'); await success(); await unbind(); owner = '42';
    malformed = true; await assert.rejects(() => bind('pull', 'replace'), /未完整/); malformed = false;
    await setMembers(['1']); remote = ['2'];
    onWrite = () => rpc('playlist.removeTrack', { playlistId: 'local', trackId: tracks[0].id });
    await bind('both', 'replace');
    await until(async () => remote.join(',') === '2' && (await members()).join(',') === tracks[1].id, 'concurrent deletion during first sync survives retry');
    await success(); await unbind();
    console.log('[sync] auto-sync, deletion propagation, persistence, permissions, account isolation, concurrent editing and failure recovery passed');
    for (const [kind, target] of [['block', 'Air'], ['genre', 'Anime']]) {
      remote = ['3']; await bind('pull', 'replace', kind, target); await success();
      const actual = (await rpc('bootstrap')).tracks.filter(t => t[kind] === target).map(t => t.neteaseId);
      assert.deepEqual(actual, ['3'], kind + ' receives cloud membership'); await unbind();
    }
    remote = []; await bind('push', 'replace', 'block', 'Air'); await success();
    await rpc('taxonomy.rename', { kind: 'block', oldName: 'Air', name: 'Air Sync' });
    await until(async () => (await bindings())[0].target === 'Air Sync', 'renaming a bound block keeps the binding');
    await rpc('library.bulkUpdate', { trackIds: [tracks[0].id], field: 'block', value: 'Air Sync' });
    await until(() => remote.includes('1'), 'block membership changes automatically push to cloud'); await success();
    await unbind();
    await rpc('library.updateTrack', { trackId: tracks[0].id, neteaseId: '', block: 'Air Sync', genre: 'Anime', rating: 0, note: '' });
    for (const direction of ['push', 'pull', 'both']) for (const strategy of ['replace', 'add']) {
      await setMembers(['1', '2']); remote = ['2', '3']; await bind(direction, strategy); await success();
      const b = (await bindings())[0];
      assert.deepEqual(b.skipped.map(t => t.id), [tracks[0].id]);
      assert.equal(b.skipped[0].title, tracks[0].title); assert.equal(b.skipped[0].artist, 'Potato');
      assert((await members()).includes(tracks[0].id), 'unmapped song retained: ' + direction + '/' + strategy);
      assert(!remote.includes('1'), 'unmapped song not uploaded');
      assert(remote.includes('2'), 'mapped songs still sync');
      await unbind();
    }
    for (const [kind, target] of [['block', 'Air Sync'], ['genre', 'Anime']]) {
      remote = ['2']; await bind('both', 'replace', kind, target); await success();
      assert.equal((await rpc('bootstrap')).tracks.find(t => t.id === tracks[0].id)[kind], target, 'unmapped taxonomy member retained');
      await unbind();
    }
    await setMembers(['1', '2']); remote = ['2']; await bind('push', 'replace'); await success();
    await page.getByRole('button', { name: '同步', exact: true }).click();
    await page.locator('.sync-skipped').waitFor();
    assert((await page.locator('.sync-skipped').innerText()).includes(tracks[0].title), 'skipped title displayed');
    await page.screenshot({ path: path.join(root, 'dist/review-sync-skipped.png') });
    await page.locator('.sync-skipped button').click();
    await page.waitForSelector('.page--editor');
    await page.getByRole('button', { name: '同步', exact: true }).click();
    await unbind();
    console.log('[sync] unmapped songs are listed, editable and retained across all six combinations and taxonomy replacement');
    // Bind existing identities through the normal editor so rescans preserve the fixture IDs.
    for (const t of tracks) await rpc('library.updateTrack', { trackId: t.id, neteaseId: t.neteaseId, block: '', genre: '', rating: 0, note: '' });
    remote = ['4']; await bind('pull', 'replace');
    await until(() => audio.includes('4'), 'missing song downloads');
    await success();
    const boot = await rpc('bootstrap'); const downloaded = boot.tracks.find(t => t.neteaseId === '4');
    assert(downloaded && fs.existsSync(downloaded.path), 'downloaded cloud song exists on disk');
    assert.deepEqual(await members(), [downloaded.id], 'downloaded song joins bound playlist');
    await unbind();
    remote = []; await bind('pull', 'replace'); await success(); assert.deepEqual(await members(), [], 'empty cloud clears membership');
    assert(fs.existsSync(downloaded.path), 'replacement never deletes audio'); await unbind();
    remote = ['2']; await bind('pull', 'replace'); await success();
    await delay(3000); const idleReads = cloudReads;
    remote = ['3'];
    await rpc('playlist.create', { name: 'Unrelated playlist' });
    console.log('[sync] checking 65 seconds of idle time: no periodic cloud reads');
    await delay(65000);
    assert.equal(cloudReads, idleReads, 'no minute polling or cloud check on unrelated local edits');
    assert.deepEqual(await members(), [tracks[1].id], 'cloud changes remain pending until manual sync');
    await rpc('sync.run');
    await until(async () => (await members()).join(',') === tracks[2].id, 'manual check receives cloud change');
    await success(); await unbind();
    assert.deepEqual(errors, []);
    console.log('[sync] blocks, genres, queued download/import, empty replacement and file retention passed');
    console.log('Sync smoke passed. Fixture: ' + home);
  } finally { if (app) await app.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
