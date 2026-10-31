const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, net, protocol, shell, globalShortcut } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { BackendProcess } = require("./backend.cjs");

const appRoot = path.resolve(__dirname, "..");
// Isolated test runs must not share localStorage/preferences with the real app.
if (process.env.POTATOMUSIC_HOME) {
  app.setPath("userData", path.join(path.resolve(process.env.POTATOMUSIC_HOME), "electron"));
}
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const capturePath = process.env.POTATO_CAPTURE_PATH || null;
const captureView = process.env.POTATO_CAPTURE_VIEW || process.env.POTATO_START_VIEW || null;
const shouldExitAfterCapture = process.env.POTATO_CAPTURE_EXIT !== "0";
const previewMode = Boolean(process.env.POTATO_PREVIEW);
const ultraMode = process.env.POTATO_ULTRA === "1" || process.argv.includes("--ultra");
const windowTitle = ultraMode
  ? "Potatoplayer Ultra"
  : previewMode
    ? "Potatoplayer Super — UI Preview"
    : "Potatoplayer Super";

let mainWindow = null;
let ultraWindow = null;
let backend = null;
let quitting = false;
let captured = false;
let mediaShortcutStatus = null;
let mediaHelper = null;
let mediaHelperBuffer = "";
let mediaHelperReady = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "potato-cover",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function dataDir() {
  if (process.env.POTATOMUSIC_HOME) return path.resolve(process.env.POTATOMUSIC_HOME);
  return path.join(app.getPath("home"), ".potatoplayer-super");
}

function sanitizeCoverPath(encoded) {
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    if (!path.isAbsolute(decoded)) return null;
    return path.normalize(decoded);
  } catch {
    return null;
  }
}

function paletteFromImage(filePath) {
  if (!filePath || !backend?.isCoverAllowed(filePath)) return null;
  let image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) return null;
  const size = image.getSize();
  if (size.width > 64) image = image.resize({ width: 48, quality: "good" });
  const bitmap = image.toBitmap();
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    const b = bitmap[i];
    const g = bitmap[i + 1];
    const r = bitmap[i + 2];
    const a = bitmap[i + 3];
    if (a < 100) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 510;
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (lightness < 0.08 || lightness > 0.95 || saturation < 0.07) continue;
    let hue = 0;
    const delta = max - min;
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    const bin = bins[Math.floor(hue / 30) % 12];
    const weight = saturation * (1 - Math.abs(lightness - 0.52));
    bin.weight += weight;
    bin.r += r * weight;
    bin.g += g * weight;
    bin.b += b * weight;
  }
  const best = bins.reduce((winner, bin) => (bin.weight > winner.weight ? bin : winner), bins[0]);
  if (!best.weight) return null;
  const toHex = (value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
  const clamp = (value) => Math.max(48, Math.min(225, value));
  const primary = `#${toHex(clamp(best.r / best.weight))}${toHex(clamp(best.g / best.weight))}${toHex(clamp(best.b / best.weight))}`;
  const secondary = `#${toHex(clamp((best.r / best.weight) * 0.78 + 38))}${toHex(
    clamp((best.g / best.weight) * 0.72 + 48),
  )}${toHex(clamp((best.b / best.weight) * 0.68 + 62))}`;
  return { primary, secondary };
}

function registerProtocol() {
  protocol.handle("potato-cover", async (request) => {
    try {
      const url = new URL(request.url);
      const file = sanitizeCoverPath(url.searchParams.get("p"));
      if (!file) return new Response("Bad cover request", { status: 400 });
      if (!backend?.isCoverAllowed(file)) return new Response("Cover not allowed", { status: 403 });
      if (!fs.existsSync(file)) return new Response("Cover not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Cover unavailable", { status: 500 });
    }
  });
}

function mediaHelperPath() {
  return path.join(appRoot, "build", "media-remote", "PotatoplayerMedia.app", "Contents", "MacOS", "PotatoplayerMedia");
}

function nativeMediaStatus() {
  return { toggle: true, next: true, previous: true, stop: true, native: true };
}

