import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeGL, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { COUNTRIES, flagHtml, getCountry, type Country } from '../lib/countries';
import { PROVINCES, getProvince, hasProvinces, type Province } from '../lib/provinces';
import cities from '../data/cities.json';
import { buildAllLakes, loadLakes } from '../lib/lakes';
import { installCameraTilt } from '../lib/cameraTilt';
import { buildNightShade, isNightAt, sunDirection } from '../lib/dayNight';
import { cityIconHtml, placeIconHtml, type CityRank } from './mapIcons';
import { buildLandMesh, type LandMesh } from '../lib/landMesh';
import { featureTest, R, toVector } from '../lib/sphere';
import type { GlobeView, PlaceKind, UnlockedCountry } from '../lib/api';
import './Globe.css';

/** What the pointer is over: a country, or (zoomed in on USA/Canada/China) one of its provinces. */
export interface GlobeTarget {
  country: Country;
  province: Province | null;
}

interface Props {
  unlocked: UnlockedCountry[];
  /** Developer "show everything": draw every country/province as unlocked, with all cities. */
  revealAll?: boolean;
  /** "day" (always lit) or "daynight" (real-time night side, with glowing markers at night). */
  view?: GlobeView;
  /** An unlocked country/province (or a photo bubble) was clicked; the camera has already flown there. */
  onOpen: (iso: string, province: string | null) => void;
  /** A locked country/province was clicked at screen position x/y. */
  onLockedClick: (target: GlobeTarget, x: number, y: number) => void;
}

const COLORS = {
  ocean: '#8fd7f7',
  locked: '#c8ced8',
  lockedSide: '#a3abba',
  unlocked: '#ffffff',
  unlockedSide: '#e3e8f2',
  hoverLocked: '#ffc2dd',
  hoverUnlocked: '#fff3c4',
};

/** Provinces (and their lock state) only show once zoomed in closer than this. */
const PROVINCE_ALTITUDE = 1.6;
// Capital names appear first; other city names only once zoomed closer, to limit overlap.
const CAPITAL_NAMES_ALTITUDE = 1.3;
const CITY_NAMES_ALTITUDE = 0.7;
// Land heights (fractions of the radius). Locked land sits low and unlocked land is raised well above it;
// layers are kept far enough apart that the depth buffer never confuses them (that caused white speckles).
const COUNTRY_ALT = 0.006;
const PROVINCE_ALT = 0.0063;
/** Extra height for unlocked countries/provinces: they stand at ~0.014. */
const UNLOCKED_LIFT = 0.008;
/** USA/Canada/China's country shape sinks out of the way while their provinces are shown. */
const SUNK_LIFT = -0.0055;

type CityMarker = {
  kind: 'city';
  rank: CityRank;
  iso: string;
  /** Province it sits in (USA/Canada/China), which must be unlocked for it to show. */
  province: string | null;
  lat: number;
  lng: number;
  name: string;
};
type Marker =
  | CityMarker
  | { kind: 'place'; place: PlaceKind; lat: number; lng: number; name: string }
  | { kind: 'bubble'; lat: number; lng: number; target: GlobeTarget; count: number; thumbUrl: string; label: string; latestAt: string };

