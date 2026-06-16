import { Database } from "bun:sqlite";
import { logger } from "./logger";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || "/data/worker-pool.db";
    db = Database.open(dbPath, { create: true });
    db.run("PRAGMA journal_mode=WAL");
    db.run("PRAGMA busy_timeout=5000");
    initSchema(db);
    logger.info("Database initialized", { path: dbPath });
  }
  return db;
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      output_path TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      worker TEXT,
      progress_pct INTEGER DEFAULT 0,
      error_code TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 1,
      estimated_cost_euro REAL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS idempotency (
      job_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'processing',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (job_id, chunk_index)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