function sendMediaShortcutStatus() {
  if (!mediaShortcutStatus) return;
  for (const win of [mainWindow, ultraWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("media:shortcut-status", mediaShortcutStatus);
  }
}

function startMediaHelper() {
  if (process.platform !== "darwin" || process.env.POTATO_HIDDEN || capturePath || previewMode) return false;
  const binary = mediaHelperPath();
  if (!fs.existsSync(binary)) return false;
  try {
    mediaHelper = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    mediaHelper.stdout.setEncoding("utf8");
    mediaHelper.stdout.on("data", (chunk) => {
      mediaHelperBuffer += chunk;
      let newline;
      while ((newline = mediaHelperBuffer.indexOf("\n")) >= 0) {
        const line = mediaHelperBuffer.slice(0, newline).trim();
        mediaHelperBuffer = mediaHelperBuffer.slice(newline + 1);
        if (!line) continue;
        if (line === "ready") {
          mediaHelperReady = true;
          mediaShortcutStatus = nativeMediaStatus();
          sendMediaShortcutStatus();
          continue;
        }
        sendMediaAction(line);
      }
    });
    mediaHelper.stderr.setEncoding("utf8");
    mediaHelper.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) console.warn("[media]", text);
    });
    mediaHelper.on("exit", () => {
      mediaHelper = null;
      mediaHelperReady = false;
      if (quitting || process.env.POTATO_HIDDEN || capturePath || previewMode) return;
      // The native helper is the preferred path. If it dies, keep what we can
      // with global media keys instead of silently losing headset support.
      registerMediaShortcuts();
      sendMediaShortcutStatus();
    });
    return true;
  } catch (error) {
    console.warn("[media] native helper failed to start:", error.message);
    mediaHelper = null;
    return false;
  }
}

function startMediaControls() {
  if (process.env.POTATO_HIDDEN || capturePath || previewMode) return;
  if (startMediaHelper()) {
    // The helper is authoritative; do not grab media keys globally as well.
    mediaShortcutStatus = nativeMediaStatus();
    return;
  }
  registerMediaShortcuts();
}

const MEDIA_SHORTCUTS = [
  ["MediaPlayPause", "toggle"],
  ["MediaNextTrack", "next"],
  ["MediaPreviousTrack", "previous"],
  ["MediaStop", "stop"],
];

function sendMediaAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("media:control", action);
}

