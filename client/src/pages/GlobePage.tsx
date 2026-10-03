import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import Globe, { type GlobeTarget } from '../components/Globe';
import UnlockModal from '../components/UnlockModal';
import { api, type GlobeView, type UnlockedCountry, type UploadResult } from '../lib/api';
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
  const [view, setView] = useState<GlobeView>('day');

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

      <Dock
        // Keep it out while there's nothing on the globe yet, so "Unlock a country" is easy to find.
        pinned={loaded && unlocked.length === 0}
        countries={unlocked.length}
        photos={photoTotal}
        onUnlock={() => setModal({ open: true })}
        revealAll={revealAll}
      />

      {loadError && <div className="globe-alert chip">😿 Can’t reach the photo server — is it running?</div>}

      <AnimatePresence>
        {loaded && !loadError && unlocked.length === 0 && !modal.open && (
          <motion.div
            className="globe-hint card"
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

const DOCK_HIDE_DELAY_MS = 700;

/**
 * The globe's menu, like a taskbar standing on the right edge: tucked away off-screen with only a tab
 * showing, and sliding out when the pointer comes near (or the tab is clicked, for touch screens).
 */
function Dock({
  pinned,
  countries,
  photos,
  onUnlock,
  revealAll,
}: {
  pinned: boolean;
  countries: number;
  photos: number;
  onUnlock: () => void;
  revealAll: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), DOCK_HIDE_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const isOpen = open || pinned;

  return (
    <nav
      className={`globe-dock ${isOpen ? 'is-open' : ''}`}
      onPointerEnter={show}
      onPointerLeave={hideSoon}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Globe menu"
    >
      <button
        className="globe-dock-tab"
        onClick={() => (isOpen ? setOpen(false) : show())}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Hide menu' : 'Show menu'}
      >
        {isOpen ? '›' : '‹'}
      </button>
      <div className="globe-dock-panel card">
        <div className="globe-dock-stat">
          <b>{countries}</b>
          <span>🗺️ {countries === 1 ? 'Country' : 'Countries'} visited</span>
        </div>
        <div className="globe-dock-stat">
          <b>{photos}</b>
          <span>📸 {photos === 1 ? 'Photo' : 'Photos'} uploaded</span>
        </div>
        <button className="btn btn-pink" onClick={onUnlock}>
          🔓 Unlock a country
        </button>
        <Link to="/settings" className="btn">
          ⚙️ Settings
        </Link>
        {DEV && (
          <Link to="/settings" className="chip dev-chip" title="Developer site: sandbox data, see Settings for tools">
            🛠️ Developer{revealAll ? ' · all shown' : ''}
          </Link>
        )}
      </div>
    </nav>
  );
}
