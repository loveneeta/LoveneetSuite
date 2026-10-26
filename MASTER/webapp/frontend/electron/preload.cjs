/**
 * Secure Electron Preload Script for Loveneet Suite
 * Enforces context isolation and validated IPC communication.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close")
  },

  // Native Windows File Dialogs
  dialog: {
    showOpenDialog: (options) => ipcRenderer.invoke("dialog:showOpenDialog", options),
    showSaveDialog: (options) => ipcRenderer.invoke("dialog:showSaveDialog", options)
  },

  // Native Filesystem Helpers
  fs: {
    openPath: (folderPath) => ipcRenderer.invoke("fs:openPath", folderPath),
    exists: (targetPath) => ipcRenderer.invoke("fs:exists", targetPath)
  },

  // Persistent Local SQLite Database
  db: {
    query: (sql, params) => ipcRenderer.invoke("db:query", { sql, params }),
    execute: (sql, params) => ipcRenderer.invoke("db:execute", { sql, params }),
    transaction: (operations) => ipcRenderer.invoke("db:transaction", operations),
    getStats: () => ipcRenderer.invoke("db:getStats"),
    backup: (destPath) => ipcRenderer.invoke("db:backup", destPath),
    restore: (srcPath) => ipcRenderer.invoke("db:restore", srcPath)
  },

  // Native High-Speed File Collector & Compressor Engine
  collector: {
    scan: (options) => ipcRenderer.invoke("collector:scan", options),
    collect: (options) => ipcRenderer.invoke("collector:collect", options)
  },

  // Synchronization Service
  sync: {
    getStatus: () => ipcRenderer.invoke("sync:getStatus"),
    queueChange: (change) => ipcRenderer.invoke("sync:queueChange", change),
    getPending: () => ipcRenderer.invoke("sync:getPending"),
    triggerSync: () => ipcRenderer.invoke("sync:triggerSync")
  },

  // Desktop Application Auto-Updater
  updater: {
    getStatus: () => ipcRenderer.invoke("updater:getStatus"),
    checkForUpdates: () => ipcRenderer.invoke("updater:check"),
    downloadUpdate: () => ipcRenderer.invoke("updater:download"),
    quitAndInstall: () => ipcRenderer.invoke("updater:quitAndInstall"),
    onStatusChange: (callback) => {
      const listener = (event, status) => callback(status);
      ipcRenderer.on("updater:statusChanged", listener);
      return () => ipcRenderer.removeListener("updater:statusChanged", listener);
    }
  }
});
