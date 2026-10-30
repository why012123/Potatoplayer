const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "ultra-rhine");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!fs.existsSync(path.join(dir, "node_modules"))) {
  console.log("[ultra] installing the RhineLabUI fork dependencies…");
  const install = spawnSync(npm, ["ci", "--prefix", dir, "--no-audit", "--no-fund"], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const build = spawnSync(npm, ["run", "build", "--prefix", dir], {
  stdio: "inherit",
  env: process.env,
});
process.exit(build.status ?? 1);
