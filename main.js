// PDF Reader: desktop shell. Opens PDFs from Explorer, keeps one window, and prints
// the original PDF file straight to the printer through the bundled SumatraPDF engine.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

let win = null;
const pending = [];          // files passed on the command line before the window is ready
const known = new Set();     // files the user has opened; only these may be printed

const isPdf = p => typeof p === "string" && /\.pdf$/i.test(p) && fs.existsSync(p);
const pdfArgs = argv => argv.slice(1).filter(isPdf).map(p => path.resolve(p));

function readPdf(p) {
  const full = path.resolve(p);
  const data = fs.readFileSync(full);
  known.add(full);
  noteRecent(full);
  return { path: full, name: path.basename(full), data };
}

/* Recently opened documents (kept in recent.json in the app's data folder). Pinned ones always stay. */
let recent = null;
const recentFile = () => path.join(app.getPath("userData"), "recent.json");
function loadRecent() {
  if (recent) return recent;
  try { recent = JSON.parse(fs.readFileSync(recentFile(), "utf8")); if (!Array.isArray(recent)) recent = []; } catch (e) { recent = []; }
  return recent;
}
function saveRecent(changed) {
  try { fs.writeFileSync(recentFile(), JSON.stringify(recent)); } catch (e) {}
  if (changed !== false && win) win.webContents.send("recent-changed");
}
function noteRecent(full) {
  if (full.startsWith(path.join(os.tmpdir(), "pdf-reader-print"))) return;
  loadRecent();
  let r = recent.find(x => x.path.toLowerCase() === full.toLowerCase());
  if (!r) { r = { path: full, pinned: false, count: 0 }; recent.push(r); }
  r.name = path.basename(full); r.last = Date.now(); r.count = (r.count || 0) + 1;
  recent = recent.filter(x => x.pinned).concat(recent.filter(x => !x.pinned).sort((a, b) => b.last - a.last).slice(0, 40));
  saveRecent();
  try { app.addRecentDocument(full); } catch (e) {}
}

function sumatraPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "SumatraPDF.exe")
    : path.join(__dirname, "vendor", "SumatraPDF.exe");
}

function popplerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "poppler", "pdftocairo.exe")
    : path.join(__dirname, "vendor", "poppler", "pdftocairo.exe");
}

/* Updates: new versions are published as GitHub releases. The app checks shortly after it opens,
   offers the update, then downloads the installer, runs it silently and reopens. */
const UPDATE_API = "https://api.github.com/repos/freddieterblanche/pdf-reader/releases/latest";
let updateInfo = null;
const newer = (a, b) => {
  const x = String(a).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
  const y = String(b).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};
async function checkForUpdate(manual) {
  try {
    const { net } = require("electron");
    const r = await net.fetch(UPDATE_API, { headers: { "Accept": "application/vnd.github+json", "User-Agent": "PDF-Reader" } });
    if (!r.ok) throw new Error("The update server answered " + r.status + ".");
    const rel = await r.json();
    const asset = (rel.assets || []).find(a => /^PDF-Reader-Setup-.*\.exe$/i.test(a.name));
    if (asset && newer(rel.tag_name, app.getVersion())) {
      updateInfo = { version: String(rel.tag_name).replace(/^v/, ""), url: asset.browser_download_url, size: asset.size, notes: rel.body || "" };
      if (win) win.webContents.send("update-available", { version: updateInfo.version, notes: updateInfo.notes });
      return { available: true, version: updateInfo.version };
    }
    return { available: false, current: app.getVersion() };
  } catch (e) {
    if (manual) return { error: (e && e.message) || "Could not reach the update server." };
    return { available: false };
  }
}
async function installUpdate() {
  if (!updateInfo) throw new Error("No update is waiting.");
  const { net } = require("electron");
  const r = await net.fetch(updateInfo.url, { headers: { "User-Agent": "PDF-Reader" } });
  if (!r.ok || !r.body) throw new Error("The download failed (" + r.status + ").");
  const dest = path.join(os.tmpdir(), "PDF-Reader-Setup-" + updateInfo.version + ".exe");
  const out = fs.createWriteStream(dest);
  const reader = r.body.getReader();
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise(res => out.once("drain", res));
    const pct = updateInfo.size ? Math.floor(got / updateInfo.size * 100) : 0;
    if (pct !== last && win) { last = pct; win.webContents.send("update-progress", pct); }
  }
  await new Promise((res, rej) => { out.end(res); out.on("error", rej); });
  if (updateInfo.size && fs.statSync(dest).size !== updateInfo.size) throw new Error("The download was incomplete. Please try again.");
  saveState();
  const { spawn } = require("child_process");
  spawn(dest, ["/S"], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => app.quit(), 300);
  return true;
}

