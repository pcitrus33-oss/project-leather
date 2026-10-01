import { motion } from 'motion/react';
import type { Photo } from '../lib/api';
import './AirplaneGallery.css';

const COLUMNS = 3;
const MIN_WINDOWS = 9; // always at least a 3×3 cabin
const SEATS = 'ACF';

interface Props {
  photos: Photo[];
  onOpen: (index: number) => void;
}

/** "Airplane" theme: photos seen through cabin windows, three across; spare windows show sky. */
export default function AirplaneGallery({ photos, onOpen }: Props) {
  const windows = Math.max(MIN_WINDOWS, Math.ceil(photos.length / COLUMNS) * COLUMNS);

  return (
    <div className="cabin">
      <div className="cabin-bins" aria-hidden="true">
        {Array.from({ length: COLUMNS }, (_, i) => (
          <span key={i} className="cabin-bin">
            <span className="cabin-light" />
            <span className="cabin-light" />
          </span>
        ))}
      </div>

      <div className="cabin-windows">
        {Array.from({ length: windows }, (_, i) => {
          const photo = photos[i];
          const seat = `${Math.floor(i / COLUMNS) + 1}${SEATS[i % COLUMNS]}`;
          return (
            <motion.div
              key={photo?.id ?? `sky-${i}`}
              className="cabin-seat"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.7), type: 'spring', stiffness: 260, damping: 22 }}
            >
              {photo ? (
                <button className="plane-window has-photo" onClick={() => onOpen(i)} aria-label={photo.caption || `Photo ${i + 1}`}>
                  <span className="plane-window-pane">
                    <img src={photo.webUrl} alt={photo.caption} loading="lazy" />
                    <span className="plane-window-glare" />
                    <span className="plane-window-shade" />
                  </span>
                </button>
              ) : (
                <div className="plane-window is-sky" aria-hidden="true">
                  <span className="plane-window-pane">
                    <span className="sky-cloud" style={{ top: `${18 + ((i * 23) % 40)}%`, animationDelay: `${-((i * 7) % 20)}s` }} />
                    <span
                      className="sky-cloud is-small"
                      style={{ top: `${55 + ((i * 11) % 25)}%`, animationDelay: `${-((i * 13) % 26)}s` }}
                    />
                    <span className="plane-window-glare" />
                    <span className="plane-window-shade" />
                  </span>
                </div>
              )}
              <div className="cabin-seat-label">
                <span className="cabin-seat-number">{seat}</span>
                {photo?.caption && <span className="cabin-seat-caption">{photo.caption}</span>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
