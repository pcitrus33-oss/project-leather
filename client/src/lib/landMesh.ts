import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { featureTest, polygonSurface, R, toVector } from './sphere';

/**
 * Lets a material raise or sink vertices by a per-vertex `lift` attribute (extra altitude, as a fraction
 * of the globe radius), on the GPU. Only vertices above the globe surface move, so a region's top and
 * the upper edge of its sides rise while the sides' bottom stays on the ground.
 */
function withLift<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float lift;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float liftR = length(transformed);
        if (liftR > ${R.toFixed(1)} * 1.0001) transformed *= (liftR + lift * ${R.toFixed(1)}) / liftR;`,
      );
  };
  return material;
}

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
  /** Raise (or sink, if negative) one region and its borders by this much altitude. */
  setLift: (key: string, lift: number) => void;
  /** The region at a point, or null. */
  regionAt: (lat: number, lng: number) => T | null;
}

/**
 * @param alt height of the flat tops when not lifted (fraction of the globe radius); borders sit just above.
 */
export function buildLandMesh<T extends Region>(regions: T[], alt: number, borderColor = '#2b3a67'): LandMesh<T> {
  const pieces: THREE.BufferGeometry[] = [];
  const ranges = new Map<string, { top: [number, number][]; side: [number, number][]; border: [number, number] }>();
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
    const range = { top: [] as [number, number][], side: [] as [number, number][], border: [borders.length / 3, 0] as [number, number] };
    ranges.set(region.key, range);
    for (const coords of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      // Edges up to 3° keep the flat top within ~0.03 units of the curved surface.
      const { top, sides } = polygonSurface(coords, alt, 3, true);
      add(top, range.top);
      add(sides!, range.side);
      for (const ring of coords) {
        for (let i = 1; i < ring.length; i++) {
          // Split long edges (the 49th parallel is one 27° edge) like the tops, so the line follows the curve.
          const [[x0, y0], [x1, y1]] = [ring[i - 1], ring[i]];
          // (Edges jumping across the date line stay one segment, or they'd wrap round the globe.)
          const steps = Math.abs(x1 - x0) > 180 ? 1 : Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
          for (let s = 0; s < steps; s++) {
            for (const t of [s / steps, (s + 1) / steps]) {
              toVector(y0 + (y1 - y0) * t, x0 + (x1 - x0) * t, alt + 0.0005, v);
              borders.push(v.x, v.y, v.z);
            }
          }
        }
      }
    }
    range.border[1] = borders.length / 3 - range.border[0];
  }

  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  const colors = merged.attributes.color as THREE.BufferAttribute;
  const lifts = new THREE.Float32BufferAttribute(new Float32Array(vertexCount), 1);
  merged.setAttribute('lift', lifts);
  const land = new THREE.Mesh(merged, withLift(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(borders, 3));
  const lineLifts = new THREE.Float32BufferAttribute(new Float32Array(borders.length / 3), 1);
  lineGeo.setAttribute('lift', lineLifts);
  const lines = new THREE.LineSegments(lineGeo, withLift(new THREE.LineBasicMaterial({ color: borderColor })));

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
    setLift(key, lift) {
      const range = ranges.get(key);
      if (!range) return;
      for (const [start, count] of [...range.top, ...range.side]) for (let i = start; i < start + count; i++) lifts.setX(i, lift);
      for (let i = range.border[0]; i < range.border[0] + range.border[1]; i++) lineLifts.setX(i, lift);
      lifts.needsUpdate = true;
      lineLifts.needsUpdate = true;
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
