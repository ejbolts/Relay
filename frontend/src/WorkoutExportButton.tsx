import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { downloadFile, workoutExportFileName } from './downloadFile';
import { Icon } from './Icon';
import type { TrackedWorkout } from './types';

const NOTICE_MS = 4000;

/** Downloads one saved workout in the same CSV format as the full history export. */
export function WorkoutExportButton({ workout }: { workout: TrackedWorkout }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(false), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function exportWorkout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(false);
    try {
      downloadFile(await api.exportWorkout(workout.id), workoutExportFileName(workout));
      setNotice(true);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Could not export this workout. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="export-workout-button"
        disabled={busy}
        onClick={() => void exportWorkout()}
      >
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      {error && (
        <p className="inline-error workout-export-error" role="alert">
          {error}
        </p>
      )}
      {notice &&
        createPortal(
          <div
            className="undo-toast top-toast"
            role="status"
            style={{ '--undo-toast-duration': `${NOTICE_MS}ms` } as CSSProperties}
          >
            <span>Workout exported</span>
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss export notification"
              onClick={() => setNotice(false)}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
