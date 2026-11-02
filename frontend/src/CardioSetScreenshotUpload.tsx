import { useRef, useState } from 'react';
import { api } from './api';
import type { CardioScreenshotScan } from './types';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

export function CardioSetScreenshotUpload({
  onScan,
}: {
  onScan: (scan: CardioScreenshotScan) => void;
}) {
  const busy = useRef(false);
  const [phase, setPhase] = useState<'paste' | 'scan' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importScreenshot(source: File | 'clipboard') {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      let file: File;
      if (source === 'clipboard') {
        setPhase('paste');
        if (!navigator.clipboard?.read) {
          throw new Error('Pasting images is unavailable in this browser. Use Upload screenshot.');
        }
        let items: ClipboardItem[];
        try {
          // Call directly from the tap so Safari retains the user gesture.
          items = await navigator.clipboard.read();
        } catch {
          throw new Error(
            'Clipboard access was not allowed. Try again and allow Paste, or use Upload screenshot.',
          );
        }
        const item = items.find((entry) => IMAGE_TYPES.some((type) => entry.types.includes(type)));
        const type = item && IMAGE_TYPES.find((value) => item.types.includes(value));
        if (!item || !type) {
          throw new Error('No image on the clipboard. Copy a screenshot first, then try again.');
        }
        const blob = await item.getType(type);
        file = new File([blob], `screenshot.${type.split('/')[1]}`, { type });
      } else {
        file = source;
      }
      setPhase('scan');
      const scan = await api.scanCardioScreenshot(file);
      onScan(scan);
      // Completion is shown by the set's existing checkmark; keep scan warnings visible.
      if (scan.warning) setError(scan.warning);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not scan that screenshot.');
    } finally {
      busy.current = false;
      setPhase(null);
    }
  }

  return (
    <div className="cardio-set-screenshot-upload" aria-busy={phase !== null}>
      <div className="cardio-set-screenshot-actions">
        <label className={phase ? 'disabled' : ''}>
          Upload screenshot
          <input
            type="file"
            accept={IMAGE_TYPES.join(',')}
            disabled={phase !== null}
            aria-label="Upload cardio set screenshot"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importScreenshot(file);
            }}
          />
        </label>
        <button
          type="button"
          disabled={phase !== null}
          onClick={() => void importScreenshot('clipboard')}
        >
          Paste screenshot
        </button>
      </div>
      {phase && (
        <small role="status">
          <span className="scanning-label">
            <span className="scanning-spinner" aria-hidden="true" />
            {phase === 'paste' ? 'Reading clipboard' : 'Scanning'}
          </span>
        </small>
      )}
      {error && (
        <small className="warning" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
