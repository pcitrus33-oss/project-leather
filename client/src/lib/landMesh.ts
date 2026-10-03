import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { featureTest, polygonSurface, toVector } from './sphere';

/** Anything drawn as a flat shape on the globe: a country or a province. */
export interface Region {
  key: string;
  feature: Feature<Polygon | MultiPolygon>;
}

/**
 * Many regions as ONE mesh plus ONE set of border lines. Drawing the 1,616 country pieces
 * (Canada alone is 141 islands) as separate meshes meant ~4,800 draw calls per frame and
 * ~10 fps; merged, the globe draws in a handful of calls.
 */
export interface LandMesh<T extends Region> {
  object: THREE.Group;
  /** Recolour one region's top and sides. */
  setColor: (key: string, top: THREE.ColorRepresentation, side: THREE.ColorRepresentation) => void;
  /** The region at a point, or null. */
  regionAt: (lat: number, lng: number) => T | null;
}

/**
 * @param alt height of the flat tops (fraction of the globe radius); borders sit just above.
 * Countries use 0.007; provinces sit a hair higher so they cover their country when shown.
 */
export function buildLandMesh<T extends Region>(regions: T[], alt: number, borderColor = '#2b3a67'): LandMesh<T> {
  const pieces: THREE.BufferGeometry[] = [];
  const ranges = new Map<string, { top: [number, number][]; side: [number, number][] }>();
  const borders: number[] = [];
  let vertexCount = 0;
  const v = new THREE.Vector3();

  const add = (geo: THREE.BufferGeometry, list: [number, number][]) => {
    const count = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    list.push([vertexCount, count]);
    vertexCount += count;
    pieces.push(geo);
  };

  for (const region of regions) {
    const g = region.feature.geometry;
    const range = { top: [] as [number, number][], side: [] as [number, number][] };
    ranges.set(region.key, range);
    for (const coords of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      // Edges up to 3° keep the flat top within ~0.03 units of the curved surface.
      const { top, sides } = polygonSurface(coords, alt, 3, true);
      add(top, range.top);
      add(sides!, range.side);
      for (const ring of coords) {
        for (let i = 1; i < ring.length; i++) {
          for (const [lng, lat] of [ring[i - 1], ring[i]]) {
            toVector(lat, lng, alt + 0.0005, v);
            borders.push(v.x, v.y, v.z);
          }
        }
      }
    }
  }

  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  const colors = merged.attributes.color as THREE.BufferAttribute;
  const land = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(borders, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: borderColor }));

  const object = new THREE.Group();
  object.add(land, lines);

  const color = new THREE.Color();
  const paint = (list: [number, number][], c: THREE.ColorRepresentation) => {
    color.set(c);
    for (const [start, count] of list) for (let i = start; i < start + count; i++) colors.setXYZ(i, color.r, color.g, color.b);
  };

  // Point-in-region lookup for hover and clicks, with a bounding-box shortlist.
  const tests = regions.map((r) => {
    const [[w, s], [e, n]] = boundsOf(r);
    return { region: r, w, s, e, n, contains: featureTest(r.feature) };
  });

  return {
    object,
    setColor(key, top, side) {
      const range = ranges.get(key);
      if (!range) return;
      paint(range.top, top);
      paint(range.side, side);
      colors.needsUpdate = true;
    },
    regionAt(lat, lng) {
      for (const t of tests) {
        const inBox = t.w <= t.e ? lng >= t.w && lng <= t.e : lng >= t.w || lng <= t.e;
        if (inBox && lat >= t.s && lat <= t.n && t.contains([lng, lat])) return t.region;
      }
      return null;
    },
  };
}

function boundsOf(region: Region): [[number, number], [number, number]] {
  let w = 180, e = -180, s = 90, n = -90;
  const g = region.feature.geometry;
  for (const coords of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    for (const [lng, lat] of coords[0]) {
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [[w, s], [e, n]];
}
