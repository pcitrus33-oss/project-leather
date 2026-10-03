import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { polygonSurface, toVector } from './sphere';

/**
 * Lakes are part of the base globe, drawn for every country whether unlocked or not. They sit above
 * both the country caps (0.007) and the province caps (0.0074), so provinces never hide them.
 */
const LAKE_ALT = 0.0078;
const SHORE_ALT = 0.008;
const SHORE_WIDTH = 0.1;

type Lake = { name: string; polygons: number[][][][] };

/** Large lakes (scripts/build-lakes.mjs), loaded separately so they don't slow the first paint. */
export function loadLakes(): Promise<Lake[]> {
  return import('../data/lakes.json').then((m) => m.default as Lake[]);
}

/** Every lake as one water mesh plus one darker shoreline mesh. */
export function buildAllLakes(lakes: Lake[]): THREE.Group {
  const fills: THREE.BufferGeometry[] = [];
  const shore = { positions: [] as number[], indices: [] as number[] };
  for (const lake of lakes) {
    for (const coords of lake.polygons) {
      if (!coords[0]) continue;
      fills.push(polygonSurface(coords, LAKE_ALT, 1, false).top);
      for (const ring of coords) ribbon(ring.map(([lng, lat]) => toVector(lat, lng, SHORE_ALT)), shore.positions, shore.indices);
    }
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(fills)!, new THREE.MeshLambertMaterial({ color: '#7fcff5', side: THREE.DoubleSide })));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(shore.positions, 3));
  geo.setIndex(shore.indices);
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#3b86c4', side: THREE.DoubleSide })));
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
