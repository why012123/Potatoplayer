const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "ultra-rhine", "dist", "index.html");
const aiHome = process.env.POTATOMUSIC_HOME
  ? path.resolve(process.env.POTATOMUSIC_HOME)
  : path.join(os.homedir(), ".potatomusic-ai");
const directLibrary = process.env.POTATOMUSIC_LIBRARY;
const libraries = [
  process.env.POTATOMUSIC_ULTRA_LIBRARY,
  directLibrary && directLibrary.endsWith(".json") ? directLibrary : null,
  path.join(aiHome, "library.json"),
  path.join(os.homedir(), ".potatoplayer-super", "library.json"),
].filter(Boolean);

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

const libraryMtime = Math.max(0, ...libraries.map(mtime));
if (fs.existsSync(entry) && mtime(entry) >= libraryMtime) process.exit(0);
console.log("[ultra] building Potatoplayer Ultra (first run or the library changed)…");
const build = spawnSync(process.execPath, [path.join(__dirname, "build-ultra.cjs")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(build.status ?? 1);
