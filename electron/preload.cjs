const { contextBridge, ipcRenderer } = require("electron");

let latestMediaShortcutStatus = null;
ipcRenderer.on("media:shortcut-status", (_event, status) => {
  latestMediaShortcutStatus = status || null;
});

contextBridge.exposeInMainWorld("potato", {
  invoke: (method, params) => ipcRenderer.invoke("backend:invoke", { method, params }),
  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("backend:event", handler);
    return () => ipcRenderer.removeListener("backend:event", handler);
  },
  onWindowFocus: (listener) => {
    const handler = (_event, active) => listener(Boolean(active));
    ipcRenderer.on("window:focus", handler);
    return () => ipcRenderer.removeListener("window:focus", handler);
  },
  onMediaControl: (listener) => {
    const handler = (_event, action) => listener(String(action));
    ipcRenderer.on("media:control", handler);
    return () => ipcRenderer.removeListener("media:control", handler);
  },
  updateMediaState: (state) => ipcRenderer.send("media:update", state),
  onMediaShortcutStatus: (listener) => {
    const handler = (_event, status) => listener(status || null);
    ipcRenderer.on("media:shortcut-status", handler);
    if (latestMediaShortcutStatus) queueMicrotask(() => listener(latestMediaShortcutStatus));
    return () => ipcRenderer.removeListener("media:shortcut-status", handler);
  },
  pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  openPath: (target) => ipcRenderer.invoke("app:open-path", target),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  coverPalette: (target) => ipcRenderer.invoke("cover:palette", target),
  coverData: (target) => ipcRenderer.invoke("cover:data", target),
  togetherUpload: (options) => ipcRenderer.invoke("together:upload", options),
  togetherDownload: (options) => ipcRenderer.invoke("together:download", options),
  cancelTogetherTransfer: (id) => ipcRenderer.invoke("together:cancel-transfer", id),
  onTogetherProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on("together:progress", handler);
    return () => ipcRenderer.removeListener("together:progress", handler);
  },
  openUltra: () => ipcRenderer.invoke("ultra:open"),
  rendererReady: () => ipcRenderer.send("app:renderer-ready"),
  platform: process.platform,
});
