import { useMemo } from 'react';
import { geoArea, geoBounds, geoContains, geoMercator, geoPath } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import cities from '../data/cities.json';
import type { Country } from '../lib/countries';
import type { Province } from '../lib/provinces';

const CAPITALS = new Map((cities as { iso: string; lat: number; lng: number; capital?: boolean }[]).filter((c) => c.capital).map((c) => [c.iso, [c.lng, c.lat] as [number, number]]));
/** Land this close to the capital's landmass (or to land already kept) still counts as the homeland. */
const NEAR_KM = 300;

/** Gap in km between two [[west, south], [east, north]] boxes; `east < west` means the box crosses the date line. */
function boxGapKm([[aw, as], [ae, an]]: number[][], [[bw, bs], [be, bn]]: number[][]) {
  if (ae < aw) ae += 360;
  if (be < bw) be += 360;
  const lngGap = Math.min(...[-360, 0, 360].map((k) => Math.max(0, bw + k - ae, aw - (be + k))));
  const latGap = Math.max(0, bs - an, as - bn);
  const cos = Math.cos((((as + an + bs + bn) / 4) * Math.PI) / 180);
  return Math.hypot(latGap * 111, lngGap * 111 * cos);
}

/**
 * Just the land connected to the capital, plus islands near it (chained, so Indonesia stays whole), so
 * far-off territories like French Guiana or Hawaii don't shrink the outline to a dot. Provinces are left whole.
 */
export function homeland(place: Country | Province): Feature<Polygon | MultiPolygon> {
  const g = place.feature.geometry;
  const capital = 'id' in place ? undefined : CAPITALS.get(place.iso);
  if (g.type === 'Polygon' || !capital) return place.feature;
  const parts = g.coordinates.map((coordinates) => {
    const polygon: Polygon = { type: 'Polygon', coordinates };
    return { coordinates, polygon, area: geoArea(polygon), box: geoBounds(polygon) as unknown as number[][] };
  });
  const total = parts.reduce((s, p) => s + p.area, 0);
  const start = parts.find((p) => geoContains(p.polygon, capital)) ?? parts.reduce((a, b) => (b.area > a.area ? b : a));
  // A landmass with a quarter of the country is part of it however far away (Malaysian Borneo).
  const kept = parts.filter((p) => p === start || p.area >= total / 4);
  let rest = parts.filter((p) => !kept.includes(p));
  for (let i = 0; i < kept.length; i++) {
    const near = rest.filter((p) => boxGapKm(kept[i].box, p.box) <= NEAR_KM);
    kept.push(...near);
    rest = rest.filter((p) => !near.includes(p));
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: kept.map((p) => p.coordinates) } };
}

/** A thin line outline of a country (or province) for the page header. */
export default function CountrySilhouette({ country, size = 96 }: { country: Country | Province; size?: number }) {
  const d = useMemo(() => {
    const feature = homeland(country);
    // Rotate to the country first so shapes crossing the date line (Russia, Fiji) stay in one piece.
    const projection = geoMercator()
      .rotate([-country.lng, 0])
      .fitExtent(
        [
          [6, 6],
          [size - 6, size - 6],
        ],
        feature,
      );
    return geoPath(projection)(feature) ?? '';
  }, [country, size]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}
