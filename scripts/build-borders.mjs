// Builds client/src/data/countries.json: Natural Earth 1:50m country shapes, simplified, with the large
// lakes (scripts/lakes.json) cut out so they show the ocean, and far-off territories (scripts/territories.mjs)
// split out of their countries.
// 70% of the points (plus every point of small countries, which global simplification would
// otherwise shrink to slivers) loads and builds in ~1 s in the browser; full detail takes ~1.5 s.
// Usage (from repo root): node scripts/build-borders.mjs [keepFraction] [smallCountryKm2]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cutLakes } from './cut-lakes.mjs';
import { TERRITORIES, territoryAt } from './territories.mjs';

const require = createRequire(path.resolve('package.json'));
const { feature } = require('topojson-client');
const { presimplify, simplify, quantile } = require('topojson-simplify');
const { geoArea } = require('d3-geo');
const isoCountries = require('i18n-iso-countries');
const topology = require('world-atlas/countries-50m.json');

const KEEP = Number(process.argv[2] ?? 0.7);
const SMALL_KM2 = Number(process.argv[3] ?? 30_000);
const OUT = path.resolve('client/src/data/countries.json');

const pre = presimplify(structuredClone(topology));
const minWeight = quantile(pre, KEEP);

// Small countries keep every point: they are cheap, and simplification hits them hardest.
for (const geometry of pre.objects.countries.geometries) {
  if (geoArea(feature(pre, geometry)) * 6371 ** 2 >= SMALL_KM2) continue;
  const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
  for (const ring of polygons.flat()) for (const a of ring) for (const point of pre.arcs[a < 0 ? ~a : a]) point[2] = Infinity;
}

const simplified = simplify(pre, minWeight);
// Round to ~100 m to keep the file small.
const round = (n) => Math.round(n * 1000) / 1000;
const countries = feature(simplified, simplified.objects.countries).features.map((f) => ({
  id: f.id ?? null,
  name: f.properties.name,
  polygons: cutLakes(
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) =>
      rings.map((ring) => ring.map(([x, y]) => [round(x), round(y)])),
    ),
  ),
}));

// Each territory takes its pieces out of the parent's shape.
const territories = new Map(TERRITORIES.map((t) => [t, []]));
for (const c of countries) {
  const iso = c.id && isoCountries.numericToAlpha3(c.id);
  c.polygons = c.polygons.filter((polygon) => {
    const t = territoryAt(iso, polygon[0][0]);
    if (t) territories.get(t).push(polygon);
    return !t;
  });
}
for (const [t, polygons] of territories) {
  if (!polygons.length) throw new Error(`No land found for ${t.name}`);
  countries.push({ id: null, name: t.name, iso: t.iso, alpha2: t.alpha2, parent: t.parent, polygons });
}

fs.writeFileSync(OUT, JSON.stringify(countries));
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, keep ${KEEP * 100}%, small countries < ${SMALL_KM2} km² kept whole)`);
