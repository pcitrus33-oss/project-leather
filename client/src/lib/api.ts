import type { ThemeId } from './themes';

/** A place picked from the location search. */
export interface Location {
  lat: number;
  lng: number;
  name: string;
}

export interface PlaceResult extends Location {
  /** Full address line, to tell similarly named places apart. */
  detail: string;
}

/** A spot on the globe where one or more of a country's photos were taken. */
export interface Pin extends Location {
  count: number;
  thumbUrl: string;
}

export interface Photo {
  id: string;
  iso: string;
  width: number;
  height: number;
  caption: string;
  thumbUrl: string;
  webUrl: string;
  originalUrl: string;
  location: Location | null;
}

export interface UnlockedCountry {
  iso: string;
  count: number;
  unlockedAt: string;
  coverId: string;
  coverUrl: string;
  /** Photos without a place; shown as one bubble at the country's centre. */
  unplacedCount: number;
  pins: Pin[];
}

export interface CountryPhotos {
  iso: string;
  coverId: string | null;
  theme: ThemeId;
  photos: Photo[];
}

export interface Settings {
  defaultTheme: ThemeId;
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

export const api = {
  countries: () => request<UnlockedCountry[]>('/api/countries'),

  photos: (iso: string) => request<CountryPhotos>(`/api/countries/${iso}/photos`),

  setOrder: (iso: string, ids: string[]) => request<{ photos: Photo[] }>(`/api/countries/${iso}/order`, json('PUT', { ids })),

  setCover: (iso: string, photoId: string) => request<{ coverId: string }>(`/api/countries/${iso}/cover`, json('PUT', { photoId })),

  setCaption: (id: string, caption: string) => request<{ ok: true }>(`/api/photos/${id}`, json('PATCH', { caption })),

  setLocation: (id: string, location: Location | null) =>
    request<{ ok: true }>(`/api/photos/${id}`, json('PATCH', { location })),

  /** Search OpenStreetMap for places, optionally within one country (ISO alpha-2). */
  searchPlaces: (q: string, alpha2?: string) =>
    request<PlaceResult[]>(`/api/geocode?${new URLSearchParams({ q, country: alpha2 ?? '' })}`),

  setTheme: (iso: string, theme: ThemeId) => request<{ theme: ThemeId }>(`/api/countries/${iso}/theme`, json('PUT', { theme })),

  settings: () => request<Settings>('/api/settings'),

  saveSettings: (settings: Settings) => request<Settings>('/api/settings', json('PUT', settings)),

  deletePhoto: (id: string) => request<{ relocked: boolean }>(`/api/photos/${id}`, { method: 'DELETE' }),

  /** Uses XHR (not fetch) so we can report upload progress. */
  upload(iso: string, files: File[], onProgress: (fraction: number) => void, location?: Location | null): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      // Text fields go before the files so the server sees them alongside the upload.
      if (location) {
        form.append('lat', String(location.lat));
        form.append('lng', String(location.lng));
        form.append('place', location.name);
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
