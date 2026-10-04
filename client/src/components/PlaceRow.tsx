import type { ReactNode } from 'react';
import './PlaceRow.css';

/** A big tappable row: cover photo, name and a details line. */
export default function PlaceRow({ imageUrl, title, sub, onClick }: { imageUrl: string; title: ReactNode; sub: ReactNode; onClick: () => void }) {
  return (
    <button className="place-row" onClick={onClick}>
      <img src={imageUrl} alt="" loading="lazy" />
      <span className="place-row-text">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
      <span className="place-row-go" aria-hidden="true">
        →
      </span>
    </button>
  );
}
