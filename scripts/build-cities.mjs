// Builds client/src/data/cities.json from Natural Earth's populated places.
//   Large countries: capital + 2 next-largest cities
//   Small countries: capital only
//   Micro countries: none
// Usage (from repo root): node scripts/build-cities.mjs [path/to/ne_10m_populated_places_simple.geojson]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('client/package.json'));
const { feature } = require('topojson-client');
const { geoArea } = require('d3-geo');
const isoCountries = require('i18n-iso-countries');
const topology = require('world-atlas/countries-50m.json');

const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';
const OUT = path.resolve('client/src/data/cities.json');

const EARTH_KM2 = 4 * Math.PI * 6371 ** 2;
const MICRO_KM2 = 1_000; // Monaco, Vatican, Singapore, Malta, Andorra…
const SMALL_KM2 = 50_000; // Belgium, Switzerland, Netherlands, Costa Rica…

// Natural Earth country codes that aren't ISO alpha-3 (or are keyed differently in our map).
const NE_TO_ISO3 = { SDS: 'SSD', KOS: 'XKX', PSX: 'PSE', SAH: 'ESH' };
// Capitals Natural Earth flags ambiguously (several capitals, or none).
const CAPITAL_OVERRIDE = { ZAF: 'Pretoria', SSD: 'Juba' };
const SKIP = new Set(['ATA']); // research stations, not cities
const MIN_GAP_KM = 80; // skip a city sitting on top of one already picked (Delhi vs New Delhi)

function distanceKm(a, b) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const file = process.argv[2];
const places = file
  ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : await (await fetch(SOURCE_URL)).json();

// Size class per country from the same map shapes the globe uses.
const countries = feature(topology, topology.objects.countries).features;
const areaByIso = new Map();
for (const f of countries) {
  const iso = f.properties.name === 'Kosovo' ? 'XKX' : f.id && isoCountries.numericToAlpha3(f.id);
  if (iso) areaByIso.set(iso, (areaByIso.get(iso) ?? 0) + (geoArea(f) / (4 * Math.PI)) * EARTH_KM2);
}

const byIso = new Map();
for (const { properties: p, geometry } of places.features) {
  const iso =
    NE_TO_ISO3[p.adm0_a3] ??
    (p.iso_a2 && p.iso_a2 !== '-99' && isoCountries.alpha2ToAlpha3(p.iso_a2)) ??
    p.adm0_a3;
  if (!areaByIso.has(iso) || SKIP.has(iso)) continue;
  const list = byIso.get(iso) ?? [];
  list.push({
    name: p.name.replace(/\s+/g, ' ').trim(),
    lat: +geometry.coordinates[1].toFixed(3),
    lng: +geometry.coordinates[0].toFixed(3),
    pop: p.pop_max,
    capital: p.adm0cap === 1,
  });
  byIso.set(iso, list);
}

const result = [];
const report = { micro: [], small: [], large: [], noData: [] };
for (const [iso, area] of areaByIso) {
  if (SKIP.has(iso)) continue;
  const list = (byIso.get(iso) ?? []).sort((a, b) => b.pop - a.pop);
  if (area < MICRO_KM2) {
    report.micro.push(iso);
    continue;
  }
  if (list.length === 0) {
    report.noData.push(iso);
    continue;
  }
  // Override first, otherwise the most populous flagged capital; territories just get their biggest city.
  const capital =
    list.find((c) => c.name === CAPITAL_OVERRIDE[iso]) ?? list.find((c) => c.capital) ?? list[0];
  const picked = [capital];
  if (area >= SMALL_KM2) {
    for (const c of list) {
      if (picked.length === 3) break;
      if (picked.every((p) => distanceKm(p, c) >= MIN_GAP_KM)) picked.push(c);
    }
    report.large.push(iso);
  } else report.small.push(iso);
  picked.forEach((c, i) =>
    result.push({ iso, name: c.name, lat: c.lat, lng: c.lng, ...(i === 0 && (c.capital || CAPITAL_OVERRIDE[iso]) ? { capital: true } : {}) }),
  );
}

fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`Wrote ${result.length} cities to ${path.relative(process.cwd(), OUT)}`);
for (const [k, v] of Object.entries(report)) console.log(`${k} (${v.length}): ${v.sort().join(' ')}`);
