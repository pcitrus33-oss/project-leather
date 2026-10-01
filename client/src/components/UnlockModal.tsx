import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { COUNTRIES, getCountry } from '../lib/countries';
import { api, type UploadResult } from '../lib/api';
import Flag from './Flag';
import './UnlockModal.css';

interface Props {
  open: boolean;
  /** Pre-selected country (still changeable unless `fixedCountry`). */
  iso?: string;
  fixedCountry?: boolean;
  unlockedIsos: Set<string>;
  onClose: () => void;
  onUploaded: (iso: string, result: UploadResult) => void;
}

interface Picked {
  file: File;
  url: string;
}

export default function UnlockModal({ open, iso, fixedCountry, unlockedIsos, onClose, onUploaded }: Props) {
  const [countryIso, setCountryIso] = useState<string | undefined>(iso);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filesRef = useRef(files);
  filesRef.current = files;
  const revokeAll = () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url));

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    revokeAll();
    setCountryIso(iso);
    setQuery('');
    setFiles([]);
    setProgress(null);
    setError(null);
  }, [open, iso]);

  useEffect(() => revokeAll, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && progress === null && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, progress, onClose]);

  const country = getCountry(countryIso);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)) : COUNTRIES;
  }, [query]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const images = [...list].filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...images.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const removeFile = (i: number) =>
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });

  const upload = async () => {
    if (!country || files.length === 0) return;
    setError(null);
    setProgress(0);
    try {
      const result = await api.upload(
        country.iso,
        files.map((f) => f.file),
        setProgress,
      );
      onUploaded(country.iso, result);
      if (result.failed.length) alert(`These files couldn't be read as images:\n${result.failed.join('\n')}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const alreadyUnlocked = country && unlockedIsos.has(country.iso);
  const busy = progress !== null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
        >
          <motion.div
            className="modal card"
            initial={{ scale: 0.7, y: 40, rotate: -3 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.8, y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            role="dialog"
            aria-modal="true"
          >
            <button className="btn btn-icon modal-close" onClick={onClose} disabled={busy} aria-label="Close">
              ✕
            </button>

            {!country ? (
              <>
                <h2 className="title modal-title">🔓 Which country?</h2>
                <input
                  className="input"
                  placeholder="Search countries…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <ul className="country-list">
                  {matches.map((c) => (
                    <li key={c.iso}>
                      <button onClick={() => setCountryIso(c.iso)}>
                        <span className="country-flag"><Flag country={c} /></span>
                        <span>{c.name}</span>
                        {unlockedIsos.has(c.iso) && <span className="country-badge">unlocked</span>}
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && <li className="country-empty">No country called “{query}” 🤔</li>}
                </ul>
              </>
            ) : (
              <>
                <h2 className="title modal-title">
                  <Flag country={country} /> {alreadyUnlocked ? `Add photos to ${country.name}` : `Unlock ${country.name}`}
                </h2>
                {!fixedCountry && (
                  <button className="link-btn" onClick={() => setCountryIso(undefined)} disabled={busy}>
                    ← pick a different country
                  </button>
                )}

                <div
                  className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => !busy && inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <div className="dropzone-icon">📸</div>
                  <div>
                    <b>Drop photos here</b> or click to choose
                  </div>
                  <small>JPG, PNG, WebP… as many as you like</small>
                </div>

                {files.length > 0 && (
                  <div className="preview-grid">
                    {files.map((f, i) => (
                      <motion.div
                        key={f.url}
                        className="preview"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      >
                        <img src={f.url} alt="" />
                        {!busy && (
                          <button className="preview-remove" onClick={() => removeFile(i)} aria-label="Remove">
                            ✕
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}

                {error && <div className="modal-error">😿 {error}</div>}

                {busy && (
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
                    <span>{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Making thumbnails…'}</span>
                  </div>
                )}

                <div className="modal-actions">
                  <button className="btn btn-pink btn-big" disabled={files.length === 0 || busy} onClick={upload}>
                    {busy ? (
                      <span className="spinner" />
                    ) : alreadyUnlocked ? (
                      `Add ${files.length || ''} photo${files.length === 1 ? '' : 's'} ✨`
                    ) : (
                      `Unlock it! 🔓`
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
