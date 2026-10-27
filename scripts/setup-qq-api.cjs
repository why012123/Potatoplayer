#!/usr/bin/env node
/**
 * Installs the local QQ Music API service into the same runtime folder the app
 * already uses for api-enhanced. Third-party service: not bundled with the app.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const target = path.join(os.homedir(), ".potatoplayer-ultra", "api", "qq-music-api");
const entry = path.join(target, "node_modules", "@yakult-green-tea", "qq-music-api", "dist", "src", "app.js");

if (fs.existsSync(entry)) {
  console.log(`[qq-api] already installed at ${target}`);
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });
if (!fs.existsSync(path.join(target, "package.json"))) {
  fs.writeFileSync(
    path.join(target, "package.json"),
    JSON.stringify({ name: "potatoplayer-qq-api", private: true, version: "1.0.0" }, null, 2) + "\n",
  );
}

console.log(`[qq-api] installing into ${target}`);
const result = spawnSync("npm", ["install", "@yakult-green-tea/qq-music-api", "--no-audit", "--no-fund"], {
  cwd: target,
  stdio: "inherit",
  env: process.env,
});
if (result.status !== 0) {
  console.error("[qq-api] install failed");
  process.exit(result.status ?? 1);
}
if (!fs.existsSync(entry)) {
  console.error(`[qq-api] installed, but entry was not found at ${entry}`);
  process.exit(1);
}
console.log("[qq-api] ready. Open Discover, click the NETEASE/QQ MUSIC badge, then Start QQ service.");
