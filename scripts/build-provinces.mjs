// Builds client/src/data/provinces.json: states/provinces for the countries that have them on the globe,
// each with its capital, from Natural Earth 1:50m admin-1 and 1:10m populated places.
// Usage (from repo root): node scripts/build-provinces.mjs [admin1Geojson] [placesGeojson]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('client/package.json'));
const { geoContains } = require('d3-geo');

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const OUT = path.resolve('client/src/data/provinces.json');
/** Countries split into provinces on the globe (keep in sync with PROVINCE_COUNTRIES in server/src/db.ts). */
const COUNTRIES = ['USA', 'CAN', 'CHN'];
const MIN_STEP_DEG = 0.03; // ~3 km
/** Capitals Natural Earth gets wrong or misses (it tags the biggest city instead, or nothing). */
const CAPITAL_OVERRIDE = {
  'US-AK': { name: 'Juneau', lat: 58.302, lng: -134.42 },
  'US-MD': { name: 'Annapolis', lat: 38.978, lng: -76.492 },
  'CA-PE': { name: 'Charlottetown', lat: 46.238, lng: -63.131 },
  'CN-HI': { name: 'Haikou', lat: 20.044, lng: 110.199 },
  'CN-LN': { name: 'Shenyang', lat: 41.805, lng: 123.432 },
  'CN-YN': { name: 'Kunming', lat: 25.038, lng: 102.718 },
};

const load = async (file, name) => (file ? JSON.parse(fs.readFileSync(file, 'utf8')) : (await fetch(BASE + name)).json());
const [admin1, places] = await Promise.all([
  load(process.argv[2], 'ne_50m_admin_1_states_provinces.geojson'),
  load(process.argv[3], 'ne_10m_populated_places_simple.geojson'),
]);

const round = (n) => Math.round(n * 1000) / 1000;
function thin(ring) {
  const out = [];
  ring.forEach(([lng, lat], i) => {
    const prev = out[out.length - 1];
    if (!prev || i === ring.length - 1 || Math.hypot(lng - prev[0], lat - prev[1]) >= MIN_STEP_DEG) out.push([round(lng), round(lat)]);
  });
  return out;
}

const provinces = admin1.features
  .filter((f) => COUNTRIES.includes(f.properties.adm0_a3) && f.geometry)
  .map((f) => {
    const p = f.properties;
    const inside = places.features.filter(
      (c) => c.properties.adm0_a3 === p.adm0_a3 && geoContains(f, c.geometry.coordinates),
    );
    // The admin-1 capital (Washington, Ottawa and Beijing are flagged as national capitals instead).
    const capital =
      inside.find((c) => c.properties.featurecla === 'Admin-1 capital') ??
      inside.find((c) => c.properties.adm0cap === 1) ??
      inside.sort((a, b) => b.properties.pop_max - a.properties.pop_max)[0];
    const id = p.iso_3166_2 || p.adm1_code;
    return {
      id,
      iso: p.adm0_a3,
      name: p.name,
      type: p.type_en ?? 'Province',
      capital: CAPITAL_OVERRIDE[id] ?? (capital && {
        name: capital.properties.name.replace(/\s+/g, ' ').trim(),
        lat: round(capital.geometry.coordinates[1]),
        lng: round(capital.geometry.coordinates[0]),
      }),
      polygons: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) =>
        rings.map(thin).filter((r) => r.length >= 4),
      ),
    };
  })
  .sort((a, b) => a.iso.localeCompare(b.iso) || a.name.localeCompare(b.name));

fs.writeFileSync(OUT, JSON.stringify(provinces));
const missing = provinces.filter((p) => !p.capital).map((p) => p.id);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${provinces.length} provinces (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(missing.length ? `No capital found for: ${missing.join(', ')}` : 'Every province has a capital');
