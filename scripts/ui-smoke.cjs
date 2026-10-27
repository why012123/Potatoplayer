const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const electronPath = require("electron");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "potato-ui-"));
  const env = {
    ...process.env,
    POTATOMUSIC_HOME: home,
    POTATO_HIDDEN: "1",
    POTATO_ALLOW_SECOND_INSTANCE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: ["."],
    cwd: root,
    env,
    timeout: 40_000,
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Content Security Policy")) {
      pageErrors.push(message.text());
    }
  });

  await page.waitForSelector(".sidebar", { timeout: 30_000 });

  // The product now supports both languages and two visual languages. Keep
  // this functional smoke test deterministic and silent before touching UI.
  await page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("potato:appearance:v1") || "{}");
      raw.language = "en";
      raw.style = "editorial";
      raw.display = "serif";
      raw.corners = "soft";
      raw.density = "comfortable";
      raw.atmosphere = "rich";
      raw.accent = "cover";
      localStorage.setItem("potato:appearance:v1", JSON.stringify(raw));
      localStorage.setItem("potato:theme", "light");
    } catch {
      // The app still boots with defaults if storage is unavailable.
    }
  });
  await page.reload();
  await page.waitForSelector(".sidebar", { timeout: 30_000 });
  await page.waitForSelector(".media-card", { timeout: 30_000 });
  await page.evaluate(async () => {
    await window.potato.invoke("playback.volume", { volume: 0 });
    await window.potato.invoke("playback.mute", { muted: true });
  });
  // The panel state is persisted between sessions. Tests should begin from the
  // full three-column state even if a previous run stopped while collapsed.
  if (await page.locator(".mini-player").count()) {
    await page.getByRole("button", { name: "Expand now playing" }).click();
    await page.waitForSelector(".now-playing");
  }
  await delay(600);
  console.log("[ui] shell and library rendered");

  // Exercise the new appearance studio and language switch before the core
  // playback flow. CSS class hooks stay stable across both languages.
  await page.locator(".topbar-avatar").click();
  await page.waitForSelector(".settings-dialog");
  await page.locator(".style-preset").nth(1).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.style), "classic");
  await page.locator(".style-preset").nth(0).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.style), "editorial");
  await page.locator(".language-choice .settings-choice").nth(1).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#settings-title").innerText(), "设置");
  await page.locator(".language-choice .settings-choice").nth(0).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#settings-title").innerText(), "Settings");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.waitForSelector(".settings-dialog", { state: "detached" });
  console.log("[ui] appearance presets and language switch responded");

  await page.getByRole("button", { name: "Songs", exact: true }).click();
  await page.waitForSelector(".page--songs", { timeout: 10_000 });
  await delay(450);
  const trackCount = await page.locator(".track-row").count();
  assert.ok(trackCount > 5, "songs page should contain the whole library");
  console.log(`[ui] songs page: ${trackCount} rendered rows`);

  await page.locator(".track-row").first().click();
  let state = await page.evaluate(() => window.potato.invoke("playback.state"));
  // VLC can take a moment to open the output device when another player is
  // using the machine, so wait for the clock instead of asserting one snapshot.
  for (let attempt = 0; attempt < 24 && (!state.playing || state.time <= 0.1); attempt++) {
    await delay(250);
    state = await page.evaluate(() => window.potato.invoke("playback.state"));
  }
  assert.equal(state.available, true, "VLC should be available");
  assert.equal(state.playing, true, "track should be playing");
  assert.ok(state.time > 0.1, "playback clock should advance");
  await page
    .waitForFunction(
      () => {
        const image = document.querySelector(".now-playing__art img");
        return Boolean(image && image.complete && image.naturalWidth > 0);
      },
      { timeout: 8_000 },
    )
    .catch(() => undefined);
  const cover = await page.evaluate(() => {
    const image = document.querySelector(".now-playing__art img");
    return image ? { complete: image.complete, width: image.naturalWidth } : null;
  });
  assert.ok(cover && cover.width > 0, "now-playing artwork should render");
  console.log(`[ui] playing for ${state.time.toFixed(1)}s, artwork ${cover.width}px`);

  await page.locator(".transport__play").click();
  await delay(250);
  state = await page.evaluate(() => window.potato.invoke("playback.state"));
  assert.equal(state.playing, false, "pause should work");
  console.log("[ui] transport and pause responded");

  await page.locator(".now-playing__art-button").click();
  await page.waitForSelector(".immerse");
  assert.ok((await page.locator(".immerse__lyric").count()) > 0, "immersive view should show lyrics");
  assert.ok(await page.locator(".immerse__top").isVisible(), "immersive shell should be visible");
  await page.getByRole("button", { name: "Customize immersive mode" }).click();
  await page.waitForSelector(".immersive-customizer");
  assert.equal(await page.locator(".immersive-customizer-scrim").count(), 0, "customizer should not dim the scene");
  assert.ok(await page.locator(".immerse__lyrics-side").isVisible(), "lyrics should remain visible beside the panel");
  const frameToggle = page.locator(".custom-toggle").filter({ hasText: "Lyrics frame" });
  assert.equal(await frameToggle.getAttribute("aria-checked"), "true", "lyrics frame should start enabled");
  await frameToggle.click();
  await page.waitForSelector(".immerse--no-lyrics-frame");
  const frameBackground = await page
    .locator(".immerse__lyrics-side")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  assert.equal(frameBackground, "rgba(0, 0, 0, 0)", "lyrics frame toggle should remove the panel surface");
  await frameToggle.click();
  await page.waitForSelector(".immerse--no-lyrics-frame", { state: "detached" });

  // The old 3D stage is gone. Exercise the replacement from the same
  // customizer and confirm the two views can switch without losing playback.
  await page.locator(".immersive-customizer").getByRole("button", { name: "Lyric stage", exact: true }).click();
  await page.waitForSelector(".stage", { timeout: 10_000 });
  await page.waitForSelector(".stage-line", { timeout: 10_000 });
  assert.ok((await page.locator(".stage-line").count()) > 0, "lyric stage should render timed lines");
  assert.ok(await page.locator(".stage__lyrics-head").isVisible(), "lyric stage header should be visible");
  await page.locator(".immersive-customizer").getByRole("button", { name: "Close customizer" }).click();
  await page.waitForSelector(".immersive-customizer", { state: "detached" });
  await page.locator(".stage__view-switch").getByRole("button", { name: "Classic", exact: true }).click();
  await page.waitForSelector(".immerse", { timeout: 10_000 });
  await page.waitForSelector(".immersive-customizer", { state: "detached" });
  console.log("[ui] lyric stage opened and returned to classic");
  await page.getByRole("button", { name: "Open equalizer" }).click();
  await page.waitForSelector(".eq-dialog");
  await page.getByRole("button", { name: "Close equalizer" }).click();
  await page.waitForSelector(".eq-dialog", { state: "detached" });
  assert.ok(await page.locator(".immerse__top").isVisible(), "immersive view should remain after closing EQ");
  console.log("[ui] immersive playback opened from cover");
  await page.locator(".immerse__cover-button").click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator(".immerse").count(), 0, "cover click should leave immersive view");
  await page.waitForSelector(".now-playing");
  console.log("[ui] immersive playback closed from cover");

  await page.getByRole("button", { name: "Equalizer" }).click();
  await page.waitForSelector(".eq-dialog");
  assert.equal(await page.locator(".eq-band__input").count(), 10, "equalizer should render ten bands");
  assert.ok((await page.locator(".eq-preset select").count()) === 1, "equalizer should expose one editing target");
  await page.locator(".eq-preset select").selectOption({ label: "Dance" });
  await page.waitForTimeout(350);
  const beforeEnable = await page.evaluate(async () => await window.potato.invoke("eq.state"));
  if (!beforeEnable.enabled) {
    await page.locator(".eq-power").click();
    await page.waitForTimeout(350);
  }
  const eqState = await page.evaluate(async () => await window.potato.invoke("eq.state"));
  assert.equal(eqState.enabled, true, "the EQ should be enabled for preview and save");
  assert.equal(eqState.bands.length, 10, "EQ state should contain ten bands");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Save to this song" }).click();
  await page.waitForTimeout(450);
  const songEq = await page.evaluate(async () => await window.potato.invoke("eq.state"));
  assert.equal(songEq.songPreset?.bands?.length, 10, "per-song EQ should be saved");
  assert.ok((songEq.songCount ?? 0) >= 1, "per-song EQ count should increase");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Save as new preset…" }).click();
  await page.waitForSelector(".prompt-dialog");
  await page.locator(".prompt-dialog input").fill("UI curve");
  await page.locator(".prompt-dialog .button--dark").click();
  await page.waitForSelector(".prompt-dialog", { state: "detached" });
  const savedEq = await page.evaluate(async () => await window.potato.invoke("eq.state"));
  assert.ok(savedEq.presets.some((preset) => preset.name === "UI curve"), "custom EQ preset should be saved");
  await page.getByRole("button", { name: "Close equalizer" }).click();
  await page.waitForTimeout(300);
  console.log("[ui] equalizer rendered, song curve and named preset saved");

  await page.keyboard.press("Meta+f");
  await page.keyboard.type("Mili");
  await page.waitForSelector(".page--search", { timeout: 5_000 });
  await delay(350);
  const results = await page.locator(".track-row").count();
  assert.ok(results > 0, "search should return matching songs");
  console.log(`[ui] search returned ${results} rows`);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".page--songs", { timeout: 5_000 });
  await delay(350);
  const heart = page.locator(".page--songs .track-row .row-heart").first();
  await heart.click({ force: true });
  await delay(350);
  await page.locator(".side-nav .nav-item").filter({ hasText: "Favorites" }).click();
  await page.waitForSelector(".page--favorites", { timeout: 5_000 });
  await delay(450);
  const favoriteRows = await page.locator(".track-row").count();
  assert.ok(favoriteRows > 0, "favorites page should show saved track");
  console.log(`[ui] favorite saved and rendered (${favoriteRows} row)`);

  await page.getByRole("button", { name: "Albums", exact: true }).click();
  await page.waitForSelector(".page--albums .collection-card");
  const collections = await page.locator(".collection-card").count();
  assert.ok(collections > 0, "album collections should exist");
  console.log(`[ui] album grid: ${collections} collections`);

  await page.getByRole("button", { name: "Songs", exact: true }).click();
  await page.waitForSelector(".page--songs");
  await page.waitForTimeout(350);
  const blockSelect = page.getByLabel("Filter by block");
  await blockSelect.selectOption({ label: "iList Light" });
  await page.waitForTimeout(300);
  const filtered = await page.locator(".page--songs .track-row").count();
  assert.ok(filtered > 0 && filtered < trackCount, "block focus should narrow the table");
  assert.equal(await page.locator(".taxonomy-select").first().locator("select").inputValue(), "iList Light");
  console.log(`[ui] block focus narrowed library to ${filtered}`);
  await blockSelect.selectOption("");

  await page.locator(".page--songs .track-row .row-more").first().click();
  await page.getByRole("button", { name: "Edit in song editor" }).click();
  await page.waitForSelector(".page--editor", { timeout: 10_000 });
  await page.locator(".editor-select-wrap select").first().selectOption({ label: "iList Standard" });
  await page.locator(".editor-note").fill("UI editor note");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(650);
  const editorStatus = await page.locator(".editor-status").innerText();
  assert.ok(editorStatus.includes("Saved"), "editor should report a saved state");
  const savedTrack = await page.evaluate(async () => {
    const data = await window.potato.invoke("bootstrap");
    return data.tracks.find((track) => track.note === "UI editor note");
  });
  assert.ok(savedTrack && savedTrack.block === "iList Standard", "editor changes should persist");
  const editorTitleBefore = await page.locator(".editor-heading h2").innerText();
  await page.locator(".editor-track").nth(1).click();
  await page
    .waitForFunction(
      (before) => document.querySelector(".editor-heading h2")?.textContent !== before,
      editorTitleBefore,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  const editorTitleAfter = await page.locator(".editor-heading h2").innerText();
  assert.notEqual(editorTitleAfter, editorTitleBefore, "editor list should switch the selected song");
  console.log("[ui] song editor saved block and note, and switched tracks");
  await page.getByRole("button", { name: "Songs", exact: true }).click();
  await page.waitForSelector(".page--songs", { timeout: 5_000 });
  await page.waitForTimeout(350);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator(".page--songs .track-row").nth(0).click();
  await page.locator(".page--songs .track-row").nth(1).click();
  await page.waitForSelector(".bulk-bar");
  assert.ok((await page.locator(".bulk-bar").innerText()).includes("2"));
  const queueBefore = await page.evaluate(async () => await window.potato.invoke("playback.state"));
  await page.locator(".bulk-bar").getByRole("button", { name: "Add to queue" }).click();
  await page.waitForTimeout(450);
  const queueAfter = await page.evaluate(async () => await window.potato.invoke("playback.state"));
  assert.ok(queueAfter.queue.length >= queueBefore.queue.length + 1, "bulk add to queue should append songs");
  await page.locator(".bulk-bar").getByRole("button", { name: "Assign genre" }).click();
  await page.waitForSelector(".bulk-dialog");
  await page.locator(".bulk-dialog input").fill("City Pop");
  await page.getByRole("button", { name: /Apply to 2/ }).click();
  await page.waitForTimeout(500);
  console.log("[ui] bulk genre assignment saved");
  await page.getByRole("button", { name: "Done", exact: true }).last().click();

  await page.locator(".side-nav .nav-item").filter({ hasText: "Collections" }).click();
  await page.waitForSelector(".page--collections .tag-card");
  const tagCards = await page.locator(".tag-card").count();
  assert.ok(tagCards >= 8, "blocks and genres should render as cards");
  await page.locator(".tag-card").first().click();
  await page.waitForSelector(".tag-hero");
  assert.ok((await page.locator(".tag-hero h1").innerText()).length > 0);
  console.log(`[ui] collection system: ${tagCards} tag cards, detail page opened`);

  await page.locator(".back-link").click();
  await page.waitForSelector(".page--collections");
  await page.getByRole("button", { name: "Manage blocks" }).click();
  await page.waitForSelector(".taxonomy-dialog");
  const imeInput = page.getByPlaceholder("New block name");
  const imeRows = await page.locator(".taxonomy-row").count();
  await imeInput.fill("IME probe");
  await imeInput.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    }));
  });
  await page.waitForTimeout(350);
  assert.equal(await page.locator(".taxonomy-row").count(), imeRows, "IME Enter must not create a block");
  assert.equal(await imeInput.inputValue(), "IME probe", "IME confirmation must keep the typed name");
  await imeInput.press("Enter");
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".taxonomy-row").count(), imeRows + 1, "normal Enter should create a block");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  console.log("[ui] IME Enter ignored; normal Enter created the block");

  await page.locator(".nav-item--online").click();
  await page.waitForSelector(".page--discover");
  await page.waitForSelector(".online-user", { timeout: 35_000 });
  await page.locator(".online-search input").fill("Mili");
  await page.locator(".online-search button[type=submit]").click();
  await page.waitForSelector(".online-song", { timeout: 25_000 });
  const onlineRows = await page.locator(".online-song").count();
  assert.ok(onlineRows > 0, "NetEase search should return songs");
  console.log(`[ui] NetEase search returned ${onlineRows} songs`);
  const sourceButton = page.locator(".nav-item__source");
  const sourceBefore = await sourceButton.innerText();
  await sourceButton.click();
  await page.waitForTimeout(600);
  const sourceAfter = await sourceButton.innerText();
  assert.notEqual(sourceAfter, sourceBefore, "the online source badge should switch on the active Discover page");
  await sourceButton.click();
  await page.waitForTimeout(400);
  console.log(`[ui] online source switched ${sourceBefore} -> ${sourceAfter} and back`);

  await page.keyboard.press("Meta+k");
  await page.waitForSelector(".command-palette");
  assert.ok((await page.locator(".command-item").count()) > 0, "command palette should have actions");
  await page.screenshot({ path: path.join(root, "dist", "test-command-palette.png") });
  await page.keyboard.press("Escape");

  const widthWithPanel = await page.locator(".page-shell").evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "Hide now playing" }).click();
  await page.waitForSelector(".mini-player");
  await page.waitForSelector(".workspace-body--solo");
  await page.waitForTimeout(500);
  const widthWithoutPanel = await page.locator(".page-shell").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(widthWithoutPanel > widthWithPanel + 200, "content should expand when now playing collapses");
  console.log(`[ui] collapsing now playing expands content ${widthWithPanel} -> ${widthWithoutPanel}px`);
  await page.getByRole("button", { name: "Expand now playing" }).click();
  await page.waitForSelector(".now-playing");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.waitForSelector(".page--home .hero");
  await page.screenshot({ path: path.join(root, "dist", "test-ui-home.png") });

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.waitForTimeout(500);
  let appearance = await page.evaluate(() => ({
    attr: document.documentElement.dataset.theme,
    stored: localStorage.getItem("potato:theme"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(appearance.attr, "dark", "dark theme should set the root theme");
  assert.equal(appearance.stored, "dark", "dark theme should persist");
  await page.reload();
  await page.waitForSelector(".page--home .hero", { timeout: 30_000 });
  appearance = await page.evaluate(() => ({
    attr: document.documentElement.dataset.theme,
    stored: localStorage.getItem("potato:theme"),
    style: document.documentElement.dataset.style,
    display: document.documentElement.dataset.display,
    lang: document.documentElement.lang,
  }));
  assert.equal(appearance.attr, "dark", "dark theme should survive a renderer reload");
  assert.equal(appearance.stored, "dark", "stored theme should survive a renderer reload");
  assert.equal(appearance.style, "editorial", "visual style should survive a renderer reload");
  assert.equal(appearance.display, "serif", "display font should survive a renderer reload");
  assert.equal(appearance.lang, "en", "language should survive a renderer reload");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.waitForTimeout(350);
  appearance = await page.evaluate(() => ({
    attr: document.documentElement.dataset.theme,
    stored: localStorage.getItem("potato:theme"),
  }));
  assert.equal(appearance.attr, "light", "light theme should be restored");
  assert.equal(appearance.stored, "light", "light theme should persist");
  console.log("[ui] theme switched dark -> reload -> light");

  assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join(" | ")}`);
  await app.close();
  fs.rmSync(home, { recursive: true, force: true });
  console.log("[ui] OK");
})().catch((error) => {
  console.error(`[ui] FAILED: ${error.stack ?? error}`);
  process.exit(1);
});
