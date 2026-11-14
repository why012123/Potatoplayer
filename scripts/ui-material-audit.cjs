// Material audit for the AI shell: screenshots + computed-style inventory of the
// shared editorial pages. Uses an isolated profile that references the local
// library index read-only (never writes to ~/.potatomusic-ai).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const source = path.join(os.homedir(), '.potatomusic-ai');
const home = path.join(root, 'tmp', 'ui-review-home');
const shots = path.join(root, 'tmp', 'ui-review', 'pages');
const dataFile = path.join(root, 'tmp', 'ui-review', 'material-audit.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATE_FILES = ['settings.json', 'library.json', 'netease_bindings.json', 'eq.json', 'daily_mix.json', 'stats.json', 'netease_aliases.json'];

function prepareHome() {
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  for (const file of STATE_FILES) {
    const from = path.join(source, file);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(home, file));
  }
  try {
    const settingsPath = path.join(home, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.volume = 0;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
  } catch {}
  fs.mkdirSync(shots, { recursive: true });
}

const PAGES = [
  { key: 'home', labels: ['首页', 'Home'] },
  { key: 'songs', labels: ['歌曲', 'Songs'] },
  { key: 'albums', labels: ['专辑', 'Albums'] },
  { key: 'artists', labels: ['艺术家', 'Artists'] },
  { key: 'collections', labels: ['合集', 'Collections'] },
  { key: 'favorites', labels: ['收藏', 'Favorites'] },
  { key: 'comments', labels: ['评论', 'Comments'] },
  { key: 'discover', labels: ['发现', 'Discover'] },
  { key: 'sync', labels: ['同步', 'Sync'] },
  { key: 'daily', labels: ['每日推荐', 'Daily mix'], more: true },
  { key: 'stats', labels: ['聆听统计', 'Listening stats'], more: true },
  { key: 'editor', labels: ['歌曲编辑', 'Song editor'], more: true },
  { key: 'ai', labels: ['AI 工作台', 'AI workspace'], more: true },
  { key: 'settings', settings: true },
];

async function clickSidebar(page, labels) {
  for (const label of labels) {
    const direct = page.locator('.ai-sidebar .nav-item').filter({ hasText: label }).first();
    if ((await direct.count()) && (await direct.isVisible())) {
      await direct.click();
      return true;
    }
  }
  return false;
}

async function expandMore(page) {
  const more = page.locator('.ai-sidebar .nav-item--more').first();
  if (await more.count()) {
    const expanded = await more.getAttribute('aria-expanded');
    if (expanded !== 'true') await more.click();
    await delay(320);
  }
}

async function goto(page, entry) {
  if (entry.settings) {
    await page.locator('.ai-sidebar .sidebar-settings').click();
    await page.waitForSelector('.settings-page', { timeout: 20000 });
    await delay(500);
    return;
  }
  let ok = await clickSidebar(page, entry.labels);
  if (!ok) {
    await expandMore(page);
    ok = await clickSidebar(page, entry.labels);
  }
  if (!ok) throw new Error('nav not found: ' + entry.key);
  await delay(700);
}

async function audit(page) {
  return page.evaluate(() => {
    const items = [];
    const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    for (const el of document.querySelectorAll('.page-shell *, .ai-sidebar *')) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 16) continue;
      const s = getComputedStyle(el);
      const bg = s.backgroundImage !== 'none' ? s.backgroundImage : s.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'none') continue;
      const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
      items.push({
        tag: el.tagName.toLowerCase(),
        cls: String(cls).slice(0, 120),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        bg: String(bg).slice(0, 260),
        radius: s.borderRadius,
        border: `${s.borderTopWidth} ${s.borderTopColor}`,
        shadow: String(s.boxShadow).slice(0, 160),
        backdrop: s.backdropFilter && s.backdropFilter !== 'none' ? s.backdropFilter : '',
        parent: (el.parentElement && typeof el.parentElement.className === 'string' ? el.parentElement.className : '').slice(0, 80),
      });
    }
    return items;
  });
}

(async () => {
  prepareHome();
  const env = { ...process.env, POTATOMUSIC_HOME: home, POTATOMUSIC_IMPORT_SUPER: '0', POTATO_HIDDEN: '1', POTATO_ALLOW_SECOND_INSTANCE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env, timeout: 45000 });
  const report = { pages: [] };
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.ai-sidebar', { timeout: 45000 });
    const appearance = {
      style: 'classic', accent: 'sage', display: 'serif', corners: 'soft', density: 'comfortable', atmosphere: 'rich',
      graphics: { glassBlur: 38, controlBlur: true, coverBackground: true, backgroundDetail: 'high', shadows: true },
      animationLevel: 'full', pageTransitions: false, backgroundTransition: false, language: 'zh',
    };
    await page.evaluate((value) => {
      localStorage.setItem('potato:appearance:v1', JSON.stringify(value));
      localStorage.setItem('potato:theme', 'light');
    }, appearance);
    await page.reload();
    await page.waitForSelector('.ai-sidebar', { timeout: 45000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await delay(1000);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => localStorage.setItem('potato:theme', value), theme);
      await page.reload();
      await page.waitForSelector('.ai-sidebar', { timeout: 45000 });
      await delay(700);
      for (const entry of PAGES) {
        try {
          await goto(page, entry);
          await page.screenshot({ path: path.join(shots, `${entry.key}-${theme}.png`) });
          const items = await audit(page);
          report.pages.push({ page: entry.key, theme, items });
          console.log(`${theme}/${entry.key}: ${items.length} painted surfaces`);
        } catch (error) {
          console.log(`${theme}/${entry.key}: FAILED ${error.message}`);
        }
        if (entry.more) await expandMore(page);
      }
    }
    fs.writeFileSync(dataFile, JSON.stringify(report));
    console.log('audit written to', dataFile);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
