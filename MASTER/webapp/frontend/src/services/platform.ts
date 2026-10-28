/**
 * Loveneet Suite — Dual-Platform Service Abstraction
 * Seamlessly switches between Desktop (Electron + SQLite) and Web (Browser APIs + IndexedDB/LocalStorage).
 * Safe for Vite web builds: NEVER imports Electron-only modules directly into renderer bundles.
 */

export interface PlatformInfo {
  isDesktop: boolean;
  platform: "windows" | "web" | "mac" | "linux";
  mode: "desktop" | "web";
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
      };
      dialog: {
        showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
        showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;
      };
      fs: {
        openPath: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
        exists: (targetPath: string) => Promise<boolean>;
        writeFile?: (targetPath: string, bufferBase64: string) => Promise<{ success: boolean; size?: number; path?: string; sha256?: string; error?: string }>;
        readFile?: (targetPath: string) => Promise<{ success: boolean; size?: number; sha256?: string; dataBase64?: string; error?: string }>;
        showItemInFolder?: (fullPath: string) => Promise<boolean>;
      };
      db: {
        query: (sql: string, params?: any[]) => Promise<any[]>;
        execute: (sql: string, params?: any[]) => Promise<{ success: boolean }>;
        transaction: (ops: Array<{ sql: string; params?: any[] }>) => Promise<{ success: boolean; count: number }>;
        getStats: () => Promise<any>;
        backup: (destPath: string) => Promise<{ success: boolean; backupPath: string }>;
        restore: (srcPath: string) => Promise<{ success: boolean }>;
      };
      collector: {
        scan: (options: any) => Promise<any>;
        collect: (options: any) => Promise<any>;
      };
      sync: {
        getStatus: () => Promise<{ pendingCount: number; lastSyncedAt: string | null }>;
        queueChange: (change: any) => Promise<{ success: boolean }>;
        getPending: () => Promise<any[]>;
        triggerSync: () => Promise<any>;
      };
      updater?: {
        getStatus: () => Promise<UpdateStatus>;
        checkForUpdates: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>;
        downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
        quitAndInstall: () => Promise<void>;
        onStatusChange: (callback: (status: UpdateStatus) => void) => () => void;
      };
    };
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
}

export function getPlatformInfo(): PlatformInfo {
  if (isDesktop()) {
    return {
      isDesktop: true,
      platform: "windows",
      mode: "desktop"
    };
  }
  return {
    isDesktop: false,
    platform: "web",
    mode: "web"
  };
}

