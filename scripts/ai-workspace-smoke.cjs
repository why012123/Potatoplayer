const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const { _electron: electron } = require(path.join(root, "node_modules/playwright-core"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function wav() {
  const buffer = Buffer.alloc(44 + 160000);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(160000, 40);
  return buffer;
}

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "potato-ai-workspace-"));
  const music = path.join(home, "music");
  fs.mkdirSync(music);
  for (const name of ["Test Artist - Morning", "Test Artist - Evening", "Test Artist - Forest", "Test Artist - Sea"]) {
    fs.writeFileSync(path.join(music, `${name}.wav`), wav());
  }
  const env = {
    ...process.env,
    POTATOMUSIC_HOME: home,
    POTATOMUSIC_LIBRARY: music,
    POTATO_HIDDEN: "1",
    POTATO_ALLOW_SECOND_INSTANCE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({
      executablePath: require(path.join(root, "node_modules/electron")),
      args: ["."],
      cwd: root,
      env,
      timeout: 40000,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForSelector(".ai-sidebar", { timeout: 45000 });
    await page.waitForFunction(() => document.querySelectorAll(".ai-record-card").length === 4, { timeout: 45000 });
    await page.evaluate(() => {
      localStorage.setItem("potato:appearance:v1", JSON.stringify({ language: "zh", style: "editorial" }));
      localStorage.setItem("potato:theme", "light");
    });
    await page.reload();
    await page.waitForSelector(".ai-sidebar", { timeout: 45000 });
    await delay(900);

    await page.locator(".ai-nav-item").filter({ hasText: "AI 工作台" }).click();
    await page.waitForSelector(".ai-workspace", { timeout: 15000 });
    await page.screenshot({ path: "/tmp/ai-workspace-history.png" });
    assert.ok((await page.locator(".ai-workspace-hero").innerText()).includes("把每次对话"));
    assert.ok((await page.locator(".ai-workspace-tabs").innerText()).includes("记忆索引"));

    const composer = page.locator(".ai-workspace-composer textarea");
    await composer.fill("为我推荐一份歌单");
    await composer.press("Enter");
    await page.waitForSelector(".ai-workspace-transcript .ai-result-track", { timeout: 20000 });
    await page.waitForSelector(".ai-conversation-item", { timeout: 10000 });
    await page.waitForTimeout(500);
    const conversation = await page.evaluate(async () => (await window.potato.invoke("ai.conversations.list"))[0]);
    assert.ok(conversation?.id, "conversation should be persisted");
    assert.equal(conversation.turnCount, 1);
    assert.ok((await page.locator(".ai-workspace-transcript").innerText()).includes("为我推荐一份歌单"));
    await page.screenshot({ path: "/tmp/ai-workspace-chat.png" });

    await page.reload();
    await page.waitForSelector(".ai-sidebar", { timeout: 45000 });
    await delay(800);
    await page.locator(".ai-nav-item").filter({ hasText: "AI 工作台" }).click();
    await page.waitForSelector(".ai-workspace", { timeout: 15000 });
    await page.waitForSelector(".ai-conversation-item", { timeout: 10000 });
    await page.locator(".ai-conversation-open").first().click();
    await page.waitForSelector(".ai-workspace-transcript .ai-user-message", { timeout: 10000 });
    assert.ok((await page.locator(".ai-workspace-transcript").innerText()).includes("为我推荐一份歌单"));
    console.log(`[ai-workspace] persisted conversation ${conversation.id}`);

    await page.locator(".ai-workspace-tabs button").filter({ hasText: "记忆索引" }).click();
    await page.waitForSelector(".ai-memory-workspace");
    await page.getByRole("button", { name: "记住一首歌" }).first().click();
    await page.waitForSelector(".ai-memory-modal");
    await page.locator(".ai-memory-modal input").first().fill("适合深夜听的测试歌曲");
    await page.locator(".ai-memory-modal textarea").fill("用户第一次听是在今天。\n喜欢它的安静氛围。");
    await page.getByRole("button", { name: "保存记忆" }).click();
    await page.waitForSelector(".ai-memory-song-row", { timeout: 10000 });
    await page.getByRole("button", { name: "记一条偏好" }).click();
    await page.waitForSelector(".ai-memory-modal");
    await page.locator(".ai-memory-modal textarea").fill("喜欢在夜晚听安静的音乐");
    await page.locator(".ai-memory-modal input").first().fill("夜晚, 安静");
    await page.getByRole("button", { name: "保存记忆" }).click();
    await page.waitForSelector(".ai-profile-card", { timeout: 10000 });
    await page.waitForTimeout(400);
    const memory = await page.evaluate(async () => await window.potato.invoke("ai.memory.snapshot"));
    assert.equal(memory.stats.songs, 1);
    assert.equal(memory.stats.profile, 1);
    assert.ok((await page.locator(".ai-memory-workspace").innerText()).includes("适合深夜听"));
    await page.screenshot({ path: "/tmp/ai-workspace-memory.png" });

    await page.reload();
    await page.waitForSelector(".ai-sidebar", { timeout: 45000 });
    await delay(800);
    await page.locator(".ai-nav-item").filter({ hasText: "AI 工作台" }).click();
    await page.waitForSelector(".ai-workspace");
    await page.locator(".ai-workspace-tabs button").filter({ hasText: "记忆索引" }).click();
    await page.waitForSelector(".ai-memory-song-row");
    assert.ok((await page.locator(".ai-memory-workspace").innerText()).includes("适合深夜听"));
    console.log("[ai-workspace] memory survived reload");

    const more = page.getByRole("button", { name: "音乐工具" });
    if (await more.count()) await more.click();
    await page.locator(".ai-nav-item").filter({ hasText: "Ultra" }).click();
    await page.waitForSelector(".ultra-page", { timeout: 15000 });
    assert.ok((await page.locator(".ultra-page").innerText()).includes("ULTRA"));
    assert.ok(await page.locator(".ultra-btn--primary").isVisible());
    await page.screenshot({ path: "/tmp/ai-workspace-ultra.png" });
    console.log("[ai-workspace] Ultra destination rendered");

    assert.deepEqual(errors, []);
    console.log("AI workspace, memory and Ultra page smoke passed.");
  } finally {
    if (app) await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
