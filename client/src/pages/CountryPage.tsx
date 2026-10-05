import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { api, type Location, type Photo, type UnlockedProvince, type UploadResult } from '../lib/api';
import { getCountry, searchCodes, territoriesOf } from '../lib/countries';
import { getProvince, hasProvinces, provinceWord } from '../lib/provinces';
import { celebrate } from '../lib/celebrate';
import type { ThemeId } from '../lib/themes';
import CountrySilhouette from '../components/CountrySilhouette';
import UnlockModal from '../components/UnlockModal';
import { EditablePhotoGrid, PhotoGrid } from '../components/PhotoGrid';
import Flag from '../components/Flag';
import PhotoDetail from '../components/PhotoDetail';
import ThemePicker from '../components/ThemePicker';
import LocationSearch from '../components/LocationSearch';
import SideDock from '../components/SideDock';
import PlaceRow from '../components/PlaceRow';
import './CountryPage.css';

interface Draft {
  photos: Photo[];
  captions: Record<string, string>;
  locations: Record<string, Location | null>;
  coverId: string | null;
}

const sameLocation = (a: Location | null, b: Location | null) =>
  a === b || (!!a && !!b && a.lat === b.lat && a.lng === b.lng && a.name === b.name);

/**
 * A country's photo page, or for USA/Canada/China either the country's catalogue of unlocked
 * provinces (/country/CAN) or one province's photo page (/country/CAN/CA-ON).
 */
