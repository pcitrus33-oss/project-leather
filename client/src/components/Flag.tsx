import type { Country } from '../lib/countries';

export default function Flag({ country }: { country: Country }) {
  if (!country.alpha2) return <span className="flag">🏳️</span>;
  return <span className={`fi fi-${country.alpha2.toLowerCase()} flag`} role="img" aria-label={`${country.name} flag`} />;
}
