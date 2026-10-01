import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import Lightbox from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/captions.css';
import { api, type Photo, type UploadResult } from '../lib/api';
import { getCountry } from '../lib/countries';
import { celebrate } from '../lib/celebrate';
import CountrySilhouette from '../components/CountrySilhouette';
import UnlockModal from '../components/UnlockModal';
import { EditablePhotoGrid, PhotoGrid } from '../components/PhotoGrid';
import Flag from '../components/Flag';
import './CountryPage.css';

interface Draft {
  photos: Photo[];
  captions: Record<string, string>;
  coverId: string | null;
}

export default function CountryPage() {
  const { iso = '' } = useParams();
  const navigate = useNavigate();
  const country = getCountry(iso);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!country) return Promise.resolve();
    return api
      .photos(country.iso)
      .then((d) => {
        setPhotos(d.photos);
        setCoverId(d.coverId);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [country]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    setDraft(null);
    load();
  }, [load]);

  // The globe falls back to the first photo when no cover has been picked.
  const effectiveCover = coverId ?? photos[0]?.id ?? null;
  const unlockedIsos = useMemo(() => new Set(photos.length && country ? [country.iso] : []), [photos, country]);

  const goBack = () => {
    // Use real history when we came from inside the app, so browser Back/Forward stay in sync.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  };

  const startEditing = () => setDraft({ photos, captions: {}, coverId: effectiveCover });

  const dirty =
    !!draft &&
    (draft.coverId !== effectiveCover ||
      draft.photos.some((p, i) => p.id !== photos[i]?.id) ||
      Object.entries(draft.captions).some(([id, c]) => photos.find((p) => p.id === id)?.caption !== c.trim()));

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
        );
      }
      for (const [id, caption] of Object.entries(draft.captions)) {
        if (photos.find((p) => p.id === id)?.caption !== caption.trim()) await api.setCaption(id, caption);
      }
      if (draft.coverId && draft.coverId !== effectiveCover) await api.setCover(country.iso, draft.coverId);
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
      const { relocked } = await api.deletePhoto(photo.id);
      if (relocked) {
        navigate('/', { replace: true });
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
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

  const handleUploaded = (_iso: string, result: UploadResult) => {
    setAddOpen(false);
    setPhotos(result.photos);
    if (result.newlyUnlocked) celebrate();
  };

  if (!country) {
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
      className="country-page"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <header className="country-header">
        <button className="btn" onClick={goBack}>
          ← 🌍 Globe
        </button>

        <div className="country-heading">
          <div className="country-silhouette">
            <CountrySilhouette country={country} />
          </div>
          <div>
            <h1 className="title country-name">
              <span className="country-name-flag"><Flag country={country} /></span> {country.name}
            </h1>
            <div className="country-sub">
              {loading ? 'Loading…' : `${photos.length} photo${photos.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>

        <div className="country-actions">
          {draft ? (
            <>
              <button className="btn" onClick={cancelEditing} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-mint" onClick={saveEditing} disabled={saving || !dirty}>
                {saving ? 'Saving…' : '💾 Save'}
              </button>
            </>
          ) : (
            <>
              {photos.length > 0 && (
                <button className="btn" onClick={startEditing}>
                  ✏️ {photos.length > 1 ? 'Edit layout' : 'Edit'}
                </button>
              )}
              <button className="btn btn-pink" onClick={() => setAddOpen(true)}>
                📸 Add photos
              </button>
            </>
          )}
        </div>
      </header>

      {draft && (
        <div className="edit-banner">
          Drag photos to rearrange · ⭐ picks the globe cover · type to caption. Hit <b>Save</b> when you’re happy!
        </div>
      )}

      <main className="country-main">
        {error && <div className="country-error">😿 {error}</div>}

        {!loading && !error && photos.length === 0 && (
          <div className="country-empty card">
            <div className="country-empty-icon">🔒</div>
            <h2 className="title">{country.name} is still locked</h2>
            <p>Add your first photos from here to unlock it on your globe.</p>
            <button className="btn btn-pink btn-big" onClick={() => setAddOpen(true)}>
              🔓 Unlock it!
            </button>
          </div>
        )}

        {draft ? (
          <EditablePhotoGrid
            photos={draft.photos}
            captions={draft.captions}
            coverId={draft.coverId}
            busyId={busyId}
            onReorder={(p) => setDraft({ ...draft, photos: p })}
            onCaption={(id, c) => setDraft({ ...draft, captions: { ...draft.captions, [id]: c } })}
            onCover={(id) => setDraft({ ...draft, coverId: id })}
            onDelete={deletePhoto}
          />
        ) : (
          <PhotoGrid photos={photos} coverId={effectiveCover} onOpen={setLightboxIndex} />
        )}
      </main>

      <Lightbox
        open={lightboxIndex >= 0}
        index={lightboxIndex}
        close={() => setLightboxIndex(-1)}
        plugins={[Captions]}
        captions={{ descriptionTextAlign: 'center' }}
        slides={photos.map((p) => ({ src: p.webUrl, width: p.width, height: p.height, description: p.caption || undefined }))}
      />

      <UnlockModal
        open={addOpen}
        iso={country.iso}
        fixedCountry
        unlockedIsos={unlockedIsos}
        onClose={() => setAddOpen(false)}
        onUploaded={handleUploaded}
      />
    </motion.div>
  );
}