/** Every possible city marker: country capitals, the biggest cities, and province capitals. */
const ALL_CITIES: CityMarker[] = (() => {
  const provinceTests = PROVINCES.map((p) => ({ p, contains: featureTest(p.feature) }));
  const provinceAt = (iso: string, lat: number, lng: number) =>
    provinceTests.find((t) => t.p.iso === iso && t.contains([lng, lat]))?.p.id ?? null;

  const provinceCapitals: CityMarker[] = PROVINCES.map((p) => ({
    kind: 'city',
    rank: 'provinceCapital',
    iso: p.iso,
    province: p.id,
    ...p.capital,
  }));
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot(a.lat - b.lat, a.lng - b.lng) < 0.3;

  const others: CityMarker[] = [];
  for (const c of cities) {
    const rank: CityRank = 'capital' in c && c.capital ? 'capital' : 'city';
    const marker: CityMarker = { kind: 'city', rank, iso: c.iso, province: hasProvinces(c.iso) ? provinceAt(c.iso, c.lat, c.lng) : null, lat: c.lat, lng: c.lng, name: c.name };
    const twin = provinceCapitals.findIndex((p) => p.iso === c.iso && near(p, c));
    if (twin < 0) others.push(marker);
    // The same city as a province capital: a national capital wins, otherwise keep the province capital.
    else if (rank === 'capital') provinceCapitals.splice(twin, 1, { ...marker, province: provinceCapitals[twin].province });
  }
  return [...provinceCapitals, ...others];
})();

/** Photo bubbles sit on top of a short stem rising straight out of their spot. */
const STEM_ALT = 0.035;
/** Cities and symbols stand on top of raised (unlocked) land. */
const SYMBOL_ALT = 0.015;
const markerAltitude = (d: object) => ((d as Marker).kind === 'bubble' ? STEM_ALT : SYMBOL_ALT);

/** At most this many photo bubbles on the globe: half the most recent places, half picked at random. */
const MAX_BUBBLES = 20;
function pickBubbles<T extends { latestAt: string }>(all: T[]): T[] {
  if (all.length <= MAX_BUBBLES) return all;
  const byNewest = [...all].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  const newest = byNewest.slice(0, MAX_BUBBLES / 2);
  const rest = byNewest.slice(MAX_BUBBLES / 2);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...newest, ...rest.slice(0, MAX_BUBBLES - newest.length)];
}

/** Thin ink stems from each bubble's spot up to the bubble, as one instanced mesh. */
const STEM_GEO = new THREE.CylinderGeometry(0.11, 0.11, 1, 6).translate(0, 0.5, 0);
const STEM_MATERIAL = new THREE.MeshBasicMaterial({ color: '#2b3a67' });
function buildStems(spots: { lat: number; lng: number }[]) {
  const mesh = new THREE.InstancedMesh(STEM_GEO, STEM_MATERIAL, Math.max(spots.length, 1));
  mesh.count = spots.length;
  const up = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Vector3();
  const length = R * (STEM_ALT - COUNTRY_ALT);
  spots.forEach((s, i) => {
    toVector(s.lat, s.lng, COUNTRY_ALT, base);
    const q = new THREE.Quaternion().setFromUnitVectors(up, base.clone().normalize());
    mesh.setMatrixAt(i, new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, length, 1)));
  });
  return mesh;
}

const DEFAULT_POV = { lat: 25, lng: 10, altitude: window.innerWidth < 600 ? 3.8 : 2.3 };
const FLY_MS = 900;
const AUTO_SPIN_RESUME_MS = 6000;

// Remembered across page visits (and reloads) so "back to globe" returns to the same view.
type Pov = { lat: number; lng: number; altitude: number };
const POV_KEY = 'globe-pov';
let savedPov: Pov | null = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(POV_KEY) ?? 'null');
  } catch {
    return null;
  }
})();
function savePov(pov: Pov) {
  savedPov = pov;
  try {
    sessionStorage.setItem(POV_KEY, JSON.stringify(pov));
  } catch {
    // Storage unavailable (private mode etc.) — the in-memory copy still works.
  }
}

function makeClouds() {
  const group = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
  const puff = new THREE.SphereGeometry(1, 16, 12);
  const spots = [
    [40, -30], [10, 60], [-25, 140], [55, 120], [-40, -80], [20, -150], [-10, 20], [65, -100],
  ];
  for (const [lat, lng] of spots) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = 3 + Math.random() * 2.5;
      const m = new THREE.Mesh(puff, material);
      m.scale.set(s, s * 0.75, s);
      m.position.set((i - n / 2) * 3.6, Math.random() * 1.5, Math.random() * 2);
      cloud.add(m);
    }
    toVector(lat, lng, 0.17, cloud.position);
    cloud.lookAt(0, 0, 0);
    group.add(cloud);
  }
  return { group, material };
}

