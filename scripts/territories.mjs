// Far-off lands split out of their country's shape (Natural Earth draws French Guiana as part of
// France) into places of their own, unlocked separately and linked back to the country by `parent`.
// `iso` is the ISO alpha-3 code where one exists, otherwise a made-up "X-..." key; `alpha2` picks the flag.
// Boxes are [west, south, east, north]; a piece of the parent's shape goes to the first box holding its first point.
export const TERRITORIES = [
  { iso: 'GUF', name: 'French Guiana', alpha2: 'GF', parent: 'FRA', boxes: [[-55, 1.5, -51, 6.5]] },
  { iso: 'GLP', name: 'Guadeloupe', alpha2: 'GP', parent: 'FRA', boxes: [[-62, 15.8, -60.9, 16.6]] },
  { iso: 'MTQ', name: 'Martinique', alpha2: 'MQ', parent: 'FRA', boxes: [[-61.3, 14.3, -60.8, 15]] },
  { iso: 'REU', name: 'Réunion', alpha2: 'RE', parent: 'FRA', boxes: [[55, -21.5, 56, -20.8]] },
  { iso: 'MYT', name: 'Mayotte', alpha2: 'YT', parent: 'FRA', boxes: [[44.9, -13.1, 45.4, -12.5]] },
  { iso: 'SJM', name: 'Svalbard', alpha2: 'SJ', parent: 'NOR', boxes: [[10, 74, 35, 81], [-9.5, 70.5, -7.5, 71.5]] }, // + Jan Mayen
  { iso: 'X-CANARY-ISLANDS', name: 'Canary Islands', alpha2: 'IC', parent: 'ESP', boxes: [[-18.5, 27.5, -13, 29.5]] },
  { iso: 'X-AZORES', name: 'Azores', alpha2: 'PT', parent: 'PRT', boxes: [[-32, 36.5, -24.5, 40]] },
  { iso: 'X-MADEIRA', name: 'Madeira', alpha2: 'PT', parent: 'PRT', boxes: [[-17.5, 32.3, -16, 33.2]] },
  { iso: 'X-GALAPAGOS', name: 'Galápagos Islands', alpha2: 'EC', parent: 'ECU', boxes: [[-92.5, -1.6, -89, 1.7]] },
  { iso: 'BES', name: 'Caribbean Netherlands', alpha2: 'BQ', parent: 'NLD', boxes: [[-69, 11.9, -62.8, 18]] },
];

/** The territory a point of `iso`'s land belongs to, if any. */
export function territoryAt(iso, [lng, lat]) {
  return TERRITORIES.find(
    (t) => (t.parent === iso || t.iso === iso) && t.boxes.some(([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n),
  );
}
