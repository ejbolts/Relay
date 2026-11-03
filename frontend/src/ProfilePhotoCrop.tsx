import { useEffect, useId, useRef, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { cropProfilePhoto, DEFAULT_PHOTO_CROP, type PhotoCrop } from './profilePhotoGeometry';
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
  const id = useId();
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: PhotoCrop } | null>(null);
  const active = useRef(true);
  const [url, setUrl] = useState('');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState(initialCrop);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heicSource =
    typeof source !== 'string' &&
    (/^image\/hei[cf]/i.test(source.type) || /\.hei[cf]$/i.test(source.name));
  const useCentreCrop = heicSource && !size && Boolean(error);
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
          className="profile-crop-preview"
          role="img"
          aria-label="Circular profile photo preview. Drag to reposition, or use the position controls."
          onPointerDown={(event) => {
            if (!size || busy || !event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId || busy) return;
            const side = event.currentTarget.getBoundingClientRect().width;
            const clamp = (value: number) => Math.max(0, Math.min(1, value));
            setCrop({
              ...start.crop,
              x:
                width > 1
                  ? clamp(start.crop.x - (event.clientX - start.x) / (side * (width - 1)))
                  : 0.5,
              y:
                height > 1
                  ? clamp(start.crop.y - (event.clientY - start.y) / (side * (height - 1)))
                  : 0.5,
            });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onLostPointerCapture={() => (drag.current = null)}
        >
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
        {!size && !error && <span role="status">Loading photo…</span>}
        {(['zoom', 'x', 'y'] as const).map((key) => (
          <label className="profile-crop-control" htmlFor={`${id}-${key}`} key={key}>
            <span id={`${id}-${key}-label`}>
              {key === 'zoom' ? 'Zoom' : key === 'x' ? 'Horizontal position' : 'Vertical position'}
            </span>
            {key === 'zoom' && <output htmlFor={`${id}-${key}`}>{crop.zoom.toFixed(1)}×</output>}
            <input
              id={`${id}-${key}`}
              aria-labelledby={`${id}-${key}-label`}
              type="range"
              min={key === 'zoom' ? 1 : 0}
              max={key === 'zoom' ? 4 : 1}
              step={0.01}
              value={crop[key]}
              disabled={
                !size || busy || (key === 'x' && width <= 1) || (key === 'y' && height <= 1)
              }
              onChange={(event) => setCrop({ ...crop, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="popup-dialog-actions">
        <button type="button" disabled={busy || !size} onClick={() => setCrop(DEFAULT_PHOTO_CROP)}>
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
