import type { ThemeId } from './themes';

export interface Photo {
  id: string;
  iso: string;
  width: number;
  height: number;
  caption: string;
  thumbUrl: string;
  webUrl: string;
  originalUrl: string;
}

export interface UnlockedCountry {
  iso: string;
  count: number;
  unlockedAt: string;
  coverId: string;
  coverUrl: string;
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

  setTheme: (iso: string, theme: ThemeId) => request<{ theme: ThemeId }>(`/api/countries/${iso}/theme`, json('PUT', { theme })),

  settings: () => request<Settings>('/api/settings'),

  saveSettings: (settings: Settings) => request<Settings>('/api/settings', json('PUT', settings)),

  deletePhoto: (id: string) => request<{ relocked: boolean }>(`/api/photos/${id}`, { method: 'DELETE' }),

  /** Uses XHR (not fetch) so we can report upload progress. */
  upload(iso: string, files: File[], onProgress: (fraction: number) => void): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
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
