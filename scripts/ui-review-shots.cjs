// UI review screenshots in an isolated profile that reuses the local library index.
// Copies only the small JSON state files; covers stay referenced by their absolute
// paths and the music folder is read-only. Never writes to ~/.potatomusic-ai.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const source = path.join(os.homedir(), '.potatomusic-ai');
const home = path.join(root, 'tmp', 'ui-review-home');
const shots = path.join(root, 'tmp', 'ui-review');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATE_FILES = [
  'settings.json',
  'library.json',
  'netease_bindings.json',
  'eq.json',
  'daily_mix.json',
  'stats.json',
  'netease_aliases.json',
];

function prepareHome() {
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  for (const file of STATE_FILES) {
    const from = path.join(source, file);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(home, file));
  }
  // Keep playback silent in the review profile.
  try {
    const settingsPath = path.join(home, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.volume = 0;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
  } catch {
    // A missing settings file just falls back to defaults.
  }
  fs.mkdirSync(shots, { recursive: true });
}

async function clickSidebar(page, labels) {
  for (const label of labels) {
    const button = page.locator('.ai-sidebar button').filter({ hasText: label }).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 1500 });
        return true;
      } catch {
        // Hidden behind a collapsed "more" section; expand and retry below.
      }
    }
  }
  return false;
}

async function expandSidebar(page) {
  for (const label of ['更多', 'More', '音乐工具', 'Music tools']) {
    const button = page.locator('.ai-sidebar button').filter({ hasText: label }).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 1500 });
        await delay(350);
        return;
      } catch {
        // not this one
      }
    }
  }
}

async function setTheme(page, theme) {
  await page.evaluate((value) => localStorage.setItem('potato:theme', value), theme);
  await page.reload();
  await page.waitForSelector('.ai-sidebar', { timeout: 40000 });
  await delay(500);
}

async function openDaily(page) {
  let clicked = await clickSidebar(page, ['每日推荐', 'Daily mix']);
  if (!clicked) {
    await expandSidebar(page);
    clicked = await clickSidebar(page, ['每日推荐', 'Daily mix']);
  }
  if (!clicked) throw new Error('could not find the daily mix navigation entry');
  await page.waitForSelector('.page--daily', { timeout: 20000 });
  await page.waitForSelector('.playlist-hero', { timeout: 20000 });
  await delay(900);
}

(async () => {
  prepareHome();
  const env = {
    ...process.env,
    POTATOMUSIC_HOME: home,
    POTATOMUSIC_IMPORT_SUPER: '0',
    POTATO_HIDDEN: '1',
    POTATO_ALLOW_SECOND_INSTANCE: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: root,
    env,
    timeout: 45000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.ai-sidebar', { timeout: 45000 });
    // Match the current local appearance so screenshots reflect what the user sees.
    const appearance = {
      style: 'classic',
      accent: 'sage',
      display: 'serif',
      corners: 'soft',
      density: 'comfortable',
      atmosphere: 'rich',
      graphics: { glassBlur: 38, controlBlur: true, coverBackground: true, backgroundDetail: 'high', shadows: true },
      animationLevel: 'full',
      pageTransitions: true,
      backgroundTransition: true,
      language: 'zh',
    };
    await page.evaluate((value) => {
      localStorage.setItem('potato:appearance:v1', JSON.stringify(value));
      localStorage.setItem('potato:theme', 'light');
    }, appearance);
    await page.reload();
    await page.waitForSelector('.ai-sidebar', { timeout: 45000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await delay(1200);

    await page.locator('.ai-sidebar').screenshot({ path: path.join(shots, 'sidebar-light.png') });
    await page.screenshot({ path: path.join(shots, 'home-light.png') });
    await openDaily(page);
    await page.locator('.ai-sidebar').screenshot({ path: path.join(shots, 'sidebar-daily-light.png') });
    await page.screenshot({ path: path.join(shots, 'daily-light.png') });
    await page.locator('.playlist-hero').screenshot({ path: path.join(shots, 'daily-hero-light.png') });

    await setTheme(page, 'dark');
    await page.locator('.ai-sidebar').screenshot({ path: path.join(shots, 'sidebar-dark.png') });
    await openDaily(page);
    await page.screenshot({ path: path.join(shots, 'daily-dark.png') });
    await page.locator('.playlist-hero').screenshot({ path: path.join(shots, 'daily-hero-dark.png') });

    console.log('UI screenshots written to', shots);
    for (const name of fs.readdirSync(shots).sort()) console.log(' -', name);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
