import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './paths.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS countries (
    iso            TEXT PRIMARY KEY,
    cover_photo_id TEXT,
    unlocked_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photos (
    id           TEXT PRIMARY KEY,
    iso          TEXT NOT NULL REFERENCES countries(iso),
    original_ext TEXT NOT NULL,
    width        INTEGER NOT NULL,
    height       INTEGER NOT NULL,
    caption      TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS photos_iso_order ON photos (iso, sort_order);
`);

export interface PhotoRow {
  id: string;
  iso: string;
  original_ext: string;
  width: number;
  height: number;
  caption: string;
  sort_order: number;
  created_at: string;
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
