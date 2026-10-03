import type { ThemeId } from './themes';

/** Kinds of tagged places, each with its own symbol on the globe (keep in sync with server/src/places.ts). */
export type PlaceKind = 'city' | 'park' | 'mountain' | 'beach' | 'water' | 'island' | 'museum' | 'landmark' | 'airport' | 'pin';

/** A place picked from the location search. */
export interface Location {
  lat: number;
  lng: number;
  name: string;
  kind: PlaceKind;
}

export interface PlaceResult extends Location {
  /** Full address line, to tell similarly named places apart. */
  detail: string;
}

/** A spot on the globe where one or more of a country's photos were taken. */
export interface Pin extends Location {
  province: string | null;
  count: number;
  thumbUrl: string;
  /** Newest upload at this place (ISO time). */
  latestAt: string;
}

export interface Photo {
  id: string;
  iso: string;
  province: string | null;
  width: number;
  height: number;
  caption: string;
  thumbUrl: string;
  webUrl: string;
  originalUrl: string;
  location: Location | null;
}

/** An unlocked province (USA, Canada, China). */
export interface UnlockedProvince {
  id: string;
  count: number;
  unplacedCount: number;
  unplacedLatestAt: string | null;
  unlockedAt: string;
  coverUrl: string;
}

export interface UnlockedCountry {
  iso: string;
  count: number;
  unlockedAt: string;
  coverId: string;
  coverUrl: string;
  /** Photos with neither a place nor a province; shown as one bubble at the country's centre. */
  unplacedCount: number;
  unplacedLatestAt: string | null;
  pins: Pin[];
  provinces: UnlockedProvince[];
}

export interface CountryPhotos {
  iso: string;
  province: string | null;
  coverId: string | null;
  theme: ThemeId;
  photos: Photo[];
  provinces: UnlockedProvince[];
}

/** How the globe is drawn (keep in sync with GLOBE_VIEWS in server/src/db.ts). */
export type GlobeView = 'day' | 'daynight';

export interface Settings {
  defaultTheme: ThemeId;
  globeView: GlobeView;
}

export interface UploadResult {
  newlyUnlocked: boolean;
  failed: string[];
  photos: Photo[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

/** `?province=…` for province pages, nothing for whole countries. */
const scopeQuery = (province?: string | null) => (province ? `?${new URLSearchParams({ province })}` : '');

export const api = {
  countries: () => request<UnlockedCountry[]>('/api/countries'),

  photos: (iso: string, province?: string | null) => request<CountryPhotos>(`/api/countries/${iso}/photos${scopeQuery(province)}`),

  setOrder: (iso: string, ids: string[], province?: string | null) =>
    request<{ photos: Photo[] }>(`/api/countries/${iso}/order`, json('PUT', { ids, province })),

  setCover: (iso: string, photoId: string, province?: string | null) =>
    request<{ coverId: string }>(`/api/countries/${iso}/cover`, json('PUT', { photoId, province })),

  setCaption: (id: string, caption: string) => request<{ ok: true }>(`/api/photos/${id}`, json('PATCH', { caption })),

  setLocation: (id: string, location: Location | null) =>
    request<{ ok: true }>(`/api/photos/${id}`, json('PATCH', { location })),

  /** Search OpenStreetMap for places, optionally within one country (ISO alpha-2). */
  searchPlaces: (q: string, alpha2?: string) =>
    request<PlaceResult[]>(`/api/geocode?${new URLSearchParams({ q, country: alpha2 ?? '' })}`),

  setTheme: (iso: string, theme: ThemeId, province?: string | null) =>
    request<{ theme: ThemeId }>(`/api/countries/${iso}/theme`, json('PUT', { theme, province })),

  settings: () => request<Settings>('/api/settings'),

  /** Saves only the settings given. */
  saveSettings: (settings: Partial<Settings>) => request<Settings>('/api/settings', json('PUT', settings)),

  deletePhoto: (id: string) =>
    request<{ relocked: boolean; provinceRelocked: boolean }>(`/api/photos/${id}`, { method: 'DELETE' }),

  /** Developer sandbox only (the real server has no /api/dev). */
  dev: {
    seed: () => request<{ added: number }>('/api/dev/seed', { method: 'POST' }),
    reset: () => request<{ ok: true }>('/api/dev/reset', { method: 'POST' }),
  },

  /** Uses XHR (not fetch) so we can report upload progress. */
  upload(
    iso: string,
    files: File[],
    onProgress: (fraction: number) => void,
    location?: Location | null,
    province?: string | null,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      // Text fields go before the files so the server sees them alongside the upload.
      if (province) form.append('province', province);
      if (location) {
        form.append('lat', String(location.lat));
        form.append('lng', String(location.lng));
        form.append('place', location.name);
        form.append('kind', location.kind);
      }
      files.forEach((f) => form.append('photos', f));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/countries/${iso}/photos`);
      xhr.responseType = 'json';
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () =>
        xhr.status < 300 ? resolve(xhr.response) : reject(new Error(xhr.response?.error ?? `Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload failed — is the server running?'));
      xhr.send(form);
    });
  },
};
