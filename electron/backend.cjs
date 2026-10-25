const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

class BackendProcess extends EventEmitter {
  constructor({ appRoot, dataDir }) {
    super();
    this.appRoot = appRoot;
    this.dataDir = dataDir;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.stopping = false;
    this.restarting = false;
    this.coverRoots = [];
  }

  jarPath() {
    return process.env.POTATOMUSIC_BACKEND_JAR || path.join(this.appRoot, "backend", "target", "potatoplayer-super-backend.jar");
  }

  javaBinary() {
    const executable = process.platform === "win32" ? "java.exe" : "java";
    if (process.env.JAVA_HOME) {
      const candidate = path.join(process.env.JAVA_HOME, "bin", executable);
      if (fs.existsSync(candidate)) return candidate;
    }
    const common = process.platform === "darwin"
      ? [
          "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java",
          "/opt/homebrew/opt/openjdk@21/bin/java",
          "/opt/homebrew/opt/openjdk/bin/java",
          "/usr/bin/java",
        ]
      : [];
    for (const candidate of common) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return "java";
  }

  start() {
    if (this.child) return this.ready;
    const jar = this.jarPath();
    if (!fs.existsSync(jar)) {
      throw new Error(
        `The Java backend is missing.\n\nExpected:\n${jar}\n\nRun "npm run build:backend" in the project folder.`,
      );
    }
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    const timeout = setTimeout(() => {
      this.readyReject?.(new Error("The Java backend did not become ready within 25 seconds."));
    }, 25_000);

    const args = [
      "-Dfile.encoding=UTF-8",
      "-Dpotatomusic.home=" + this.dataDir,
      "-jar",
      jar,
    ];
    if (process.env.POTATOMUSIC_LIBRARY) {
      args.unshift(`-Dpotatomusic.library=${process.env.POTATOMUSIC_LIBRARY}`);
    }

    this.child = spawn(this.javaBinary(), args, {
      cwd: this.appRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this.handleLine(line));

    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (process.env.POTATO_DEBUG) process.stderr.write(`[java] ${text}`);
      else if (/error|fatal|exception/i.test(text)) process.stderr.write(`[java] ${text}`);
    });

    this.child.on("error", (error) => {
      clearTimeout(timeout);
      this.failPending(error);
      this.readyReject?.(error);
      this.emit("status", { state: "error", message: error.message });
    });

    this.child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      this.child = null;
      const error = new Error(`The Java backend stopped unexpectedly (${signal ?? code}).`);
      this.failPending(error);
      this.readyReject?.(error);
      this.emit("status", { state: "stopped", code, signal });
      if (!this.stopping && !this.restarting) {
        this.emit("backend-exit", { code, signal });
      }
    });

    this.once("ready", () => {
      clearTimeout(timeout);
      this.readyResolve?.();
    });
    return this.ready;
  }

  handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      if (process.env.POTATO_DEBUG) console.error("[backend] invalid JSON", line.slice(0, 400));
      return;
    }

    if (message.event) {
      if (message.event === "ready") {
        this.emit("ready", message.data);
        this.emit("event", message);
        return;
      }
      if (message.event === "backend.fatal") {
        this.readyReject?.(new Error(message.data?.message ?? "Backend failed to start."));
      }
      this.emit("event", message);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? "Backend request failed."));
    } else {
      pending.resolve(message.result);
    }
  }

  setCoverRoots(roots) {
    if (!Array.isArray(roots)) return;
    this.coverRoots = roots.filter((root) => typeof root === "string");
  }

  isCoverAllowed(candidate) {
    if (!candidate) return false;
    const normalized = path.resolve(candidate);
    const compare = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    return this.coverRoots.some((root) => {
      const absolute = path.resolve(root);
      const rootCompare = process.platform === "win32" ? absolute.toLowerCase() : absolute;
      return compare === rootCompare || compare.startsWith(rootCompare + path.sep);
    });
  }

  async invoke(method, params = {}) {
    await this.ready;
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("The audio service is not running.");
    }
    const id = this.nextId++;
    const request = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The audio service timed out while running "${method}".`));
      }, 45_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(request + "\n", "utf8", (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  failPending(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  async shutdown() {
    if (this.stopping) return;
    this.stopping = true;
    if (!this.child) return;
    const child = this.child;
    try {
      const id = this.nextId++;
      child.stdin.write(JSON.stringify({ id, method: "app.shutdown", params: {} }) + "\n");
    } catch {
      // The process may already be gone.
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
    if (!child.killed) {
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
  }
}

module.exports = { BackendProcess };
