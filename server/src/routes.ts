import crypto from 'node:crypto';
import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { db, transaction, defaultTheme, isThemeId, setSetting, THEME_IDS, type PhotoRow } from './db.js';
import { processUpload, deleteImageFiles } from './images.js';
import { PROVINCE_COUNTRIES, provinceBelongsTo } from './provinces.js';
import { isPlaceKind, placeKind, type PlaceKind } from './places.js';

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
    province: row.province,
    width: row.width,
    height: row.height,
    caption: row.caption,
    thumbUrl: `/uploads/thumb/${row.id}.jpg`,
    webUrl: `/uploads/web/${row.id}.jpg`,
    originalUrl: `/uploads/original/${row.id}${row.original_ext}`,
    location:
      row.lat == null || row.lng == null
        ? null
        : { lat: row.lat, lng: row.lng, name: row.place ?? '', kind: (row.place_kind ?? 'pin') as PlaceKind },
  };
}

export type Location = { lat: number; lng: number; name: string; kind: PlaceKind };

/** undefined = not given, null = clear it, otherwise a validated place; throws on bad input. */
function parseLocation(raw: unknown): Location | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const { lat, lng, name, kind } = raw as Record<string, unknown>;
  const la = Number(lat);
  const ln = Number(lng);
  if (!(Math.abs(la) <= 90 && Math.abs(ln) <= 180) || typeof name !== 'string' || name.length > 300) {
    throw new Error('location needs lat (-90..90), lng (-180..180) and a name');
  }
  return { lat: la, lng: ln, name: name.trim(), kind: isPlaceKind(kind) ? kind : 'pin' };
}

// ---------- Scopes: a whole country, or one province of USA/Canada/China ----------

/** Where photos live: a country, or one province (only for countries that have provinces). */
export type Scope = { iso: string; province: string | null };

class BadRequest extends Error {}

/** Reads ?province= / body.province and checks it belongs to the country. */
function scopeOf(req: Request): Scope {
  const iso = String(req.params.iso);
  const raw = req.body?.province ?? req.query.province;
  const province = raw ? String(raw) : null;
  if (province && !provinceBelongsTo(province, iso)) throw new BadRequest(`${province} is not a province of ${iso}`);
  return { iso, province };
}

function photosFor({ iso, province }: Scope) {
  const rows = (
    province
      ? db.prepare('SELECT * FROM photos WHERE iso = ? AND province = ? ORDER BY sort_order, created_at').all(iso, province)
      : db.prepare('SELECT * FROM photos WHERE iso = ? ORDER BY sort_order, created_at').all(iso)
  ) as unknown as PhotoRow[];
  return rows.map(toPhoto);
}

/** The countries/provinces row holding the scope's cover photo and theme. */
function scopeRow({ iso, province }: Scope) {
  return (
    province
      ? db.prepare('SELECT cover_photo_id, theme FROM provinces WHERE id = ?').get(province)
      : db.prepare('SELECT cover_photo_id, theme FROM countries WHERE iso = ?').get(iso)
  ) as { cover_photo_id: string | null; theme: string } | undefined;
}

/** Unlocked provinces of a country, for its catalogue page and the globe. */
function provincesOf(iso: string) {
  const rows = db
    .prepare(
      `SELECT v.id, v.cover_photo_id, v.unlocked_at, COUNT(p.id) AS count,
              SUM(p.lat IS NULL) AS unplaced,
              MAX(CASE WHEN p.lat IS NULL THEN p.created_at END) AS unplaced_at,
              (SELECT id FROM photos f WHERE f.province = v.id ORDER BY sort_order, created_at LIMIT 1) AS first_id
       FROM provinces v JOIN photos p ON p.province = v.id
       WHERE v.iso = ?
       GROUP BY v.id
       ORDER BY v.unlocked_at`,
    )
    .all(iso) as { id: string; cover_photo_id: string | null; unlocked_at: string; count: number; unplaced: number; unplaced_at: string | null; first_id: string }[];
  return rows.map((r) => {
    const coverId = r.cover_photo_id ?? r.first_id;
    return {
      id: r.id,
      count: r.count,
      unplacedCount: r.unplaced,
      /** Newest upload among the unplaced photos (for choosing which globe bubbles to show). */
      unplacedLatestAt: r.unplaced_at,
      unlockedAt: r.unlocked_at,
      coverUrl: `/uploads/thumb/${coverId}.jpg`,
    };
  });
}

/** Creates the country (and province) rows if needed; returns whether the scope itself was newly unlocked. */
function unlock({ iso, province }: Scope, now: string) {
  const country = db.prepare('INSERT OR IGNORE INTO countries (iso, unlocked_at, theme) VALUES (?, ?, ?)').run(iso, now, defaultTheme());
  if (!province) return country.changes > 0;
  const prov = db
    .prepare('INSERT OR IGNORE INTO provinces (id, iso, unlocked_at, theme) VALUES (?, ?, ?, ?)')
    .run(province, iso, now, defaultTheme());
  return prov.changes > 0;
}

