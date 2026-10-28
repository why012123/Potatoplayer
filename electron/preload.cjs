const { contextBridge, ipcRenderer } = require("electron");

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
  pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  openPath: (target) => ipcRenderer.invoke("app:open-path", target),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  coverPalette: (target) => ipcRenderer.invoke("cover:palette", target),
  rendererReady: () => ipcRenderer.send("app:renderer-ready"),
  platform: process.platform,
});
