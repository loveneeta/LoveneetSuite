/**
 * Electron Main Process for Loveneet Suite
 * Secure, restricted renderer, offline-first execution, persistent SQLite database.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const LocalDatabase = require("./database.cjs");

let mainWindow = null;
let dbInstance = null;

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
        if (path.resolve(fullPath) === outputPath) continue;

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

  // Native Safe Copy Collector Engine
  ipcMain.handle("collector:collect", async (event, payload = {}) => {
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

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Reuse scan logic to compute candidate names
    const scanData = await ipcMain.emit
      ? null
      : null; // will run below inline

    // Read and copy files safely
    let copied = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    const usedNames = new Set();

    function walkAndCopy(currentDir, currentPathParts) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!include_hidden && entry.name.startsWith(".")) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (path.resolve(fullPath) === outputPath) continue;

        if (entry.isFile()) {
          try {
            let baseName = entry.name;
            if (prefix_subfolders && currentPathParts.length > 0) {
              baseName = `${currentPathParts.join("-")}-${entry.name}`;
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
                let i = 1;
                while (true) {
                  const cand = `${stem} (${i})${fileExt}`;
                  if (!usedNames.has(cand.toLowerCase()) && !fs.existsSync(path.join(outputPath, cand))) {
                    targetName = cand;
                    break;
                  }
                  i++;
                }
              }
            }
            usedNames.add(targetName.toLowerCase());

            const destPath = path.join(outputPath, targetName);
            // Prevent copying onto itself
            if (path.resolve(fullPath) === path.resolve(destPath)) {
              skipped++;
              continue;
            }

            fs.copyFileSync(fullPath, destPath);
            copied++;
          } catch (copyErr) {
            failed++;
            errors.push({ file: fullPath, error: copyErr.message });
          }
        } else if (entry.isDirectory() && include_subfolders) {
          walkAndCopy(fullPath, [...currentPathParts, entry.name]);
        }
      }
    }

    walkAndCopy(inputPath, []);

    // Record job in local SQLite database
    try {
      dbInstance.execute(
        `INSERT INTO file_collection_jobs (
          job_name, input_folder, output_folder, total_files, copied_count, skipped_count, failed_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          `Collect ${path.basename(inputPath)}`,
          inputPath,
          outputPath,
          copied + skipped + failed,
          copied,
          skipped,
          failed,
          new Date().toISOString()
        ]
      );
    } catch (_) {}

    return {
      ok: true,
      input_folder: inputPath,
      output_folder: outputPath,
      copied,
      skipped,
      failed,
      errors
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
}
