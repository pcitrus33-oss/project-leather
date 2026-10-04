import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import type { UnlockedCountry } from '../lib/api';
import { getCountry } from '../lib/countries';
import { hasProvinces, provinceWord } from '../lib/provinces';
import Flag from './Flag';
import PlaceRow from './PlaceRow';
import './CountriesSheet.css';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Every visited country as a single-column list, for finding photos without the globe. A tab at the
 * bottom of the screen pulls it up (click, or swipe up); its handle pulls it back down to the globe.
 * Already open on arrival (Back from a country), it shows without sliding in again.
 */
export default function CountriesSheet({
  unlocked,
  open,
  onOpenChange,
}: {
  unlocked: UnlockedCountry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const drag = useDragControls();
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () =>
      unlocked
        .flatMap((u) => {
          const country = getCountry(u.iso);
          return country ? [{ ...u, country }] : [];
        })
        .sort((a, b) => a.country.name.localeCompare(b.country.name)),
    [unlocked],
  );
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.country.name.toLowerCase().includes(q)) : rows;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!rows.length) return null;

  return (
    <>
      <AnimatePresence initial={false}>
        {!open && (
          <motion.button
            className="countries-tab"
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => onOpenChange(true)}
            onPanEnd={(_, info) => info.offset.y < -30 && onOpenChange(true)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="countries-grip" aria-hidden="true" />
            My countries · {rows.length}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {open && (
          <motion.section
            className="countries-sheet card"
            aria-label="Countries visited"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && onOpenChange(false)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="countries-sheet-handle"
              onPointerDown={(e) => drag.start(e)}
              onClick={() => onOpenChange(false)}
              aria-label="Back to the globe"
            >
              <span className="countries-grip" aria-hidden="true" />
              Pull down for the globe
            </button>
            <div className="countries-sheet-head">
              <h2 className="title">Countries visited</h2>
              <input
                className="input"
                type="search"
                placeholder="Find a country…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="countries-sheet-list">
              {shown.map((r) => (
                <li key={r.iso}>
                  <PlaceRow
                    imageUrl={r.coverUrl}
                    title={
                      <>
                        <Flag country={r.country} /> {r.country.name}
                      </>
                    }
                    sub={
                      hasProvinces(r.iso) && r.provinces.length
                        ? `${plural(r.count, 'photo')} · ${plural(r.provinces.length, provinceWord(r.iso))}`
                        : plural(r.count, 'photo')
                    }
                    onClick={() => navigate(`/country/${r.iso}`)}
                  />
                </li>
              ))}
              {!shown.length && <li className="countries-sheet-empty">No visited country matches “{query.trim()}”.</li>}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
