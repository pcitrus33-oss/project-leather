import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { Location, Photo } from '../lib/api';
import './PhotoGrid.css';

interface ViewProps {
  photos: Photo[];
  onOpen: (index: number) => void;
}

/**
 * Photos at their own shape, never cropped, in justified rows that keep the saved order left to right.
 * Each cell grows in proportion to its aspect ratio (`--r`), so every photo in a row gets the same height;
 * the grid's ::after soaks up the last row so it isn't stretched.
 */
export function PhotoGrid({ photos, onOpen }: ViewProps) {
  return (
    <div className="photo-rows">
      {photos.map((p, i) => {
        const r = p.width && p.height ? p.width / p.height : 1;
        return (
          <motion.button
            key={p.id}
            className="photo-cell"
            style={{ '--r': r } as CSSProperties}
            onClick={() => onOpen(i)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i * 0.03, 0.5), duration: 0.5 }}
          >
            <motion.img
              layoutId={`photo-${p.id}`}
              src={p.thumbUrl}
              srcSet={`${p.thumbUrl} 640w, ${p.webUrl} 2048w`}
              sizes={`${Math.round(r * 320)}px`}
              width={p.width}
              height={p.height}
              alt={p.caption}
              loading="lazy"
            />
          </motion.button>
        );
      })}
    </div>
  );
}

interface EditProps {
  photos: Photo[];
  captions: Record<string, string>;
  /** Draft place per photo id (null = removed); falls back to the saved one. */
  locations: Record<string, Location | null>;
  coverId: string | null;
  busyId: string | null;
  onLocate: (id: string) => void;
  onClearLocation: (id: string) => void;
  onReorder: (photos: Photo[]) => void;
  onCaption: (id: string, caption: string) => void;
  onCover: (id: string) => void;
  onDelete: (photo: Photo) => void;
}

export function EditablePhotoGrid({
  photos,
  captions,
  locations,
  coverId,
  busyId,
  onReorder,
  onCaption,
  onCover,
  onDelete,
  onLocate,
  onClearLocation,
}: EditProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.id === active.id);
    const to = photos.findIndex((p) => p.id === over.id);
    onReorder(arrayMove(photos, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="photo-grid is-editing">
          {photos.map((p) => (
            <SortableTile
              key={p.id}
              photo={p}
              caption={captions[p.id] ?? p.caption}
              location={p.id in locations ? locations[p.id] : p.location}
              onLocate={() => onLocate(p.id)}
              onClearLocation={() => onClearLocation(p.id)}
              isCover={p.id === coverId}
              busy={busyId === p.id}
              onCaption={(c) => onCaption(p.id, c)}
              onCover={() => onCover(p.id)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface TileProps {
  photo: Photo;
  caption: string;
  location: Location | null;
  onLocate: () => void;
  onClearLocation: () => void;
  isCover: boolean;
  busy: boolean;
  onCaption: (caption: string) => void;
  onCover: () => void;
  onDelete: () => void;
}

function SortableTile({ photo, caption, location, isCover, busy, onCaption, onCover, onDelete, onLocate, onClearLocation }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });

  return (
    <div
      ref={setNodeRef}
      className={`edit-tile ${isDragging ? 'is-dragging' : ''} ${busy ? 'is-busy' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="edit-tile-image" {...attributes} {...listeners} title="Drag to move">
        <img src={photo.thumbUrl} alt="" draggable={false} />
        <span className="edit-tile-grip" aria-hidden="true">⠿</span>
      </div>
      <div className="edit-tile-tools">
        <button
          className={`btn btn-icon ${isCover ? 'btn-yellow' : ''}`}
          onClick={onCover}
          title={isCover ? 'This is the cover photo' : 'Use as cover photo on the globe'}
        >
          {isCover ? '★' : '☆'}
        </button>
        <button className="btn btn-icon" onClick={onDelete} title="Delete photo" disabled={busy}>
          ×
        </button>
      </div>
      <input
        className="input edit-tile-caption"
        placeholder="Title"
        value={caption}
        maxLength={500}
        onChange={(e) => onCaption(e.target.value)}
      />
      {location ? (
        <span className="location-chip edit-tile-location">
          <button className="edit-tile-location-name" onClick={onLocate} title="Change place">
            {location.name}
          </button>
          <button onClick={onClearLocation} aria-label="Remove place">
            ×
          </button>
        </span>
      ) : (
        <button className="btn edit-tile-add-location" onClick={onLocate}>
          + Place
        </button>
      )}
    </div>
  );
}
