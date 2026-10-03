import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { api, type GlobeView } from '../lib/api';
import { THEMES, type ThemeId } from '../lib/themes';
import ThemePreview from '../components/ThemePreview';
import { DEV, setRevealAll, useRevealAll } from '../lib/devMode';
import './SettingsPage.css';

const GLOBE_VIEWS: { id: GlobeView; name: string; emoji: string; description: string }[] = [
  { id: 'day', name: 'Day', emoji: '☀️', description: 'The whole globe in bright daylight.' },
  {
    id: 'daynight',
    name: 'Day/Night cycle',
    emoji: '🌗',
    description: 'Real-time day and night for right now. Night areas are shaded gray, and places there glow.',
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [defaultTheme, setDefaultTheme] = useState<ThemeId | null>(null);
  const [globeView, setGlobeView] = useState<GlobeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setDefaultTheme(s.defaultTheme);
        setGlobeView(s.globeView);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  const chooseView = async (view: GlobeView) => {
    if (view === globeView) return;
    const previous = globeView;
    setGlobeView(view);
    try {
      await api.saveSettings({ globeView: view });
      setSaved(true);
    } catch (e) {
      setGlobeView(previous);
      setError((e as Error).message);
    }
  };

  const choose = async (theme: ThemeId) => {
    if (theme === defaultTheme) return;
    const previous = defaultTheme;
    setDefaultTheme(theme);
    try {
      await api.saveSettings({ defaultTheme: theme });
      setSaved(true);
    } catch (e) {
      setDefaultTheme(previous);
      setError((e as Error).message);
    }
  };

  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <motion.div
      className="settings-page"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <header className="settings-header">
        <button className="btn" onClick={goBack}>
          ← 🌍 Globe
        </button>
        <h1 className="title settings-title">⚙️ Settings</h1>
      </header>

      {error && <div className="settings-error">😿 {error}</div>}

      <section className="settings-section card">
        <h2 className="title">🌍 Globe view</h2>
        <p className="settings-hint">How the globe on the home page looks.</p>
        <div className="theme-options" role="radiogroup" aria-label="Globe view">
          {GLOBE_VIEWS.map((v) => {
            const selected = v.id === globeView;
            return (
              <button
                key={v.id}
                role="radio"
                aria-checked={selected}
                className={`theme-option ${selected ? 'is-selected' : ''}`}
                onClick={() => chooseView(v.id)}
                disabled={globeView === null}
              >
                <div className={`globe-view-preview is-${v.id}`} aria-hidden="true">
                  <span className="globe-view-ball" />
                </div>
                <span className="theme-option-name">
                  {v.emoji} {v.name}
                  {selected && <span className="theme-option-badge">On</span>}
                </span>
                <span className="theme-option-desc">{v.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section card">
        <h2 className="title">🎨 Default theme</h2>
        <p className="settings-hint">
          Countries you unlock from now on start with this theme. Each country keeps its own theme, and you can change it
          any time from that country’s page with the <b>🎨 Theme</b> button.
        </p>

        <div className="theme-options" role="radiogroup" aria-label="Default theme">
          {THEMES.map((t) => {
            const selected = t.id === defaultTheme;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={selected}
                className={`theme-option ${selected ? 'is-selected' : ''}`}
                onClick={() => choose(t.id)}
                disabled={defaultTheme === null}
              >
                <ThemePreview theme={t.id} />
                <span className="theme-option-name">
                  {t.emoji} {t.name}
                  {selected && <span className="theme-option-badge">Default</span>}
                </span>
                <span className="theme-option-desc">{t.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {DEV && <DeveloperTools />}

      <AnimatePresence>
        {saved && (
          <motion.div
            className="settings-toast chip"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
          >
            ✅ Saved!
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Developer site only: see the whole globe, and fill or empty the sandbox (never the real portfolio). */
function DeveloperTools() {
  const revealAll = useRevealAll();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(true);
    setStatus(`${label}…`);
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus(`😿 ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section card dev-tools">
      <h2 className="title">🛠️ Developer tools</h2>
      <p className="settings-hint">
        This is the <b>Developer site</b> (localhost:5174). It has its own sandbox photos, so nothing here touches your real
        portfolio on localhost:5173.
      </p>
      <label className="dev-toggle">
        <input type="checkbox" checked={revealAll} onChange={(e) => setRevealAll(e.target.checked)} />
        <span>
          <b>Show everything</b>: draw every country and province as unlocked, with all cities and capitals. (Display only.)
        </span>
      </label>
      <div className="dev-actions">
        <button
          className="btn btn-mint"
          disabled={busy}
          onClick={() => run('Adding sample photos', async () => `✅ Added ${(await api.dev.seed()).added} sample photos`)}
        >
          🧪 Add sample photos
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            confirm('Delete every photo in the developer sandbox?') &&
            run('Clearing the sandbox', async () => (await api.dev.reset(), '🧹 Sandbox cleared'))
          }
        >
          🧹 Clear sandbox
        </button>
      </div>
      {status && <div className="dev-status">{status}</div>}
    </section>
  );
}
