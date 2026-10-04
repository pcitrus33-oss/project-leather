import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLift } from './landMesh';
import { polygonSurface, toVector } from './sphere';

/**
 * Lakes are part of the base globe, drawn for every country whether unlocked or not. They sit just
 * above the low (locked) land, and each vertex is lifted with the land under it (see setLift), so
 * lakes stay on top of raised unlocked regions too.
 */
const LAKE_ALT = 0.0068;
const SHORE_ALT = 0.007;
const SHORE_WIDTH = 0.1;

type Lake = { name: string; polygons: number[][][][] };

/** Large lakes (scripts/build-lakes.mjs), loaded separately so they don't slow the first paint. */
export function loadLakes(): Promise<Lake[]> {
  return import('../data/lakes.json').then((m) => m.default as Lake[]);
}

/** Every lake as one water mesh plus one darker shoreline mesh. */
export function buildAllLakes(lakes: Lake[]) {
  const fills: THREE.BufferGeometry[] = [];
  const shore = { positions: [] as number[], indices: [] as number[] };
  for (const lake of lakes) {
    for (const coords of lake.polygons) {
      if (!coords[0]) continue;
      fills.push(polygonSurface(coords, LAKE_ALT, 1, false).top);
      for (const ring of coords) ribbon(ring.map(([lng, lat]) => toVector(lat, lng, SHORE_ALT)), shore.positions, shore.indices);
    }
  }
  const water = mergeGeometries(fills)!;
  const shoreGeo = new THREE.BufferGeometry();
  shoreGeo.setAttribute('position', new THREE.Float32BufferAttribute(shore.positions, 3));
  shoreGeo.setIndex(shore.indices);
  for (const geo of [water, shoreGeo]) geo.setAttribute('lift', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));

  const group = new THREE.Group();
  group.add(new THREE.Mesh(water, withLift(new THREE.MeshLambertMaterial({ color: '#7fcff5', side: THREE.DoubleSide }))));
  group.add(new THREE.Mesh(shoreGeo, withLift(new THREE.MeshBasicMaterial({ color: '#3b86c4', side: THREE.DoubleSide }))));

  const v = new THREE.Vector3();
  return {
    group,
    /** Lifts every lake vertex by the lift of the land at that point. */
    setLift(liftAt: (lat: number, lng: number) => number) {
      for (const geo of [water, shoreGeo]) {
        const pos = geo.attributes.position;
        const lift = geo.attributes.lift as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const lat = 90 - (Math.acos(v.y / v.length()) * 180) / Math.PI;
          let lng = 90 - (Math.atan2(v.z, v.x) * 180) / Math.PI;
          if (lng > 180) lng -= 360;
          lift.setX(i, liftAt(lat, lng));
        }
        lift.needsUpdate = true;
      }
    },
  };
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
