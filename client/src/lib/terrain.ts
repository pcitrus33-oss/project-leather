import * as THREE from 'three';
import { geoArea, geoBounds } from 'd3-geo';
import elevationUrl from '../data/elevation.png';
import type { Country } from './countries';
import { featureTest, polygonSurface, R, toLatLng, toVector, type PointTest } from './sphere';

// Altitudes below are fractions of the globe radius R.
/** Painted land sits just above the flat country caps (polygon altitude 0.007). */
const LAND_ALT = 0.01;
/** Elevation (0..1 of the map's range) above which cartoon mountains appear. ~0.3 ≈ 1,500–2,000 m. */
const MOUNTAIN_MIN = 0.3;
/** Mountains taller than this also get snowy tips. */
const SNOW_MIN = 0.5;
const KM_PER_DEG = 111;
const UNITS_PER_DEG = (2 * Math.PI * R) / 360;

export const SHADOWS_ENABLED = true;

const COLORS = {
  fieldA: new THREE.Color('#9ed98a'),
  fieldB: new THREE.Color('#bfe58f'),
  fieldC: new THREE.Color('#86cc7c'),
  side: new THREE.Color('#6fae63'),
  lake: '#7fcff5',
  river: '#6cc4f2',
  waterEdge: '#3b86c4',
  snow: new THREE.Color('#ffffff'),
  outline: '#2b3a67',
};

const landMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const mountainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const rockMaterial = new THREE.MeshLambertMaterial({ color: '#9aa0ab', flatShading: true });
// Cartoon ink outline: the same shape drawn slightly larger from the inside, in ink.
const outlineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.outline, side: THREE.BackSide });
const lakeMaterial = new THREE.MeshLambertMaterial({ color: COLORS.lake, side: THREE.DoubleSide });
// Ribbons are drawn from both sides, so their winding direction doesn't matter.
const riverMaterial = new THREE.MeshBasicMaterial({ color: COLORS.river, side: THREE.DoubleSide });
const waterEdgeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.waterEdge, side: THREE.DoubleSide });

// ---------- Data ----------

interface Elevation {
  data: Uint8Array;
  width: number;
  height: number;
}
interface Water {
  rivers: { name: string; rank: number; lines: number[][][] }[];
  lakes: { name: string; polygons: number[][][][] }[];
}
export interface TerrainData {
  elevation: Elevation;
  water: Water;
}

let data: Promise<TerrainData> | null = null;

/** Loads the elevation map and river/lake data once (only needed once a country is unlocked). */
export function loadTerrainData(): Promise<TerrainData> {
  data ??= Promise.all([loadElevation(), import('../data/water.json').then((m) => m.default as Water)]).then(
    ([elevation, water]) => ({ elevation, water }),
  );
  return data;
}

function loadElevation(): Promise<Elevation> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
      const px = new Uint8Array(img.width * img.height);
      for (let i = 0; i < px.length; i++) px[i] = rgba[i * 4];
      resolve({ data: px, width: img.width, height: img.height });
    };
    img.onerror = () => reject(new Error('Could not load elevation map'));
    img.src = elevationUrl;
  });
}

/** Relative elevation 0..1 at a point, bilinearly interpolated. */
function elevationAt(e: Elevation, lat: number, lng: number) {
  const x = (((((lng + 180) % 360) + 360) % 360) / 360) * (e.width - 1);
  const y = ((90 - lat) / 180) * (e.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, e.width - 1), y1 = Math.min(y0 + 1, e.height - 1);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) => e.data[yy * e.width + xx];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return (top * (1 - fy) + bottom * fy) / 255;
}

// ---------- Helpers ----------

/** Deterministic pseudo-random 0..1 from two numbers, so a country always looks the same. */
function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise for painting field patches. */
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------- Pieces ----------

