import { useRef, useState } from 'react';
import { api } from './api';
import { machineUsedShort } from './machineHistory';
import type { MachinePhotoUsage } from './types';
import { localDate } from './utils';
import './machinePhotoMerge.css';

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
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [keepId, setKeepId] = useState('');
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const selectedPhotos = photos.filter((photo) => selected.includes(photo.id));

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
    <section className="machine-merge" aria-label="Select machine photos to merge">
      <div className="machine-merge-toolbar">
        <strong role="status">{selected.length} selected</strong>
        {!reviewing && (
          <>
            <button type="button" onClick={() => setSelected(photos.map((photo) => photo.id))}>
              Select all
            </button>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])}>
                Clear
              </button>
            )}
          </>
        )}
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        {!reviewing && selected.length >= 2 && (
          <button type="button" className="machine-merge-submit" onClick={review}>
            Merge ({selected.length})
          </button>
        )}
      </div>
      {reviewing ? (
        <form
          className="machine-merge-review"
          onSubmit={(event) => {
            event.preventDefault();
            void merge();
          }}
        >
          <h3>Merge machine photos</h3>
          <fieldset disabled={saving}>
            <legend>Keep cover and future settings from</legend>
            <div className="machine-merge-grid">
              {selectedPhotos.map((photo) => (
                <label className={keepId === photo.id ? 'chosen' : ''} key={photo.id}>
                  <img src={photo.thumbnail_url} alt="" />
                  <span>
                    <input
                      type="radio"
                      name="keep-machine"
                      checked={keepId === photo.id}
                      onChange={() => {
                        setKeepId(photo.id);
                        setCaption(photo.caption);
                      }}
                    />
                    {photo.caption}
                  </span>
                </label>
              ))}
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
              <button type="button" onClick={() => setReviewing(false)}>
                Back
              </button>
              <button type="submit" className="machine-merge-submit" disabled={!caption.trim()}>
                {saving ? 'Merging…' : 'Merge photos'}
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="machine-merge-grid">
          {photos.map((photo) => (
            <button
              type="button"
              key={photo.id}
              className={selected.includes(photo.id) ? 'chosen' : ''}
              aria-label={`Select ${photo.caption} for merge`}
              aria-pressed={selected.includes(photo.id)}
              onClick={() => toggle(photo.id)}
            >
              <img src={photo.thumbnail_url} alt="" />
              <span className="machine-merge-check" aria-hidden="true">
                {selected.includes(photo.id) ? '✓' : ''}
              </span>
              <strong>{photo.caption}</strong>
              <small>{machineUsedShort(photo.last_used_date, localDate())}</small>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="machine-photo-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
