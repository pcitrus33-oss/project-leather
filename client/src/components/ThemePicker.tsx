import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { THEMES, getTheme, type ThemeId } from '../lib/themes';
import ThemePreview from './ThemePreview';

interface Props {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
  disabled?: boolean;
}

/** "Theme" button with a drop-down of theme cards, for one country's page. */
export default function ThemePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={rootRef}>
      <button className="btn" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open}>
        {getTheme(value).name}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="theme-picker-menu card"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            role="radiogroup"
            aria-label="Theme for this country"
          >
            <div className="theme-picker-title">Theme for this country</div>
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={t.id === value}
                className={`theme-option ${t.id === value ? 'is-selected' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (t.id !== value) onChange(t.id);
                }}
              >
                <ThemePreview theme={t.id} />
                <span className="theme-option-name">
                  {t.name}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
