import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import Globe from '../components/Globe';
import UnlockModal from '../components/UnlockModal';
import { api, type UnlockedCountry, type UploadResult } from '../lib/api';
import type { Country } from '../lib/countries';
import { celebrate } from '../lib/celebrate';
import Flag from '../components/Flag';
import './GlobePage.css';

export default function GlobePage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState<UnlockedCountry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; iso?: string }>({ open: false });
  const [lockedPopup, setLockedPopup] = useState<{ country: Country; x: number; y: number } | null>(null);

  const refresh = useCallback(
    () =>
      api
        .countries()
        .then((c) => {
          setUnlocked(c);
          setLoadError(null);
        })
        .catch((e: Error) => setLoadError(e.message))
        .finally(() => setLoaded(true)),
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unlockedIsos = useMemo(() => new Set(unlocked.map((u) => u.iso)), [unlocked]);
  const photoTotal = unlocked.reduce((n, u) => n + u.count, 0);

  const handleUploaded = (_iso: string, result: UploadResult) => {
    setModal({ open: false });
    refresh();
    if (result.newlyUnlocked) celebrate();
  };

  return (
    <div className="globe-page" onClick={() => setLockedPopup(null)}>
      <Globe
        unlocked={unlocked}
        onOpenCountry={(iso) => navigate(`/country/${iso}`)}
        onLockedClick={(country, x, y) => setTimeout(() => setLockedPopup({ country, x, y }))}
      />

      <header className="globe-header">
        <motion.h1
          className="title globe-logo"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          <span className="globe-logo-icon">🌍</span> My Globe
        </motion.h1>
        <motion.div
          className="globe-stats"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
        >
          <span className="chip">🗺️ {unlocked.length} {unlocked.length === 1 ? 'country' : 'countries'}</span>
          <span className="chip">📸 {photoTotal} photos</span>
        </motion.div>
      </header>

      {loadError && <div className="globe-alert chip">😿 Can’t reach the photo server — is it running?</div>}

      <AnimatePresence>
        {loaded && !loadError && unlocked.length === 0 && !modal.open && (
          <motion.div
            className="globe-hint card"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
          >
            Your globe is all gray! Unlock your first country 👇
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="globe-actions"
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.2 }}
      >
        <button className="btn btn-pink btn-big" onClick={() => setModal({ open: true })}>
          🔓 Unlock a country
        </button>
      </motion.div>

      <AnimatePresence>
        {lockedPopup && (
          <motion.div
            className="locked-popup card"
            style={{
              left: Math.min(lockedPopup.x, window.innerWidth - 240),
              top: Math.min(lockedPopup.y + 12, window.innerHeight - 150),
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <b>
              <Flag country={lockedPopup.country} /> {lockedPopup.country.name}
            </b>
            <span>Not unlocked yet!</span>
            <button
              className="btn btn-yellow"
              onClick={() => {
                setModal({ open: true, iso: lockedPopup.country.iso });
                setLockedPopup(null);
              }}
            >
              📸 Add photos
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <UnlockModal
        open={modal.open}
        iso={modal.iso}
        unlockedIsos={unlockedIsos}
        onClose={() => setModal({ open: false })}
        onUploaded={handleUploaded}
      />
    </div>
  );
}
