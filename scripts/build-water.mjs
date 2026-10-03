// Builds client/src/data/water.json: major rivers (lines) and lakes (polygons) from Natural Earth 1:50m,
// drawn on unlocked countries. Coordinates are rounded and thinned to keep the file small.
// Usage (from repo root): node scripts/build-water.mjs [riversGeojson] [lakesGeojson]
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const OUT = path.resolve('client/src/data/water.json');
const MIN_STEP_DEG = 0.04; // ~4 km: finer detail is invisible on the globe

const load = async (file, name) =>
  file ? JSON.parse(fs.readFileSync(file, 'utf8')) : (await fetch(BASE + name)).json();
const [riversGeo, lakesGeo] = await Promise.all([
  load(process.argv[2], 'ne_50m_rivers_lake_centerlines.geojson'),
  load(process.argv[3], 'ne_50m_lakes.geojson'),
]);

const round = (n) => Math.round(n * 1000) / 1000;
/** Rounds points and drops ones closer than MIN_STEP_DEG to the previous kept point (keeps the ends). */
function thin(line) {
  const out = [];
  line.forEach(([lng, lat], i) => {
    const prev = out[out.length - 1];
    const last = i === line.length - 1;
    if (!prev || last || Math.hypot(lng - prev[0], lat - prev[1]) >= MIN_STEP_DEG) out.push([round(lng), round(lat)]);
  });
  return out;
}

// Lake centrelines just cross lakes we already draw, so only real rivers are kept.
const rivers = riversGeo.features
  .filter((f) => f.properties.featurecla === 'River' && f.geometry)
  .map((f) => ({
    name: f.properties.name ?? '',
    // Natural Earth scalerank: 0 = most important. Used for line width.
    rank: f.properties.scalerank,
    lines: (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).map(thin).filter((l) => l.length > 1),
  }));

const lakes = lakesGeo.features
  .filter((f) => f.geometry)
  .map((f) => ({
    name: f.properties.name ?? '',
    polygons: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) =>
      rings.map(thin).filter((r) => r.length >= 4),
    ),
  }));

fs.writeFileSync(OUT, JSON.stringify({ rivers, lakes }));
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${rivers.length} rivers, ${lakes.length} lakes (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
