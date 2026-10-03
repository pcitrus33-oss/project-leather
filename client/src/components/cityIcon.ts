// Cartoon skyscraper icons for city markers on the globe (HTML strings: the globe builds marker DOM by hand).

const INK = '#2b3a67';
const BODY_COLORS = ['#b9a6ff', '#8fd7f7', '#ffb3d4', '#ffd36e', '#7ee0c3'];
const WINDOW = '#fff7cc';

/** Stable small number from a string, so each city always gets the same look. */
function seed(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** A grid of lit windows inside a box. */
function windows(x: number, y: number, cols: number, rows: number, w: number, h: number) {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(`<rect x="${x + c * (w + 2)}" y="${y + r * (h + 2.2)}" width="${w}" height="${h}" rx="0.5" fill="${WINDOW}" stroke="none" />`);
    }
  }
  return out.join('');
}

const box = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${fill}" />`;

/** Three city tower shapes (viewBox 0 0 20 34, base at the bottom). */
const TOWERS: ((fill: string) => string)[] = [
  // Classic tower with an antenna
  (f) =>
    `<line x1="10" y1="1" x2="10" y2="6" />${box(7, 5, 6, 4, f)}${box(4, 8.5, 12, 24, f)}${windows(6.3, 11, 2, 6, 3, 1.8)}`,
  // Stepped tower
  (f) => `${box(6, 5, 8, 10, f)}${box(3, 13, 14, 19.5, f)}${windows(8, 7.5, 2, 2, 1.8, 1.6)}${windows(5.5, 16, 3, 4, 2, 1.8)}`,
  // Rounded top
  (f) =>
    `<path d="M4 32.5 V12 A6 6 0 0 1 16 12 V32.5 Z" fill="${f}" />${windows(6.3, 13, 2, 5, 3, 1.8)}`,
];

/** The capital: a wider, taller tower with a spire (viewBox 0 0 26 44). */
const capitalTower = (f: string) =>
  `<path d="M13 1 L16 9 H10 Z" fill="${f}" />${box(8, 8.5, 10, 9, f)}${box(3, 16.5, 20, 26, f)}` +
  `${windows(10.3, 11, 2, 2, 2.4, 1.6)}${windows(6, 19.5, 4, 6, 2.5, 2)}`;

/** Marker HTML: the building (and, for a capital, a flag on a pole above it) standing on the city point. */
export function cityIconHtml(name: string, capital: boolean, alpha2?: string) {
  const s = seed(name);
  const fill = BODY_COLORS[s % BODY_COLORS.length];
  const svg = capital
    ? `<svg class="city-tower" width="26" height="44" viewBox="0 0 26 44" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">${capitalTower(fill)}</svg>`
    : `<svg class="city-tower" width="20" height="34" viewBox="0 0 20 34" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">${TOWERS[s % TOWERS.length](fill)}</svg>`;
  const flag = capital && alpha2 ? `<span class="city-flag"><span class="city-flag-cloth fi fi-${alpha2.toLowerCase()}"></span></span>` : '';
  return `<span class="city-icon">${flag}${svg}</span>`;
}
