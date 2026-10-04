// Cuts the large lakes (scripts/lakes.json, from build-lakes.mjs) out of land polygons, so lakes show the
// ocean underneath instead of being a layer on top of the land (which raised land would cover or tear).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const polygonClipping = require('polygon-clipping');

const lakes = JSON.parse(fs.readFileSync(path.resolve('scripts/lakes.json'), 'utf8'))
  .flatMap((lake) => lake.polygons)
  .map((coords) => ({ coords, box: bbox(coords[0]) }));

function bbox(ring) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [x, y] of ring) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  return { w, e, s, n };
}
const overlaps = (a, b) => a.w <= b.e && b.w <= a.e && a.s <= b.n && b.s <= a.n;
const round = (n) => Math.round(n * 1000) / 1000;

/** One polygon (rings) minus every lake touching it; returns a list of polygons. */
function cutPolygon(coords) {
  const box = bbox(coords[0]);
  // Date-line-spanning rings aren't valid flat polygons; no large lake sits on one anyway.
  if (box.e - box.w > 180) return [coords];
  const hits = lakes.filter((l) => overlaps(box, l.box)).map((l) => l.coords);
  if (!hits.length) return [coords];
  return polygonClipping
    .difference(coords, ...hits)
    .map((rings) =>
      rings
        .map((ring) => ring.map(([x, y]) => [round(x), round(y)]).filter((p, i, r) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]))
        .filter((ring) => ring.length >= 4),
    )
    .filter((rings) => rings.length && rings[0].length >= 4);
}

/** A list of polygons (MultiPolygon coordinates) with the lakes cut out. */
export const cutLakes = (polygons) => polygons.flatMap(cutPolygon);
