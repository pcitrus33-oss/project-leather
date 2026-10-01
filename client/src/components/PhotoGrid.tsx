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
import type { Photo } from '../lib/api';
import './PhotoGrid.css';

interface ViewProps {
  photos: Photo[];
  coverId: string | null;
  onOpen: (index: number) => void;
}

export function PhotoGrid({ photos, coverId, onOpen }: ViewProps) {
  return (
    <div className="photo-grid">
      {photos.map((p, i) => (
        <motion.button
          key={p.id}
          className="photo-tile"
          onClick={() => onOpen(i)}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: Math.min(i * 0.04, 0.6), type: 'spring', stiffness: 300, damping: 22 }}
          style={{ rotate: `${((i * 7) % 5) - 2}deg` }}
          whileHover={{ rotate: 0, scale: 1.03 }}
        >
          <img src={p.thumbUrl} alt={p.caption} loading="lazy" />
          {p.id === coverId && <span className="photo-cover-badge" title="Cover photo">⭐</span>}
          {p.caption && <span className="photo-caption">{p.caption}</span>}
        </motion.button>
      ))}
    </div>
  );
}

interface EditProps {
  photos: Photo[];
  captions: Record<string, string>;
  coverId: string | null;
  busyId: string | null;
  onReorder: (photos: Photo[]) => void;
  onCaption: (id: string, caption: string) => void;
  onCover: (id: string) => void;
  onDelete: (photo: Photo) => void;
}

export function EditablePhotoGrid({ photos, captions, coverId, busyId, onReorder, onCaption, onCover, onDelete }: EditProps) {
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
  isCover: boolean;
  busy: boolean;
  onCaption: (caption: string) => void;
  onCover: () => void;
  onDelete: () => void;
}

function SortableTile({ photo, caption, isCover, busy, onCaption, onCover, onDelete }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });

  return (
    <div
      ref={setNodeRef}
      className={`edit-tile ${isDragging ? 'is-dragging' : ''} ${busy ? 'is-busy' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="edit-tile-image" {...attributes} {...listeners} title="Drag to move">
        <img src={photo.thumbUrl} alt="" draggable={false} />
        <span className="edit-tile-grip">✥</span>
      </div>
      <div className="edit-tile-tools">
        <button
          className={`btn btn-icon ${isCover ? 'btn-yellow' : ''}`}
          onClick={onCover}
          title={isCover ? 'This is the cover photo' : 'Use as cover photo on the globe'}
        >
          {isCover ? '⭐' : '☆'}
        </button>
        <button className="btn btn-icon" onClick={onDelete} title="Delete photo" disabled={busy}>
          🗑️
        </button>
      </div>
      <input
        className="input edit-tile-caption"
        placeholder="Add a caption…"
        value={caption}
        maxLength={500}
        onChange={(e) => onCaption(e.target.value)}
      />
    </div>
  );
}
