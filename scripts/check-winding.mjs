// Sanity check for the generated map data: no polygon may cover more than half the sphere (that means its
// rings are wound the wrong way for d3, which breaks silhouettes and bubble positions).
// Usage (from repo root): node scripts/check-winding.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('client/package.json'));
const { geoArea } = require('d3-geo');

let bad = 0;
for (const file of ['client/src/data/countries.json', 'client/src/data/provinces.json']) {
  for (const shape of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    if (shape.polygons.some((coordinates) => geoArea({ type: 'Polygon', coordinates }) > 2 * Math.PI)) {
      console.log(`${file}: ${shape.id ?? ''} ${shape.name} is wound inside out`);
      bad++;
    }
  }
}
console.log(bad ? `${bad} inverted shapes` : 'All shapes wound correctly');
process.exit(bad ? 1 : 0);
