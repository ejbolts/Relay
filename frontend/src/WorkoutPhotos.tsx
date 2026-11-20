import { useRef, useState, type CSSProperties } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { InlineConfirmButton } from './InlineConfirmButton';
import { optimisePhoto } from './photoOptimise';
import { PopupDialog } from './PopupDialog';
import { useToast } from './Toast';
import type { WorkoutPhoto } from './types';
import { MAX_WORKOUT_PHOTOS } from './workoutPhotoState';
import './profilePhotoViewer.css';
import './workoutPhotos.css';

/** The longest side of the small copy the server keeps beside the full photo. */
const THUMBNAIL_SIDE = 360;

type Layout = 'feed' | 'strip';

/** Lets the browser pick the small copy for small tiles and the full photo for large ones. */
function sources(photo: WorkoutPhoto): string {
  const scale = Math.min(1, THUMBNAIL_SIDE / Math.max(photo.width, photo.height));
  const thumbnailWidth = Math.max(1, Math.round(photo.width * scale));
  return `${photo.thumbnail_url} ${thumbnailWidth}w, ${photo.full_url} ${photo.width}w`;
}

function sizes(layout: Layout, count: number): string {
  if (layout === 'strip') return '5rem';
  return count === 1 ? '(min-width: 44rem) 40rem, 100vw' : '(min-width: 44rem) 20rem, 50vw';
}

/**
 * A workout's photos: a collage in the feed, or a row of small tiles in a workout's details.
 * Each opens full screen, where its owner can remove it.
 */
export function WorkoutPhotos({
  photos,
  subject,
  layout = 'feed',
  onRemove,
}: {
  photos: WorkoutPhoto[];
  /** Whose workout this is, for the photos' accessible names, such as “Alex’s Upper body”. */
  subject: string;
  layout?: Layout;
  /** Given for your own workout: removes the photo being viewed. */
  onRemove?: (photo: WorkoutPhoto) => Promise<void>;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const viewing = photos.find((photo) => photo.id === viewingId) ?? null;
  const position = viewing ? photos.indexOf(viewing) : -1;
  if (!photos.length) return null;

  function close() {
    setViewingId(null);
    setRemoveError(null);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    <>
      <div
        className={`workout-photos workout-photos-${layout}`}
        data-count={Math.min(photos.length, MAX_WORKOUT_PHOTOS)}
        role="group"
        aria-label={`Photos of ${subject}`}
        style={
          layout === 'feed' && photos.length === 1
            ? ({ '--photo-ratio': `${photos[0].width} / ${photos[0].height}` } as CSSProperties)
            : undefined
        }
      >
        {photos.slice(0, MAX_WORKOUT_PHOTOS).map((photo, index) => (
          <button
            type="button"
            key={photo.id}
            aria-label={`View photo ${index + 1} of ${photos.length} of ${subject}`}
            aria-haspopup="dialog"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setFailed(null);
              setViewingId(photo.id);
            }}
          >
            <img
              src={photo.thumbnail_url}
              srcSet={sources(photo)}
              sizes={sizes(layout, photos.length)}
              width={photo.width}
              height={photo.height}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>
      {viewing && (
        <PopupDialog
          variant="screen"
          title={photos.length > 1 ? `Photo ${position + 1} of ${photos.length}` : 'Workout photo'}
          className="profile-photo-viewer workout-photo-viewer"
          headerActions={
            onRemove && (
              <InlineConfirmButton
                className="workout-photo-remove"
                label="Remove"
                confirmLabel="Confirm remove"
                workingLabel="Removing…"
                onConfirm={async () => {
                  setRemoveError(null);
                  try {
                    await onRemove(viewing);
                    close();
                  } catch (reason) {
                    setRemoveError(authErrorMessage(reason));
                  }
                }}
              />
            )
          }
          onClose={close}
        >
          <div className="profile-photo-viewer-content">
            {failed === viewing.id ? (
              <p role="alert">This photo could not be loaded. Close and try again.</p>
            ) : (
              <img
                src={viewing.full_url}
                alt={`Photo ${position + 1} of ${subject}`}
                onError={() => setFailed(viewing.id)}
              />
            )}
            {photos.length > 1 && (
              <div className="workout-photo-steps">
                <button
                  type="button"
                  aria-label="Previous photo"
                  disabled={position === 0}
                  onClick={() => setViewingId(photos[position - 1].id)}
                >
                  <Icon name="chevron-left" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  disabled={position === photos.length - 1}
                  onClick={() => setViewingId(photos[position + 1].id)}
                >
                  <Icon name="chevron-right" />
                </button>
              </div>
            )}
          </div>
          {removeError && (
            <p className="inline-error workout-photo-error" role="alert">
              {removeError}
            </p>
          )}
        </PopupDialog>
      )}
    </>
  );
}

/**
 * Your own workout's photos, with a button to add another. `onChange` receives the new list as
 * soon as the server has saved or removed a photo.
 */
export function WorkoutPhotoEditor({
  workoutId,
  photos,
  subject,
  layout = 'strip',
  canAdd = true,
  onChange,
}: {
  workoutId: string;
  photos: WorkoutPhoto[];
  subject: string;
  layout?: Layout;
  /** False where photos can be viewed and removed but not added, such as History. */
  canAdd?: boolean;
  onChange: (photos: WorkoutPhoto[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const latest = useRef(photos);
  latest.current = photos;

  async function add(file: File) {
    setAdding(true);
    setError(null);
    try {
      const saved = await api.uploadWorkoutPhoto(workoutId, await optimisePhoto(file));
      onChange([...latest.current, saved]);
      toast.show('Photo added');
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setAdding(false);
    }
  }

  const full = !canAdd || photos.length >= MAX_WORKOUT_PHOTOS;
  if (!canAdd && !photos.length) return null;
  return (
    <div className={`workout-photo-editor workout-photo-editor-${layout}`}>
      <WorkoutPhotos
        photos={photos}
        subject={subject}
        layout={layout}
        onRemove={async (photo) => {
          await api.deleteWorkoutPhoto(photo.id);
          onChange(latest.current.filter((item) => item.id !== photo.id));
          toast.show('Photo removed');
        }}
      />
      {!full && (
        <button
          type="button"
          className="workout-photo-add"
          disabled={adding}
          aria-label={layout === 'feed' ? (adding ? 'Adding photo…' : 'Add photo') : undefined}
          onClick={() => input.current?.click()}
        >
          <Icon name="photos" />
          {/* In the feed the button is a bare photo icon beside the workout's other icons. */}
          {layout !== 'feed' && (adding ? 'Adding…' : 'Add photo')}
        </button>
      )}
      {canAdd && (
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          aria-label={`Add a photo to ${subject}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same photo again still counts as a change.
            event.target.value = '';
            if (file) void add(file);
          }}
        />
      )}
      {error && (
        <p className="inline-error workout-photo-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
