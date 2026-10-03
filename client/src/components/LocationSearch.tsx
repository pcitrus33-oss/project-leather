import { useState } from 'react';
import { api, type Location, type PlaceResult } from '../lib/api';
import './LocationSearch.css';

interface Props {
  /** ISO alpha-2 code: results are limited to this country. */
  alpha2?: string;
  onPick: (location: Location) => void;
}

/**
 * Search box for tagging photos with a place (OpenStreetMap). Searches on Enter / button
 * rather than every keystroke, as OpenStreetMap's usage policy asks.
 */
export default function LocationSearch({ alpha2, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await api.searchPlaces(query.trim(), alpha2));
    } catch (e) {
      setError((e as Error).message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="location-search">
      <form
        className="location-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          className="input"
          placeholder="Search a city, landmark or address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="btn btn-yellow" type="submit" disabled={busy || query.trim().length < 2}>
          {busy ? '…' : '🔍'}
        </button>
      </form>

      {error && <div className="location-search-note is-error">😿 {error}</div>}
      {results?.length === 0 && <div className="location-search-note">No places found. Try another spelling?</div>}
      {results && results.length > 0 && (
        <ul className="location-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng},${r.detail}`}>
              <button onClick={() => onPick({ lat: r.lat, lng: r.lng, name: r.name, kind: r.kind })}>
                <b>📍 {r.name}</b>
                <span>{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="location-search-credit">Search by © OpenStreetMap contributors</div>
    </div>
  );
}