export default function CountryPage() {
  const { iso = '', province: provinceParam } = useParams();
  const navigate = useNavigate();
  const country = getCountry(iso);
  const province = getProvince(provinceParam);
  const validProvince = !provinceParam || province?.iso === iso;
  const catalogue = hasProvinces(iso) && !province;
  const scopeId = province?.id ?? null;
  const place = province ?? country;
  const parent = getCountry(country?.parent);
  const territories = useMemo(() => (country ? territoriesOf(country.iso) : []), [country]);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [provinces, setProvinces] = useState<UnlockedProvince[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>('classic');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);

  // A country with overseas territories links to the ones that have photos.
  useEffect(() => {
    if (territories.length) api.countries().then((list) => setVisited(list.map((u) => u.iso)), () => {});
  }, [territories]);
  const openTerritories = territories.filter((t) => visited.includes(t.iso));

  const load = useCallback(() => {
    if (!country || !validProvince) return Promise.resolve();
    return api
      .photos(country.iso, scopeId)
      .then((d) => {
        setPhotos(d.photos);
        setProvinces(d.provinces);
        setCoverId(d.coverId);
        setTheme(d.theme);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [country, scopeId, validProvince]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    setDraft(null);
    load();
  }, [load]);

  // The globe falls back to the first photo when no cover has been picked.
  const effectiveCover = coverId ?? photos[0]?.id ?? null;
  const unlockedIsos = useMemo(
    () => new Set((photos.length || provinces.length) && country ? [country.iso] : []),
    [photos, provinces, country],
  );
  const unlockedProvinces = useMemo(() => new Set(provinces.map((p) => p.id)), [provinces]);

  const goBack = () => {
    // Use real history when we came from inside the app, so browser Back/Forward stay in sync.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  };

  const changeTheme = async (next: ThemeId) => {
    if (!country) return;
    const previous = theme;
    setTheme(next);
    try {
      await api.setTheme(country.iso, next, scopeId);
    } catch (e) {
      setTheme(previous);
      alert(`Couldn't change the theme: ${(e as Error).message}`);
    }
  };

  const startEditing = () => setDraft({ photos, captions: {}, locations: {}, coverId: effectiveCover });

  const dirty =
    !!draft &&
    (draft.coverId !== effectiveCover ||
      draft.photos.some((p, i) => p.id !== photos[i]?.id) ||
      Object.entries(draft.captions).some(([id, c]) => photos.find((p) => p.id === id)?.caption !== c.trim()) ||
      Object.entries(draft.locations).some(([id, l]) => !sameLocation(photos.find((p) => p.id === id)?.location ?? null, l)));

  const cancelEditing = () => {
    if (dirty && !confirm('Throw away your changes?')) return;
    setDraft(null);
  };

  const saveEditing = async () => {
    if (!draft || !country) return;
    setSaving(true);
    try {
      if (draft.photos.some((p, i) => p.id !== photos[i]?.id)) {
        await api.setOrder(
          country.iso,
          draft.photos.map((p) => p.id),
          scopeId,
        );
      }
      for (const [id, caption] of Object.entries(draft.captions)) {
        if (photos.find((p) => p.id === id)?.caption !== caption.trim()) await api.setCaption(id, caption);
      }
      for (const [id, location] of Object.entries(draft.locations)) {
        if (!sameLocation(photos.find((p) => p.id === id)?.location ?? null, location)) await api.setLocation(id, location);
      }
      if (draft.coverId && draft.coverId !== effectiveCover) await api.setCover(country.iso, draft.coverId, scopeId);
      await load();
      setDraft(null);
    } catch (e) {
      alert(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const deletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo for good? This removes the file too.')) return;
    setBusyId(photo.id);
    try {
      const { relocked, provinceRelocked } = await api.deletePhoto(photo.id);
      if (relocked || provinceRelocked) {
        navigate(relocked ? '/' : `/country/${iso}`, { replace: true });
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setLightboxIndex((i) => Math.min(i, photos.length - 2));
      if (coverId === photo.id) setCoverId(null);
      setDraft((d) =>
        d && {
          ...d,
          photos: d.photos.filter((p) => p.id !== photo.id),
          coverId: d.coverId === photo.id ? null : d.coverId,
        },
      );
    } catch (e) {
      alert(`Couldn't delete: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const setCoverNow = async (id: string) => {
    if (!country) return;
    await api.setCover(country.iso, id, scopeId);
    setCoverId(id);
  };

  const handleUploaded = (_iso: string, result: UploadResult, uploadedTo: string | null) => {
    setAddOpen(false);
    if (result.newlyUnlocked) celebrate();
    // From the catalogue, go and see the province the photos went into.
    if (catalogue && uploadedTo) navigate(`/country/${iso}/${uploadedTo}`);
    else setPhotos(result.photos);
  };

  if (!country || !validProvince) {
    return (
      <div className="country-page">
        <div className="country-empty card">
          <div className="country-empty-icon">🧭</div>
          <h2 className="title">Hmm, that place isn’t on the map.</h2>
          <button className="btn btn-pink" onClick={() => navigate('/')}>
            🌍 Back to the globe
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={`country-page theme-${theme}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <header className="country-header">
        <div className="country-header-side">
          <button className="btn btn-quiet" onClick={province ? () => navigate('/') : goBack}>
            ← Globe
          </button>
        </div>

        <div className="country-heading">
          <div className="country-silhouette">
            <CountrySilhouette country={place!} size={64} />
          </div>
          <h1 className="title country-name">{place!.name}</h1>
          <div className="eyebrow country-sub">
            <Flag country={country} />
            <span>
              {province && `${province.type} · ${country.name} · `}
              {parent && `Territory · ${parent.name} · `}
              {loading
                ? 'Loading…'
                : catalogue
                  ? `${provinces.length} ${provinceWord(iso)}${provinces.length === 1 ? '' : 's'} · ${photos.length} photo${photos.length === 1 ? '' : 's'}`
                  : `${photos.length} photo${photos.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {openTerritories.length > 0 && (
            <div className="eyebrow country-territories">
              Also{' '}
              {openTerritories.map((t, i) => (
                <span key={t.iso}>
                  {i > 0 && ' · '}
                  <Link to={`/country/${t.iso}`}>{t.name}</Link>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="country-header-side is-end">
          {province && (
            <button className="btn btn-quiet" onClick={() => navigate(`/country/${iso}`)}>
              ← {country.name}
            </button>
          )}
          {parent && (
            <button className="btn btn-quiet" onClick={() => navigate(`/country/${parent.iso}`)}>
              ← {parent.name}
            </button>
          )}
        </div>
      </header>

      {/* Kept out while editing, so Save and Cancel are always in reach. */}
      <SideDock pinned={!!draft} label="Page menu">
        {draft ? (
          <>
            <button className="btn btn-mint" onClick={saveEditing} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={cancelEditing} disabled={saving}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {!catalogue && photos.length > 0 && <ThemePicker value={theme} onChange={changeTheme} />}
            {!catalogue && photos.length > 0 && (
              <button className="btn" onClick={startEditing}>
                {photos.length > 1 ? 'Edit layout' : 'Edit'}
              </button>
            )}
            <button className="btn btn-pink" onClick={() => setAddOpen(true)}>
              Add photos
            </button>
            <Link to="/settings" className="btn">
              Settings
            </Link>
          </>
        )}
      </SideDock>

      {draft && (
        <div className="edit-banner">
          Drag photos to rearrange · ★ picks the globe cover · type a title · add a place. Press <b>Save</b> on the right when you’re done.
        </div>
      )}

      <main className="country-main">
        {error && <div className="country-error">{error}</div>}

        {!loading && !error && photos.length === 0 && (
          <div className="country-empty">
            <h2 className="title">{place!.name} is still locked</h2>
            <p>
              {catalogue
                ? `Add photos to any ${provinceWord(iso)} to unlock it on your globe.`
                : 'Add your first photos from here to unlock it on your globe.'}
            </p>
            <button className="btn btn-pink btn-big" onClick={() => setAddOpen(true)}>
              Unlock it
            </button>
          </div>
        )}

        {catalogue ? (
          <ProvinceCatalogue iso={iso} provinces={provinces} onOpen={(id) => navigate(`/country/${iso}/${id}`)} />
        ) : draft ? (
          <EditablePhotoGrid
            photos={draft.photos}
            captions={draft.captions}
            coverId={draft.coverId}
            busyId={busyId}
            onReorder={(p) => setDraft({ ...draft, photos: p })}
            onCaption={(id, c) => setDraft({ ...draft, captions: { ...draft.captions, [id]: c } })}
            onCover={(id) => setDraft({ ...draft, coverId: id })}
            onDelete={deletePhoto}
            locations={draft.locations}
            onLocate={setLocatingId}
            onClearLocation={(id) => setDraft({ ...draft, locations: { ...draft.locations, [id]: null } })}
          />
        ) : photos.length === 0 ? null : (
          <PhotoGrid photos={photos} onOpen={setLightboxIndex} />
        )}
      </main>

      <AnimatePresence>
        {lightboxIndex >= 0 && photos[lightboxIndex] && (
          <PhotoDetail
            photos={photos}
            index={lightboxIndex}
            coverId={effectiveCover}
            alpha2={searchCodes(country)}
            onIndex={setLightboxIndex}
            onClose={() => setLightboxIndex(-1)}
            onChange={(next) => setPhotos((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onCover={setCoverNow}
            onDelete={deletePhoto}
          />
        )}
      </AnimatePresence>

      {locatingId && draft && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLocatingId(null)}>
          <div className="modal card" role="dialog" aria-modal="true">
            <button className="btn btn-icon btn-quiet modal-close" onClick={() => setLocatingId(null)} aria-label="Close">
              ×
            </button>
            <h2 className="title modal-title">Where was this taken?</h2>
            <LocationSearch
              alpha2={searchCodes(country)}
              onPick={(place) => {
                setDraft({ ...draft, locations: { ...draft.locations, [locatingId]: place } });
                setLocatingId(null);
              }}
            />
          </div>
        </div>
      )}

      <UnlockModal
        open={addOpen}
        iso={country.iso}
        province={province?.id}
        fixedCountry
        unlockedIsos={unlockedIsos}
        unlockedProvinces={unlockedProvinces}
        onClose={() => setAddOpen(false)}
        onUploaded={handleUploaded}
      />
    </motion.div>
  );
}

function ProvinceCatalogue({ iso, provinces, onOpen }: { iso: string; provinces: UnlockedProvince[]; onOpen: (id: string) => void }) {
  const rows = provinces
    .map((p) => ({ ...p, info: getProvince(p.id) }))
    .filter((p) => p.info)
    .sort((a, b) => a.info!.name.localeCompare(b.info!.name));
  return (
    <ul className="province-catalogue">
      {rows.map((p, i) => (
        <motion.li
          key={p.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.05, 0.5), type: 'spring', stiffness: 300, damping: 24 }}
        >
          <PlaceRow
            imageUrl={p.coverUrl}
            title={p.info!.name}
            sub={`${p.info!.type} · ${p.count} photo${p.count === 1 ? '' : 's'}`}
            onClick={() => onOpen(p.id)}
          />
        </motion.li>
      ))}
      {rows.length > 0 && (
        <li className="province-catalogue-hint">
          Zoom in on the globe to see every {provinceWord(iso)}, or use Add photos to unlock another.
        </li>
      )}
    </ul>
  );
}
