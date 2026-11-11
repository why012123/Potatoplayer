const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-package-'));
const mount = path.join(tmp, 'mounted');
const bundle = path.resolve(process.argv[2] || path.join(mount, 'PotatoMusicAI.app'));
const executablePath = path.join(bundle, 'Contents/MacOS/PotatoMusicAI');
let mounted = false;
const music = path.join(tmp, 'Music');
fs.mkdirSync(music);
// A synthetic, silent WAV exercises scanning, decoding and the playback clock.
const samples = 44100 * 8;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
fs.writeFileSync(path.join(music, 'Packaging test.wav'), wav);
(async () => {
  try {
    if (!process.argv[2]) {
      const version = require('../package.json').version;
      fs.mkdirSync(mount);
      execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount,
        path.join(root, `release/PotatoMusicAI-${version}-macOS-arm64.dmg`)], {stdio: 'inherit'});
      mounted = true;
    }
    execFileSync('codesign', ['--verify', '--deep', '--strict', bundle]);
    for (const engine of ['vlc', 'potatohq', 'mpv']) {
      const home = path.join(tmp, engine);
      fs.mkdirSync(home);
      fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({libraryRoot: music, playbackEngine: engine, volume: 0, followSourceRate: false}));
      // Deliberately exclude Homebrew, JAVA_HOME and all developer overrides.
      const env = { HOME: home, TMPDIR: os.tmpdir(), PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        POTATOMUSIC_HOME: home, POTATOMUSIC_LIBRARY: music, POTATO_HIDDEN: '1',
        POTATO_ALLOW_SECOND_INSTANCE: '1', POTATO_DEBUG: '1',
        POTATOMUSIC_API_BASE: 'http://127.0.0.1:18371', POTATOMUSIC_QQ_API_BASE: 'http://127.0.0.1:18372' };
      const app = await electron.launch({executablePath, args: [], cwd: tmp, env, timeout: 40000});
      app.process().stderr.on('data', data => { if (/error|exception|fatal/i.test(String(data))) process.stderr.write(data); });
      try {
        const page = await app.firstWindow();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.waitForSelector('.ai-sidebar', {timeout: 40000});
        const invoke = (method, params = {}) => page.evaluate(({method, params}) => window.potato.invoke(method, params), {method, params});
        await invoke('library.scan');
        let boot;
        for (let i = 0; i < 80; i++) {
          boot = await invoke('bootstrap');
          if (boot.tracks.length) break;
          await page.waitForTimeout(200);
        }
        assert.equal(boot.tracks.length, 1, 'isolated test library scanned');
        assert.equal(boot.settings.playbackEngine, engine);
        await invoke('playback.volume', {volume: 0});
        await invoke('playback.play', {trackId: boot.tracks[0].id});
        let state;
        for (let i = 0; i < 60; i++) {
          state = await invoke('playback.state');
          if (state.playing && state.time > 0.1) break;
          await page.waitForTimeout(200);
        }
        assert.ok(state.available && state.playing && state.time > 0.1, `${engine}: ${JSON.stringify(state)}`);
        await invoke('playback.toggle');
        if (engine === 'vlc') {
          for (const service of ['netease', 'qq']) {
            const status = await invoke(`${service}.startService`);
            assert.equal(status.service, true, `${service}: ${JSON.stringify(status)}`);
          }
          await page.evaluate(() => window.potato.openUltra());
          for (let i = 0; i < 50 && app.windows().length < 2; i++) await page.waitForTimeout(100);
          assert.equal(app.windows().length, 2, 'Ultra window opened');
          const ultra = app.windows()[1];
          await ultra.waitForLoadState('domcontentloaded');
          assert.ok(ultra.url().includes('ultra-rhine/dist/index.html'));
          await page.screenshot({path: path.join(root, 'release/package-smoke.png')});
        }
        assert.deepEqual(errors, []);
        console.log(`[package-test] ${engine}: UI, backend, scan and playback passed`);
      } finally { await app.close(); }
    }
  } finally {
    if (mounted) execFileSync('hdiutil', ['detach', mount], {stdio: 'inherit'});
    fs.rmSync(tmp, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
