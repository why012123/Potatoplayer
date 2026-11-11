const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "ultra-rhine", "dist", "index.html");
const library = path.join(os.homedir(), ".potatoplayer-super", "library.json");

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

if (fs.existsSync(entry) && mtime(entry) >= mtime(library)) process.exit(0);
console.log("[ultra] building Potatoplayer Ultra (first run or the library changed)…");
const build = spawnSync(process.execPath, [path.join(__dirname, "build-ultra.cjs")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(build.status ?? 1);
