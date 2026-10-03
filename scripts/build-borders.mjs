// Builds client/src/data/countries.json: Natural Earth 1:50m country shapes, simplified.
// The full-detail borders took ~6 s to turn into globe geometry; at 8% of the points it is ~0.2 s,
// keeps all 241 countries (1:110m drops 64 small ones), and the smoother outlines suit the cartoon look.
// Usage (from repo root): node scripts/build-borders.mjs [keepFraction]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const { presimplify, simplify, quantile } = require('topojson-simplify');
const topology = require('world-atlas/countries-50m.json');

const KEEP = Number(process.argv[2] ?? 0.08);
const OUT = path.resolve('client/src/data/countries.json');

const pre = presimplify(structuredClone(topology));
const simplified = simplify(pre, quantile(pre, KEEP));
// Drop the per-point weight presimplify adds, and round to ~100 m to keep the file small.
const round = (n) => Math.round(n * 1000) / 1000;
simplified.arcs = simplified.arcs.map((arc) => arc.map(([x, y]) => [round(x), round(y)]));

fs.writeFileSync(OUT, JSON.stringify(simplified));
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, keep ${KEEP * 100}%)`);