function registerMediaShortcuts() {
  // UI tests and preview captures must not steal the user's media keys.
  if (process.env.POTATO_HIDDEN || capturePath || previewMode) return;
  mediaShortcutStatus = {};
  for (const [accelerator, action] of MEDIA_SHORTCUTS) {
    try {
      const registered = globalShortcut.register(accelerator, () => sendMediaAction(action));
      mediaShortcutStatus[action] = registered;
      if (!registered) {
        console.warn(`[media] could not register ${accelerator}${process.platform === "darwin" ? " (macOS Accessibility permission may be required)" : ""}`);
      }
    } catch (error) {
      mediaShortcutStatus[action] = false;
      console.warn(`[media] ${accelerator} registration failed: ${error.message}`);
    }
  }
  sendMediaShortcutStatus();
}

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 856,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: windowTitle,
    backgroundColor: "#ece6dc",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  // DOM focus/blur is unreliable on some macOS Spaces. Forward the real
  // BrowserWindow focus so the renderer can stop compositor-heavy animations
  // and 20 Hz spectrum re-renders while another app is in front.
  mainWindow.on("focus", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("window:focus", true);
  });
  mainWindow.on("blur", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("window:focus", false);
  });

  mainWindow.on("page-title-updated", (event) => {
    if (!previewMode) return;
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(windowTitle);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (previewMode && mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(windowTitle);
    if (mediaShortcutStatus && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media:shortcut-status", mediaShortcutStatus);
    }
  });

  mainWindow.once("ready-to-show", () => {
    // UI checks can run off-screen without stealing focus from the real player.
    if (!process.env.POTATO_HIDDEN) mainWindow.show();
    if (capturePath) {
      setTimeout(() => attemptCapture(), 30_000);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    const query = captureView ? `?view=${encodeURIComponent(captureView)}` : "";
    mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`);
  } else {
    const options = captureView ? { query: { view: captureView } } : undefined;
    mainWindow.loadFile(path.join(appRoot, "dist", "index.html"), options);
  }

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer] gone", details.reason);
  });
}

function createUltraWindow() {
  if (ultraWindow && !ultraWindow.isDestroyed()) {
    ultraWindow.show();
    ultraWindow.focus();
    return;
  }
  ultraWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Potatoplayer Ultra",
    backgroundColor: "#ece7e1",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  ultraWindow.once("ready-to-show", () => {
    if (!process.env.POTATO_HIDDEN) ultraWindow.show();
  });
  ultraWindow.on("closed", () => {
    ultraWindow = null;
  });
  ultraWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  ultraWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[ultra] renderer gone", details.reason);
  });

  const ultraEntry = path.join(appRoot, "ultra-rhine", "dist", "index.html");
  const ultraSilent = process.env.POTATO_HIDDEN || process.env.POTATO_ULTRA_SILENT === "1";
  if (!fs.existsSync(ultraEntry)) {
    ultraWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="font:14px -apple-system;padding:48px;background:#eae5e1;color:#1d1a17">
          <h1 style="font-weight:600">Potatoplayer Ultra</h1>
          <p>Ultra 还没有构建。请在终端运行：</p>
          <pre style="padding:16px;background:#f6f1e9">npm run build:ultra</pre>
          <p>或直接运行 <code>npm run ultra</code>。</p>
        </body>`,
      )}`,
    );
  } else if (ultraSilent) {
    ultraWindow.loadFile(ultraEntry, { query: { silent: "1" } });
  } else {
    ultraWindow.loadFile(ultraEntry);
  }
}

async function attemptCapture() {
  if (captured || !mainWindow || mainWindow.isDestroyed() || !capturePath) return;
  captured = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 4200));
    const image = await mainWindow.webContents.capturePage();
    fs.mkdirSync(path.dirname(capturePath), { recursive: true });
    fs.writeFileSync(capturePath, image.toPNG());
    console.log(`[capture] wrote ${capturePath}`);
  } catch (error) {
    console.error("[capture] failed", error);
  }
  if (shouldExitAfterCapture) app.quit();
}

function buildMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: ultraMode ? "Potatoplayer Ultra" : "Potatoplayer Super",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "togglefullscreen" }],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Open Potatoplayer Ultra",
          accelerator: "CmdOrCtrl+Shift+U",
          click: () => createUltraWindow(),
        },
        { type: "separator" },
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// UI checks use an isolated data dir and must be able to run beside the real
// player, so they can opt out of the single-instance guard.
if (!process.env.POTATO_ALLOW_SECOND_INSTANCE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--ultra")) {
      createUltraWindow();
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName(ultraMode ? "Potatoplayer Ultra" : "Potatoplayer Super");
    if (process.platform === "darwin" && app.dock) {
      const icon = path.join(appRoot, "build", "icon.png");
      if (fs.existsSync(icon)) app.dock.setIcon(icon);
    }
    registerProtocol();
    buildMenu();

    backend = new BackendProcess({ appRoot, dataDir: dataDir() });
    backend.on("event", (message) => {
      if (message.event === "ready") return;
      if (Array.isArray(message.data?.coverRoots)) backend.setCoverRoots(message.data.coverRoots);
      for (const win of [mainWindow, ultraWindow]) {
        if (win && !win.isDestroyed()) win.webContents.send("backend:event", message);
      }
    });
    backend.on("backend-exit", () => {
      for (const win of [mainWindow, ultraWindow]) {
        if (win && !win.isDestroyed()) {
          win.webContents.send("backend:event", {
            event: "backend.fatal",
            data: { message: "The audio service stopped. Reopen the app to start it again." },
          });
        }
      }
    });

    try {
      await backend.start();
    } catch (error) {
      dialog.showErrorBox(ultraMode ? "Potatoplayer Ultra" : "Potatoplayer Super", error.message);
      app.quit();
      return;
    }

    ipcMain.on("media:update", (_event, payload) => {
      if (!mediaHelper?.stdin?.writable || !payload || typeof payload !== "object") return;
      try {
        mediaHelper.stdin.write(`${JSON.stringify(payload)}\n`);
      } catch (error) {
        console.warn("[media] helper update failed:", error.message);
      }
    });

    ipcMain.handle("backend:invoke", async (_event, { method, params }) => {
      const result = await backend.invoke(method, params);
      if (Array.isArray(result?.coverRoots)) backend.setCoverRoots(result.coverRoots);
      return result;
    });

    ipcMain.handle("dialog:pick-folder", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choose your music folder",
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "Use this folder",
      });
      return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
    });

    ipcMain.handle("app:open-path", async (_event, target) => {
      if (typeof target !== "string") return;
      await shell.openPath(target);
    });

    ipcMain.handle("app:open-external", async (_event, target) => {
      if (typeof target !== "string") return false;
      let url;
      try {
        url = new URL(target);
      } catch {
        return false;
      }
      const allowed = ["bilibili.com", "b23.tv"];
      if (
        url.protocol !== "https:" ||
        !allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      ) {
        return false;
      }
      await shell.openExternal(url.toString());
      return true;
    });

    ipcMain.handle("cover:palette", (_event, target) => paletteFromImage(target));

    // Covers are painted into WebGL sticker textures. A data URL keeps the
    // canvas untainted, which a cross-scheme potato-cover image would not.
    ipcMain.handle("cover:data", async (_event, target) => {
      if (typeof target !== "string" || !backend) return null;
      if (!backend.coverRoots.length) {
        try {
          const boot = await backend.invoke("bootstrap");
          if (Array.isArray(boot?.coverRoots)) backend.setCoverRoots(boot.coverRoots);
        } catch {
          // The backend may still be starting; the caller can retry.
        }
      }
      if (!backend.isCoverAllowed(target)) return null;
      try {
        const stat = await fs.promises.stat(target);
        if (!stat.isFile() || stat.size > 32_000_000) return null;
        if (stat.size > 6_000_000) {
          const thumbnail = await nativeImage.createThumbnailFromPath(target, { width: 512, height: 512 });
          return thumbnail.isEmpty() ? null : thumbnail.toDataURL();
        }
        const bytes = await fs.promises.readFile(target);
        const ext = path.extname(target).toLowerCase();
        const mime =
          ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
        return `data:${mime};base64,${bytes.toString("base64")}`;
      } catch {
        return null;
      }
    });

    const activeTogetherTransfers = new Map();

    ipcMain.handle("together:cancel-transfer", (_event, id) => {
      const task = activeTogetherTransfers.get(String(id || ""));
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
      if (stat.size > 2048 * 1024 * 1024) throw new Error("The track file is too large");
      const url = togetherEndpoint(options?.url);
      const controller = new AbortController();
      const task = { abort: () => controller.abort() };
      if (id) activeTogetherTransfers.set(id, task);
      const report = (sent, force = false) => {
        if (event.sender.isDestroyed()) return;
        const now = Date.now();
        if (!force && now - (task.lastReport || 0) < 140) return;
        task.lastReport = now;
        event.sender.send("together:progress", {
          id,
          direction: "up",
          loaded: sent,
          total: stat.size,
        });
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
          report(0, true);
          request.setTimeout(10 * 60 * 1000, () => request.destroy(new Error("Together upload timed out")));
          request.on("error", reject);
          let sent = 0;
          const stream = fs.createReadStream(file);
          stream.on("data", (chunk) => {
            sent += chunk.length;
            report(sent);
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
        if (id && activeTogetherTransfers.get(id) === task) activeTogetherTransfers.delete(id);
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
      const dir = path.join(dataDir(), "together");
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
      if (id) activeTogetherTransfers.set(id, task);
      let size = 0;
      let total = 0;
      const report = (force = false) => {
        if (event.sender.isDestroyed()) return;
        const now = Date.now();
        if (!force && now - (task.lastReport || 0) < 140) return;
        task.lastReport = now;
        event.sender.send("together:progress", {
          id,
          direction: "down",
          loaded: size,
          total,
        });
      };
      try {
        const response = await new Promise((resolve, reject) => {
          const request = togetherHttp(url).request(
            url,
            { method: "GET", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } },
            resolve,
          );
          request.setTimeout(10 * 60 * 1000, () => request.destroy(new Error("Together download timed out")));
          request.on("error", reject);
          request.end();
        });
        if (response.statusCode >= 400) throw new Error(`Together relay rejected the download (${response.statusCode})`);
        total = Math.max(0, Number(response.headers["content-length"]) || 0);
        report(true);
        await pipeline(
          response,
          new Transform({
            transform(chunk, _encoding, callback) {
              size += chunk.length;
              hash.update(chunk);
              report();
              callback(null, chunk);
            },
          }),
          fs.createWriteStream(temp),
        );
        const actual = hash.digest("hex");
        if (actual !== sha256) throw new Error("Together download failed its checksum");
        await fs.promises.rename(temp, dest);
        report(true);
        return { path: dest, sha256: actual, size };
      } catch (error) {
        fs.rmSync(temp, { force: true });
        if (controller.signal.aborted) throw new Error("Together transfer canceled");
        throw error;
      } finally {
        if (id && activeTogetherTransfers.get(id) === task) activeTogetherTransfers.delete(id);
      }
    });

    ipcMain.handle("ultra:open", () => {
      createUltraWindow();
    });

    ipcMain.on("app:renderer-ready", () => {
      if (capturePath) setTimeout(() => void attemptCapture(), 450);
    });

    startMediaControls();
    if (ultraMode) createUltraWindow();
    else createWindow();
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (mediaHelper) {
      mediaHelper.stdin?.end();
      mediaHelper.kill();
      mediaHelper = null;
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (ultraMode) createUltraWindow();
      else createWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || capturePath) app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    Promise.resolve(backend?.shutdown())
      .catch(() => undefined)
      .finally(() => app.quit());
  });
}
