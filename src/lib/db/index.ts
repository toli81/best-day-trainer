import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "bestday.db");
const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create tables if they don't exist (handles fresh deployments)
sqlite.exec(`
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
    overview_analysis TEXT,
    session_notes TEXT,
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