// Storage Adapter: SQLite on Desktop, LocalStorage / IndexedDB on Web
export const storageAdapter = {
  async getSetting<T = any>(key: string, defaultValue?: T): Promise<T | null> {
    if (isDesktop() && window.electronAPI) {
      try {
        const rows = await window.electronAPI.db.query(
          "SELECT value FROM app_settings WHERE key = ? LIMIT 1;",
          [key]
        );
        if (rows.length > 0 && rows[0].value !== undefined) {
          try {
            return JSON.parse(rows[0].value) as T;
          } catch {
            return rows[0].value as T;
          }
        }
        return defaultValue ?? null;
      } catch (err) {
        console.warn("Desktop SQLite getSetting fallback to localStorage:", err);
      }
    }

    try {
      const item = localStorage.getItem(`loveneet_setting_${key}`);
      if (item !== null) {
        try {
          return JSON.parse(item) as T;
        } catch {
          return item as unknown as T;
        }
      }
    } catch (_) {}
    return defaultValue ?? null;
  },

  async setSetting(key: string, value: any): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    const now = new Date().toISOString();

    if (isDesktop() && window.electronAPI) {
      try {
        await window.electronAPI.db.execute(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
          [key, serialized, now]
        );
        return;
      } catch (err) {
        console.warn("Desktop SQLite setSetting fallback to localStorage:", err);
      }
    }

    try {
      localStorage.setItem(`loveneet_setting_${key}`, serialized);
    } catch (_) {}
  },

  async savePoRecord(record: {
    sourceFile: string;
    soNumber?: string;
    itemCode?: string;
    qty?: string;
    length?: string;
    width?: string;
    height?: string;
    ply?: string;
    boxType?: string;
    confidence?: string;
    rawPayload?: any;
  }): Promise<void> {
    const now = new Date().toISOString();
    if (isDesktop() && window.electronAPI) {
      try {
        await window.electronAPI.db.execute(
          `INSERT INTO po_extraction_records (
            source_file, so_number, item_code, qty, length, width, height, ply, box_type, confidence, raw_payload, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            record.sourceFile || "unknown.pdf",
            record.soNumber || "",
            record.itemCode || "",
            record.qty || "",
            record.length || "",
            record.width || "",
            record.height || "",
            record.ply || "",
            record.boxType || "",
            record.confidence || "review",
            JSON.stringify(record.rawPayload || {}),
            now
          ]
        );
        return;
      } catch (e) {
        console.warn("Desktop savePoRecord failed:", e);
      }
    }

    try {
      const key = "loveneet_po_records";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.unshift({ ...record, createdAt: now });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 500)));
    } catch (_) {}
  },

  async getPoRecords(limit = 100): Promise<any[]> {
    if (isDesktop() && window.electronAPI) {
      try {
        return await window.electronAPI.db.query(
          "SELECT * FROM po_extraction_records ORDER BY id DESC LIMIT ?;",
          [limit]
        );
      } catch (e) {
        console.warn("Desktop getPoRecords failed:", e);
      }
    }

    try {
      const existing = JSON.parse(localStorage.getItem("loveneet_po_records") || "[]");
      return existing.slice(0, limit);
    } catch (_) {
      return [];
    }
  },

  async getStats(): Promise<any> {
    if (isDesktop() && window.electronAPI) {
      try {
        return await window.electronAPI.db.getStats();
      } catch (e) {}
    }
    return {
      initialized: true,
      storageType: "Web Storage (LocalStorage/IndexedDB)",
      mode: "web"
    };
  },

  async backupDatabase(destPath?: string): Promise<{ success: boolean; path?: string }> {
    if (isDesktop() && window.electronAPI) {
      let targetPath = destPath;
      if (!targetPath) {
        const res = await window.electronAPI.dialog.showSaveDialog({
          title: "Backup Loveneet Suite Local Database",
          defaultPath: `LoveneetSuite_Backup_${new Date().toISOString().slice(0, 10)}.db`,
          filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }]
        });
        if (res.canceled || !res.filePath) return { success: false };
        targetPath = res.filePath;
      }
      const bRes = await window.electronAPI.db.backup(targetPath);
      return { success: bRes.success, path: targetPath };
    }
    return { success: false };
  },

  async restoreDatabase(): Promise<{ success: boolean }> {
    if (isDesktop() && window.electronAPI) {
      const res = await window.electronAPI.dialog.showOpenDialog({
        title: "Select Database Backup to Restore",
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }],
        properties: ["openFile"]
      });
      if (res.canceled || !res.filePaths[0]) return { success: false };
      return await window.electronAPI.db.restore(res.filePaths[0]);
    }
    return { success: false };
  }
};

// Native File & Dialog Operations
export const fileAdapter = {
  async pickFolder(): Promise<string | null> {
    if (isDesktop() && window.electronAPI) {
      const res = await window.electronAPI.dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"]
      });
      if (!res.canceled && res.filePaths.length > 0) {
        return res.filePaths[0];
      }
      return null;
    }
    return null;
  },

  async openFolder(folderPath: string): Promise<boolean> {
    if (isDesktop() && window.electronAPI) {
      const res = await window.electronAPI.fs.openPath(folderPath);
      return res.success;
    }
    // Web fallback: call backend open-folder if local, otherwise return false
    try {
      const res = await fetch("/api/collector/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folderPath })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

// Synchronization Manager
export const syncService = {
  async getStatus(): Promise<{ pendingCount: number; lastSyncedAt: string | null }> {
    if (isDesktop() && window.electronAPI) {
      return await window.electronAPI.sync.getStatus();
    }
    return { pendingCount: 0, lastSyncedAt: null };
  },

  async queueChange(change: { entityType: string; entityId: string; action: "create" | "update" | "delete"; payload?: any }): Promise<void> {
    if (isDesktop() && window.electronAPI) {
      await window.electronAPI.sync.queueChange(change);
    }
  },

  isOnline(): boolean {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  }
};

// Desktop Auto-Updater Service
export interface UpdateStatus {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  progress: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  } | null;
  error: string | null;
  lastChecked: string | null;
  fallbackUrl: string;
}

export const updateService = {
  async getStatus(): Promise<UpdateStatus> {
    if (isDesktop() && window.electronAPI?.updater) {
      return await window.electronAPI.updater.getStatus();
    }
    return {
      status: "not-available",
      currentVersion: "1.1.0",
      latestVersion: "1.1.0",
      releaseNotes: null,
      releaseDate: null,
      progress: null,
      error: null,
      lastChecked: new Date().toISOString(),
      fallbackUrl: "https://github.com/loveneeta/LoveneetSuite/releases/latest"
    };
  },

  async checkForUpdates(): Promise<{ success: boolean; updateInfo?: any; error?: string }> {
    if (isDesktop() && window.electronAPI?.updater) {
      return await window.electronAPI.updater.checkForUpdates();
    }
    return {
      success: true,
      error: "Web version is automatically up to date via Vercel deployments."
    };
  },

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (isDesktop() && window.electronAPI?.updater) {
      return await window.electronAPI.updater.downloadUpdate();
    }
    return { success: false, error: "Updates are only downloaded in the desktop app." };
  },

  quitAndInstall(): void {
    if (isDesktop() && window.electronAPI?.updater) {
      window.electronAPI.updater.quitAndInstall();
    }
  },

  onStatusChange(callback: (status: UpdateStatus) => void): () => void {
    if (isDesktop() && window.electronAPI?.updater) {
      return window.electronAPI.updater.onStatusChange(callback);
    }
    return () => {};
  }
};
