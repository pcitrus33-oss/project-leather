/** Kinds of tagged places, each drawn with its own symbol on the globe (keep in sync with client/src/lib/api.ts). */
const PLACE_KINDS = ['city', 'park', 'mountain', 'beach', 'water', 'island', 'museum', 'landmark', 'airport', 'pin'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export const isPlaceKind = (v: unknown): v is PlaceKind => PLACE_KINDS.includes(v as PlaceKind);

const CITY_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'borough', 'suburb', 'quarter', 'neighbourhood']);

/** Maps an OpenStreetMap search result's category/type to a symbol kind. */
export function placeKind(category = '', type = '', addresstype = ''): PlaceKind {
  if (CITY_TYPES.has(addresstype) || (category === 'place' && CITY_TYPES.has(type))) return 'city';
  if (category === 'aeroway') return 'airport';
  if (type === 'national_park' || type === 'protected_area' || type === 'nature_reserve' || type === 'park' || type === 'forest' || type === 'wood')
    return 'park';
  if (['peak', 'volcano', 'ridge', 'mountain_range', 'saddle', 'glacier'].includes(type)) return 'mountain';
  if (['beach', 'coastline', 'beach_resort'].includes(type)) return 'beach';
  if (type === 'island' || type === 'islet' || type === 'archipelago') return 'island';
  if (category === 'waterway' || ['water', 'bay', 'lake', 'river', 'reservoir', 'waterfall', 'strait'].includes(type)) return 'water';
  if (type === 'museum' || type === 'gallery' || type === 'arts_centre') return 'museum';
  if (category === 'historic' || ['attraction', 'viewpoint', 'theme_park', 'zoo', 'monument', 'castle', 'tower', 'lighthouse', 'bridge', 'cathedral', 'church', 'temple', 'place_of_worship'].includes(type))
    return 'landmark';
  return 'pin';
}
