// Cartoon map symbols for globe markers (HTML strings: the globe builds marker DOM by hand).
import type { PlaceKind } from '../lib/api';

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

const svg = (w: number, h: number, body: string) =>
  `<svg class="map-symbol" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

/** Three city tower shapes (20×34, base at the bottom). */
const TOWERS: ((fill: string) => string)[] = [
  (f) => `<line x1="10" y1="1" x2="10" y2="6" />${box(7, 5, 6, 4, f)}${box(4, 8.5, 12, 24, f)}${windows(6.3, 11, 2, 6, 3, 1.8)}`,
  (f) => `${box(6, 5, 8, 10, f)}${box(3, 13, 14, 19.5, f)}${windows(8, 7.5, 2, 2, 1.8, 1.6)}${windows(5.5, 16, 3, 4, 2, 1.8)}`,
  (f) => `<path d="M4 32.5 V12 A6 6 0 0 1 16 12 V32.5 Z" fill="${f}" />${windows(6.3, 13, 2, 5, 3, 1.8)}`,
];

/** Province capital (23×39): between a city and a national capital, crowned with a gold dome. */
const provinceTower = (f: string) =>
  `<path d="M6.5 9 A5 5 0 0 1 16.5 9 Z" fill="#ffd36e" /><line x1="11.5" y1="1" x2="11.5" y2="4" />` +
  `${box(4, 9, 15, 28.5, f)}${windows(6.5, 12, 3, 6, 2.4, 2)}`;

/** National capital (26×44): a wide spired tower (its flag is added on a pole above). */
const capitalTower = (f: string) =>
  `<path d="M13 1 L16 9 H10 Z" fill="${f}" />${box(8, 8.5, 10, 9, f)}${box(3, 16.5, 20, 26, f)}` +
  `${windows(10.3, 11, 2, 2, 2.4, 1.6)}${windows(6, 19.5, 4, 6, 2.5, 2)}`;

export type CityRank = 'city' | 'provinceCapital' | 'capital';

/** A city skyscraper: plain city, province capital, or national capital with its flag on a pole. */
export function cityIconHtml(name: string, rank: CityRank, alpha2?: string) {
  const fill = BODY_COLORS[seed(name) % BODY_COLORS.length];
  const art =
    rank === 'capital' ? svg(26, 44, capitalTower(fill)) : rank === 'provinceCapital' ? svg(23, 39, provinceTower(fill)) : svg(20, 34, TOWERS[seed(name) % TOWERS.length](fill));
  const flag = rank === 'capital' && alpha2 ? `<span class="city-flag"><span class="city-flag-cloth fi fi-${alpha2.toLowerCase()}"></span></span>` : '';
  return `<span class="map-icon">${flag}${art}</span>`;
}

/** Symbols for tagged places that aren't already a city on the globe (24×28 unless noted). */
const PLACE_ART: Record<Exclude<PlaceKind, 'city'>, string> = {
  park: svg(24, 30,
    `<rect x="10.5" y="22" width="3" height="6" fill="#b98a62" />` +
    `<path d="M12 2 L20 14 H4 Z" fill="#7ee0c3" /><path d="M12 8 L22 22 H2 Z" fill="#5fcf9f" />`),
  mountain: svg(30, 24,
    `<path d="M2 22 L11 6 L16 14 L20 9 L28 22 Z" fill="#c3c9d6" />` +
    `<path d="M11 6 L14 11.5 L12 11 L10 12.5 L8 11 Z" fill="white" stroke="none" /><path d="M20 9 L22.5 13 L20.5 12.5 L18.6 13.4 Z" fill="white" stroke="none" />`),
  beach: svg(26, 28,
    `<path d="M3 26 Q13 21 23 26 Z" fill="#ffe3a3" /><line x1="13" y1="10" x2="15" y2="25" />` +
    `<path d="M3 11 Q13 0 23 11 Q18 8.5 13 11 Q8 8.5 3 11 Z" fill="#ff9ec7" />`),
  water: svg(26, 22,
    `<path d="M2 8 Q6 4 10 8 T18 8 T24 8" fill="none" stroke="#3b86c4" stroke-width="2.2" />` +
    `<path d="M2 14 Q6 10 10 14 T18 14 T24 14" fill="none" stroke="#6cc4f2" stroke-width="2.2" />` +
    `<path d="M2 20 Q6 16 10 20 T18 20 T24 20" fill="none" stroke="#3b86c4" stroke-width="2.2" />`),
  island: svg(28, 28,
    `<path d="M3 25 Q14 17 25 25 Z" fill="#ffe3a3" /><path d="M14 22 Q13 14 15 8" fill="none" stroke="#b98a62" stroke-width="2" />` +
    `<path d="M15 8 Q9 5 5 9 M15 8 Q21 4 25 8 M15 8 Q12 2 8 2 M15 8 Q19 2 22 2" fill="none" stroke="#5fcf9f" stroke-width="2.4" />`),
  museum: svg(28, 26,
    `<path d="M2 9 L14 2 L26 9 Z" fill="#fff3c4" /><rect x="3" y="21" width="22" height="3" fill="#fff3c4" />` +
    `<path d="M6 10 V20 M11 10 V20 M17 10 V20 M22 10 V20" stroke-width="2.4" />`),
  landmark: svg(24, 32,
    `<line x1="12" y1="1" x2="12" y2="7" /><path d="M12 1 L17 3 L12 5" fill="#ff9ec7" />` +
    `<path d="M5 30 V12 H8 V9 H10.5 V12 H13.5 V9 H16 V12 H19 V30 Z" fill="#d9cdbd" /><path d="M10 30 V24 A2 2 0 0 1 14 24 V30" fill="${INK}" />`),
  airport: svg(28, 24,
    `<path d="M3 12 L11 11 L17 3 H20 L17 11 L24 10.5 Q27 12 24 13.5 L17 13 L20 21 H17 L11 13 L3 12 Z" fill="#8fd7f7" />`),
  pin: svg(22, 30,
    `<path d="M11 29 C11 29 3 18 3 11 A8 8 0 0 1 19 11 C19 18 11 29 11 29 Z" fill="#ff7eb6" /><circle cx="11" cy="11" r="3.2" fill="white" />`),
};

/** Symbol for a tagged place: a skyscraper for cities, otherwise the kind's symbol. */
export function placeIconHtml(name: string, kind: PlaceKind) {
  return kind === 'city' ? cityIconHtml(name, 'city') : `<span class="map-icon">${PLACE_ART[kind]}</span>`;
}
