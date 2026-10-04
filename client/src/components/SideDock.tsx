import { useEffect, useRef, useState, type ReactNode } from 'react';
import './SideDock.css';

const HIDE_DELAY_MS = 700;

/**
 * A menu standing on the right edge like a taskbar: tucked away off-screen with only a tab showing,
 * sliding out when the pointer comes near (or the tab is clicked, for touch screens). `pinned` keeps it out.
 */
export default function SideDock({ pinned, label, children }: { pinned: boolean; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const isOpen = open || pinned;

  return (
    <nav
      className={`side-dock ${isOpen ? 'is-open' : ''}`}
      onPointerEnter={show}
      onPointerLeave={hideSoon}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
    >
      <button
        className="side-dock-tab"
        onClick={() => (isOpen ? setOpen(false) : show())}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Hide menu' : 'Show menu'}
      >
        {isOpen ? '›' : '‹'}
      </button>
      <div className="side-dock-panel card">{children}</div>
    </nav>
  );
}
