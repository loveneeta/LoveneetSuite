/**
 * Electron Main Process for Loveneet Suite
 * Secure, restricted renderer, offline-first execution, persistent SQLite database.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const LocalDatabase = require("./database.cjs");

let mainWindow = null;
let dbInstance = null;

// Configure autoUpdater
autoUpdater.autoDownload = false; // User controls download via UI
autoUpdater.autoInstallOnAppQuit = false; // Safe user-approved restart only
autoUpdater.allowPrerelease = false;

// Update Status State
const updateStatus = {
  status: "idle", // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseNotes: null,
  releaseDate: null,
  progress: null,
  error: null,
  lastChecked: null,
  fallbackUrl: "https://github.com/loveneeta/LoveneetSuite/releases/latest"
};

function broadcastUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:statusChanged", updateStatus);
  }
}

autoUpdater.on("checking-for-update", () => {
  updateStatus.status = "checking";
  updateStatus.error = null;
  broadcastUpdateStatus();
});

autoUpdater.on("update-available", (info) => {
  updateStatus.status = "available";
  updateStatus.latestVersion = info.version;
  updateStatus.releaseNotes = typeof info.releaseNotes === "string" ? info.releaseNotes : null;
  updateStatus.releaseDate = info.releaseDate;
  updateStatus.lastChecked = new Date().toISOString();
  updateStatus.error = null;
  broadcastUpdateStatus();
});

autoUpdater.on("update-not-available", (info) => {
  updateStatus.status = "not-available";
  updateStatus.latestVersion = info.version;
  updateStatus.lastChecked = new Date().toISOString();
  updateStatus.error = null;
  broadcastUpdateStatus();
});

autoUpdater.on("download-progress", (progressObj) => {
  updateStatus.status = "downloading";
  updateStatus.progress = {
    percent: Math.round(progressObj.percent || 0),
    transferred: progressObj.transferred,
    total: progressObj.total,
    bytesPerSecond: progressObj.bytesPerSecond
  };
  broadcastUpdateStatus();
});

autoUpdater.on("update-downloaded", (info) => {
  updateStatus.status = "downloaded";
  updateStatus.latestVersion = info.version;
  updateStatus.error = null;
  broadcastUpdateStatus();
});

autoUpdater.on("error", (err) => {
  updateStatus.status = "error";
  updateStatus.error = err ? (err.message || String(err)) : "Failed to check or download update";
  updateStatus.lastChecked = new Date().toISOString();
  broadcastUpdateStatus();
});

// Enforce single application instance on Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  // Initialize persistent SQLite database in %APPDATA%/LoveneetSuite/
  const userDataPath = app.getPath("userData");
  dbInstance = new LocalDatabase(userDataPath);
  await dbInstance.init();

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 880,
    minWidth: 1000,
    minHeight: 700,
    title: "Loveneet Suite",
    backgroundColor: "#0b1020",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  // Remove default menu bar for clean modern app interface
  mainWindow.setMenuBarVisibility(false);

  // Load production bundle or development server
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const distIndex = path.join(__dirname, "..", "dist", "index.html");
    if (fs.existsSync(distIndex)) {
      mainWindow.loadFile(distIndex);
    } else {
      console.warn("dist/index.html not found, fallback to localhost:5173");
      mainWindow.loadURL("http://localhost:5173");
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Background check for desktop updates (6s after window launch, only if packaged)
  setTimeout(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn("Background update check skipped:", err?.message || err);
      });
    }
  }, 6000);
}

app.whenReady().then(async () => {
  setupIpcHandlers();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Setup IPC Handlers
function setupIpcHandlers() {
  // Window controls
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());

  // Native Windows File Dialogs
  ipcMain.handle("dialog:showOpenDialog", async (event, options) => {
    return await dialog.showOpenDialog(mainWindow, options || {});
  });

  ipcMain.handle("dialog:showSaveDialog", async (event, options) => {
    return await dialog.showSaveDialog(mainWindow, options || {});
  });

  // Filesystem Helpers
  ipcMain.handle("fs:openPath", async (event, folderPath) => {
    if (!folderPath) return { success: false, error: "Empty path" };
    try {
      const result = await shell.openPath(folderPath);
      return { success: !result, error: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("fs:writeFile", async (event, { targetPath, bufferBase64 }) => {
    if (!targetPath || !bufferBase64) return { success: false, error: "Invalid path or empty data" };
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmpPath = `${targetPath}.${Date.now()}.tmp`;
      const buf = Buffer.from(bufferBase64, "base64");
      await fs.promises.writeFile(tmpPath, buf);
      await fs.promises.rename(tmpPath, targetPath);
      const stat = await fs.promises.stat(targetPath);
      return { success: true, size: stat.size, path: targetPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("fs:showItemInFolder", (event, fullPath) => {
    if (!fullPath) return false;
    shell.showItemInFolder(fullPath);
    return true;
  });

  ipcMain.handle("fs:exists", (event, targetPath) => {
    if (!targetPath) return false;
    return fs.existsSync(targetPath);
  });

  // Persistent SQLite Database Handlers
  ipcMain.handle("db:query", (event, { sql, params }) => {
    return dbInstance.query(sql, params);
  });

  ipcMain.handle("db:execute", (event, { sql, params }) => {
    return dbInstance.execute(sql, params);
  });

  ipcMain.handle("db:transaction", (event, operations) => {
    return dbInstance.transaction(operations);
  });

  ipcMain.handle("db:getStats", () => {
    return dbInstance.getStats();
  });

  ipcMain.handle("db:backup", (event, destPath) => {
    return dbInstance.backup(destPath);
  });

  ipcMain.handle("db:restore", (event, srcPath) => {
    return dbInstance.restore(srcPath);
  });

  let isCollectorCancelled = false;

// Native Image Compression Helper using Electron Skia Graphics Engine
async function compressImageNative(srcPath, destPath, compressionOptions = {}) {
  try {
    const ext = path.extname(srcPath).toLowerCase();
    const isPng = ext === ".png";
    const isJpg = ext === ".jpg" || ext === ".jpeg";

    const img = nativeImage.createFromPath(srcPath);
    if (img.isEmpty()) {
      await fs.promises.copyFile(srcPath, destPath);
      const stat = await fs.promises.stat(destPath);
      return { status: "fallback", origBytes: stat.size, finalBytes: stat.size };
    }

    const origStat = await fs.promises.stat(srcPath);
    const origBytes = origStat.size;

    const targetBytes = compressionOptions.targetBytes || (compressionOptions.targetSize ? (compressionOptions.targetUnit === "MB" ? compressionOptions.targetSize * 1048576 : compressionOptions.targetSize * 1024) : 0);
    if (compressionOptions.skipBelowTarget && targetBytes > 0 && origBytes <= targetBytes) {
      await fs.promises.copyFile(srcPath, destPath);
      return { status: "skipped_below_target", origBytes, finalBytes: origBytes };
    }

    const origSize = img.getSize();
    let targetWidth = origSize.width;
    let targetHeight = origSize.height;

    if (compressionOptions.resizeMode === "scale" && compressionOptions.scalePct && compressionOptions.scalePct < 100) {
      const scale = compressionOptions.scalePct / 100;
      targetWidth = Math.max(1, Math.round(origSize.width * scale));
      targetHeight = Math.max(1, Math.round(origSize.height * scale));
    } else if (compressionOptions.resizeMode === "custom" && (compressionOptions.maxWidth || compressionOptions.maxHeight)) {
      const maxW = compressionOptions.maxWidth || origSize.width;
      const maxH = compressionOptions.maxHeight || origSize.height;
      if (compressionOptions.preserveAspect !== false) {
        const ratio = Math.min(maxW / origSize.width, maxH / origSize.height, 1);
        targetWidth = Math.max(1, Math.round(origSize.width * ratio));
        targetHeight = Math.max(1, Math.round(origSize.height * ratio));
      } else {
        targetWidth = maxW;
        targetHeight = maxH;
      }
    }

    let processedImg = img;
    if (targetWidth !== origSize.width || targetHeight !== origSize.height) {
      processedImg = img.resize({ width: targetWidth, height: targetHeight, quality: "best" });
    }

    const outFmt = compressionOptions.outputFormat || "original";
    const wantPng = outFmt === "png" || (outFmt === "original" && isPng);

    let quality = compressionOptions.quality || 80;
    let buffer;

    if (wantPng) {
      buffer = processedImg.toPNG();
    } else {
      buffer = processedImg.toJPEG(quality);
      if (compressionOptions.mode === "target" && targetBytes > 0 && buffer.length > targetBytes) {
        let q = quality;
        for (let attempt = 0; attempt < 4; attempt++) {
          q = Math.max(15, q - 20);
          const trial = processedImg.toJPEG(q);
          if (trial) {
            buffer = trial;
            if (buffer.length <= targetBytes) break;
          }
        }
      }
    }

    if (buffer && buffer.length < origBytes) {
      await fs.promises.writeFile(destPath, buffer);
      return { status: "compressed", origBytes, finalBytes: buffer.length };
    } else {
      await fs.promises.copyFile(srcPath, destPath);
      return { status: "preserved", origBytes, finalBytes: origBytes };
    }
  } catch (err) {
    await fs.promises.copyFile(srcPath, destPath);
    return { status: "error", origBytes: 0, finalBytes: 0, error: err.message };
  }
}

  // Native Recursive File Collector Scan Engine
  ipcMain.handle("collector:scan", async (event, payload = {}) => {
    const input_folder = payload.input_folder || payload.inputFolder;
    const output_folder = payload.output_folder || payload.outputFolder;
    const include_subfolders = payload.include_subfolders !== undefined ? payload.include_subfolders : (payload.includeSubfolders !== undefined ? payload.includeSubfolders : true);
    const include_hidden = payload.include_hidden !== undefined ? payload.include_hidden : (payload.includeHidden !== undefined ? payload.includeHidden : false);
    const prefix_subfolders = payload.prefix_subfolders !== undefined ? payload.prefix_subfolders : (payload.prefixSubfolders !== undefined ? payload.prefixSubfolders : true);
    const duplicate_mode = payload.duplicate_mode || payload.duplicateMode || "rename";

    if (!input_folder || !fs.existsSync(input_folder)) {
      throw new Error(`Input folder does not exist: ${input_folder}`);
    }

    const inputPath = path.resolve(input_folder);
    const outputPath = output_folder
      ? path.resolve(output_folder)
      : path.join(inputPath, "Collected_Files");

    const foundFiles = [];
    const imgExts = new Set([
      ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".ico", ".heic", ".heif", ".avif"
    ]);

    function walkSync(currentDir, currentPathParts) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!include_hidden && entry.name.startsWith(".")) continue;
        const fullPath = path.join(currentDir, entry.name);

        // Avoid scanning output folder into itself
        const fullNorm = path.resolve(fullPath).toLowerCase().replace(/[\\/]+$/, "");
        const outNorm = outputPath.toLowerCase().replace(/[\\/]+$/, "");
        if (fullNorm === outNorm || fullNorm.startsWith(outNorm + path.sep.toLowerCase())) continue;

        if (entry.isFile()) {
          foundFiles.push({
            fullPath,
            name: entry.name,
            parts: currentPathParts,
            size: fs.statSync(fullPath).size
          });
        } else if (entry.isDirectory() && include_subfolders) {
          walkSync(fullPath, [...currentPathParts, entry.name]);
        }
      }
    }

    walkSync(inputPath, []);

    const usedNames = new Set();
    const items = [];
    let dups = 0;
    let imgCount = 0;

    for (const f of foundFiles) {
      const ext = path.extname(f.name).toLowerCase();
      const isImg = imgExts.has(ext);
      if (isImg) imgCount++;

      let baseName = f.name;
      if (prefix_subfolders && f.parts.length > 0) {
        baseName = `${f.parts.join("-")}-${f.name}`;
      }

      const stem = path.basename(baseName, path.extname(baseName));
      const fileExt = path.extname(baseName);
      const lower = baseName.toLowerCase();
      let targetName = baseName;
      let status = "eligible";

      if (!usedNames.has(lower)) {
        usedNames.add(lower);
      } else {
        dups++;
        if (duplicate_mode === "skip") {
          status = "duplicate_skipped";
        } else if (duplicate_mode === "overwrite") {
          status = "overwrite";
        } else {
          let i = 1;
          while (true) {
            const cand = `${stem} (${i})${fileExt}`;
            if (!usedNames.has(cand.toLowerCase())) {
              usedNames.add(cand.toLowerCase());
              targetName = cand;
              status = "duplicate_renamed";
              break;
            }
            i++;
          }
        }
      }

      const relPath = path.relative(inputPath, f.fullPath).replace(/\\/g, "/");
      items.push({
        source_path: f.fullPath,
        relative_path: relPath,
        target_filename: targetName,
        size: f.size,
        status,
        is_image: isImg
      });
    }

    return {
      ok: true,
      input_folder: inputPath,
      output_folder: outputPath,
      total_found: items.length,
      total_images: imgCount,
      total_non_images: items.length - imgCount,
      total_duplicates: dups,
      files: items
    };
  });

  // Collector Cancellation Handler
  ipcMain.handle("collector:cancel", () => {
    isCollectorCancelled = true;
    return { ok: true };
  });

  // Native Safe Asynchronous Collector & Image Compressor Engine
  ipcMain.handle("collector:collect", async (event, payload = {}) => {
    isCollectorCancelled = false;
    const input_folder = payload.input_folder || payload.inputFolder;
    const output_folder = payload.output_folder || payload.outputFolder;
    const include_subfolders = payload.include_subfolders !== undefined ? payload.include_subfolders : (payload.includeSubfolders !== undefined ? payload.includeSubfolders : true);
    const include_hidden = payload.include_hidden !== undefined ? payload.include_hidden : (payload.includeHidden !== undefined ? payload.includeHidden : false);
    const prefix_subfolders = payload.prefix_subfolders !== undefined ? payload.prefix_subfolders : (payload.prefixSubfolders !== undefined ? payload.prefixSubfolders : true);
    const duplicate_mode = payload.duplicate_mode || payload.duplicateMode || "rename";
    const enable_compression = payload.enableCompression || payload.enable_compression || false;
    const compression = payload.compression || {};

    if (!input_folder || !fs.existsSync(input_folder)) {
      throw new Error(`Input folder does not exist: ${input_folder}`);
    }

    const inputPath = path.resolve(input_folder);
    const outputPath = output_folder
      ? path.resolve(output_folder)
      : path.join(inputPath, "Collected_Files");
    const outNorm = outputPath.toLowerCase().replace(/[\/]+$/, "");

    if (!fs.existsSync(outputPath)) {
      await fs.promises.mkdir(outputPath, { recursive: true });
    }

    const imgExts = new Set([
      ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".ico", ".heic", ".heif", ".avif"
    ]);

    // Discover eligible files recursively and asynchronously
    async function getEligibleFiles(currentDir, currentPathParts) {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      const found = [];
      for (const entry of entries) {
        if (!include_hidden && entry.name.startsWith(".")) continue;
        const fullPath = path.join(currentDir, entry.name);
        const fullNorm = path.resolve(fullPath).toLowerCase().replace(/[\/]+$/, "");
        if (fullNorm === outNorm || fullNorm.startsWith(outNorm + path.sep.toLowerCase())) continue;

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          found.push({
            fullPath,
            name: entry.name,
            parts: currentPathParts,
            isImage: imgExts.has(ext)
          });
        } else if (entry.isDirectory() && include_subfolders) {
          const subs = await getEligibleFiles(fullPath, [...currentPathParts, entry.name]);
          found.push(...subs);
        }
      }
      return found;
    }

    const eligibleFiles = await getEligibleFiles(inputPath, []);
    const total = eligibleFiles.length;
    let copied = 0;
    let skipped = 0;
    let failed = 0;
    let compCount = 0;
    let totalImages = 0;
    let origTotalBytes = 0;
    let compTotalBytes = 0;
    const errors = [];
    const usedNames = new Set();

    for (const f of eligibleFiles) {
      if (f.isImage) totalImages++;
    }

    for (let i = 0; i < eligibleFiles.length; i++) {
      if (isCollectorCancelled) {
        break;
      }

      const item = eligibleFiles[i];
      let baseName = item.name;
      if (prefix_subfolders && item.parts.length > 0) {
        baseName = `${item.parts.join("-")}-${item.name}`;
      }

      const stem = path.basename(baseName, path.extname(baseName));
      const fileExt = path.extname(baseName);
      const lower = baseName.toLowerCase();
      let targetName = baseName;

      if (usedNames.has(lower)) {
        if (duplicate_mode === "skip") {
          skipped++;
          continue;
        } else if (duplicate_mode === "overwrite") {
          targetName = baseName;
        } else {
          let num = 1;
          while (true) {
            const cand = `${stem} (${num})${fileExt}`;
            if (!usedNames.has(cand.toLowerCase()) && !fs.existsSync(path.join(outputPath, cand))) {
              targetName = cand;
              break;
            }
            num++;
          }
        }
      }
      usedNames.add(targetName.toLowerCase());

      const destPath = path.join(outputPath, targetName);
      if (path.resolve(item.fullPath).toLowerCase() === path.resolve(destPath).toLowerCase()) {
        skipped++;
        continue;
      }

      try {
        if (enable_compression && item.isImage) {
          const compRes = await compressImageNative(item.fullPath, destPath, compression);
          if (compRes.status === "compressed") compCount++;
          origTotalBytes += compRes.origBytes || 0;
          compTotalBytes += compRes.finalBytes || 0;
          copied++;
        } else {
          await fs.promises.copyFile(item.fullPath, destPath);
          copied++;
        }
      } catch (err) {
        failed++;
        errors.push({ file: item.fullPath, error: err.message });
      }

      // Stream real-time progress update to renderer
      const pct = Math.round(((i + 1) / total) * 100);
      try {
        event.sender.send("collector:progress", {
          copied,
          skipped,
          failed,
          total,
          currentFile: targetName,
          percent: pct,
          compressionStats: enable_compression ? {
            enabled: true,
            total_images: totalImages,
            compressed: compCount,
            skipped: Math.max(0, totalImages - compCount),
            original_bytes: origTotalBytes,
            compressed_bytes: compTotalBytes,
            saved_bytes: Math.max(0, origTotalBytes - compTotalBytes),
            saved_percent: origTotalBytes > 0 ? Math.round((Math.max(0, origTotalBytes - compTotalBytes) / origTotalBytes) * 100) : 0
          } : null
        });
      } catch (_) {}

      // Critical non-blocking yield to event loop so OS window message pump runs!
      await new Promise(resolve => setImmediate(resolve));
    }

    // Save job into SQLite database
    try {
      dbInstance.execute(
        `INSERT INTO file_collection_jobs (
          job_name, input_folder, output_folder, total_files, copied_count, skipped_count, failed_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          `Collect ${path.basename(inputPath)}`,
          inputPath,
          outputPath,
          total,
          copied,
          skipped,
          failed,
          new Date().toISOString()
        ]
      );
    } catch (_) {}

    return {
      ok: true,
      cancelled: isCollectorCancelled,
      input_folder: inputPath,
      output_folder: outputPath,
      total,
      copied,
      skipped,
      failed,
      errors,
      compression_stats: enable_compression ? {
        enabled: true,
        total_images: totalImages,
        compressed: compCount,
        skipped: Math.max(0, totalImages - compCount),
        original_bytes: origTotalBytes,
        compressed_bytes: compTotalBytes,
        saved_bytes: Math.max(0, origTotalBytes - compTotalBytes),
        saved_percent: origTotalBytes > 0 ? Math.round((Math.max(0, origTotalBytes - compTotalBytes) / origTotalBytes) * 100) : 0
      } : null
    };
  });

  // Synchronization Queue Handlers
  ipcMain.handle("sync:getStatus", () => {
    const pending = dbInstance.query(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending';"
    );
    const lastSynced = dbInstance.query(
      "SELECT synced_at FROM sync_queue WHERE status = 'synced' ORDER BY synced_at DESC LIMIT 1;"
    );
    return {
      pendingCount: pending[0]?.count || 0,
      lastSyncedAt: lastSynced[0]?.synced_at || null
    };
  });

  ipcMain.handle("sync:queueChange", (event, change) => {
    dbInstance.execute(
      `INSERT INTO sync_queue (entity_type, entity_id, action, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?);`,
      [
        change.entityType,
        change.entityId,
        change.action,
        JSON.stringify(change.payload || {}),
        new Date().toISOString()
      ]
    );
    return { success: true };
  });

  ipcMain.handle("sync:getPending", () => {
    return dbInstance.query(
      "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 100;"
    );
  });

  // Desktop Application Auto-Updater IPC Handlers
  ipcMain.handle("updater:getStatus", () => {
    updateStatus.currentVersion = app.getVersion();
    return updateStatus;
  });

  ipcMain.handle("updater:check", async () => {
    updateStatus.status = "checking";
    updateStatus.error = null;
    broadcastUpdateStatus();
    try {
      const res = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: res?.updateInfo };
    } catch (err) {
      updateStatus.status = "error";
      updateStatus.error = err ? (err.message || String(err)) : "Failed to check for updates";
      broadcastUpdateStatus();
      return { success: false, error: updateStatus.error };
    }
  });

  ipcMain.handle("updater:download", async () => {
    updateStatus.status = "downloading";
    updateStatus.error = null;
    broadcastUpdateStatus();
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      updateStatus.status = "error";
      updateStatus.error = err ? (err.message || String(err)) : "Failed to download update";
      broadcastUpdateStatus();
      return { success: false, error: updateStatus.error };
    }
  });

  ipcMain.handle("updater:quitAndInstall", () => {
    autoUpdater.quitAndInstall(false, true);
  });
}
