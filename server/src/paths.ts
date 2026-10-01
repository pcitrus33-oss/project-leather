import path from 'node:path';
import fs from 'node:fs';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');

export const VARIANTS = ['original', 'web', 'thumb'] as const;
export type Variant = (typeof VARIANTS)[number];

for (const v of VARIANTS) fs.mkdirSync(path.join(UPLOADS_DIR, v), { recursive: true });
