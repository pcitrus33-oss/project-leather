// Builds client/src/data/lakes.json: large lakes from Natural Earth 1:50m, drawn on unlocked countries.
// Usage (from repo root): node scripts/build-lakes.mjs [lakesGeojson]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('client/package.json'));
const { geoArea } = require('d3-geo');

const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson';
const OUT = path.resolve('client/src/data/lakes.json');
/** Lakes at least this big are drawn (64 lakes: the Great Lakes, Victoria, Baikal, Titicaca…). */
const MIN_KM2 = 3000;
/** Smaller lakes that matter anyway, by Natural Earth name (e.g. 'Dead Sea', 'Lac Léman'). */
const ALWAYS_KEEP = [];
const MIN_STEP_DEG = 0.04; // ~4 km: finer outline detail is invisible on the globe

const geo = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : await (await fetch(SOURCE_URL)).json();

const round = (n) => Math.round(n * 1000) / 1000;
/** Rounds points and drops ones closer than MIN_STEP_DEG to the previous kept point (keeps the ends). */
function thin(ring) {
  const out = [];
  ring.forEach(([lng, lat], i) => {
    const prev = out[out.length - 1];
    if (!prev || i === ring.length - 1 || Math.hypot(lng - prev[0], lat - prev[1]) >= MIN_STEP_DEG) out.push([round(lng), round(lat)]);
  });
  return out;
}

const lakes = geo.features
  .filter((f) => f.geometry && (geoArea(f) * 6371 ** 2 >= MIN_KM2 || ALWAYS_KEEP.includes(f.properties.name)))
  .map((f) => ({
    name: f.properties.name ?? '',
    polygons: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) =>
      rings.map(thin).filter((r) => r.length >= 4),
    ),
  }));

fs.writeFileSync(OUT, JSON.stringify(lakes));
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${lakes.length} lakes (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
