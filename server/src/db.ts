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

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Additive migrations for databases created by earlier versions.
const columns = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
if (!columns('countries').includes('theme')) {
  db.exec(`ALTER TABLE countries ADD COLUMN theme TEXT NOT NULL DEFAULT 'classic'`);
}
// v1.2: optional place a photo was taken (from the location search).
if (!columns('photos').includes('lat')) {
  db.exec(`
    BEGIN;
    ALTER TABLE photos ADD COLUMN lat REAL;
    ALTER TABLE photos ADD COLUMN lng REAL;
    ALTER TABLE photos ADD COLUMN place TEXT;
    COMMIT;
  `);
}

/** Page themes a country can use; keep in sync with client/src/lib/themes.ts. */
export const THEME_IDS = ['classic', 'airplane'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const isThemeId = (v: unknown): v is ThemeId => THEME_IDS.includes(v as ThemeId);

export function getSetting(key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

/** Theme newly unlocked countries start with. */
export function defaultTheme(): ThemeId {
  const v = getSetting('default_theme');
  return isThemeId(v) ? v : 'classic';
}

export interface PhotoRow {
  id: string;
  iso: string;
  original_ext: string;
  width: number;
  height: number;
  caption: string;
  sort_order: number;
  created_at: string;
  lat: number | null;
  lng: number | null;
  place: string | null;
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
