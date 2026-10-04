import { useMemo } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { Country } from '../lib/countries';
import type { Province } from '../lib/provinces';

/** A thin line outline of a country (or province) for the page header. */
export default function CountrySilhouette({ country, size = 96 }: { country: Country | Province; size?: number }) {
  const d = useMemo(() => {
    // Rotate to the country first so shapes crossing the date line (Russia, Fiji) stay in one piece.
    const projection = geoMercator()
      .rotate([-country.lng, 0])
      .fitExtent(
        [
          [6, 6],
          [size - 6, size - 6],
        ],
        country.feature,
      );
    return geoPath(projection)(country.feature) ?? '';
  }, [country, size]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}
