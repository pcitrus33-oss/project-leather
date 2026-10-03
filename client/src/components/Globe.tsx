import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeGL, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { COUNTRIES, flagHtml, getCountry, type Country } from '../lib/countries';
import cities from '../data/cities.json';
import { buildTerrain, loadElevation } from '../lib/terrain';
import type { UnlockedCountry } from '../lib/api';
import './Globe.css';

interface Props {
  unlocked: UnlockedCountry[];
  /** A white (unlocked) country or its photo bubble was clicked; the camera has already flown there. */
  onOpenCountry: (iso: string) => void;
  /** A gray (locked) country was clicked at screen position x/y. */
  onLockedClick: (country: Country, x: number, y: number) => void;
}

const COLORS = {
  ocean: '#8fd7f7',
  locked: '#c8ced8',
  lockedSide: '#a3abba',
  // Unlocked countries are covered by terrain; their flat cap matches its lowland colour.
  unlocked: '#a6e3a1',
  unlockedSide: '#7cc47a',
  hoverLocked: '#ffc2dd',
  hoverUnlocked: '#fff3c4',
  outline: '#2b3a67',
};

// Narrow (phone) screens need the camera further out to fit the whole globe.
type Marker =
  | { kind: 'city'; iso: string; lat: number; lng: number; name: string; capital: boolean }
  | { kind: 'bubble'; lat: number; lng: number; country: Country; count: number; coverUrl: string };

const CITY_MARKERS = cities.map((c): Marker & { kind: 'city' } => ({
  kind: 'city',
  iso: c.iso,
  lat: c.lat,
  lng: c.lng,
  name: c.name,
  capital: 'capital' in c && !!c.capital,
}));
// Capital names appear first; other city names only once zoomed closer, to limit overlap.
const CAPITAL_NAMES_ALTITUDE = 1.3;
const CITY_NAMES_ALTITUDE = 0.7;
// Cities sit just above raised (unlocked) countries; bubbles float higher.
const markerAltitude = (d: object) => ((d as Marker).kind === 'city' ? 0.025 : 0.05);

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

function makeClouds(radius: number) {
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
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((90 - lng) * Math.PI) / 180;
    const r = radius * 1.17;
    cloud.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    cloud.lookAt(0, 0, 0);
    group.add(cloud);
  }
  return group;
}

