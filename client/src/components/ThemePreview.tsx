import type { ThemeId } from '../lib/themes';
import './ThemePreview.css';

/** Tiny illustration of a theme for the settings page and theme picker. */
export default function ThemePreview({ theme }: { theme: ThemeId }) {
  if (theme === 'airplane') {
    return (
      <div className="theme-preview is-airplane" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="tp-window">
            <span className="tp-pane" />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="theme-preview is-classic" aria-hidden="true">
      {[-4, 2, -2].map((r, i) => (
        <span key={i} className="tp-polaroid" style={{ rotate: `${r}deg` }}>
          <span className="tp-photo" />
        </span>
      ))}
    </div>
  );
}
