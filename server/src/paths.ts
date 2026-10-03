import path from 'node:path';
import fs from 'node:fs';

/**
 * Developer sandbox: started with `--dev`, the server keeps its own database and photos in
 * data-dev/ on port 3002, so testing never touches the real portfolio in data/.
 */
export const DEV_MODE = process.argv.includes('--dev');

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
export const DATA_DIR = path.join(ROOT_DIR, DEV_MODE ? 'data-dev' : 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');
export const PORT = Number(process.env.PORT ?? (DEV_MODE ? 3002 : 3001));

export const VARIANTS = ['original', 'web', 'thumb'] as const;
export type Variant = (typeof VARIANTS)[number];

for (const v of VARIANTS) fs.mkdirSync(path.join(UPLOADS_DIR, v), { recursive: true });