function run(file, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: timeout || 0 }, (err, stdout) => {
      if (err) reject(err); else resolve(String(stdout || ""));
    });
  });
}

/* Window size and position are remembered between sessions */
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch (e) { return {}; } }
function saveState() {
  if (!win) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch (e) {}
}

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    x: s.x, y: s.y, width: s.width || 1360, height: s.height || 860,
    minWidth: 720, minHeight: 480,
    title: "PDF Reader",
    icon: path.join(__dirname, "src", "icon.png"),
    backgroundColor: "#eef0f2",
    autoHideMenuBar: true,
    // Our own red title bar; Windows still draws the minimise, maximise and close buttons over it
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#b02e2e", symbolColor: "#ffffff", height: 34 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  if (s.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", saveState);
  win.on("closed", () => { win = null; });
  // Never navigate away from the reader (for example when a file is dropped outside a drop zone)
  win.webContents.on("will-navigate", e => e.preventDefault());
  // Right-click menu for selected text and text fields
  win.webContents.on("context-menu", (_e, p) => {
    const items = [];
    if (p.isEditable) items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" }, { role: "selectAll" });
    else if (p.selectionText && p.selectionText.trim()) items.push({ role: "copy" });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadFile(path.join(__dirname, "src", "index.html"));
}

function sendFiles(paths) {
  const files = [];
  for (const p of paths) { try { files.push(readPdf(p)); } catch (e) {} }
  if (files.length && win) win.webContents.send("open-files", files);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pending.push(...pdfArgs(process.argv));

  app.on("second-instance", (_e, argv) => {
    const files = pdfArgs(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      sendFiles(files);
    } else pending.push(...files);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    ipcMain.handle("initial-files", () => {
      const out = [];
      for (const p of pending.splice(0)) { try { out.push(readPdf(p)); } catch (e) {} }
      return out;
    });

    ipcMain.handle("open-dialog", async () => {
      const r = await dialog.showOpenDialog(win, {
        title: "Open PDFs",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "PDF documents", extensions: ["pdf"] }]
      });
      if (r.canceled) return [];
      const out = [];
      for (const p of r.filePaths) { try { out.push(readPdf(p)); } catch (e) {} }
      return out;
    });

    ipcMain.handle("read-files", (_e, paths) => {
      const out = [];
      for (const p of (Array.isArray(paths) ? paths : [])) if (isPdf(p)) { try { out.push(readPdf(p)); } catch (e) {} }
      return out;
    });

    ipcMain.handle("write-temp", (_e, name, data) => {
      const dir = path.join(os.tmpdir(), "pdf-reader-print");
      fs.mkdirSync(dir, { recursive: true });
      const safe = String(name || "document.pdf").replace(/[^\w .()-]/g, "_").slice(0, 120) || "document.pdf";
      const full = path.join(dir, Date.now() + "-" + (/\.pdf$/i.test(safe) ? safe : safe + ".pdf"));
      fs.writeFileSync(full, Buffer.from(data));
      known.add(full);
      return full;
    });

    ipcMain.handle("show-in-folder", (_e, p) => { if (known.has(p)) shell.showItemInFolder(p); });

    ipcMain.handle("get-printers", async () => {
      let printers = [];
      try {
        printers = (await win.webContents.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName || p.name }));
      } catch (e) {}
      let defaultPrinter = "";
      try {
        defaultPrinter = (await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
          "(Get-CimInstance -ClassName Win32_Printer -Filter 'Default=TRUE').Name"], 15000)).trim();
      } catch (e) {}
      return { printers, defaultPrinter };
    });

    // Printing. "fast" draws pages through Windows' vector print path (text and shapes, as Adobe does);
    // "standard" is the SumatraPDF engine, which sends each page as a picture.
    ipcMain.handle("print", async (_e, o) => {
      o = o || {};
      if (!known.has(o.file)) throw new Error("This document can no longer be found on disk.");
      const copies = Math.max(1, Math.min(99, parseInt(o.copies, 10) || 1));
      if (o.engine !== "standard") {
        const args = ["-print", "-q"];
        if (o.printer) args.push("-printer", String(o.printer));
        const from = parseInt(o.from, 10), to = parseInt(o.to, 10);
        if (from > 0) args.push("-f", String(from));
        if (to > 0) args.push("-l", String(to));
        const duplex = { simplex: "off", duplexlong: "long", duplexshort: "short" }[o.sides];
        if (duplex) args.push("-printopt", "duplex=" + duplex);
        if (o.scale === "fit") args.push("-expand");
        if (o.scale === "noscale") args.push("-noshrink");
        args.push(o.file);
        for (let i = 0; i < copies; i++) await run(popplerPath(), args, 30 * 60 * 1000);
        return true;
      }
      const settings = [];
      if (o.pages && /^[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*$/.test(o.pages)) settings.push(o.pages);
      if (copies > 1) settings.push(copies + "x");
      if (["simplex", "duplexlong", "duplexshort"].includes(o.sides)) settings.push(o.sides);
      if (["color", "monochrome"].includes(o.color)) settings.push(o.color);
      if (["fit", "shrink", "noscale"].includes(o.scale)) settings.push(o.scale);
      const args = o.printer ? ["-print-to", String(o.printer)] : ["-print-to-default"];
      if (settings.length) args.push("-print-settings", settings.join(","));
      args.push("-silent", o.file);
      await run(sumatraPath(), args, 30 * 60 * 1000);
      return true;
    });

    // Full Windows print dialog (trays, stapling, paper and other printer-specific options)
    ipcMain.handle("print-dialog", async (_e, o) => {
      if (!o || !known.has(o.file)) throw new Error("This document can no longer be found on disk.");
      await run(sumatraPath(), ["-print-dialog", "-exit-when-done", o.file], 30 * 60 * 1000);
      return true;
    });

    /* Saving edited PDFs. New files can only be written where the user chose in a Save dialog or folder
       picker; overwriting is only allowed for files the user opened, and the original is backed up first. */
    const writable = new Set(), writableDirs = new Set();
    const backupDir = () => path.join(app.getPath("userData"), "Backups");
    function backup(file) {
      const dir = backupDir();
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
      fs.copyFileSync(file, path.join(dir, stamp + " " + path.basename(file)));
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      for (const f of fs.readdirSync(dir)) {
        try { const p = path.join(dir, f); if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch (e) {}
      }
    }
    function unique(p) {
      if (!fs.existsSync(p)) return p;
      const ext = path.extname(p), base = p.slice(0, -ext.length);
      for (let i = 2; i < 1000; i++) { const q = base + " (" + i + ")" + ext; if (!fs.existsSync(q)) return q; }
      throw new Error("Could not find a free file name.");
    }
    const defaultDir = p => (p && fs.existsSync(path.dirname(p))) ? p : path.join(app.getPath("documents"), path.basename(p || "document.pdf"));

    ipcMain.handle("save-dialog", async (_e, o) => {
      o = o || {};
      const r = await dialog.showSaveDialog(win, { title: o.title || "Save PDF", defaultPath: defaultDir(o.defaultPath),
        filters: [{ name: "PDF documents", extensions: ["pdf"] }] });
      if (r.canceled || !r.filePath) return "";
      let p = path.resolve(r.filePath); if (!/\.pdf$/i.test(p)) p += ".pdf";
      writable.add(p); return p;
    });
    ipcMain.handle("choose-folder", async (_e, o) => {
      o = o || {};
      const r = await dialog.showOpenDialog(win, { title: o.title || "Choose a folder", defaultPath: o.defaultPath && fs.existsSync(o.defaultPath) ? o.defaultPath : app.getPath("documents"),
        properties: ["openDirectory", "createDirectory"] });
      if (r.canceled || !r.filePaths[0]) return "";
      const d = path.resolve(r.filePaths[0]); writableDirs.add(d); return d;
    });
    ipcMain.handle("write-pdf", async (_e, o) => {
      o = o || {};
      let target = path.resolve(String(o.path || ""));
      if (o.mode === "overwrite") {
        if (!known.has(target)) throw new Error("This document can no longer be found on disk.");
        backup(target);
      } else if (o.mode === "new") {
        if (!writable.has(target)) throw new Error("Choose where to save the file first.");
      } else if (o.mode === "part") {
        if (!writableDirs.has(path.dirname(target)) || !/\.pdf$/i.test(target)) throw new Error("Choose a folder first.");
        target = unique(target);
      } else throw new Error("Unknown save type.");
      const tmp = target + ".pdfreader-tmp";
      try {
        fs.writeFileSync(tmp, Buffer.from(o.data));
        fs.renameSync(tmp, target);
      } catch (e) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        if (["EBUSY", "EPERM", "EACCES"].includes(e.code)) throw new Error("The file is open in another program or is read-only. Close it there and try again, or use Save as copy.");
        throw e;
      }
      known.add(target);
      if (o.mode === "new") noteRecent(target);
      return target;
    });

    /* OCR: recognises text on scanned pages, offline, with Tesseract (English). A small pool of workers
       runs in the background; the reader sends one page image at a time and gets words with positions. */
    let ocrPool = null;
    function ocrScheduler() {
      if (ocrPool) return ocrPool;
      ocrPool = (async () => {
        const base = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules") : path.join(__dirname, "node_modules");
        const { createScheduler, createWorker } = require(path.join(base, "tesseract.js"));
        const langPath = path.join(base, "@tesseract.js-data", "eng", "4.0.0_best_int");
        const cachePath = path.join(app.getPath("userData"), "ocr-cache");
        fs.mkdirSync(cachePath, { recursive: true });
        // Unpack the language data into the cache ourselves; the engine's own first-time load stalls inside Electron
        const cached = path.join(cachePath, "eng.traineddata");
        if (!fs.existsSync(cached) || fs.statSync(cached).size < 1e6) {
          const raw = require("zlib").gunzipSync(fs.readFileSync(path.join(langPath, "eng.traineddata.gz")));
          fs.writeFileSync(cached + ".tmp", raw); fs.renameSync(cached + ".tmp", cached);
        }
        const s = createScheduler();
        const n = Math.max(1, Math.min(3, os.cpus().length - 1));
        const withLimit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);
        for (let i = 0; i < n; i++) {
          let fail; const failed = new Promise((_, rej) => { fail = rej; });
          const w = await withLimit(Promise.race([createWorker("eng", 1, { langPath, cachePath, gzip: true, logger: () => {}, errorHandler: e => fail(e) }), failed]), 90000, "The OCR engine did not start.");
          s.addWorker(w);
        }
        return s;
      })();
      ocrPool.catch(() => { ocrPool = null; });
      return ocrPool;
    }
    ipcMain.handle("ocr-page", async (_e, data) => {
      const s = await ocrScheduler();
      const { data: r } = await Promise.race([s.addJob("recognize", Buffer.from(data), {}, { blocks: true, text: false }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Text recognition took too long on one page.")), 300000))]);
      const words = []; let line = 0;
      (r.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => { line++; (l.words || []).forEach(w => {
        if (w.text && w.text.trim() && w.confidence > 25) words.push({ text: w.text, line, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
      }); })));
      return words;
    });
    app.on("before-quit", () => { if (ocrPool) ocrPool.then(s => s.terminate()).catch(() => {}); });

    ipcMain.handle("recent-list", () => loadRecent()
      .map(r => ({ path: r.path, name: r.name, last: r.last, count: r.count, pinned: !!r.pinned, folder: path.dirname(r.path), exists: fs.existsSync(r.path) }))
      .sort((a, b) => (b.pinned - a.pinned) || (b.last - a.last)));
    const findRecent = p => loadRecent().find(x => x.path === p);
    ipcMain.handle("recent-pin", (_e, p, on) => { const r = findRecent(p); if (r) { r.pinned = !!on; saveRecent(); } });
    ipcMain.handle("recent-remove", (_e, p) => { recent = loadRecent().filter(x => x.path !== p); saveRecent(); });
    ipcMain.handle("recent-clear", () => { recent = loadRecent().filter(x => x.pinned); saveRecent(); try { app.clearRecentDocuments(); } catch (e) {} });
    ipcMain.handle("recent-open", (_e, p) => {
      const r = findRecent(p); if (!r) throw new Error("This document is no longer in the recent list.");
      if (!fs.existsSync(r.path)) throw new Error("This file has been moved, renamed or deleted.");
      return [readPdf(r.path)];
    });

    ipcMain.handle("app-version", () => app.getVersion());
    ipcMain.handle("check-update", () => checkForUpdate(true));
    ipcMain.handle("install-update", () => installUpdate());

    createWindow();
    if (app.isPackaged) {
      setTimeout(() => checkForUpdate(false), 8000);
      setInterval(() => checkForUpdate(false), 6 * 60 * 60 * 1000);
    }
  });

  app.on("window-all-closed", () => app.quit());
}
