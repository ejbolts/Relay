import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { PopupDialog } from './PopupDialog';
import {
  cropProfilePhoto,
  DEFAULT_PHOTO_CROP,
  gesturePhotoCrop,
  reframePhotoCrop,
  type CropPoint,
  type PhotoCrop,
} from './profilePhotoGeometry';
import './profilePhotoCrop.css';

export function ProfilePhotoCrop({
  source,
  initialCrop = DEFAULT_PHOTO_CROP,
  onUse,
  onClose,
}: {
  source: File | string;
  initialCrop?: PhotoCrop;
  onUse: (file: File, crop: PhotoCrop) => void;
  onClose: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, CropPoint>());
  const gesture = useRef<{ crop: PhotoCrop; points: CropPoint[] } | null>(null);
  const cropRef = useRef(initialCrop);
  const hideContext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const [url, setUrl] = useState('');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState(initialCrop);
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heicSource =
    typeof source !== 'string' &&
    (/^image\/hei[cf]/i.test(source.type) || /\.hei[cf]$/i.test(source.name));
  const useCentreCrop = heicSource && !size && Boolean(error);
  useEffect(
    () => () => {
      if (hideContext.current !== null) clearTimeout(hideContext.current);
    },
    [],
  );

  function reveal() {
    setShowContext(true);
    if (hideContext.current !== null) clearTimeout(hideContext.current);
    hideContext.current = setTimeout(() => setShowContext(false), 1000);
  }

  function updateCrop(next: PhotoCrop) {
    cropRef.current = next;
    setCrop(next);
  }

  function rebaseGesture() {
    gesture.current = pointers.current.size
      ? { crop: cropRef.current, points: [...pointers.current.values()] }
      : null;
  }

  function point(event: PointerEvent<HTMLDivElement>): CropPoint {
    const rect = viewport.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function endPointer(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    rebaseGesture();
  }
  useEffect(() => {
    active.current = true;
    const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => {
      active.current = false;
      if (typeof source !== 'string') URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  const scale = size ? crop.zoom / Math.min(size.width, size.height) : 1;
  const width = size ? size.width * scale : 1;
  const height = size ? size.height * scale : 1;

  async function apply() {
    if (!image.current || !size || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await cropProfilePhoto(image.current, crop);
      if (active.current) onUse(file, crop);
    } catch (reason) {
      if (active.current)
        setError(reason instanceof Error ? reason.message : 'Could not crop photo.');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  return (
    <PopupDialog title="Adjust profile photo" className="profile-crop-dialog" onClose={onClose}>
      <div className="profile-crop-body">
        <div
          className={`profile-crop-stage${showContext ? ' is-adjusting' : ''}`}
          role="group"
          tabIndex={0}
          aria-label="Profile photo crop. Drag to move, pinch to zoom. Arrow keys move; plus and minus zoom."
          onPointerDown={(event) => {
            if (!size || busy || event.button !== 0 || pointers.current.size >= 2) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, point(event));
            rebaseGesture();
            reveal();
          }}
          onPointerMove={(event) => {
            const start = gesture.current;
            if (!size || !start || !pointers.current.has(event.pointerId) || busy) return;
            pointers.current.set(event.pointerId, point(event));
            updateCrop(
              gesturePhotoCrop(size.width, size.height, start.crop, start.points, [
                ...pointers.current.values(),
              ]),
            );
            reveal();
          }}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
          onKeyDown={(event) => {
            if (!size || busy) return;
            const current = cropRef.current;
            const direction: Record<string, CropPoint> = {
              ArrowLeft: { x: -0.03, y: 0 },
              ArrowRight: { x: 0.03, y: 0 },
              ArrowUp: { x: 0, y: -0.03 },
              ArrowDown: { x: 0, y: 0.03 },
            };
            if (direction[event.key]) {
              const delta = direction[event.key];
              updateCrop(
                reframePhotoCrop(
                  size.width,
                  size.height,
                  current,
                  current.zoom,
                  { x: 0.5, y: 0.5 },
                  { x: 0.5 + delta.x, y: 0.5 + delta.y },
                ),
              );
            } else if (['+', '=', '-', '_'].includes(event.key)) {
              updateCrop(
                reframePhotoCrop(
                  size.width,
                  size.height,
                  current,
                  current.zoom * (event.key === '-' || event.key === '_' ? 1 / 1.1 : 1.1),
                ),
              );
            } else return;
            event.preventDefault();
            reveal();
          }}
        >
          {url && (
            <img
              className="profile-crop-context"
              src={url}
              alt=""
              draggable={false}
              aria-hidden="true"
              style={{
                width: `${width * 82}%`,
                height: `${height * 82}%`,
                left: `${9 - (width - 1) * crop.x * 82}%`,
                top: `${9 - (height - 1) * crop.y * 82}%`,
                visibility: size ? 'visible' : 'hidden',
              }}
            />
          )}
          <div className="profile-crop-preview" ref={viewport}>
            {url && (
              <img
                ref={image}
                src={url}
                alt=""
                draggable={false}
                style={{
                  width: `${width * 100}%`,
                  height: `${height * 100}%`,
                  left: `${-(width - 1) * crop.x * 100}%`,
                  top: `${-(height - 1) * crop.y * 100}%`,
                  visibility: size ? 'visible' : 'hidden',
                }}
                onLoad={(event) => {
                  setSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                  setError(null);
                  reveal();
                }}
                onError={() => {
                  setSize(null);
                  setError(
                    heicSource
                      ? 'This browser cannot preview this format. Use a centre crop or choose a JPEG, PNG or WebP.'
                      : 'This photo could not be opened. Try a JPEG, PNG or WebP image.',
                  );
                }}
              />
            )}
          </div>
        </div>
        {!size && !error && <span role="status">Loading photo…</span>}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="popup-dialog-actions">
        <button
          type="button"
          disabled={busy || !size}
          onClick={() => {
            updateCrop(DEFAULT_PHOTO_CROP);
            reveal();
          }}
        >
          Reset
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="popup-primary-action"
          disabled={busy || (!size && !useCentreCrop)}
          onClick={() => {
            if (useCentreCrop && typeof source !== 'string') onUse(source, DEFAULT_PHOTO_CROP);
            else void apply();
          }}
        >
          {busy ? 'Cropping…' : useCentreCrop ? 'Use centre crop' : 'Use crop'}
        </button>
      </div>
    </PopupDialog>
  );
}
