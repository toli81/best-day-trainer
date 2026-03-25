import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function initDb() {
  if (_db) return { sqlite: _sqlite!, db: _db };

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "bestday.db");
  _sqlite = new Database(dbPath);

  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("busy_timeout = 5000");
  _sqlite.pragma("foreign_keys = ON");

  // Auto-create tables if they don't exist (handles fresh deployments)
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      client_name TEXT,
      recorded_at TEXT NOT NULL,
      duration_seconds INTEGER,
      video_file_path TEXT NOT NULL,
      video_file_name TEXT NOT NULL,
      video_size_bytes INTEGER,
      status TEXT NOT NULL DEFAULT 'uploading',
      processing_error TEXT,
      processing_started_at TEXT,
      processing_completed_at TEXT,
      gemini_file_uri TEXT,
      gemini_cache_id TEXT,
      gemini_file_name TEXT,
      overview_analysis TEXT,
      details_analysis TEXT,
      session_notes TEXT,
      pipeline_stage TEXT,
      token_count INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      start_timestamp TEXT NOT NULL,
      end_timestamp TEXT NOT NULL,
      start_seconds REAL NOT NULL,
      end_seconds REAL NOT NULL,
      order_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      muscle_groups TEXT,
      equipment TEXT,
      difficulty TEXT,
      category TEXT,
      rep_count INTEGER,
      set_count INTEGER,
      form_notes TEXT,
      coaching_cues TEXT,
      clip_file_path TEXT,
      thumbnail_file_path TEXT,
      clip_duration_seconds REAL,
      is_library_entry INTEGER NOT NULL DEFAULT 1,
      tags TEXT,
      detail_status TEXT DEFAULT 'complete',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // New tables for client portal
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      role TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations: add new columns safely (SQLite ALTER TABLE ADD COLUMN is safe)
  const migrations = [
    "ALTER TABLE sessions ADD COLUMN gemini_file_name TEXT",
    "ALTER TABLE sessions ADD COLUMN details_analysis TEXT",
    "ALTER TABLE sessions ADD COLUMN pipeline_stage TEXT",
    "ALTER TABLE exercises ADD COLUMN detail_status TEXT DEFAULT 'complete'",
  ];
  for (const m of migrations) {
    try {
      _sqlite.exec(m);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Add new columns to existing tables
  try { _sqlite.exec("ALTER TABLE sessions ADD COLUMN client_id TEXT"); } catch {}
  try { _sqlite.exec("ALTER TABLE exercises ADD COLUMN form_score INTEGER"); } catch {}
  try { _sqlite.exec("ALTER TABLE exercises ADD COLUMN form_score_override INTEGER"); } catch {}
  try { _sqlite.exec("ALTER TABLE sessions ADD COLUMN report_data TEXT"); } catch {}

  // Recover sessions stuck in processing states (e.g., from server restart)
  _sqlite.exec(`
    UPDATE sessions
    SET status = 'error',
        processing_error = 'Processing interrupted by server restart — click Retry to resume',
        updated_at = datetime('now')
    WHERE status IN ('analyzing', 'segmenting', 'generating_notes', 'form_scores_generated')
  `);

  _sqlite.exec(`
    UPDATE sessions
    SET pipeline_stage = 'downloaded',
        status = 'error',
        processing_error = 'Pipeline upgraded — old compression stage no longer exists. Click Retry to reprocess.',
        updated_at = datetime('now')
    WHERE pipeline_stage = 'compressed'
  `);

  _db = drizzle(_sqlite, { schema });
  return { sqlite: _sqlite, db: _db };
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    const { db } = initDb();
    return Reflect.get(db, prop, receiver);
  },
});

export const sqlite = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const { sqlite } = initDb();
    return Reflect.get(sqlite, prop, receiver);
  },
});
