const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const target = path.join(backend, "target");
const testClasses = path.join(target, "test-classes");
const lib = path.join(target, "lib");

function javaTool(name) {
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, "bin", name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: backend, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const build = spawnSync(process.execPath, [path.join(__dirname, "build-backend.cjs")], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

fs.rmSync(testClasses, { recursive: true, force: true });
fs.mkdirSync(testClasses, { recursive: true });
const testSource = path.join(
  backend,
  "src",
  "test",
  "java",
  "com",
  "potatomusic",
  "superapp",
  "BackendSelfTest.java",
);
const classpath = [path.join(target, "classes"), path.join(lib, "*")].join(path.delimiter);
run(javaTool("javac"), ["-encoding", "UTF-8", "-cp", classpath, "-d", testClasses, testSource]);
run(javaTool("java"), [
  "-cp",
  [testClasses, path.join(target, "classes"), path.join(lib, "*")].join(path.delimiter),
  "com.potatomusic.superapp.BackendSelfTest",
]);
