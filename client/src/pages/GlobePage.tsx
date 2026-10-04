import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import Globe, { type GlobeTarget } from '../components/Globe';
import UnlockModal from '../components/UnlockModal';
import { api, type GlobeView, type UnlockedCountry, type UploadResult } from '../lib/api';
import { celebrate } from '../lib/celebrate';
import Flag from '../components/Flag';
import PlaneIcon from '../components/PlaneIcon';
import SideDock from '../components/SideDock';
import CountriesSheet from '../components/CountriesSheet';
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
  const [view, setView] = useState<GlobeView>('day');
  // In the URL (replacing, not pushing), so Back from a country opened from the list returns to the list.
  const [params, setParams] = useSearchParams();
  const listOpen = params.has('countries');
  const setListOpen = useCallback((open: boolean) => setParams(open ? { countries: '' } : {}, { replace: true }), [setParams]);

  useEffect(() => {
    api
      .settings()
      .then((s) => setView(s.globeView))
      .catch(() => {}); // the globe still works in the default view
  }, []);

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
        view={view}
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
      </header>

      {/* Kept out while there's nothing on the globe yet, so "Unlock a country" is easy to find. */}
      <SideDock pinned={loaded && unlocked.length === 0} label="Globe menu">
        <div className="globe-dock-stat">
          <b>{unlocked.length}</b>
          <span>{unlocked.length === 1 ? 'Country' : 'Countries'} visited</span>
        </div>
        <div className="globe-dock-stat">
          <b>{photoTotal}</b>
          <span>{photoTotal === 1 ? 'Photo' : 'Photos'} uploaded</span>
        </div>
        <button className="btn btn-pink" onClick={() => setModal({ open: true })}>
          Unlock a country
        </button>
        <Link to="/settings" className="btn">
          Settings
        </Link>
        {DEV && (
          <Link to="/settings" className="chip dev-chip" title="Developer site: sandbox data, see Settings for tools">
            Developer site{revealAll ? ' · all shown' : ''}
          </Link>
        )}
      </SideDock>

      <CountriesSheet unlocked={unlocked} open={listOpen} onOpenChange={setListOpen} />

      {loadError && <div className="globe-alert chip cartoon">😿 Can’t reach the photo server — is it running?</div>}

      <AnimatePresence>
        {loaded && !loadError && unlocked.length === 0 && !modal.open && (
          <motion.div
            className="globe-hint card cartoon"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
          >
            Your globe is all gray! Unlock your first country from the menu 👉
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lockedPopup && (
          <motion.div
            className="locked-popup card cartoon"
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
