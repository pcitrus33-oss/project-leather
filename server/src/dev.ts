import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import sharp from 'sharp';
import { db, transaction } from './db.js';
import { UPLOADS_DIR, VARIANTS } from './paths.js';
import { addPhotos, type Location, type Scope } from './routes.js';

/** Developer-sandbox-only tools (mounted only when the server runs with --dev). */
export const devApi = Router();

const SAMPLES: { scope: Scope; location: Location | null; count: number }[] = [
  { scope: { iso: 'FRA', province: null }, location: { lat: 48.857, lng: 2.352, name: 'Paris', kind: 'city' }, count: 3 },
  { scope: { iso: 'FRA', province: null }, location: null, count: 2 },
  { scope: { iso: 'JPN', province: null }, location: { lat: 35.363, lng: 138.731, name: 'Mount Fuji', kind: 'mountain' }, count: 2 },
  { scope: { iso: 'PER', province: null }, location: { lat: -13.163, lng: -72.545, name: 'Machu Picchu', kind: 'landmark' }, count: 2 },
  { scope: { iso: 'USA', province: 'US-CA' }, location: { lat: 37.865, lng: -119.538, name: 'Yosemite National Park', kind: 'park' }, count: 3 },
  { scope: { iso: 'USA', province: 'US-NY' }, location: { lat: 40.713, lng: -74.006, name: 'New York', kind: 'city' }, count: 2 },
  { scope: { iso: 'CAN', province: 'CA-AB' }, location: { lat: 51.178, lng: -115.571, name: 'Banff', kind: 'city' }, count: 2 },
  { scope: { iso: 'CAN', province: 'CA-BC' }, location: null, count: 2 },
  { scope: { iso: 'CHN', province: 'CN-SC' }, location: { lat: 30.573, lng: 104.066, name: 'Chengdu', kind: 'city' }, count: 2 },
  { scope: { iso: 'AUS', province: null }, location: { lat: -16.918, lng: 145.778, name: 'Cairns Beach', kind: 'beach' }, count: 1 },
];
const COLORS = ['#ff9ec7', '#ffd36e', '#7ee0c3', '#b9a6ff', '#8fd7f7', '#ffa07a'];

/** A colourful placeholder "photo" with a label. */
function sampleImage(label: string, i: number) {
  const [w, h] = i % 2 ? [1200, 800] : [900, 1200];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${COLORS[i % COLORS.length]}"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="white" opacity=".55"/>
    <text x="50%" y="52%" font-size="${Math.min(w, h) / 12}" text-anchor="middle" fill="#2b3a67" font-family="sans-serif">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

devApi.post('/seed', async (_req, res) => {
  let n = 0;
  for (const s of SAMPLES) {
    const label = s.location?.name ?? s.scope.province ?? s.scope.iso;
    const files = await Promise.all(
      Array.from({ length: s.count }, async (_, i) => ({ buffer: await sampleImage(`${label} ${i + 1}`, n + i), originalname: `sample-${n + i}.jpg` })),
    );
    n += (await addPhotos(s.scope, files, s.location)).added;
  }
  res.json({ added: n });
});

devApi.post('/reset', (_req, res) => {
  transaction(() => {
    db.exec('DELETE FROM photos; DELETE FROM provinces; DELETE FROM countries;');
  });
  for (const v of VARIANTS) {
    const dir = path.join(UPLOADS_DIR, v);
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  }
  res.json({ ok: true });
});
