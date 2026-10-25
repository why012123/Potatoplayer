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
  const env = { ...process.env, POTATOMUSIC_HOME: home };
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
  await page.waitForSelector(".media-card", { timeout: 30_000 });
  // The panel state is persisted between sessions. Tests should begin from the
  // full three-column state even if a previous run stopped while collapsed.
  if (await page.locator(".mini-player").count()) {
    await page.getByRole("button", { name: "Expand now playing" }).click();
    await page.waitForSelector(".now-playing");
  }
  await delay(600);
  console.log("[ui] shell and library rendered");

  await page.getByRole("button", { name: "Songs", exact: true }).click();
  await page.waitForSelector(".page--songs", { timeout: 10_000 });
  await delay(450);
  const trackCount = await page.locator(".track-row").count();
  assert.ok(trackCount > 5, "songs page should contain the whole library");
  console.log(`[ui] songs page: ${trackCount} rendered rows`);

  await page.locator(".track-row").first().click();
  await delay(1800);
  let state = await page.evaluate(() => window.potato.invoke("playback.state"));
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
  await page.getByRole("button", { name: "Assign genre" }).click();
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
  await page.screenshot({ path: path.join(root, "docs", "screenshots", "ui-collections.png") });

  await page.locator(".nav-item--online").click();
  await page.waitForSelector(".page--discover");
  await page.waitForSelector(".online-user", { timeout: 35_000 });
  await page.locator(".online-search input").fill("Mili");
  await page.locator(".online-search button[type=submit]").click();
  await page.waitForSelector(".online-song", { timeout: 25_000 });
  const onlineRows = await page.locator(".online-song").count();
  assert.ok(onlineRows > 0, "NetEase search should return songs");
  console.log(`[ui] NetEase search returned ${onlineRows} songs`);
  await page.screenshot({ path: path.join(root, "docs", "screenshots", "ui-discover.png") });

  await page.keyboard.press("Meta+k");
  await page.waitForSelector(".command-palette");
  assert.ok((await page.locator(".command-item").count()) > 0, "command palette should have actions");
  await page.screenshot({ path: path.join(root, "docs", "screenshots", "command-palette.png") });
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
  await page.screenshot({ path: path.join(root, "docs", "screenshots", "ui-home.png") });

  assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join(" | ")}`);
  await app.close();
  fs.rmSync(home, { recursive: true, force: true });
  console.log("[ui] OK");
})().catch((error) => {
  console.error(`[ui] FAILED: ${error.stack ?? error}`);
  process.exit(1);
});
