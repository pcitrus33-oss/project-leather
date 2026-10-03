import { geoArea, geoCentroid } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import data from '../data/provinces.json';

/** A state/province of the USA, Canada or China (scripts/build-provinces.mjs). */
export interface Province {
  /** ISO 3166-2 code, e.g. "CA-ON". */
  id: string;
  /** Country (ISO alpha-3). */
  iso: string;
  name: string;
  /** "State", "Province", "Territory", "Autonomous region"… */
  type: string;
  capital: { name: string; lat: number; lng: number };
  feature: Feature<MultiPolygon>;
  /** Where its photo bubble sits: centre of its largest landmass. */
  lat: number;
  lng: number;
}

type Raw = { id: string; iso: string; name: string; type: string; capital: Province['capital']; polygons: number[][][][] };

function mainLandmass(polygons: number[][][][]) {
  const parts = polygons.map((coordinates): Feature<Polygon> => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }));
  return parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
}

export const PROVINCES: Province[] = (data as Raw[]).map((p) => {
  const [lng, lat] = geoCentroid(mainLandmass(p.polygons));
  return {
    id: p.id,
    iso: p.iso,
    name: p.name,
    type: p.type,
    capital: p.capital,
    feature: { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: p.polygons } },
    lat,
    lng,
  };
});

const BY_ID = new Map(PROVINCES.map((p) => [p.id, p]));

export const getProvince = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined);

/** Countries split into provinces: USA, Canada, China. */
export const hasProvinces = (iso: string | undefined) => !!iso && PROVINCES.some((p) => p.iso === iso);

export const provincesOf = (iso: string) => PROVINCES.filter((p) => p.iso === iso).sort((a, b) => a.name.localeCompare(b.name));

/** "province"/"state" wording for a country's subdivisions. */
export const provinceWord = (iso: string) => (iso === 'USA' ? 'state' : 'province');
