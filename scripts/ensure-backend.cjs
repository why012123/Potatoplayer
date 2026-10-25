const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const jar = path.join(backend, "target", "potatoplayer-super-backend.jar");

function newestSource() {
  let newest = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "target" || entry.name === ".deps") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  walk(path.join(backend, "src"));
  for (const file of ["pom.xml"]) {
    const full = path.join(backend, file);
    if (fs.existsSync(full)) newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

const lib = path.join(backend, "target", "lib");
const libReady = fs.existsSync(lib) && fs.readdirSync(lib).filter((name) => name.endsWith(".jar")).length >= 8;
const stale = !fs.existsSync(jar) || !libReady || fs.statSync(jar).mtimeMs < newestSource();
if (stale) {
  console.log("[backend] audio service is missing or out of date — building it now");
  const result = spawnSync(process.execPath, [path.join(__dirname, "build-backend.cjs")], {
    stdio: "inherit",
    cwd: root,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  console.log(`[backend] ${path.relative(root, jar)} is ready`);
}
