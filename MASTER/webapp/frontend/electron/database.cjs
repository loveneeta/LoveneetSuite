/**
 * Persistent SQLite Database Layer for Loveneet Suite Desktop
 * Powered by WebAssembly SQLite (sql.js)
 * Stored in persistent Windows AppData: %APPDATA%/LoveneetSuite/data.db
 */

const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

class LocalDatabase {
  constructor(userDataPath) {
    this.userDataPath = userDataPath || process.cwd();
    this.dbDir = path.join(this.userDataPath, "data");
    this.dbPath = path.join(this.dbDir, "data.db");
    this.db = null;
    this.SQL = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return this;

    // Ensure data directory exists
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    // Initialize WebAssembly SQLite
    this.SQL = await initSqlJs();

    // Load existing database if available, otherwise create new
    if (fs.existsSync(this.dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(fileBuffer);
      } catch (err) {
        console.error("Corrupted database file detected, initializing backup & clean database:", err);
        const backupCorruptPath = path.join(this.dbDir, `data_corrupt_${Date.now()}.bak`);
        try {
          fs.copyFileSync(this.dbPath, backupCorruptPath);
        } catch (_) {}
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    // Run schema migrations
    this.migrate();
    this.persist();
    this.isInitialized = true;
    return this;
  }

  persist() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error("Failed to persist database to disk:", err);
    }
  }

  migrate() {
    // 1. Ensure migrations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // Check applied migrations
    const appliedRows = this.query("SELECT version FROM schema_migrations;");
    const applied = new Set(appliedRows.map((r) => r.version));

    // Migration definitions
    const migrations = [
      {
        version: 1,
        name: "initial_schema",
        sql: `
          -- Key-value application settings
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          -- Extracted PO / Quotation rows (PO PDF to Excel)
          CREATE TABLE IF NOT EXISTS po_extraction_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            so_number TEXT,
            item_code TEXT,
            qty TEXT,
            length TEXT,
            width TEXT,
            height TEXT,
            ply TEXT,
            box_type TEXT,
            confidence TEXT,
            raw_payload TEXT,
            created_at TEXT NOT NULL
          );

          -- File collection & compression jobs
          CREATE TABLE IF NOT EXISTS file_collection_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_name TEXT,
            input_folder TEXT NOT NULL,
            output_folder TEXT NOT NULL,
            total_files INTEGER DEFAULT 0,
            copied_count INTEGER DEFAULT 0,
            skipped_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0,
            compression_enabled INTEGER DEFAULT 0,
            saved_bytes INTEGER DEFAULT 0,
            saved_pct REAL DEFAULT 0,
            report_text TEXT,
            created_at TEXT NOT NULL
          );

          -- Catalogue column mapping presets
          CREATE TABLE IF NOT EXISTS catalogue_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_name TEXT NOT NULL UNIQUE,
            profile_type TEXT NOT NULL,
            columns_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          -- Synchronization Queue for offline-first changes
          CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL, -- 'create' | 'update' | 'delete'
            payload_json TEXT NOT NULL,
            status TEXT DEFAULT 'pending', -- 'pending' | 'syncing' | 'synced' | 'failed'
            retry_count INTEGER DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            synced_at TEXT
          );
        `
      }
    ];

    for (const m of migrations) {
      if (!applied.has(m.version)) {
        try {
          this.db.run(m.sql);
          const stmt = this.db.prepare(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);"
          );
          stmt.run([m.version, m.name, new Date().toISOString()]);
          stmt.free();
          console.log(`Applied migration v${m.version}: ${m.name}`);
        } catch (e) {
          console.error(`Migration v${m.version} failed:`, e);
          throw e;
        }
      }
    }
  }

  query(sql, params = []) {
    if (!this.db) throw new Error("Database not initialized");
    try {
      const stmt = this.db.prepare(sql);
      if (params && params.length > 0) {
        stmt.bind(params);
      }
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (err) {
      console.error("SQL query error:", sql, err);
      throw err;
    }
  }

  execute(sql, params = []) {
    if (!this.db) throw new Error("Database not initialized");
    try {
      if (params && params.length > 0) {
        const stmt = this.db.prepare(sql);
        stmt.run(params);
        stmt.free();
      } else {
        this.db.run(sql);
      }
      this.persist();
      return { success: true };
    } catch (err) {
      console.error("SQL execute error:", sql, err);
      throw err;
    }
  }

  transaction(operations = []) {
    if (!this.db) throw new Error("Database not initialized");
    try {
      this.db.run("BEGIN TRANSACTION;");
      for (const op of operations) {
        if (op.params && op.params.length > 0) {
          const stmt = this.db.prepare(op.sql);
          stmt.run(op.params);
          stmt.free();
        } else {
          this.db.run(op.sql);
        }
      }
      this.db.run("COMMIT;");
      this.persist();
      return { success: true, count: operations.length };
    } catch (err) {
      this.db.run("ROLLBACK;");
      console.error("Transaction failed and rolled back:", err);
      throw err;
    }
  }

  backup(destPath) {
    if (!this.db) throw new Error("Database not initialized");
    try {
      this.persist();
      fs.copyFileSync(this.dbPath, destPath);
      return { success: true, backupPath: destPath };
    } catch (err) {
      console.error("Database backup failed:", err);
      throw err;
    }
  }

  restore(sourcePath) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error("Backup file not found: " + sourcePath);
    }
    try {
      const fileBuffer = fs.readFileSync(sourcePath);
      const testDb = new this.SQL.Database(fileBuffer);
      // verify schema
      testDb.exec("SELECT * FROM schema_migrations LIMIT 1;");
      testDb.close();

      // Close current db and replace
      this.db.close();
      fs.copyFileSync(sourcePath, this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      return { success: true };
    } catch (err) {
      console.error("Database restore failed:", err);
      throw err;
    }
  }

  getStats() {
    if (!this.db) return { initialized: false };
    const tables = this.query("SELECT name FROM sqlite_master WHERE type='table';");
    const counts = {};
    for (const t of tables) {
      if (!t.name.startsWith("sqlite_")) {
        const countRes = this.query(`SELECT COUNT(*) as c FROM "${t.name}";`);
        counts[t.name] = countRes[0]?.c || 0;
      }
    }
    let fileSize = 0;
    try {
      fileSize = fs.statSync(this.dbPath).size;
    } catch (_) {}

    return {
      initialized: true,
      path: this.dbPath,
      sizeBytes: fileSize,
      tables: counts
    };
  }
}

module.exports = LocalDatabase;
