/**
 * Together file relay IPC — uploads and downloads a room member's local file
 * through the relay, verifies its SHA-256 and reports progress to the renderer.
 *
 * Split out of main.cjs so the Together wiring can be reviewed on its own; the
 * Lead merges the `registerTogether(...)` call into the app-ready block.
 */
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const MAX_UPLOAD_BYTES = 2048 * 1024 * 1024;
const PROGRESS_INTERVAL_MS = 140;
const TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;

/** The relay speaks ws(s)://, but the file cache is plain http(s). */
function togetherEndpoint(raw) {
  const url = new URL(String(raw || ""));
  if (url.protocol === "ws:") url.protocol = "http:";
  else if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Together file URL must use http(s) or ws(s)");
  }
  return url;
}

function togetherHttp(url) {
  return url.protocol === "https:" ? https : http;
}

/**
 * Register the Together file bridges.
 *
 * @param {object} options
 * @param {import("electron").IpcMain} options.ipcMain
 * @param {() => string} options.dataDir  app data directory (main.cjs's dataDir)
 * @param {import("electron").App} [options.app]  fallback when dataDir is omitted
 * @returns {() => void} unregister hook (mostly for tests)
 */
function registerTogether({ ipcMain, dataDir, app } = {}) {
  if (!ipcMain) throw new Error("registerTogether needs ipcMain");
  const resolveDataDir =
    typeof dataDir === "function"
      ? dataDir
      : typeof dataDir === "string"
        ? () => dataDir
        : () => (app ? app.getPath("userData") : process.cwd());
  const activeTransfers = new Map();

  const report = (event, task, payload) => {
    if (event.sender.isDestroyed()) return;
    const now = Date.now();
    if (!payload.force && now - (task.lastReport || 0) < PROGRESS_INTERVAL_MS) return;
    task.lastReport = now;
    event.sender.send("together:progress", {
      id: payload.id,
      direction: payload.direction,
      loaded: payload.loaded,
      total: payload.total,
    });
  };

  ipcMain.handle("together:cancel-transfer", (_event, id) => {
    const task = activeTransfers.get(String(id || ""));
    if (!task) return false;
    task.abort();
    return true;
  });

  ipcMain.handle("together:upload", async (event, options) => {
    const id = String(options?.id || "");
    const file = path.resolve(String(options?.path || ""));
    const token = String(options?.token || "");
    if (!token) throw new Error("Missing Together upload token");
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile()) throw new Error("The track file is missing");
    if (stat.size <= 0) throw new Error("The track file is empty");
    if (stat.size > MAX_UPLOAD_BYTES) throw new Error("The track file is too large");
    const url = togetherEndpoint(options?.url);
    const controller = new AbortController();
    const task = { abort: () => controller.abort() };
    if (id) activeTransfers.set(id, task);
    const progress = (sent, force = false) => {
      report(event, task, { id, direction: "up", loaded: sent, total: stat.size, force });
    };
    try {
      return await new Promise((resolve, reject) => {
        const request = togetherHttp(url).request(
          url,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/octet-stream",
              "Content-Length": stat.size,
              "X-File-Name": path.basename(String(options?.fileName || file)),
            },
          },
          (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => {
              if (response.statusCode >= 400) {
                reject(new Error(`Together relay rejected the upload (${response.statusCode})`));
                return;
              }
              try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
              } catch {
                reject(new Error("Together relay returned an invalid upload response"));
              }
            });
          },
        );
        task.abort = () => {
          request.destroy();
          controller.abort();
        };
        progress(0, true);
        request.setTimeout(TRANSFER_TIMEOUT_MS, () => request.destroy(new Error("Together upload timed out")));
        request.on("error", reject);
        let sent = 0;
        const stream = fs.createReadStream(file);
        stream.on("data", (chunk) => {
          sent += chunk.length;
          progress(sent);
        });
        stream.on("error", (error) => {
          request.destroy();
          reject(error);
        });
        stream.pipe(request);
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Together transfer canceled");
      throw error;
    } finally {
      if (id && activeTransfers.get(id) === task) activeTransfers.delete(id);
    }
  });

  ipcMain.handle("together:download", async (event, options) => {
    const id = String(options?.id || "");
    const sha256 = String(options?.sha256 || "").toLowerCase();
    const token = String(options?.token || "");
    if (!token) throw new Error("Missing Together download token");
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Invalid Together file hash");
    const ext = /^\.[a-z0-9]{1,8}$/i.test(String(options?.ext || ""))
      ? String(options.ext).toLowerCase()
      : ".bin";
    const dir = path.join(resolveDataDir(), "together");
    await fs.promises.mkdir(dir, { recursive: true });
    const dest = path.join(dir, `${sha256}${ext}`);
    const existing = await fs.promises.stat(dest).catch(() => null);
    if (existing?.isFile() && existing.size > 0) {
      return { path: dest, sha256, size: existing.size };
    }
    const url = togetherEndpoint(options?.url);
    const temp = `${dest}.${crypto.randomUUID()}.part`;
    const hash = crypto.createHash("sha256");
    const controller = new AbortController();
    const task = { abort: () => controller.abort() };
    if (id) activeTransfers.set(id, task);
    let size = 0;
    let total = 0;
    const progress = (force = false) => {
      report(event, task, { id, direction: "down", loaded: size, total, force });
    };
    try {
      const response = await new Promise((resolve, reject) => {
        const request = togetherHttp(url).request(
          url,
          { method: "GET", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } },
          resolve,
        );
        request.setTimeout(TRANSFER_TIMEOUT_MS, () => request.destroy(new Error("Together download timed out")));
        request.on("error", reject);
        request.end();
      });
      if (response.statusCode >= 400) throw new Error(`Together relay rejected the download (${response.statusCode})`);
      total = Math.max(0, Number(response.headers["content-length"]) || 0);
      progress(true);
      await pipeline(
        response,
        new Transform({
          transform(chunk, _encoding, callback) {
            size += chunk.length;
            hash.update(chunk);
            progress();
            callback(null, chunk);
          },
        }),
        fs.createWriteStream(temp),
      );
      const actual = hash.digest("hex");
      if (actual !== sha256) throw new Error("Together download failed its checksum");
      await fs.promises.rename(temp, dest);
      progress(true);
      return { path: dest, sha256: actual, size };
    } catch (error) {
      fs.rmSync(temp, { force: true });
      if (controller.signal.aborted) throw new Error("Together transfer canceled");
      throw error;
    } finally {
      if (id && activeTransfers.get(id) === task) activeTransfers.delete(id);
    }
  });

  return () => {
    for (const task of activeTransfers.values()) task.abort();
    activeTransfers.clear();
    for (const channel of ["together:cancel-transfer", "together:upload", "together:download"]) {
      if (typeof ipcMain.removeHandler === "function") ipcMain.removeHandler(channel);
    }
  };
}

module.exports = { registerTogether };
