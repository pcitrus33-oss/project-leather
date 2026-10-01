import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../lib/api';
import { THEMES, type ThemeId } from '../lib/themes';
import ThemePreview from '../components/ThemePreview';
import './SettingsPage.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [defaultTheme, setDefaultTheme] = useState<ThemeId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((s) => setDefaultTheme(s.defaultTheme))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);

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
