import * as THREE from 'three';
import type { Country } from './countries';
import { featureTest, polygonSurface, toVector } from './sphere';

/** Lakes sit just above the country caps (0.007) and below the border lines (0.0075). */
const LAKE_ALT = 0.0071;
const SHORE_ALT = 0.0073;
const SHORE_WIDTH = 0.1;

const waterMaterial = new THREE.MeshLambertMaterial({ color: '#7fcff5', side: THREE.DoubleSide });
const shoreMaterial = new THREE.MeshBasicMaterial({ color: '#3b86c4', side: THREE.DoubleSide });

type Lake = { name: string; polygons: number[][][][] };

let lakes: Promise<Lake[]> | null = null;

/** Large lakes (scripts/build-lakes.mjs), loaded only once a country is unlocked. */
export function loadLakes(): Promise<Lake[]> {
  lakes ??= import('../data/lakes.json').then((m) => m.default as Lake[]);
  return lakes;
}

/** The lakes touching an unlocked country, as blue water with a darker drawn shoreline. */
export function buildLakes(country: Country, all: Lake[]): THREE.Group {
  const contains = featureTest(country.feature);
  const group = new THREE.Group();
  const shore = { positions: [] as number[], indices: [] as number[] };
  for (const lake of all) {
    for (const coords of lake.polygons) {
      if (!coords[0]?.some(contains)) continue;
      group.add(new THREE.Mesh(polygonSurface(coords, LAKE_ALT, 1, false).top, waterMaterial));
      for (const ring of coords) ribbon(ring.map(([lng, lat]) => toVector(lat, lng, SHORE_ALT)), shore.positions, shore.indices);
    }
  }
  if (shore.indices.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(shore.positions, 3));
    geo.setIndex(shore.indices);
    group.add(new THREE.Mesh(geo, shoreMaterial));
  }
  return group;
}

/** A flat ribbon following a line on the globe surface. */
function ribbon(points: THREE.Vector3[], positions: number[], indices: number[]) {
  const start = positions.length / 3;
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  points.forEach((p, i) => {
    tangent.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(tangent, p).normalize().multiplyScalar(SHORE_WIDTH / 2);
    positions.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i > 0) {
      const a = start + (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
}
