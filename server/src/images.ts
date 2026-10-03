import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { UPLOADS_DIR, VARIANTS, type Variant } from './paths.js';

const WEB_MAX = 2048;
const THUMB_MAX = 640;

function variantPath(variant: Variant, id: string, ext = '.jpg') {
  return path.join(UPLOADS_DIR, variant, id + ext);
}

/** Saves the untouched original plus resized web + thumb JPEGs (EXIF rotation applied). */
export async function processUpload(id: string, buffer: Buffer, originalName: string) {
  const ext = (path.extname(originalName) || '.jpg').toLowerCase();
  await fs.writeFile(variantPath('original', id, ext), buffer);

  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const web = await base
    .clone()
    .resize(WEB_MAX, WEB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(variantPath('web', id));
  await base
    .clone()
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(variantPath('thumb', id));

  return { ext, width: web.width, height: web.height };
}

export async function deleteImageFiles(id: string, originalExt: string) {
  await Promise.all(
    VARIANTS.map((v) => fs.rm(variantPath(v, id, v === 'original' ? originalExt : '.jpg'), { force: true })),
  );
}