export default function Globe({ unlocked, onOpenCountry, onLockedClick }: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [hovered, setHovered] = useState<Country | null>(null);
  const flyingRef = useRef(false);
  const resumeTimer = useRef<number | undefined>(undefined);

  const unlockedSet = useMemo(() => new Set(unlocked.map((u) => u.iso)), [unlocked]);
  const isUnlocked = useCallback((c: Country) => unlockedSet.has(c.iso), [unlockedSet]);

  // Relief models for unlocked countries, built once per country after the elevation map loads.
  const [terrain, setTerrain] = useState<{ country: Country; obj: THREE.Object3D }[]>([]);
  const terrainCache = useRef(new Map<string, THREE.Object3D>());
  useEffect(() => {
    let cancelled = false;
    const countries = unlocked.flatMap((u) => getCountry(u.iso) ?? []);
    for (const iso of terrainCache.current.keys()) if (!unlockedSet.has(iso)) terrainCache.current.delete(iso);
    if (countries.length === 0) return setTerrain([]);
    loadElevation()
      .then((elevation) => {
        if (cancelled) return;
        setTerrain(
          countries.map((country) => {
            let obj = terrainCache.current.get(country.iso);
            if (!obj) terrainCache.current.set(country.iso, (obj = buildTerrain(country, elevation)));
            return { country, obj };
          }),
        );
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [unlocked, unlockedSet]);

  const tooltip = useCallback(
    (c: Country) => {
      const u = unlocked.find((x) => x.iso === c.iso);
      const sub = u ? `${u.count} photo${u.count === 1 ? '' : 's'} · click to open` : 'locked · click to unlock';
      return `<div class="globe-tip"><b>${flagHtml(c)} ${c.name}</b><span>${sub}</span></div>`;
    },
    [unlocked],
  );

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
  const openRef = useRef(onOpenCountry);
  openRef.current = onOpenCountry;

  const flyTo = useCallback((country: Country) => {
    const globe = globeRef.current;
    if (!globe || flyingRef.current) return;
    flyingRef.current = true;
    savePov(globe.pointOfView());
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: country.lat, lng: country.lng, altitude: 0.9 }, FLY_MS);
    window.setTimeout(() => openRef.current(country.iso), FLY_MS);
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

  // City names fade in when zoomed close; toggled on the DOM directly to avoid re-rendering the globe.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handleZoom = useCallback((pov: { altitude: number }) => {
    const cl = wrapperRef.current?.classList;
    cl?.toggle('show-capital-names', pov.altitude < CAPITAL_NAMES_ALTITUDE);
    cl?.toggle('show-city-names', pov.altitude < CITY_NAMES_ALTITUDE);
  }, []);

  const handleReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.enableDamping = true;
    controls.minDistance = globe.getGlobeRadius() * 1.25;
    controls.maxDistance = globe.getGlobeRadius() * 5;
    controls.addEventListener('start', pauseSpin);
    globe.pointOfView(savedPov ?? DEFAULT_POV, 0);
    handleZoom(globe.pointOfView());

    const clouds = makeClouds(globe.getGlobeRadius());
    clouds.name = 'clouds';
    globe.scene().add(clouds);
    let frame = 0;
    const drift = () => {
      clouds.rotation.y += 0.0006;
      frame = requestAnimationFrame(drift);
    };
    drift();
    clouds.userData.stop = () => cancelAnimationFrame(frame);
  }, [pauseSpin, handleZoom]);

  useEffect(
    () => () => {
      window.clearTimeout(resumeTimer.current);
      const globe = globeRef.current;
      if (!globe) return;
      if (!flyingRef.current) savePov(globe.pointOfView());
      globe.scene().getObjectByName('clouds')?.userData.stop?.();
    },
    [],
  );

  // Cities and photo bubbles share globe.gl's single HTML-element layer.
  const markers = useMemo<Marker[]>(
    () => [
      // Cities only appear once their country is unlocked.
      ...CITY_MARKERS.filter((m) => unlockedSet.has(m.iso)),
      ...unlocked.flatMap((u): Marker[] => {
        const c = getCountry(u.iso);
        return c ? [{ kind: 'bubble', lat: c.lat, lng: c.lng, country: c, count: u.count, coverUrl: u.coverUrl }] : [];
      }),
    ],
    [unlocked, unlockedSet],
  );

  // Stable so globe.gl doesn't rebuild ~450 elements on every hover re-render.
  const buildMarker = useCallback(
    (d: object) => {
      const m = d as Marker;
      // The globe positions `el` with its own CSS transform, so animations live on inner elements.
      const el = document.createElement('div');
      if (m.kind === 'city') {
        el.className = `city-marker ${m.capital ? 'is-capital' : ''}`;
        const dot = document.createElement('span');
        dot.className = 'city-dot';
        dot.textContent = m.capital ? '★' : '';
        const label = document.createElement('span');
        label.className = 'city-label';
        label.textContent = m.name;
        el.append(dot, label);
        return el;
      }
      el.className = 'photo-bubble-anchor';
      const btn = document.createElement('button');
      btn.className = 'photo-bubble';
      btn.title = `${m.country.name} — ${m.count} photo${m.count === 1 ? '' : 's'}`;
      btn.innerHTML = `<img src="${m.coverUrl}" alt="" draggable="false" /><span class="photo-bubble-count">${m.count}</span>`;
      btn.style.animationDelay = `${Math.random() * -3}s`;
      btn.onclick = (e) => {
        e.stopPropagation();
        flyRef.current(m.country);
      };
      btn.onpointerenter = pauseSpin;
      el.appendChild(btn);
      return el;
    },
    [pauseSpin],
  );

  return (
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
        polygonsData={COUNTRIES}
        // The library's own GeoJSON typing is too narrow for MultiPolygons.
        polygonGeoJsonGeometry={(d) => (d as Country).feature.geometry as never}
        polygonCapColor={(d) => {
          const c = d as Country;
          if (c === hovered) return isUnlocked(c) ? COLORS.hoverUnlocked : COLORS.hoverLocked;
          return isUnlocked(c) ? COLORS.unlocked : COLORS.locked;
        }}
        polygonSideColor={(d) => (isUnlocked(d as Country) ? COLORS.unlockedSide : COLORS.lockedSide)}
        polygonStrokeColor={() => COLORS.outline}
        polygonAltitude={(d) => ((d as Country) === hovered && !isUnlocked(d as Country) ? 0.04 : 0.007)}
        polygonsTransitionDuration={250}
        polygonLabel={(d) => tooltip(d as Country)}
        onPolygonHover={(d) => {
          setHovered((d as Country) ?? null);
          if (d) pauseSpin();
        }}
        onPolygonClick={(d, event) => {
          const c = d as Country;
          if (isUnlocked(c)) flyTo(c);
          else onLockedClick(c, event.clientX, event.clientY);
        }}
        customLayerData={terrain}
        customThreeObject={(d) => (d as (typeof terrain)[number]).obj}
        customLayerLabel={(d) => tooltip((d as (typeof terrain)[number]).country)}
        onCustomLayerHover={(d) => {
          if (d) pauseSpin();
        }}
        onCustomLayerClick={(d) => flyTo((d as (typeof terrain)[number]).country)}
        onZoom={handleZoom}
        htmlElementsData={markers}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={markerAltitude}
        htmlElement={buildMarker}
        htmlElementVisibilityModifier={(el, visible) => {
          el.style.opacity = visible ? '1' : '0';
          // Cities are decoration: clicks pass through them to the country underneath.
          if (el.classList.contains('photo-bubble-anchor')) el.style.pointerEvents = visible ? 'auto' : 'none';
        }}
      />
    </div>
  );
}
