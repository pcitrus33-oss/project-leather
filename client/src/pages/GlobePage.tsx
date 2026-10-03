import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import Globe, { type GlobeTarget } from '../components/Globe';
import UnlockModal from '../components/UnlockModal';
import { api, type UnlockedCountry, type UploadResult } from '../lib/api';
import { celebrate } from '../lib/celebrate';
import Flag from '../components/Flag';
import PlaneIcon from '../components/PlaneIcon';
import { DEV, useRevealAll } from '../lib/devMode';
import './GlobePage.css';

export default function GlobePage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState<UnlockedCountry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; iso?: string; province?: string }>({ open: false });
  const [lockedPopup, setLockedPopup] = useState<{ target: GlobeTarget; x: number; y: number } | null>(null);
  const revealAll = useRevealAll();

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
  const unlockedProvinces = useMemo(() => new Set(unlocked.flatMap((u) => u.provinces.map((p) => p.id))), [unlocked]);
  const photoTotal = unlocked.reduce((n, u) => n + u.count, 0);

  const handleUploaded = (_iso: string, result: UploadResult) => {
    setModal({ open: false });
    refresh();
    if (result.newlyUnlocked) celebrate();
  };

  return (
    // Close on pointer-down: the globe reports clicks on pointer-up, so a new popup opens after this.
    <div className="globe-page" onPointerDown={() => setLockedPopup(null)}>
      <Globe
        unlocked={unlocked}
        revealAll={revealAll}
        onOpen={(iso, province) => navigate(province ? `/country/${iso}/${province}` : `/country/${iso}`)}
        onLockedClick={(target, x, y) => setLockedPopup({ target, x, y })}
      />

      <header className="globe-header">
        <motion.h1
          className="title globe-logo"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          Project Leather
          <span className="globe-logo-icon">
            <PlaneIcon />
          </span>
        </motion.h1>
        <motion.div
          className="globe-stats"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
        >
          <span className="chip">🗺️ {unlocked.length} {unlocked.length === 1 ? 'country' : 'countries'}</span>
          <span className="chip">📸 {photoTotal} photos</span>
          {DEV && (
            <Link to="/settings" className="chip dev-chip" title="Developer site: sandbox data, see Settings for tools">
              🛠️ Developer{revealAll ? ' · showing everything' : ''}
            </Link>
          )}
          <Link to="/settings" className="btn btn-icon" title="Settings" aria-label="Settings">
            ⚙️
          </Link>
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
            onPointerDown={(e) => e.stopPropagation()}
          >
            <b>
              <Flag country={lockedPopup.target.country} /> {(lockedPopup.target.province ?? lockedPopup.target.country).name}
            </b>
            <span>
              {lockedPopup.target.province ? `${lockedPopup.target.country.name} · ` : ''}Not unlocked yet!
            </span>
            <button
              className="btn btn-yellow"
              onClick={() => {
                setModal({ open: true, iso: lockedPopup.target.country.iso, province: lockedPopup.target.province?.id });
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
        province={modal.province}
        unlockedIsos={unlockedIsos}
        unlockedProvinces={unlockedProvinces}
        onClose={() => setModal({ open: false })}
        onUploaded={handleUploaded}
      />
    </div>
  );
}
