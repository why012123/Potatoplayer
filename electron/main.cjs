const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, net, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { BackendProcess } = require("./backend.cjs");

const appRoot = path.resolve(__dirname, "..");
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const capturePath = process.env.POTATO_CAPTURE_PATH || null;
const captureView = process.env.POTATO_CAPTURE_VIEW || process.env.POTATO_START_VIEW || null;
const shouldExitAfterCapture = process.env.POTATO_CAPTURE_EXIT !== "0";

let mainWindow = null;
let backend = null;
let quitting = false;
let captured = false;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 856,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: "Potatoplayer Super",
    backgroundColor: "#ece6dc",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
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
      label: "Potatoplayer Super",
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
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName("Potatoplayer Super");
    if (process.platform === "darwin" && app.dock) {
      const icon = path.join(appRoot, "build", "icon.png");
      if (fs.existsSync(icon)) app.dock.setIcon(icon);
    }
    registerProtocol();
    buildMenu();

    backend = new BackendProcess({ appRoot, dataDir: dataDir() });
    backend.on("event", (message) => {
      if (message.event === "ready") return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("backend:event", message);
      }
    });
    backend.on("backend-exit", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("backend:event", {
          event: "backend.fatal",
          data: { message: "The audio service stopped. Reopen the app to start it again." },
        });
      }
    });

    try {
      await backend.start();
    } catch (error) {
      dialog.showErrorBox("Potatoplayer Super", error.message);
      app.quit();
      return;
    }

    ipcMain.handle("backend:invoke", async (_event, { method, params }) => {
      const result = await backend.invoke(method, params);
      if (method === "bootstrap" && result?.coverRoots) backend.setCoverRoots(result.coverRoots);
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

    ipcMain.handle("cover:palette", (_event, target) => paletteFromImage(target));

    ipcMain.on("app:renderer-ready", () => {
      if (capturePath) setTimeout(() => void attemptCapture(), 450);
    });

    createWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
