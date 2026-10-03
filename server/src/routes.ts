import crypto from 'node:crypto';
import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { db, transaction, defaultTheme, isThemeId, setSetting, THEME_IDS, type PhotoRow } from './db.js';
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
    location: row.lat == null || row.lng == null ? null : { lat: row.lat, lng: row.lng, name: row.place ?? '' },
  };
}

type Location = { lat: number; lng: number; name: string };

/** undefined = not given, null = clear it, otherwise a validated place; throws on bad input. */
function parseLocation(raw: unknown): Location | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const { lat, lng, name } = raw as Record<string, unknown>;
  const la = Number(lat);
  const ln = Number(lng);
  if (!(Math.abs(la) <= 90 && Math.abs(ln) <= 180) || typeof name !== 'string' || name.length > 300) {
    throw new Error('location needs lat (-90..90), lng (-180..180) and a name');
  }
  return { lat: la, lng: ln, name: name.trim() };
}

function photosFor(iso: string) {
  const rows = db
    .prepare('SELECT * FROM photos WHERE iso = ? ORDER BY sort_order, created_at')
    .all(iso) as unknown as PhotoRow[];
  return rows.map(toPhoto);
}

function countryRow(iso: string) {
  return db.prepare('SELECT cover_photo_id, theme FROM countries WHERE iso = ?').get(iso) as
    | { cover_photo_id: string | null; theme: string }
    | undefined;
}

function validIso(req: Request, res: Response, next: NextFunction) {
  if (!ISO_RE.test(String(req.params.iso))) {
    res.status(400).json({ error: 'Bad country code' });
    return;
  }
  next();
}

export const api = Router();

/**
 * Every unlocked country (drives the globe): photo count, cover thumbnail, how many photos have no
 * place yet (shown as one bubble at the country's centre), and one pin per distinct place.
 */
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

  const placed = db
    .prepare('SELECT id, iso, lat, lng, place FROM photos WHERE lat IS NOT NULL ORDER BY sort_order, created_at')
    .all() as { id: string; iso: string; lat: number; lng: number; place: string | null }[];
  // Photos tagged with the same search result share one pin.
  const pins = new Map<string, { iso: string; lat: number; lng: number; name: string; count: number; thumbUrl: string }>();
  for (const p of placed) {
    const key = `${p.iso}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
    const pin = pins.get(key);
    if (pin) pin.count++;
    else pins.set(key, { iso: p.iso, lat: p.lat, lng: p.lng, name: p.place ?? '', count: 1, thumbUrl: `/uploads/thumb/${p.id}.jpg` });
  }
  const pinList = [...pins.values()];

  res.json(
    rows.map((r) => {
      const coverId = r.cover_photo_id ?? r.first_id;
      const countryPins = pinList.filter((p) => p.iso === r.iso);
      return {
        iso: r.iso,
        count: r.count,
        unlockedAt: r.unlocked_at,
        coverId,
        coverUrl: `/uploads/thumb/${coverId}.jpg`,
        unplacedCount: r.count - countryPins.reduce((n, p) => n + p.count, 0),
        pins: countryPins.map(({ lat, lng, name, count, thumbUrl }) => ({ lat, lng, name, count, thumbUrl })),
      };
    }),
  );
});

api.get('/countries/:iso/photos', validIso, (req, res) => {
  const iso = String(req.params.iso);
  const row = countryRow(iso);
  // Locked countries report the theme they would get if unlocked now.
  res.json({ iso, coverId: row?.cover_photo_id ?? null, theme: row?.theme ?? defaultTheme(), photos: photosFor(iso) });
});

api.post('/countries/:iso/photos', validIso, upload.array('photos'), async (req, res) => {
  const iso = String(req.params.iso);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: 'No image files received' });
    return;
  }
  // Optional place for the whole batch, sent as form fields.
  let location: Location | null | undefined;
  try {
    location = req.body?.lat ? parseLocation({ lat: req.body.lat, lng: req.body.lng, name: req.body.place ?? '' }) : null;
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
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
    const inserted = db
      .prepare('INSERT OR IGNORE INTO countries (iso, unlocked_at, theme) VALUES (?, ?, ?)')
      .run(iso, now, defaultTheme());
    const { max } = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM photos WHERE iso = ?')
      .get(iso) as { max: number };
    const insert = db.prepare(
      `INSERT INTO photos (id, iso, original_ext, width, height, sort_order, created_at, lat, lng, place)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    processed.forEach((p, i) =>
      insert.run(p.id, iso, p.ext, p.width, p.height, max + 1 + i, now, location?.lat ?? null, location?.lng ?? null, location?.name ?? null),
    );
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

api.put('/countries/:iso/theme', validIso, (req, res) => {
  const iso = String(req.params.iso);
  const theme = req.body?.theme;
  if (!isThemeId(theme)) {
    res.status(400).json({ error: `theme must be one of: ${THEME_IDS.join(', ')}` });
    return;
  }
  const result = db.prepare('UPDATE countries SET theme = ? WHERE iso = ?').run(theme, iso);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Unlock this country before choosing its theme' });
    return;
  }
  res.json({ theme });
});

