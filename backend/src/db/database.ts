import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve("manga-reader.db");

const db: DatabaseType = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize schema immediately so tables exist before any prepared statements run
db.exec(`
  CREATE TABLE IF NOT EXISTS comics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'qtoon',
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    cover_url TEXT,
    total_chapters INTEGER,
    serial_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, source_id)
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comic_id INTEGER NOT NULL REFERENCES comics(id),
    source_episode_id TEXT NOT NULL,
    title TEXT,
    chapter_number INTEGER,
    is_free INTEGER NOT NULL DEFAULT 1,
    image_urls TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(comic_id, source_episode_id)
  );

  CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id),
    image_index INTEGER NOT NULL,
    original_url TEXT NOT NULL,
    original_text TEXT,
    translated_text TEXT,
    target_lang TEXT NOT NULL DEFAULT 'pt-BR',
    overlay_data TEXT,
    model_used TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(chapter_id, image_index, target_lang)
  );
`);

export default db;