/** Flat green land with soft patches of different greens, like painted fields. */
function buildLand(polygons: number[][][][], resolution: number) {
  const group = new THREE.Group();
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  for (const coords of polygons) {
    const { top, sides } = polygonSurface(coords, LAND_ALT, resolution, true);
    const pos = top.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const [lat, lng] = toLatLng(v.fromBufferAttribute(pos, i));
      const n = noise(lat * 1.3, lng * 1.3) * 0.7 + noise(lat * 4, lng * 4) * 0.3;
      color.copy(COLORS.fieldA).lerp(n > 0.5 ? COLORS.fieldB : COLORS.fieldC, Math.abs(n - 0.5) * 2);
      color.toArray(colors, i * 3);
    }
    top.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const land = new THREE.Mesh(top, landMaterial);
    land.receiveShadow = SHADOWS_ENABLED;
    group.add(land);

    const sideColors = new Float32Array(sides!.attributes.position.count * 3);
    for (let i = 0; i < sides!.attributes.position.count; i++) COLORS.side.toArray(sideColors, i * 3);
    sides!.setAttribute('color', new THREE.BufferAttribute(sideColors, 3));
    group.add(new THREE.Mesh(sides!, landMaterial));
  }
  return group;
}

/** Lakes whose outline touches the country, drawn as flat blue water with a darker shoreline. */
function buildLakes(contains: PointTest, water: Water) {
  const group = new THREE.Group();
  const shore = { positions: [] as number[], indices: [] as number[] };
  for (const lake of water.lakes) {
    for (const coords of lake.polygons) {
      if (!coords[0]?.some(contains)) continue;
      group.add(new THREE.Mesh(polygonSurface(coords, LAND_ALT + 0.0006, 1, false).top, lakeMaterial));
      for (const ring of coords) {
        ribbon(ring.map(([lng, lat]) => toVector(lat, lng, LAND_ALT + 0.0009)), 0.1, shore.positions, shore.indices);
      }
    }
  }
  if (shore.indices.length) group.add(ribbonMesh(shore, waterEdgeMaterial));
  return group;
}

function ribbonMesh(part: { positions: number[]; indices: number[] }, material: THREE.Material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
  geo.setIndex(part.indices);
  return new THREE.Mesh(geo, material);
}

