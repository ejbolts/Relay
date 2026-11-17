import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeight } from './weightUnits';
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import './prToast.css';
import { bodyweightContext } from './relativeStrength';

export interface PrToastEntry {
  exercise: string;
  labels: string[];
  reps: number;
  weightKg: number;
  bodyweightKg?: number | null;
}

export const PR_TOAST_MS = 5000;

export function PrToast({ entries, onClose }: { entries: PrToastEntry[]; onClose: () => void }) {
  const weightUnit = useWeightUnit();
  useEffect(() => {
    const timer = window.setTimeout(onClose, PR_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [entries, onClose]);

  return (
    <aside
      className="pr-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ '--pr-toast-duration': `${PR_TOAST_MS}ms` } as CSSProperties}
    >
      <span className="pr-toast-icon" aria-hidden="true">
        🏆
      </span>
      <div className="pr-toast-copy">
        {entries.map((entry, index) => (
          <div key={index}>
            <strong>{entry.labels.join(' + ')}</strong>
            <span>{entry.exercise}</span>
            <small>
              {entry.reps} reps at {formatWeight(entry.weightKg, weightUnit)}
              {entry.bodyweightKg != null && (
                <>
                  <br />
                  {bodyweightContext(entry.weightKg, entry.bodyweightKg, weightUnit)}
                </>
              )}
            </small>
          </div>
        ))}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss personal record popup">
        ×
      </button>
      <span className="pr-toast-countdown" aria-hidden="true">
        <span className="pr-toast-countdown-fill" />
      </span>
    </aside>
  );
}
