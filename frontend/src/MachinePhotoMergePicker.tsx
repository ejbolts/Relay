import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { machineUsedShort } from './machineHistory';
import type { MachinePhotoUsage } from './types';
import { localDate } from './utils';
import './machinePhotoMerge.css';

function photoCount(photo: MachinePhotoUsage) {
  return Math.max(photo.images?.length ?? 1, 1);
}

export function MachinePhotoMergePicker({
  exerciseId,
  photos,
  onMerged,
  onCancel,
}: {
  exerciseId: string;
  photos: MachinePhotoUsage[];
  onMerged: (photo: MachinePhotoUsage, sourceIds: string[]) => void;
  onCancel: () => void;
}) {
  // Selection order is kept so the first machine tapped becomes the default cover.
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [keepId, setKeepId] = useState('');
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const selectedPhotos = selected
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is MachinePhotoUsage => !!photo);
  const allSelected = selected.length === photos.length;
  const mergedPhotoCount = selectedPhotos.reduce((total, photo) => total + photoCount(photo), 0);
  const today = localDate();

  useEffect(() => {
    sectionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [reviewing]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setError('');
  }

  function review() {
    const keep = selectedPhotos[0];
    if (!keep || selectedPhotos.length < 2) return;
    setKeepId(keep.id);
    setCaption(keep.caption);
    setReviewing(true);
    setError('');
  }

  function chooseCover(photo: MachinePhotoUsage) {
    const previous = selectedPhotos.find((item) => item.id === keepId);
    // Follow the cover's name until the user types their own.
    if (!previous || caption.trim() === previous.caption.trim()) setCaption(photo.caption);
    setKeepId(photo.id);
  }

  function leave() {
    if (saving) return;
    if (reviewing) setReviewing(false);
    else onCancel();
  }

  async function merge() {
    if (busy.current || !caption.trim()) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const photo = await api.mergeMachinePhotos(exerciseId, selected, keepId, caption.trim());
      onMerged(photo, selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not merge the machine photos.');
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section
      ref={sectionRef}
      className="machine-merge"
      aria-label={reviewing ? 'Review machine photo merge' : 'Select machine photos to merge'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        leave();
      }}
    >
      {reviewing ? (
        <form
          className="machine-merge-review"
          onSubmit={(event) => {
            event.preventDefault();
            void merge();
          }}
        >
          <div className="machine-merge-header">
            <button type="button" className="machine-merge-back" onClick={leave} disabled={saving}>
              <Icon name="chevron-left" />
              Back
            </button>
            <h3>Merge {selectedPhotos.length} machines</h3>
          </div>
          <fieldset disabled={saving}>
            <legend>Cover and settings</legend>
            <div className="machine-merge-grid">
              {selectedPhotos.map((photo) => {
                const chosen = keepId === photo.id;
                return (
                  <label className={chosen ? 'chosen' : ''} key={photo.id}>
                    <input
                      className="sr-only"
                      type="radio"
                      name="keep-machine"
                      checked={chosen}
                      onChange={() => chooseCover(photo)}
                    />
                    <span className="machine-merge-thumb">
                      <img src={photo.thumbnail_url} alt="" />
                      {chosen && <span className="machine-merge-cover">Cover</span>}
                    </span>
                    <strong>{photo.caption}</strong>
                    {photoCount(photo) > 1 && <small>{photoCount(photo)} photos</small>}
                  </label>
                );
              })}
            </div>
            <label className="machine-merge-name">
              Machine name
              <input
                autoFocus
                required
                maxLength={160}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
            <div className="machine-merge-footer">
              <button type="submit" className="machine-merge-submit" disabled={!caption.trim()}>
                {saving ? 'Merging…' : `Merge into 1 machine · ${mergedPhotoCount} photos`}
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="machine-merge-header">
            <button type="button" className="machine-merge-back" onClick={onCancel}>
              Cancel
            </button>
            <strong role="status">
              {selected.length ? `${selected.length} selected` : 'Select duplicates'}
            </strong>
            <button
              type="button"
              className="machine-merge-all"
              onClick={() => setSelected(allSelected ? [] : photos.map((photo) => photo.id))}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="machine-merge-grid">
            {photos.map((photo) => {
              const order = selected.indexOf(photo.id);
              const chosen = order >= 0;
              return (
                <button
                  type="button"
                  key={photo.id}
                  className={chosen ? 'chosen' : ''}
                  aria-label={`Select ${photo.caption} for merge`}
                  aria-pressed={chosen}
                  onClick={() => toggle(photo.id)}
                >
                  <span className="machine-merge-thumb">
                    <img src={photo.thumbnail_url} alt="" />
                    <span className="machine-merge-check" aria-hidden="true">
                      {chosen && <Icon name="check" />}
                    </span>
                  </span>
                  <strong>{photo.caption}</strong>
                  <small>
                    {photoCount(photo) > 1 && `${photoCount(photo)} photos · `}
                    {machineUsedShort(photo.last_used_date, today)}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="machine-merge-footer">
            <button
              type="button"
              className="machine-merge-submit"
              disabled={selected.length < 2}
              onClick={review}
            >
              {selected.length < 2 ? 'Select 2 or more to merge' : `Merge ${selected.length}`}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="machine-photo-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