/** A flat ribbon following a line on the globe surface. */
function ribbon(points: THREE.Vector3[], width: number, positions: number[], indices: number[]) {
  const start = positions.length / 3;
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  points.forEach((p, i) => {
    tangent.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(tangent, p).normalize().multiplyScalar(width / 2);
    positions.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i > 0) {
      const a = start + (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
}

/** Rivers clipped to the country, as blue ribbons with darker edges. Bigger rivers are wider. */
function buildRivers(contains: PointTest, water: Water) {
  const fill = { positions: [] as number[], indices: [] as number[] };
  const edge = { positions: [] as number[], indices: [] as number[] };
  for (const river of water.rivers) {
    const width = THREE.MathUtils.clamp(0.3 - river.rank * 0.025, 0.1, 0.3);
    for (const line of river.lines) {
      // Split the line into runs of points inside the country.
      let run: THREE.Vector3[] = [];
      const flush = () => {
        if (run.length > 1) {
          ribbon(run.map((p) => p.clone().setLength(R * (1 + LAND_ALT + 0.0005))), width + 0.09, edge.positions, edge.indices);
          ribbon(run.map((p) => p.clone().setLength(R * (1 + LAND_ALT + 0.0008))), width, fill.positions, fill.indices);
        }
        run = [];
      };
      for (const [lng, lat] of line) {
        if (contains([lng, lat])) run.push(toVector(lat, lng, 0));
        else flush();
      }
      flush();
    }
  }
  const group = new THREE.Group();
  if (edge.indices.length) group.add(ribbonMesh(edge, waterEdgeMaterial), ribbonMesh(fill, riverMaterial));
  return group;
}

/** Low-poly cone, base at y=0, with gray rocky faces and (optionally) a white snowy tip. */
function mountainGeometry(snowy: boolean) {
  const geo = new THREE.ConeGeometry(1, 1, 7, 3).toNonIndexed();
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    if (snowy && y > 0.62) c.copy(COLORS.snow);
    else c.setHSL(0.6, 0.06, 0.5 + hash(i, 7) * 0.2); // uneven grays read as rock faces
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
const MOUNTAIN_GEO = { rocky: mountainGeometry(false), snowy: mountainGeometry(true) };
const ROCK_GEO = new THREE.IcosahedronGeometry(1, 0);

/**
 * Cartoon mountains wherever the real elevation is high enough, sized by height,
 * with a couple of boulders around each one's feet.
 */
function buildMountains(country: Country, contains: PointTest, e: Elevation, sizeKm: number) {
  const spacing = THREE.MathUtils.clamp(sizeKm / KM_PER_DEG / 28, 0.22, 1.1);
  const [[west, south], [east, north]] = geoBounds(country.feature);
  const eastEdge = east < west ? east + 360 : east; // countries crossing the date line
  const peaks: { rocky: THREE.Matrix4[]; snowy: THREE.Matrix4[] } = { rocky: [], snowy: [] };
  const rocks: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const spin = new THREE.Quaternion();
  const place = (lat: number, lng: number, radius: number, height: number, turn: number) => {
    const p = toVector(lat, lng, LAND_ALT - 0.0004);
    const q = new THREE.Quaternion().setFromUnitVectors(up, p.clone().normalize()).multiply(spin.setFromAxisAngle(up, turn));
    return new THREE.Matrix4().compose(p, q, new THREE.Vector3(radius, height, radius));
  };

  for (let lat = south; lat <= north; lat += spacing) {
    for (let lng0 = west; lng0 <= eastEdge; lng0 += spacing) {
      // Jitter so peaks don't sit on a visible grid.
      const jLat = lat + (hash(lat, lng0) - 0.5) * spacing;
      let jLng = lng0 + (hash(lng0, lat) - 0.5) * spacing;
      if (jLng > 180) jLng -= 360;
      const h = elevationAt(e, jLat, jLng);
      if (h < MOUNTAIN_MIN || !contains([jLng, jLat])) continue;
      const radius = spacing * UNITS_PER_DEG * (0.6 + hash(jLat, 3) * 0.25);
      // Tall and pointy, so they still read as peaks when seen from above.
      const height = radius * (2.4 + (h - MOUNTAIN_MIN) * 5);
      (h >= SNOW_MIN ? peaks.snowy : peaks.rocky).push(place(jLat, jLng, radius, height, hash(jLng, 9) * 6.28));
      for (let k = 0; k < 2; k++) {
        const a = hash(jLat + k, jLng) * Math.PI * 2;
        const d = (radius * 1.15) / UNITS_PER_DEG;
        const r = radius * (0.12 + hash(k, jLat) * 0.08);
        rocks.push(place(jLat + Math.sin(a) * d, jLng + Math.cos(a) * d, r, r * 0.8, a));
      }
    }
  }

  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], outline: number) => {
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(geo, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = SHADOWS_ENABLED;
    group.add(mesh);
    const ink = new THREE.InstancedMesh(geo, outlineMaterial, matrices.length);
    const grow = new THREE.Matrix4().makeScale(outline, outline, outline);
    matrices.forEach((m, i) => ink.setMatrixAt(i, m.clone().multiply(grow)));
    group.add(ink);
  };
  add(MOUNTAIN_GEO.rocky, mountainMaterial, peaks.rocky, 1.12);
  add(MOUNTAIN_GEO.snowy, mountainMaterial, peaks.snowy, 1.12);
  add(ROCK_GEO, rockMaterial, rocks, 1.15);
  return group;
}

/** The painted cartoon landscape for one unlocked country, in globe coordinates. */
export function buildTerrain(country: Country, { elevation, water }: TerrainData): THREE.Group {
  const sizeKm = Math.sqrt(geoArea(country.feature) * 6371 ** 2);
  // ~40 grid cells across the country for the land surface.
  const resolution = THREE.MathUtils.clamp(sizeKm / KM_PER_DEG / 40, 0.15, 0.8);
  const geometry = country.feature.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  const group = new THREE.Group();
  const contains = featureTest(country.feature);
  group.add(buildLand(polygons, resolution), buildLakes(contains, water), buildRivers(contains, water));
  group.add(buildMountains(country, contains, elevation, sizeKm));
  return group;
}
