const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveDependencies } = require("./backend-deps.cjs");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const target = path.join(backend, "target");
const classes = path.join(target, "classes");
const lib = path.join(target, "lib");
const jar = path.join(target, "potatoplayer-super-backend.jar");

function javaTool(name) {
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, "bin", name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

async function main() {
  if (!fs.existsSync(path.join(backend, "pom.xml"))) {
    throw new Error("backend/pom.xml is missing");
  }
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  fs.rmSync(lib, { recursive: true, force: true });
  fs.mkdirSync(lib, { recursive: true });

  const dependencies = await resolveDependencies({ root });
  for (const dependency of dependencies) {
    fs.copyFileSync(dependency, path.join(lib, path.basename(dependency)));
  }

  const sources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java")) sources.push(full);
    }
  };
  walk(path.join(backend, "src", "main", "java"));

  const classpath = dependencies.join(path.delimiter);
  console.log(`[backend] compiling ${sources.length} Java files`);
  run(javaTool("javac"), ["-encoding", "UTF-8", "-cp", classpath, "-d", classes, ...sources]);

  const libEntries = fs
    .readdirSync(lib)
    .filter((name) => name.endsWith(".jar"))
    .map((name) => `lib/${name}`)
    .join(" ");
  const manifest = [
    "Manifest-Version: 1.0",
    "Main-Class: com.potatomusic.superapp.Main",
    `Class-Path: ${libEntries}`,
    "",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(target, "MANIFEST.MF"), manifest, "utf8");

  fs.rmSync(jar, { force: true });
  run(javaTool("jar"), [
    "--create",
    "--file",
    jar,
    "--manifest",
    path.join(target, "MANIFEST.MF"),
    "-C",
    classes,
    ".",
  ]);
  console.log(`[backend] built ${path.relative(root, jar)}`);
}

main().catch((error) => {
  console.error(`[backend] ${error.message}`);
  process.exit(1);
});