api.get('/settings', (_req, res) => {
  res.json({ defaultTheme: defaultTheme() });
});

api.put('/settings', (req, res) => {
  const theme = req.body?.defaultTheme;
  if (!isThemeId(theme)) {
    res.status(400).json({ error: `defaultTheme must be one of: ${THEME_IDS.join(', ')}` });
    return;
  }
  setSetting('default_theme', theme);
  res.json({ defaultTheme: theme });
});

/** Update a photo's caption and/or location (send location: null to remove it). */
api.patch('/photos/:id', (req, res) => {
  const caption: unknown = req.body?.caption;
  let location: Location | null | undefined;
  try {
    location = parseLocation(req.body?.location);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  if (caption !== undefined && (typeof caption !== 'string' || caption.length > 500)) {
    res.status(400).json({ error: 'Bad caption' });
    return;
  }
  if (caption === undefined && location === undefined) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }
  const id = String(req.params.id);
  const changes = transaction(() => {
    let n = 0;
    if (typeof caption === 'string') n = Number(db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(caption.trim(), id).changes);
    if (location !== undefined) {
      n = Number(
        db
          .prepare('UPDATE photos SET lat = ?, lng = ?, place = ? WHERE id = ?')
          .run(location?.lat ?? null, location?.lng ?? null, location?.name ?? null, id).changes,
      );
    }
    return n;
  });
  if (changes === 0) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }
  res.json({ ok: true });
});

// OpenStreetMap's search allows about 1 request per second and asks apps to identify themselves.
let lastGeocode = 0;

/** Place search for tagging photos, proxied to OpenStreetMap Nominatim. */
api.get('/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const country = String(req.query.country ?? '').toLowerCase();
  if (q.length < 2 || q.length > 200) {
    res.status(400).json({ error: 'Type at least 2 characters' });
    return;
  }
  const wait = lastGeocode + 1100 - Date.now();
  lastGeocode = Date.now() + Math.max(wait, 0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q, format: 'jsonv2', limit: '8', 'accept-language': 'en' }).toString();
  if (/^[a-z]{2}$/.test(country)) url.searchParams.set('countrycodes', country);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'ProjectLeather/1.2 (personal photo portfolio)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`OpenStreetMap search failed (${r.status})`);
    const results = (await r.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
    res.json(
      results.map((p) => ({
        name: p.name || p.display_name.split(',')[0],
        detail: p.display_name,
        lat: Number(p.lat),
        lng: Number(p.lon),
      })),
    );
  } catch (e) {
    const timedOut = (e as Error).name === 'TimeoutError';
    res.status(502).json({ error: timedOut ? 'Location search timed out. Are you online?' : (e as Error).message });
  }
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
