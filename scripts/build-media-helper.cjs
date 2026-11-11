const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "native", "media-remote", "main.swift");
const info = path.join(root, "native", "media-remote", "Info.plist");
const app = path.join(root, "build", "media-remote", "PotatoplayerMedia.app");
const binary = path.join(app, "Contents", "MacOS", "PotatoplayerMedia");

if (process.platform !== "darwin") process.exit(0);
if (!fs.existsSync(source)) process.exit(0);

const destInfo = path.join(app, "Contents", "Info.plist");
if (fs.existsSync(binary) && fs.statSync(binary).mtimeMs >= fs.statSync(source).mtimeMs) {
  if (!fs.existsSync(destInfo) || fs.statSync(destInfo).mtimeMs < fs.statSync(info).mtimeMs) {
    fs.copyFileSync(info, destInfo);
  }
  process.exit(0);
}

const swiftc = spawnSync("swiftc", ["--version"], { stdio: "ignore" });
if (swiftc.status !== 0) {
  console.warn("[media] swiftc not available; using global media-key shortcuts instead");
  process.exit(0);
}

fs.mkdirSync(path.dirname(binary), { recursive: true });
const result = spawnSync(
  "swiftc",
  ["-O", source, "-framework", "AppKit", "-framework", "MediaPlayer", "-o", binary],
  { cwd: root, stdio: "inherit" },
);
if (result.status !== 0) {
  console.warn("[media] native helper build failed; using global media-key shortcuts instead");
  process.exit(0);
}
fs.copyFileSync(info, path.join(app, "Contents", "Info.plist"));
console.log(`[media] built ${path.relative(root, binary)}`);
