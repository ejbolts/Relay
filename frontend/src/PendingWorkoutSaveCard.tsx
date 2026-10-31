import type { PendingWorkoutSave } from './workoutDraft';
import { Icon } from './Icon';

export function PendingWorkoutSaveCard({
  completion,
  saving,
  error,
  onRetry,
  onReview,
}: {
  completion: PendingWorkoutSave;
  saving: boolean;
  error: string | null;
  onRetry: () => void;
  onReview?: () => void;
}) {
  return (
    <section
      className="pulse-card pending-workout-save"
      aria-label="Finished workout"
      aria-live="polite"
    >
      <div className="pending-workout-heading">
        <Icon name="check" />
        <strong>Workout finished</strong>
        <time className="num" dateTime={`PT${completion.payload.duration_minutes}M`}>
          {completion.payload.duration_minutes} min
        </time>
      </div>
      <span>{completion.payload.name}</span>
      <div className="pending-workout-actions">
        <span role={onReview ? 'alert' : 'status'}>
          {saving ? 'Syncing workout…' : (error ?? 'Saved on this device. Waiting to sync.')}
        </span>
        {onReview ? (
          <button type="button" onClick={onReview}>
            Review workout
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={onRetry}>
            {saving ? 'Syncing…' : 'Retry sync'}
          </button>
        )}
      </div>
    </section>
  );
}