/** Clouds float at 17% of the radius: fade them out as the camera comes down to their height. */
function cloudOpacity(altitude: number) {
  return 0.92 * THREE.MathUtils.smoothstep(altitude, 0.6, 1.2);
}

type CountryRegion = Country & { key: string };
type ProvinceRegion = Province & { key: string };

/** How often the day/night line moves to the current time. */
const SUN_UPDATE_MS = 60_000;

export default function Globe({ unlocked, revealAll = false, view = 'day', onOpen, onLockedClick }: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  /** "c:ISO" or "p:PROVINCE" under the pointer. */
  const [hovered, setHovered] = useState<string | null>(null);
  const flyingRef = useRef(false);
  const tiltRef = useRef<ReturnType<typeof installCameraTilt> | null>(null);
  /** The view to remember: without the camera tilt, so restoring it doesn't drift. */
  const currentPov = () => tiltRef.current?.untiltedPov() ?? globeRef.current!.pointOfView();
  const resumeTimer = useRef<number | undefined>(undefined);
  const zoomedInRef = useRef(false);
  const nightRef = useRef<ReturnType<typeof buildNightShade> | null>(null);
  const cloudsRef = useRef<ReturnType<typeof makeClouds> | null>(null);
  const lakesRef = useRef<ReturnType<typeof buildAllLakes> | null>(null);
  const applyLiftsRef = useRef<() => void>(() => {});
  const sunRef = useRef(sunDirection());
  const viewRef = useRef(view);
  viewRef.current = view;
  /** Markers in the night (day/night view only) glow; refreshed as the sun moves. */
  const markNight = useCallback((el: HTMLElement) => {
    const night = viewRef.current === 'daynight' && isNightAt(Number(el.dataset.lat), Number(el.dataset.lng), sunRef.current);
    el.classList.toggle('is-night', night);
  }, []);

  // What's really unlocked (drives clicks) and what is drawn unlocked (developer reveal shows everything).
  const unlockedCountries = useMemo(() => new Set(unlocked.map((u) => u.iso)), [unlocked]);
  const unlockedProvinces = useMemo(() => new Set(unlocked.flatMap((u) => u.provinces.map((p) => p.id))), [unlocked]);
  const shownCountry = useCallback((iso: string) => revealAll || unlockedCountries.has(iso), [revealAll, unlockedCountries]);
  const shownProvince = useCallback((id: string) => revealAll || unlockedProvinces.has(id), [revealAll, unlockedProvinces]);

  const tooltip = useCallback(
    ({ country, province }: GlobeTarget) => {
      const u = unlocked.find((x) => x.iso === country.iso);
      const photos = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
      if (province) {
        const p = u?.provinces.find((x) => x.id === province.id);
        const sub = p ? `${photos(p.count)} · click to open` : 'locked · click to unlock';
        return `<div class="globe-tip"><b>${flagHtml(country)} ${province.name}</b><span>${country.name} · ${sub}</span></div>`;
      }
      let sub = u ? `${photos(u.count)} · click to open` : 'locked · click to unlock';
      if (u && hasProvinces(country.iso)) sub = `${photos(u.count)} in ${u.provinces.length} ${u.provinces.length === 1 ? 'place' : 'places'} · click to open`;
      return `<div class="globe-tip"><b>${flagHtml(country)} ${country.name}</b><span>${sub}</span></div>`;
    },
    [unlocked],
  );
  const tooltipRef = useRef(tooltip);
  tooltipRef.current = tooltip;
  /** Re-reads what's under the pointer; set by the hover effect, also run when data or zoom change. */
  const refreshHoverRef = useRef<() => void>(() => {});
  useEffect(() => refreshHoverRef.current(), [tooltip]);

  // Countries, and the provinces of USA/Canada/China, each as one merged mesh (see lib/landMesh.ts).
  const landRef = useRef<{ countries: LandMesh<CountryRegion>; provinces: LandMesh<ProvinceRegion> } | null>(null);
  const [landReady, setLandReady] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const land = landRef.current;
    if (!land) return;
    const paint = (mesh: LandMesh<CountryRegion | ProvinceRegion>, key: string, open: boolean, hover: boolean) => {
      const top = hover ? (open ? COLORS.hoverUnlocked : COLORS.hoverLocked) : open ? COLORS.unlocked : COLORS.locked;
      mesh.setColor(key, top, open ? COLORS.unlockedSide : COLORS.lockedSide);
    };
    for (const c of COUNTRIES) paint(land.countries, c.iso, shownCountry(c.iso), hovered === `c:${c.iso}`);
    for (const p of PROVINCES) paint(land.provinces, p.id, shownProvince(p.id), hovered === `p:${p.id}`);
  }, [landReady, shownCountry, shownProvince, hovered]);

  // Raise unlocked land (and the lakes on it); sink province countries' own shape while provinces show.
  const applyLifts = useCallback(() => {
    const land = landRef.current;
    if (!land) return;
    const zoomedIn = zoomedInRef.current;
    const countryLift = (iso: string) => (zoomedIn && hasProvinces(iso) ? SUNK_LIFT : shownCountry(iso) ? UNLOCKED_LIFT : 0);
    for (const c of COUNTRIES) land.countries.setLift(c.iso, countryLift(c.iso));
    for (const p of PROVINCES) land.provinces.setLift(p.id, shownProvince(p.id) ? UNLOCKED_LIFT : 0);
    lakesRef.current?.setLift((lat, lng) => {
      const country = land.countries.regionAt(lat, lng);
      if (!country) return 0;
      if (zoomedIn && hasProvinces(country.iso)) {
        const province = land.provinces.regionAt(lat, lng);
        return province && shownProvince(province.id) ? UNLOCKED_LIFT : 0;
      }
      return shownCountry(country.iso) ? UNLOCKED_LIFT : 0;
    });
  }, [shownCountry, shownProvince]);
  applyLiftsRef.current = applyLifts;
  useEffect(applyLifts, [applyLifts, landReady]);

  /** Country (and, when zoomed in on a province country, province) at a point. */
  const targetAt = useCallback((lat: number, lng: number): GlobeTarget | null => {
    const land = landRef.current;
    const country = land?.countries.regionAt(lat, lng);
    if (!land || !country) return null;
    const province = zoomedInRef.current && hasProvinces(country.iso) ? land.provinces.regionAt(lat, lng) : null;
    return { country, province };
  }, []);

  const globeMaterial = useMemo(
    () => new THREE.MeshToonMaterial({ color: COLORS.ocean, emissive: '#3fa9e0', emissiveIntensity: 0.18 }),
    [],
  );

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keep the latest callbacks reachable from the hand-built bubble DOM elements.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  // Flies to a spot (a photo pin, or the country/province centre), then opens its page.
  const flyTo = useCallback(({ country, province }: GlobeTarget, lat?: number, lng?: number) => {
    const globe = globeRef.current;
    if (!globe || flyingRef.current) return;
    flyingRef.current = true;
    savePov(currentPov());
    globe.controls().autoRotate = false;
    const spot = province ?? country;
    globe.pointOfView({ lat: lat ?? spot.lat, lng: lng ?? spot.lng, altitude: 0.9 }, FLY_MS);
    window.setTimeout(() => openRef.current(country.iso, province?.id ?? null), FLY_MS);
  }, []);
  const flyRef = useRef(flyTo);
  flyRef.current = flyTo;

  const pauseSpin = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = false;
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      if (!flyingRef.current) controls.autoRotate = true;
    }, AUTO_SPIN_RESUME_MS);
  }, []);

  // Zoom-dependent display, toggled directly (no React re-render of the globe).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handleZoom = useCallback((pov: { altitude: number }) => {
    const cl = wrapperRef.current?.classList;
    cl?.toggle('show-capital-names', pov.altitude < CAPITAL_NAMES_ALTITUDE);
    cl?.toggle('show-city-names', pov.altitude < CITY_NAMES_ALTITUDE);
    const zoomedIn = pov.altitude < PROVINCE_ALTITUDE;
    if (zoomedIn !== zoomedInRef.current) {
      zoomedInRef.current = zoomedIn;
      if (landRef.current) landRef.current.provinces.object.visible = zoomedIn;
      applyLiftsRef.current();
      refreshHoverRef.current(); // the pointer may now be over a province instead of its country
    }
    nightRef.current?.setZoom(pov.altitude);
    const clouds = cloudsRef.current;
    if (clouds) {
      clouds.material.opacity = cloudOpacity(pov.altitude);
      clouds.group.visible = clouds.material.opacity > 0.01;
    }
  }, []);

  const handleReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    // The camera never comes closer than 25 units to the surface, so a near plane of 1 (globe.gl uses
    // 0.05) gives ~20x the depth precision: thin stacked layers stop flickering through each other.
    const cam = globe.camera() as THREE.PerspectiveCamera;
    cam.near = 1;
    cam.updateProjectionMatrix();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.enableDamping = true;
    controls.minDistance = R * 1.25;
    controls.maxDistance = R * 5;
    controls.addEventListener('start', pauseSpin);

    const countries = buildLandMesh(COUNTRIES.map((c) => ({ ...c, key: c.iso })), COUNTRY_ALT);
    // Province borders are drawn softer than country borders.
    const provinces = buildLandMesh(PROVINCES.map((p) => ({ ...p, key: p.id })), PROVINCE_ALT, '#6b779c');
    provinces.object.visible = false; // shown by handleZoom once zoomed in
    globe.scene().add(countries.object, provinces.object);
    landRef.current = { countries, provinces };
    const night = buildNightShade();
    night.mesh.visible = viewRef.current === 'daynight';
    globe.scene().add(night.mesh);
    nightRef.current = night;
    setLandReady(true);

    globe.pointOfView(savedPov ?? DEFAULT_POV, 0);
    handleZoom(globe.pointOfView());
    tiltRef.current = installCameraTilt(globe);

    // Lakes belong to the base globe: drawn everywhere, above countries and provinces.
    loadLakes()
      .then((all) => {
        const lakes = buildAllLakes(all);
        globe.scene().add(lakes.group);
        lakesRef.current = lakes;
        applyLiftsRef.current();
      })
      .catch((e) => console.error(e));

    // The default light sits fixed over the North Pole; this "sun" follows the camera from the
    // upper left instead, so every country is lit the same way.
    const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
    globe.lights([new THREE.AmbientLight(0xcccccc, Math.PI), sun]);
    globe.scene().add(sun.target);
    const camera = globe.camera();
    const sunOffset = new THREE.Vector3();

    const { group: clouds, material: cloudMaterial } = makeClouds();
    clouds.name = 'clouds';
    globe.scene().add(clouds);
    cloudsRef.current = { group: clouds, material: cloudMaterial };
    handleZoom(currentPov()); // apply the zoom-dependent cloud fade straight away
    let frame = 0;
    const drift = () => {
      clouds.rotation.y += 0.0006;
      sunOffset.set(-1, 1.2, 0).applyQuaternion(camera.quaternion).multiplyScalar(180);
      sun.position.copy(camera.position).setLength(320).add(sunOffset);
      frame = requestAnimationFrame(drift);
    };
    drift();
    clouds.userData.stop = () => cancelAnimationFrame(frame);
  }, [pauseSpin, handleZoom]);

  useEffect(() => {
    if (nightRef.current) nightRef.current.mesh.visible = view === 'daynight';
    const refresh = () => {
      sunRef.current = sunDirection();
      nightRef.current?.updateSun();
      wrapperRef.current?.querySelectorAll<HTMLElement>('[data-lat]').forEach(markNight);
    };
    refresh();
    if (view !== 'daynight') return;
    const timer = window.setInterval(refresh, SUN_UPDATE_MS);
    return () => window.clearInterval(timer);
  }, [view, landReady, markNight]);

  // Hover: find what's under the pointer from its lat/lng (the merged meshes have no per-region objects).
  useEffect(() => {
    const globe = globeRef.current;
    const tip = tipRef.current;
    if (!globe || !landReady || !tip) return;
    const canvas = globe.renderer().domElement;
    let frame = 0;
    let last: string | null = null;
    let lastHtml = '';
    let pointer: PointerEvent | null = null;
    const refresh = () => {
      const e = pointer;
      if (!e) return;
      const at = globe.toGlobeCoords(e.offsetX, e.offsetY);
      const t = at ? targetAt(at.lat, at.lng) : null;
      const key = t ? (t.province ? `p:${t.province.id}` : `c:${t.country.iso}`) : null;
      if (key !== last) {
        last = key;
        setHovered(key);
        if (t) pauseSpin();
        canvas.style.cursor = t ? 'pointer' : '';
      }
      const html = t ? tooltipRef.current(t) : '';
      if (html !== lastHtml) tip.innerHTML = lastHtml = html;
      tip.style.display = t ? 'block' : 'none';
      tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 16}px)`;
    };
    refreshHoverRef.current = refresh;
    const onMove = (e: PointerEvent) => {
      pointer = e;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      pointer = null;
      last = null;
      setHovered(null);
      tip.style.display = 'none';
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [landReady, pauseSpin, targetAt]);

  useEffect(
    () => () => {
      window.clearTimeout(resumeTimer.current);
      const globe = globeRef.current;
      if (!globe) return;
      if (!flyingRef.current) savePov(currentPov());
      globe.scene().getObjectByName('clouds')?.userData.stop?.();
    },
    [],
  );

  // Cities, place symbols and photo bubbles share globe.gl's single HTML-element layer.
  const markers = useMemo<Marker[]>(() => {
    // Cities appear once their country (or, for USA/Canada/China, their province) is unlocked.
    const visibleCities = ALL_CITIES.filter((m) => (m.province ? shownProvince(m.province) : shownCountry(m.iso)));
    const out: Marker[] = [...visibleCities];
    const bubbles: (Marker & { kind: 'bubble' })[] = [];

    for (const u of unlocked) {
      const country = getCountry(u.iso);
      if (!country) continue;
      for (const p of u.pins) {
        const province = getProvince(p.province) ?? null;
        // A tagged place the globe doesn't show yet gets its own symbol.
        if (!visibleCities.some((c) => Math.hypot(c.lat - p.lat, c.lng - p.lng) < 0.25)) {
          out.push({ kind: 'place', place: p.kind, lat: p.lat, lng: p.lng, name: p.name });
        }
        bubbles.push({
          kind: 'bubble',
          lat: p.lat,
          lng: p.lng,
          target: { country, province },
          count: p.count,
          thumbUrl: p.thumbUrl,
          label: `${p.name || (province ?? country).name}, ${(province ?? country).name}`,
          latestAt: p.latestAt,
        });
      }
      // Photos without a place: one bubble at the centre of their province, or of the country.
      for (const p of u.provinces) {
        const province = getProvince(p.id);
        if (province && p.unplacedCount > 0) {
          bubbles.push({
            kind: 'bubble',
            lat: province.lat,
            lng: province.lng,
            target: { country, province },
            count: p.unplacedCount,
            thumbUrl: p.coverUrl,
            label: `${province.name}, ${country.name}`,
            latestAt: p.unplacedLatestAt ?? '',
          });
        }
      }
      if (u.unplacedCount > 0) {
        bubbles.push({
          kind: 'bubble',
          lat: country.lat,
          lng: country.lng,
          target: { country, province: null },
          count: u.unplacedCount,
          thumbUrl: u.coverUrl,
          label: country.name,
          latestAt: u.unplacedLatestAt ?? '',
        });
      }
    }
    return [...out, ...pickBubbles(bubbles)];
  }, [unlocked, shownCountry, shownProvince]);

  // A stem under each shown bubble, rebuilt when the bubbles change.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !landReady) return;
    const stems = buildStems(markers.filter((m) => m.kind === 'bubble'));
    globe.scene().add(stems);
    return () => {
      globe.scene().remove(stems);
      stems.dispose();
    };
  }, [markers, landReady]);

  // Stable so globe.gl doesn't rebuild every marker on each hover re-render.
  const buildMarker = useCallback(
    (d: object) => {
      const m = d as Marker;
      // The globe positions `el` with its own CSS transform, so animations live on inner elements.
      const el = document.createElement('div');
      el.dataset.lat = String(m.lat);
      el.dataset.lng = String(m.lng);
      if (m.kind === 'city' || m.kind === 'place') {
        const rankClass = m.kind === 'city' && m.rank !== 'city' ? (m.rank === 'capital' ? 'is-capital' : 'is-province-capital') : '';
        el.className = `city-marker ${rankClass}`;
        el.innerHTML = m.kind === 'city' ? cityIconHtml(m.name, m.rank, getCountry(m.iso)?.alpha2) : placeIconHtml(m.name, m.place);
        const label = document.createElement('span');
        label.className = 'city-label';
        label.textContent = m.name;
        el.append(label);
        markNight(el);
        return el;
      }
      el.className = 'photo-bubble-anchor';
      const btn = document.createElement('button');
      btn.className = 'photo-bubble';
      btn.title = `${m.label}: ${m.count} photo${m.count === 1 ? '' : 's'}`;
      btn.innerHTML = `<img src="${m.thumbUrl}" alt="" draggable="false" /><span class="photo-bubble-count">${m.count}</span>`;
      btn.onclick = (e) => {
        e.stopPropagation();
        flyRef.current(m.target, m.lat, m.lng);
      };
      btn.onpointerenter = pauseSpin;
      el.appendChild(btn);
      markNight(el);
      return el;
    },
    [pauseSpin, markNight],
  );

  return (
    <>
      <div ref={wrapperRef} className="globe-wrapper">
        <GlobeGL
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={globeMaterial}
          showAtmosphere
          atmosphereColor="#c9f0ff"
          atmosphereAltitude={0.22}
          onGlobeReady={handleReady}
          showPointerCursor={false}
          onGlobeClick={({ lat, lng }, event) => {
            const t = targetAt(lat, lng);
            if (!t) return;
            const open = t.province ? unlockedProvinces.has(t.province.id) : unlockedCountries.has(t.country.iso);
            if (open) flyTo(t);
            else onLockedClick(t, event.clientX, event.clientY);
          }}
          onZoom={handleZoom}
          htmlElementsData={markers}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={markerAltitude}
          htmlElement={buildMarker}
          htmlElementVisibilityModifier={(el, visible) => {
            el.style.opacity = visible ? '1' : '0';
            // Cities and symbols are decoration: clicks pass through them to the land underneath.
            if (el.classList.contains('photo-bubble-anchor')) el.style.pointerEvents = visible ? 'auto' : 'none';
          }}
        />
      </div>
      {/* Outside the globe's stacking layer, so the tooltip draws above every marker. */}
      <div ref={tipRef} className="globe-tip-floating" />
    </>
  );
}
