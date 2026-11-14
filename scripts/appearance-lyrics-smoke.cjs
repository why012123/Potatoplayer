// Isolated Electron regression: preferences, lyric following, and transient downloads.
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-appearance-'));
  const music = path.join(home, 'music'); fs.mkdirSync(music);
  const wav = Buffer.alloc(44 + 16000 * 180);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (const name of ['Studio - Evening', 'Studio - Morning']) {
    fs.writeFileSync(path.join(music, `${name}.wav`), wav);
    fs.writeFileSync(path.join(music, `${name}.lrc`), Array.from({ length: 40 }, (_, i) => `[${String(Math.floor(i * 4 / 60)).padStart(2, '0')}:${String(i * 4 % 60).padStart(2, '0')}.00]第 ${i + 1} 句，音乐在这里继续`).join('\n'));
  }
  const env = { ...process.env, POTATOMUSIC_HOME: home, POTATOMUSIC_LIBRARY: music, POTATOMUSIC_IMPORT_SUPER: '0', POTATO_HIDDEN: '1', POTATO_ALLOW_SECOND_INSTANCE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env, timeout: 40000 });
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('.ai-record-card', { timeout: 45000 });
    const invoke = (method, params = {}) => page.evaluate(([method, params]) => window.potato.invoke(method, params), [method, params]);
    await invoke('playback.volume', { volume: 0 });
    await invoke('playback.mute', { muted: true });
    await page.setViewportSize({ width: 1360, height: 856 });
    await page.getByRole('button', { name: '播放页面侧栏', exact: true }).click();
    await page.waitForSelector('.ai-np-lyrics button.is-current');
    await page.clock.install();
    const centered = () => page.waitForFunction(() => {
      const list = document.querySelector('.ai-np-content').getBoundingClientRect();
      const row = document.querySelector('.ai-np-lyrics .is-current').getBoundingClientRect();
      return Math.abs(row.top + row.height / 2 - list.top - list.height / 2) < 3;
    });
    await centered();
    const browse = async (gesture = 'wheel') => {
      await page.locator('.ai-np-content').dispatchEvent(gesture, gesture === 'wheel' ? { deltaY: 500 } : {});
      await page.locator('.ai-np-content').evaluate(el => { el.scrollTop += 500; });
      await page.waitForSelector('.ai-np-resume');
    };
    await browse();
    await page.clock.fastForward(2500);
    await page.locator('.ai-np-content').dispatchEvent('wheel', { deltaY: 50 });
    await page.clock.fastForward(2500);
    assert(await page.locator('.ai-np-resume').isVisible(), 'more scrolling extends the pause');
    await page.clock.fastForward(4200);
    await page.waitForSelector('.ai-np-resume', { state: 'detached' });
    await centered(); // Playback time has not changed: this catches the original regression.
    await browse('touchmove');
    await page.getByRole('button', { name: '回到当前歌词' }).click();
    await centered();
    await browse();
    await page.getByRole('tab', { name: /播放队列/ }).click();
    await page.getByRole('tab', { name: '歌词', exact: true }).click();
    await centered();
    await page.setViewportSize({ width: 1100, height: 740 });
    await centered();
    await page.screenshot({ path: '/tmp/potato-polish-lyrics.png' });
    console.log('[appearance] wheel, touch, timed/manual resume, tabs and resize passed');

    // Exercise the actual settings controls, including the old dark/sans cascade bug.
    await page.locator('.ai-sidebar .sidebar-settings').click();
    await page.getByRole('button', { name: '个性化', exact: true }).click();
    const font = () => page.locator('#personalization-title').evaluate(el => getComputedStyle(el).fontFamily);
    const choose = (label, text) => page.getByRole('group', { name: label, exact: true }).getByRole('button', { name: text, exact: true }).click();
    for (const styleIndex of [0, 1]) {
      await page.locator('.style-preset').nth(styleIndex).click();
      for (const theme of ['light', 'dark']) {
        await page.locator('.theme-choice button').nth(theme === 'light' ? 0 : 1).click();
        await choose('界面字体', '无衬线'); assert(!/Iowan|Palatino|Songti|Georgia/.test(await font()), 'sans must win in both themes');
        await choose('界面字体', '衬线'); assert(/Iowan/.test(await font()));
      }
    }
    await choose('圆角', '利落');
    assert.equal(await page.locator('.ai-now-playing').evaluate(el => getComputedStyle(el).borderTopLeftRadius), '16px');
    await choose('密度', '紧凑');
    assert.equal(await page.locator('.ai-app').evaluate(el => getComputedStyle(el).paddingTop), '10px');
    await page.getByRole('group', { name: '渲染预设' }).getByRole('button', { name: /轻量/ }).click();
    for (const selector of ['.ai-sidebar', '.ai-now-playing', '.page-shell', '.ai-player', '.modal', '.ai-search']) {
      const style = await page.locator(selector).evaluate(el => ({ blur: getComputedStyle(el).backdropFilter, shadow: getComputedStyle(el).boxShadow }));
      assert.equal(style.blur, 'none', `${selector} blur disabled`); assert.equal(style.shadow, 'none', `${selector} shadow disabled`);
    }
    await choose('动画档位', '关闭');
    assert.equal(await page.locator('.ai-sidebar .nav-item').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.getByRole('button', { name: '关闭个性化', exact: true }).click();
    await page.waitForSelector('.personalization-dialog', { state: 'detached' });
    await page.screenshot({ path: '/tmp/potato-polish-classic-dark.png' });
    await page.reload(); await page.waitForSelector('.ai-sidebar');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.display), 'serif');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.density), 'compact');
    console.log('[appearance] classic/editorial, fonts, light/dark, corners, density, graphics, motion and persistence passed');

    // Actual local assistant receives audio-header metadata, not a requested quality label.
    await page.getByRole('button', { name: 'AI侧栏', exact: true }).click();
    await page.locator('.ai-assistant textarea').fill('这首歌的采样率是多少');
    await page.locator('.ai-assistant textarea').press('Enter');
    await page.waitForFunction(() => document.querySelector('.ai-assistant').textContent.includes('8000 Hz'));
    assert((await page.locator('.ai-assistant').innerText()).includes('16 bit'));

    const progress = async (jobId, phase = 'downloading', downloaded = 1) => {
      await app.evaluate(({ BrowserWindow }, data) => BrowserWindow.getAllWindows()[0].webContents.send('backend:event', { event: 'download.progress', data }), {
        jobId, neteaseId: 'test', title: 'Transient download', downloaded, total: 100, phase, source: 'netease',
      });
    };
    await progress('tray-1'); await page.waitForSelector('.download-tray');
    await page.mouse.move(0, 0);
    await page.clock.fastForward(5000);
    await progress('tray-1', 'verifying', 100);
    await page.waitForFunction(() => document.querySelector('.download-tray')?.textContent.includes('校验'));
    await page.clock.fastForward(3500);
    await page.waitForSelector('.download-tray', { state: 'detached' });
    await progress('tray-1', 'finalizing', 100);
    assert.equal(await page.locator('.download-tray').count(), 0, 'progress must not reopen the toast');
    await page.getByRole('button', { name: '下载任务', exact: true }).click();
    await page.waitForSelector('.download-panel');
    assert((await page.locator('.download-panel').innerText()).includes('正在整理'));
    console.log('[appearance] measured audio specs and download auto-hide without cancelling passed');
    assert.deepEqual(errors, []);
  } finally {
    if (app) await app.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
