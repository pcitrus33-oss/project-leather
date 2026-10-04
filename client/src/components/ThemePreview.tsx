import type { ThemeId } from '../lib/themes';
import './ThemePreview.css';

/** Tiny illustration of a theme for the settings page and theme picker. */
export default function ThemePreview({ theme }: { theme: ThemeId }) {
  // Classic: two justified rows of photos at different shapes.
  return (
    <div className={`theme-preview is-${theme}`} aria-hidden="true">
      {[
        [3, 2, 4],
        [2, 4, 3],
      ].map((row, i) => (
        <span key={i} className="tp-row">
          {row.map((r, j) => (
            <span key={j} className="tp-photo" style={{ flexGrow: r }} />
          ))}
        </span>
      ))}
    </div>
  );
}
