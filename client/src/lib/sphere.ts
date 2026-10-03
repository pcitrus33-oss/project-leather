import * as THREE from 'three';
import { geoContains } from 'd3-geo';
import type { Country } from './countries';

/** Globe radius in three-globe units. */
export const R = 100;

/** Same convention as three-globe's polar2Cartesian, so our meshes line up with the globe. */
export function toVector(lat: number, lng: number, alt: number, out = new THREE.Vector3()) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = R * (1 + alt);
  return out.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

// ---------- Point in polygon ----------

export type PointTest = (p: number[]) => boolean;

/** Even-odd ray casting on plain lng/lat: fine at country scale and far faster than geoContains. */
function inRing(ring: number[][], [x, y]: number[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * "Is this lng/lat inside the polygon?" The exact spherical geoContains was far too slow for
 * Canada-sized shapes (~15 s), so this uses a bounding box plus flat ray casting, falling back to geoContains only
 * for rings spanning more than 180° of longitude (date-line cases).
 */
function polygonTest(coords: number[][][]): PointTest {
  const outer = coords[0];
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [lng, lat] of outer) {
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  if (e - w > 180) {
    const polygon = { type: 'Polygon' as const, coordinates: coords };
    return (p) => geoContains(polygon, p as [number, number]);
  }
  return (p) =>
    p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n && inRing(outer, p) && !coords.slice(1).some((hole) => inRing(hole, p));
}

export function featureTest(feature: Country['feature']): PointTest {
  const g = feature.geometry;
  const parts = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(polygonTest);
  return (p) => parts.some((t) => t(p));
}

// ---------- Polygon surfaces ----------

/**
 * A polygon drawn on the globe at a fixed altitude: a flat top (earcut triangulation, with big
 * triangles split until no edge is longer than maxEdgeDeg so they follow the curve instead of
 * sagging below it) and, optionally, sides down to the surface.
 *
 * Replaces three-conic-polygon-geometry for flat shapes: that library computes a spherical
 * Delaunay triangulation and took ~3.5 s in the browser for all countries; this takes a fraction.
 */
export function polygonSurface(coords: number[][][], alt: number, maxEdgeDeg: number, withSides: boolean) {
  // Rings arrive closed (first point repeated); earcut wants them open.
  let rings = coords.map((ring) => ring.slice(0, -1));
  // Keep date-line-crossing polygons continuous by shifting western points east by 360°.
  const lngs = rings[0].map((p) => p[0]);
  if (Math.max(...lngs) - Math.min(...lngs) > 180) rings = rings.map((r) => r.map(([x, y]) => [x < 0 ? x + 360 : x, y]));

  const points: number[][] = rings.flat();
  const tris = THREE.ShapeUtils.triangulateShape(
    rings[0].map(([x, y]) => new THREE.Vector2(x, y)),
    rings.slice(1).map((r) => r.map(([x, y]) => new THREE.Vector2(x, y))),
  );

  // Subdivide long triangles, sharing midpoints between neighbours so there are no cracks.
  const index: number[] = [];
  const midpoints = new Map<string, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let i = midpoints.get(key);
    if (i === undefined) {
      i = points.push([(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2]) - 1;
      midpoints.set(key, i);
    }
    return i;
  };
  const len = (a: number, b: number) => Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
  // Halve the longest edge until all edges are short enough. (Splitting into four instead blows up
  // quadratically on the long thin slivers earcut produces: millions of triangles for France.)
  const split = (a: number, b: number, c: number, depth: number): void => {
    const ab = len(a, b), bc = len(b, c), ca = len(c, a);
    const longest = Math.max(ab, bc, ca);
    if (depth > 24 || longest <= maxEdgeDeg) {
      index.push(a, b, c);
    } else if (longest === ab) {
      const m = mid(a, b);
      split(a, m, c, depth + 1);
      split(m, b, c, depth + 1);
    } else if (longest === bc) {
      const m = mid(b, c);
      split(a, b, m, depth + 1);
      split(a, m, c, depth + 1);
    } else {
      const m = mid(c, a);
      split(a, b, m, depth + 1);
      split(m, b, c, depth + 1);
    }
  };
  for (const [a, b, c] of tris) split(a, b, c, 0);

  const v = new THREE.Vector3();
  const positions = new Float32Array(points.length * 3);
  const normals = new Float32Array(points.length * 3);
  points.forEach(([lng, lat], i) => {
    toVector(lat, lng, alt, v).toArray(positions, i * 3);
    v.normalize().toArray(normals, i * 3); // sphere normal: smooth, even lighting across the top
  });
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  top.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  top.setIndex(index);

  let sides: THREE.BufferGeometry | null = null;
  if (withSides) {
    const pos: number[] = [];
    const lo = new THREE.Vector3(), hi = new THREE.Vector3(), lo2 = new THREE.Vector3(), hi2 = new THREE.Vector3();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
        toVector(y1, x1, 0, lo); toVector(y1, x1, alt, hi); toVector(y2, x2, 0, lo2); toVector(y2, x2, alt, hi2);
        pos.push(...lo.toArray(), ...lo2.toArray(), ...hi.toArray(), ...hi.toArray(), ...lo2.toArray(), ...hi2.toArray());
      }
    }
    sides = new THREE.BufferGeometry();
    sides.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sides.computeVertexNormals();
    // Indexed like the tops, so the two merge into one geometry.
    sides.setIndex([...Array(pos.length / 3).keys()]);
  }
  return { top, sides };
}
