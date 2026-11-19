import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeight } from './weightUnits';
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import './prToast.css';
import { bodyweightContext } from './relativeStrength';
import { Icon } from './Icon';

export interface PrToastEntry {
  exercise: string;
  labels: string[];
  reps: number;
  weightKg: number;
  bodyweightKg?: number | null;
}

export const PR_TOAST_MS = 5000;

/**
 * A compact pill above the rest timer while training, so a record never covers the workout's
 * header, timer or Finish. The set's row keeps its PR badge; Home's finished card lists them all.
 */
export function PrToast({ entries, onClose }: { entries: PrToastEntry[]; onClose: () => void }) {
  const weightUnit = useWeightUnit();
  useEffect(() => {
    const timer = window.setTimeout(onClose, PR_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [entries, onClose]);

  return (
    <aside
      className="undo-toast pr-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ '--undo-toast-duration': `${PR_TOAST_MS}ms` } as CSSProperties}
    >
      <i className="pr-toast-icon" aria-hidden="true">
        🏆
      </i>
      <div className="pr-toast-copy">
        {entries.map((entry, index) => (
          <p key={index}>
            <strong>{entry.labels.join(' + ')}</strong>
            <small>
              {entry.exercise} · {entry.reps} reps at {formatWeight(entry.weightKg, weightUnit)}
              {entry.bodyweightKg != null &&
                ` · ${bodyweightContext(entry.weightKg, entry.bodyweightKg, weightUnit)}`}
            </small>
          </p>
        ))}
      </div>
      <button
        type="button"
        className="undo-toast-close"
        onClick={onClose}
        aria-label="Dismiss personal record popup"
      >
        <Icon name="close" />
      </button>
    </aside>
  );
}
