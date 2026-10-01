/** Cartoon side-view plane used next to the site name (placeholder logo). */
export default function PlaneIcon({ size = 64 }: { size?: number }) {
  return (
    <svg
      className="plane-icon"
      width={size}
      height={size * 0.6}
      viewBox="0 0 120 72"
      aria-hidden="true"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* speed puffs */}
      <g fill="white" stroke="var(--ink)" strokeWidth="2.5">
        <circle cx="8" cy="44" r="4" />
        <circle cx="16" cy="50" r="3" />
      </g>
      {/* far wing */}
      <path d="M62 30 L78 30 L92 12 L84 12 Z" fill="#ffb3d4" stroke="var(--ink)" strokeWidth="3" />
      {/* tail fin */}
      <path d="M30 32 L20 10 L33 10 L46 30 Z" fill="var(--pink)" stroke="var(--ink)" strokeWidth="3" />
      {/* body */}
      <path
        d="M24 40 Q24 30 38 30 H92 Q114 30 116 42 Q114 52 92 52 H38 Q24 52 24 40 Z"
        fill="white"
        stroke="var(--ink)"
        strokeWidth="3"
      />
      {/* cheek stripe */}
      <path d="M30 46 H108" stroke="var(--pink)" strokeWidth="3" />
      {/* windows */}
      <g fill="var(--ocean)" stroke="var(--ink)" strokeWidth="2">
        <circle cx="48" cy="39" r="3.2" />
        <circle cx="60" cy="39" r="3.2" />
        <circle cx="72" cy="39" r="3.2" />
        <circle cx="84" cy="39" r="3.2" />
      </g>
      {/* cockpit */}
      <path d="M98 33 Q108 34 112 40 H99 Z" fill="var(--ocean)" stroke="var(--ink)" strokeWidth="2.5" />
      {/* near wing */}
      <path d="M58 46 L78 46 L66 66 L54 66 Z" fill="var(--pink)" stroke="var(--ink)" strokeWidth="3" />
    </svg>
  );
}
