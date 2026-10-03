import * as THREE from 'three';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import { geoArea, geoContains } from 'd3-geo';
import elevationUrl from '../data/elevation.png';
import type { Country } from './countries';

// Globe radius in three-globe units, and terrain heights as a fraction of it.
const R = 100;
/** Terrain base sits just above the flat country caps (polygon altitude 0.007). */
export const TERRAIN_BASE = 0.01;
/**
 * Height of the highest peak (Everest) as a fraction of the globe radius. Real relief is ~0.0014,
 * so 0.012 is roughly 9× exaggeration: mountains read clearly without turning into spikes.
 */
const TERRAIN_SCALE = 0.012;

const KM2_PER_STERADIAN = 6371 ** 2;

// Cartoon colour ramp by relative height (0 = sea level, 1 = Everest).
const RAMP: [number, THREE.Color][] = [
  [0, new THREE.Color('#a6e3a1')],
  [0.12, new THREE.Color('#cfe8a0')],
  [0.3, new THREE.Color('#e9cf95')],
  [0.55, new THREE.Color('#c2936a')],
  [0.75, new THREE.Color('#a77f63')],
  [0.85, new THREE.Color('#ffffff')],
];

// Faceted "low-poly" shading makes the relief readable even under soft globe lighting.
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface Elevation {
  data: Uint8Array;
  width: number;
  height: number;
}

let elevation: Promise<Elevation> | null = null;

/** Loads the NASA-derived elevation map (grayscale, equirectangular) once. */
export function loadElevation(): Promise<Elevation> {
  elevation ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
      const data = new Uint8Array(img.width * img.height);
      for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
      resolve({ data, width: img.width, height: img.height });
    };
    img.onerror = () => reject(new Error('Could not load elevation map'));
    img.src = elevationUrl;
  });
  return elevation;
}

/** Relative height 0..1 at a point, bilinearly interpolated. */
function sample(e: Elevation, lat: number, lng: number) {
  const x = ((((lng + 180) % 360) + 360) % 360 / 360) * (e.width - 1);
  const y = ((90 - lat) / 180) * (e.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, e.width - 1), y1 = Math.min(y0 + 1, e.height - 1);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) => e.data[yy * e.width + xx];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return (top * (1 - fy) + bottom * fy) / 255;
}

function colorAt(h: number, out: THREE.Color) {
  if (h <= RAMP[0][0]) return out.copy(RAMP[0][1]);
  for (let i = 1; i < RAMP.length; i++) {
    const [stop, color] = RAMP[i];
    if (h <= stop) {
      const [prevStop, prev] = RAMP[i - 1];
      return out.copy(prev).lerp(color, (h - prevStop) / (stop - prevStop));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

/** A raised, coloured relief model of the country, in globe coordinates. */
export function buildTerrain(country: Country, e: Elevation): THREE.Group {
  const group = new THREE.Group();
  // Aim for ~40 grid cells across the country: fine enough for the Alps, cheap for Russia.
  const sizeKm = Math.sqrt(geoArea(country.feature) * KM2_PER_STERADIAN);
  const resolution = THREE.MathUtils.clamp(sizeKm / 111 / 40, 0.15, 0.8);
  const topHeight = (lng: number, lat: number) => R * (1 + TERRAIN_BASE + sample(e, lat, lng) * TERRAIN_SCALE);

  const geometry = country.feature.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const coords of polygons) {
    const geo = new ConicPolygonGeometry(coords, R, topHeight, false, true, false, resolution);
    dropTrianglesOutside(geo, coords);
    colorize(geo);
    group.add(new THREE.Mesh(geo, material));
    const sides = new ConicPolygonGeometry(coords, R, topHeight, false, false, true, resolution);
    colorize(sides);
    group.add(new THREE.Mesh(sides, material));
  }
  return group;
}

/**
 * At fine resolutions the geometry library adds some triangles outside large concave
 * countries (e.g. across Hudson Bay); drop any whose centre isn't inside the polygon.
 */
function dropTrianglesOutside(geo: THREE.BufferGeometry, coords: number[][][]) {
  const polygon = { type: 'Polygon' as const, coordinates: coords };
  const pos = geo.attributes.position;
  const index = geo.index!.array;
  const kept: number[] = [];
  const v = new THREE.Vector3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) v.add(corner.fromBufferAttribute(pos, index[i + k]));
    // Inverse of three-globe's polar2Cartesian.
    const lat = 90 - (Math.acos(v.y / v.length()) * 180) / Math.PI;
    const lng = 90 - (Math.atan2(v.z, v.x) * 180) / Math.PI;
    if (geoContains(polygon, [lng > 180 ? lng - 360 : lng, lat])) kept.push(index[i], index[i + 1], index[i + 2]);
  }
  geo.setIndex(kept);
}

/** Vertex colours by height, so the ramp follows the relief. */
function colorize(geo: THREE.BufferGeometry) {
  const color = new THREE.Color();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
    colorAt((r / R - 1 - TERRAIN_BASE) / TERRAIN_SCALE, color).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
