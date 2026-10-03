import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COUNTRIES, type Country } from './countries';
import { featureTest, polygonSurface, toVector } from './sphere';

/** Country caps stand slightly proud of the ocean, like flat cardboard cut-outs. */
const CAP_ALT = 0.007;
const BORDER_ALT = 0.0075;

/**
 * All countries as ONE mesh plus ONE set of border lines. Drawing the 1,616 country pieces
 * (Canada alone is 141 islands) as separate meshes meant ~4,800 draw calls per frame and
 * ~10 fps; merged, the globe draws in a handful of calls.
 */
export interface LandMesh {
  object: THREE.Group;
  /** Recolour one country's top and sides. */
  setColor: (iso: string, top: THREE.ColorRepresentation, side: THREE.ColorRepresentation) => void;
  /** The country at a point, or null for ocean. */
  countryAt: (lat: number, lng: number) => Country | null;
}

export function buildLandMesh(): LandMesh {
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

  for (const country of COUNTRIES) {
    const g = country.feature.geometry;
    const range = { top: [] as [number, number][], side: [] as [number, number][] };
    ranges.set(country.iso, range);
    for (const coords of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      // Edges up to 3° keep the flat top within ~0.03 units of the curved surface.
      const { top, sides } = polygonSurface(coords, CAP_ALT, 3, true);
      add(top, range.top);
      add(sides!, range.side);
      for (const ring of coords) {
        for (let i = 1; i < ring.length; i++) {
          for (const [lng, lat] of [ring[i - 1], ring[i]]) {
            toVector(lat, lng, BORDER_ALT, v);
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
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#2b3a67' }));

  const object = new THREE.Group();
  object.add(land, lines);

  const color = new THREE.Color();
  const paint = (list: [number, number][], c: THREE.ColorRepresentation) => {
    color.set(c);
    for (const [start, count] of list) for (let i = start; i < start + count; i++) colors.setXYZ(i, color.r, color.g, color.b);
  };

  // Point-in-country lookup for hover and clicks, with a bounding-box shortlist.
  const tests = COUNTRIES.map((c) => {
    const [[w, s], [e, n]] = boundsOf(c);
    return { country: c, w, s, e, n, contains: featureTest(c.feature) };
  });

  return {
    object,
    setColor(iso, top, side) {
      const range = ranges.get(iso);
      if (!range) return;
      paint(range.top, top);
      paint(range.side, side);
      colors.needsUpdate = true;
    },
    countryAt(lat, lng) {
      for (const t of tests) {
        const inBox = t.w <= t.e ? lng >= t.w && lng <= t.e : lng >= t.w || lng <= t.e;
        if (inBox && lat >= t.s && lat <= t.n && t.contains([lng, lat])) return t.country;
      }
      return null;
    },
  };
}

function boundsOf(country: Country): [[number, number], [number, number]] {
  let w = 180, e = -180, s = 90, n = -90;
  const g = country.feature.geometry;
  for (const coords of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    for (const [lng, lat] of coords[0]) {
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [[w, s], [e, n]];
}
