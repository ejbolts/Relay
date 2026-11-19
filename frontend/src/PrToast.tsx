import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeight } from './weightUnits';
import './prToast.css';
import { bodyweightContext } from './relativeStrength';
import { InlineToast, TOAST_MS } from './Toast';

export interface PrToastEntry {
  exercise: string;
  labels: string[];
  reps: number;
  weightKg: number;
  bodyweightKg?: number | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export const PR_TOAST_MS = TOAST_MS.celebrate;

/**
 * A celebrate toast above the rest timer while training, so a record never covers the workout's
 * header, timer or Finish. The set's row keeps its PR badge; Home's finished card lists them all.
 */
export function PrToast({ entries, onClose }: { entries: PrToastEntry[]; onClose: () => void }) {
  const weightUnit = useWeightUnit();
  const lines = entries.map((entry) => ({
    title: entry.labels.join(' + '),
    detail:
      `${entry.exercise} · ${entry.reps} reps at ${formatWeight(entry.weightKg, weightUnit)}` +
      (entry.bodyweightKg != null
        ? ` · ${bodyweightContext(entry.weightKg, entry.bodyweightKg, weightUnit)}`
        : ''),
  }));
  return (
    <InlineToast
      variant="celebrate"
      message={lines.map((line) => line.title).join(', ')}
      lines={lines}
      dismissLabel="Dismiss personal record popup"
      onDismiss={onClose}
    />
  );
}
