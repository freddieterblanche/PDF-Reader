// The only bridge between the reader page and Windows. Exposes a small, fixed set of actions.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("pdfReader", {
  desktop: true,
  initialFiles: () => ipcRenderer.invoke("initial-files"),
  openDialog: () => ipcRenderer.invoke("open-dialog"),
  readFiles: paths => ipcRenderer.invoke("read-files", paths),
  writeTemp: (name, data) => ipcRenderer.invoke("write-temp", name, data),
  showInFolder: p => ipcRenderer.invoke("show-in-folder", p),
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  print: opts => ipcRenderer.invoke("print", opts),
  printDialog: opts => ipcRenderer.invoke("print-dialog", opts),
  pathForFile: file => { try { return webUtils.getPathForFile(file) || ""; } catch (e) { return ""; } },
  onOpenFiles: cb => ipcRenderer.on("open-files", (_e, files) => cb(files)),
  ocrPage: data => ipcRenderer.invoke("ocr-page", data),
  recentList: () => ipcRenderer.invoke("recent-list"),
  recentPin: (p, on) => ipcRenderer.invoke("recent-pin", p, on),
  recentRemove: p => ipcRenderer.invoke("recent-remove", p),
  recentClear: () => ipcRenderer.invoke("recent-clear"),
  recentOpen: p => ipcRenderer.invoke("recent-open", p),
  onRecentChanged: cb => ipcRenderer.on("recent-changed", () => cb()),
  saveDialog: opts => ipcRenderer.invoke("save-dialog", opts),
  chooseFolder: opts => ipcRenderer.invoke("choose-folder", opts),
  writePdf: opts => ipcRenderer.invoke("write-pdf", opts),
  appVersion: () => ipcRenderer.invoke("app-version"),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: cb => ipcRenderer.on("update-available", (_e, info) => cb(info)),
  onUpdateProgress: cb => ipcRenderer.on("update-progress", (_e, pct) => cb(pct))
});
