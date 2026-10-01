import crypto from 'node:crypto';
import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { db, transaction, type PhotoRow } from './db.js';
import { processUpload, deleteImageFiles } from './images.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 200 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const ISO_RE = /^[A-Z0-9-]{2,40}$/;

function toPhoto(row: PhotoRow) {
  return {
    id: row.id,
    iso: row.iso,
    width: row.width,
    height: row.height,
    caption: row.caption,
    thumbUrl: `/uploads/thumb/${row.id}.jpg`,
    webUrl: `/uploads/web/${row.id}.jpg`,
    originalUrl: `/uploads/original/${row.id}${row.original_ext}`,
  };
}

function photosFor(iso: string) {
  const rows = db
    .prepare('SELECT * FROM photos WHERE iso = ? ORDER BY sort_order, created_at')
    .all(iso) as unknown as PhotoRow[];
  return rows.map(toPhoto);
}

function coverIdFor(iso: string): string | null {
  const row = db.prepare('SELECT cover_photo_id FROM countries WHERE iso = ?').get(iso) as
    | { cover_photo_id: string | null }
    | undefined;
  return row?.cover_photo_id ?? null;
}

function validIso(req: Request, res: Response, next: NextFunction) {
  if (!ISO_RE.test(String(req.params.iso))) {
    res.status(400).json({ error: 'Bad country code' });
    return;
  }
  next();
}

export const api = Router();

/** Every unlocked country with its photo count and cover thumbnail (drives the globe). */
api.get('/countries', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.iso, c.cover_photo_id, c.unlocked_at, COUNT(p.id) AS count,
              (SELECT id FROM photos f WHERE f.iso = c.iso ORDER BY sort_order, created_at LIMIT 1) AS first_id
       FROM countries c JOIN photos p ON p.iso = c.iso
       GROUP BY c.iso
       ORDER BY c.unlocked_at`,
    )
    .all() as unknown as {
    iso: string;
    cover_photo_id: string | null;
    unlocked_at: string;
    count: number;
    first_id: string;
  }[];

  res.json(
    rows.map((r) => {
      const coverId = r.cover_photo_id ?? r.first_id;
      return {
        iso: r.iso,
        count: r.count,
        unlockedAt: r.unlocked_at,
        coverId,
        coverUrl: `/uploads/thumb/${coverId}.jpg`,
      };
    }),
  );
});

api.get('/countries/:iso/photos', validIso, (req, res) => {
  const iso = String(req.params.iso);
  res.json({ iso, coverId: coverIdFor(iso), photos: photosFor(iso) });
});

api.post('/countries/:iso/photos', validIso, upload.array('photos'), async (req, res) => {
  const iso = String(req.params.iso);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: 'No image files received' });
    return;
  }

  const processed: { id: string; ext: string; width: number; height: number }[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    try {
      processed.push({ id, ...(await processUpload(id, file.buffer, file.originalname)) });
    } catch (err) {
      console.error(`Could not process ${file.originalname}:`, err);
      failed.push(file.originalname);
      await deleteImageFiles(id, path.extname(file.originalname).toLowerCase());
    }
  }
  if (processed.length === 0) {
    res.status(422).json({ error: 'None of the files could be read as images', failed });
    return;
  }

  const newlyUnlocked = transaction(() => {
    const now = new Date().toISOString();
    const inserted = db.prepare('INSERT OR IGNORE INTO countries (iso, unlocked_at) VALUES (?, ?)').run(iso, now);
    const { max } = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM photos WHERE iso = ?')
      .get(iso) as { max: number };
    const insert = db.prepare(
      'INSERT INTO photos (id, iso, original_ext, width, height, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    processed.forEach((p, i) => insert.run(p.id, iso, p.ext, p.width, p.height, max + 1 + i, now));
    return inserted.changes > 0;
  });

  res.status(201).json({ newlyUnlocked, failed, photos: photosFor(iso) });
});

api.put('/countries/:iso/order', validIso, (req, res) => {
  const iso = String(req.params.iso);
  const ids: unknown = req.body?.ids;
  const current = new Set(photosFor(iso).map((p) => p.id));
  if (!Array.isArray(ids) || ids.length !== current.size || !ids.every((id) => current.has(id))) {
    res.status(400).json({ error: 'ids must list every photo in this country exactly once' });
    return;
  }
  transaction(() => {
    const update = db.prepare('UPDATE photos SET sort_order = ? WHERE id = ? AND iso = ?');
    ids.forEach((id, i) => update.run(i, id, iso));
  });
  res.json({ photos: photosFor(iso) });
});

api.put('/countries/:iso/cover', validIso, (req, res) => {
  const iso = String(req.params.iso);
  const photoId = String(req.body?.photoId ?? '');
  const owns = db.prepare('SELECT 1 FROM photos WHERE id = ? AND iso = ?').get(photoId, iso);
  if (!owns) {
    res.status(400).json({ error: 'That photo is not in this country' });
    return;
  }
  db.prepare('UPDATE countries SET cover_photo_id = ? WHERE iso = ?').run(photoId, iso);
  res.json({ coverId: photoId });
});

api.patch('/photos/:id', (req, res) => {
  const caption = req.body?.caption;
  if (typeof caption !== 'string' || caption.length > 500) {
    res.status(400).json({ error: 'Bad caption' });
    return;
  }
  const result = db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(caption.trim(), req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }
  res.json({ ok: true });
});

api.delete('/photos/:id', async (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as unknown as PhotoRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  const relocked = transaction(() => {
    db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
    db.prepare('UPDATE countries SET cover_photo_id = NULL WHERE iso = ? AND cover_photo_id = ?').run(row.iso, row.id);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE iso = ?').get(row.iso) as { n: number };
    if (n === 0) db.prepare('DELETE FROM countries WHERE iso = ?').run(row.iso);
    return n === 0;
  });
  await deleteImageFiles(row.id, row.original_ext);
  res.json({ relocked });
});