/** Deletes province/country rows that no longer have photos (re-locking them). */
function relockEmpty(iso: string, province: string | null) {
  let provinceRelocked = false;
  if (province) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE province = ?').get(province) as { n: number };
    if (n === 0) provinceRelocked = db.prepare('DELETE FROM provinces WHERE id = ?').run(province).changes > 0;
  }
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE iso = ?').get(iso) as { n: number };
  const relocked = n === 0 && db.prepare('DELETE FROM countries WHERE iso = ?').run(iso).changes > 0;
  return { relocked, provinceRelocked };
}

/** Saves images (original + resized copies) into a country or province, unlocking it if needed. */
export async function addPhotos(scope: Scope, files: { buffer: Buffer; originalname: string }[], location: Location | null) {
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
  if (processed.length === 0) return { added: 0, newlyUnlocked: false, failed };

  const newlyUnlocked = transaction(() => {
    const now = new Date().toISOString();
    const isNew = unlock(scope, now);
    const { max } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM photos WHERE iso = ?').get(scope.iso) as { max: number };
    const insert = db.prepare(
      `INSERT INTO photos (id, iso, province, original_ext, width, height, sort_order, created_at, lat, lng, place, place_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    processed.forEach((p, i) =>
      insert.run(
        p.id, scope.iso, scope.province, p.ext, p.width, p.height, max + 1 + i, now,
        location?.lat ?? null, location?.lng ?? null, location?.name ?? null, location?.kind ?? null,
      ),
    );
    return isNew;
  });
  return { added: processed.length, newlyUnlocked, failed };
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
 * Every unlocked country (drives the globe): photo count, cover thumbnail, photos without a place
 * (one bubble at the centre), one pin per distinct place, and unlocked provinces.
 */
api.get('/countries', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.iso, c.cover_photo_id, c.unlocked_at, COUNT(p.id) AS count,
              SUM(p.lat IS NULL AND p.province IS NULL) AS unplaced,
              MAX(CASE WHEN p.lat IS NULL AND p.province IS NULL THEN p.created_at END) AS unplaced_at,
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
    unplaced: number;
    unplaced_at: string | null;
    first_id: string;
  }[];

  const placed = db
    .prepare('SELECT id, iso, province, lat, lng, place, place_kind, created_at FROM photos WHERE lat IS NOT NULL ORDER BY sort_order, created_at')
    .all() as {
    id: string;
    iso: string;
    province: string | null;
    lat: number;
    lng: number;
    place: string | null;
    place_kind: string | null;
    created_at: string;
  }[];
  // Photos tagged with the same search result share one pin.
  type Pin = {
    iso: string;
    province: string | null;
    lat: number;
    lng: number;
    name: string;
    kind: string;
    count: number;
    thumbUrl: string;
    latestAt: string;
  };
  const pins = new Map<string, Pin>();
  for (const p of placed) {
    const key = `${p.iso}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
    const pin = pins.get(key);
    if (pin) {
      pin.count++;
      if (p.created_at > pin.latestAt) pin.latestAt = p.created_at;
    }
    else
      pins.set(key, {
        iso: p.iso,
        province: p.province,
        lat: p.lat,
        lng: p.lng,
        name: p.place ?? '',
        kind: p.place_kind ?? 'pin',
        count: 1,
        latestAt: p.created_at,
        thumbUrl: `/uploads/thumb/${p.id}.jpg`,
      });
  }
  const pinList = [...pins.values()];

  res.json(
    rows.map((r) => {
      const coverId = r.cover_photo_id ?? r.first_id;
      return {
        iso: r.iso,
        count: r.count,
        unlockedAt: r.unlocked_at,
        coverId,
        coverUrl: `/uploads/thumb/${coverId}.jpg`,
        unplacedCount: r.unplaced,
        unplacedLatestAt: r.unplaced_at,
        pins: pinList.filter((p) => p.iso === r.iso).map(({ iso: _iso, ...pin }) => pin),
        provinces: PROVINCE_COUNTRIES.has(r.iso) ? provincesOf(r.iso) : [],
      };
    }),
  );
});

/** Photos of a country, or of one province with ?province=. Countries with provinces also list them. */
api.get('/countries/:iso/photos', validIso, (req, res) => {
  const scope = scopeOf(req);
  const row = scopeRow(scope);
  res.json({
    iso: scope.iso,
    province: scope.province,
    coverId: row?.cover_photo_id ?? null,
    // Locked countries/provinces report the theme they would get if unlocked now.
    theme: row?.theme ?? defaultTheme(),
    photos: photosFor(scope),
    provinces: PROVINCE_COUNTRIES.has(scope.iso) ? provincesOf(scope.iso) : [],
  });
});

api.post('/countries/:iso/photos', validIso, upload.array('photos'), async (req, res) => {
  const scope = scopeOf(req);
  if (PROVINCE_COUNTRIES.has(scope.iso) && !scope.province) {
    res.status(400).json({ error: 'Choose a province or state for these photos' });
    return;
  }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: 'No image files received' });
    return;
  }
  // Optional place for the whole batch, sent as form fields.
  const b = req.body ?? {};
  const location = b.lat ? parseLocation({ lat: b.lat, lng: b.lng, name: b.place ?? '', kind: b.kind }) : null;

  const result = await addPhotos(scope, files, location ?? null);
  if (!result.added) {
    res.status(422).json({ error: 'None of the files could be read as images', failed: result.failed });
    return;
  }
  res.status(201).json({ newlyUnlocked: result.newlyUnlocked, failed: result.failed, photos: photosFor(scope) });
});

