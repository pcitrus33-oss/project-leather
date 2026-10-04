import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { api, type Location, type Photo } from '../lib/api';
import SideDock from './SideDock';
import LocationSearch from './LocationSearch';
import './PhotoDetail.css';

interface Props {
  photos: Photo[];
  index: number;
  coverId: string | null;
  /** ISO alpha-2 of the country, to keep place search inside it. */
  alpha2?: string;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** A photo's caption, story or place was saved. */
  onChange: (photo: Photo) => void;
  onCover: (id: string) => Promise<void>;
  onDelete: (photo: Photo) => void;
}

/**
 * One photo up close: enlarged on the left, with its caption as a title and its story (a little blog)
 * beside it. Captions and stories only ever show here, never on the page's grid. Editing lives in a
 * pull tab on the right edge, like the page's own menu.
 */
export default function PhotoDetail({ photos, index, coverId, alpha2, onIndex, onClose, onChange, onCover, onDelete }: Props) {
  const photo = photos[index];
  // Only the photo it opened on grows out of the grid; the next/previous ones just fade in.
  const openedId = useRef(photo?.id).current;
  const [text, setText] = useState<{ caption: string; story: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const editing = text !== null;
  const go = (step: number) => {
    const next = index + step;
    if (!editing && next >= 0 && next < photos.length) onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (locating) setLocating(false);
        else if (editing) setText(null);
        else onClose();
      }
      if (editing || locating) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Keep the page behind from scrolling while this is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!photo) return null;

  const run = async (fn: () => Promise<void>, what: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`Couldn't ${what}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveText = () =>
    run(async () => {
      const next = { caption: text!.caption.trim(), story: text!.story.trim() };
      await api.setText(photo.id, next);
      onChange({ ...photo, ...next });
      setText(null);
    }, 'save');

  const savePlace = (location: Location | null) =>
    run(async () => {
      await api.setLocation(photo.id, location);
      onChange({ ...photo, location });
      setLocating(false);
    }, 'save the place');

  return (
    <motion.div
      className="photo-detail"
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || 'Photo'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="photo-detail-bar">
        <button className="btn btn-quiet" onClick={onClose}>
          ← Back
        </button>
        <span className="eyebrow">
          {index + 1} / {photos.length}
        </span>
      </div>

      <div className="photo-detail-stage">
        <button className="photo-detail-nav" onClick={() => go(-1)} disabled={index === 0 || editing} aria-label="Previous photo">
          ‹
        </button>
        <motion.img
          key={photo.id}
          layoutId={photo.id === openedId ? `photo-${photo.id}` : undefined}
          src={photo.webUrl}
          alt={photo.caption}
          initial={photo.id === openedId ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        />
        <button
          className="photo-detail-nav"
          onClick={() => go(1)}
          disabled={index === photos.length - 1 || editing}
          aria-label="Next photo"
        >
          ›
        </button>
      </div>

      <aside className="photo-detail-text">
        {photo.location && <div className="eyebrow">{photo.location.name}</div>}
        {editing ? (
          <>
            <input
              className="input photo-detail-title-input"
              placeholder="Title"
              maxLength={500}
              value={text.caption}
              onChange={(e) => setText({ ...text, caption: e.target.value })}
              autoFocus
            />
            <textarea
              className="input photo-detail-story-input"
              placeholder="Write about this photo…"
              maxLength={20000}
              value={text.story}
              onChange={(e) => setText({ ...text, story: e.target.value })}
            />
          </>
        ) : (
          <>
            {photo.caption && <h2 className="photo-detail-title">{photo.caption}</h2>}
            {photo.story && <div className="photo-detail-story">{photo.story}</div>}
            {!photo.caption && !photo.story && (
              <p className="photo-detail-empty">No title or story yet. Open the menu on the right to write one.</p>
            )}
          </>
        )}
      </aside>

      {/* Kept out while writing, so Save and Cancel are always in reach. */}
      <SideDock pinned={editing} label="Photo menu">
        {editing ? (
          <>
            <button className="btn btn-pink" onClick={saveText} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={() => setText(null)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setText({ caption: photo.caption, story: photo.story })}>
              {photo.caption || photo.story ? 'Edit text' : 'Write a story'}
            </button>
            <button className="btn" onClick={() => setLocating(true)}>
              {photo.location ? 'Change place' : 'Add place'}
            </button>
            {photo.location && (
              <button className="btn" onClick={() => savePlace(null)} disabled={busy}>
                Remove place
              </button>
            )}
            <button className="btn" onClick={() => run(() => onCover(photo.id), 'set the cover')} disabled={busy || photo.id === coverId}>
              {photo.id === coverId ? 'Cover photo ✓' : 'Use as cover'}
            </button>
            <button className="btn" onClick={() => onDelete(photo)} disabled={busy}>
              Delete photo
            </button>
          </>
        )}
      </SideDock>

      {locating && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLocating(false)}>
          <div className="modal card" role="dialog" aria-modal="true">
            <button className="btn btn-icon btn-quiet modal-close" onClick={() => setLocating(false)} aria-label="Close">
              ×
            </button>
            <h2 className="title modal-title">Where was this taken?</h2>
            <LocationSearch alpha2={alpha2} onPick={savePlace} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