/** Rearranges the photos of a country or province: ids must list every photo in that scope once. */
api.put('/countries/:iso/order', validIso, (req, res) => {
  const scope = scopeOf(req);
  const ids: unknown = req.body?.ids;
  const current = new Set(photosFor(scope).map((p) => p.id));
  if (!Array.isArray(ids) || ids.length !== current.size || !ids.every((id) => current.has(id))) {
    res.status(400).json({ error: 'ids must list every photo on this page exactly once' });
    return;
  }
  transaction(() => {
    const update = db.prepare('UPDATE photos SET sort_order = ? WHERE id = ? AND iso = ?');
    ids.forEach((id, i) => update.run(i, id, scope.iso));
  });
  res.json({ photos: photosFor(scope) });
});

api.put('/countries/:iso/cover', validIso, (req, res) => {
  const scope = scopeOf(req);
  const photoId = String(req.body?.photoId ?? '');
  if (!photosFor(scope).some((p) => p.id === photoId)) {
    res.status(400).json({ error: 'That photo is not on this page' });
    return;
  }
  if (scope.province) db.prepare('UPDATE provinces SET cover_photo_id = ? WHERE id = ?').run(photoId, scope.province);
  else db.prepare('UPDATE countries SET cover_photo_id = ? WHERE iso = ?').run(photoId, scope.iso);
  res.json({ coverId: photoId });
});

api.put('/countries/:iso/theme', validIso, (req, res) => {
  const scope = scopeOf(req);
  const theme = req.body?.theme;
  if (!isThemeId(theme)) {
    res.status(400).json({ error: `theme must be one of: ${THEME_IDS.join(', ')}` });
    return;
  }
  const result = scope.province
    ? db.prepare('UPDATE provinces SET theme = ? WHERE id = ?').run(theme, scope.province)
    : db.prepare('UPDATE countries SET theme = ? WHERE iso = ?').run(theme, scope.iso);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Unlock this place before choosing its theme' });
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

/** Update a photo's caption, location (null removes it) and/or province (moves it). */
api.patch('/photos/:id', (req, res) => {
  const id = String(req.params.id);
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as unknown as PhotoRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }
  const { caption, province } = req.body ?? {};
  const location = parseLocation(req.body?.location);
  if (caption !== undefined && (typeof caption !== 'string' || caption.length > 500)) throw new BadRequest('Bad caption');
  if (province !== undefined && !provinceBelongsTo(String(province), row.iso)) throw new BadRequest(`${province} is not a province of ${row.iso}`);
  if (caption === undefined && location === undefined && province === undefined) throw new BadRequest('Nothing to update');

  const moved = transaction(() => {
    if (typeof caption === 'string') db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(caption.trim(), id);
    if (location !== undefined) {
      db.prepare('UPDATE photos SET lat = ?, lng = ?, place = ?, place_kind = ? WHERE id = ?').run(
        location?.lat ?? null, location?.lng ?? null, location?.name ?? null, location?.kind ?? null, id,
      );
    }
    if (province === undefined || province === row.province) return null;
    unlock({ iso: row.iso, province: String(province) }, new Date().toISOString());
    db.prepare('UPDATE photos SET province = ? WHERE id = ?').run(String(province), id);
    if (row.province) db.prepare('UPDATE provinces SET cover_photo_id = NULL WHERE id = ? AND cover_photo_id = ?').run(row.province, id);
    return relockEmpty(row.iso, row.province);
  });
  res.json({ ok: true, ...moved });
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
      headers: { 'User-Agent': 'ProjectLeather/2.0 (personal photo portfolio)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`OpenStreetMap search failed (${r.status})`);
    const results = (await r.json()) as {
      name?: string;
      display_name: string;
      lat: string;
      lon: string;
      category?: string;
      type?: string;
      addresstype?: string;
    }[];
    res.json(
      results.map((p) => ({
        name: p.name || p.display_name.split(',')[0],
        detail: p.display_name,
        lat: Number(p.lat),
        lng: Number(p.lon),
        kind: placeKind(p.category, p.type, p.addresstype),
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
  const result = transaction(() => {
    db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
    db.prepare('UPDATE countries SET cover_photo_id = NULL WHERE iso = ? AND cover_photo_id = ?').run(row.iso, row.id);
    if (row.province) db.prepare('UPDATE provinces SET cover_photo_id = NULL WHERE id = ? AND cover_photo_id = ?').run(row.province, row.id);
    return relockEmpty(row.iso, row.province);
  });
  await deleteImageFiles(row.id, row.original_ext);
  res.json(result);
});

/** Bad input from any route above becomes a 400 with its message. */
api.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof BadRequest || err.message.startsWith('location needs')) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
});
