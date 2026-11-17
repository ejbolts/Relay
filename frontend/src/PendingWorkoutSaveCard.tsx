import type { PendingWorkoutSave } from './workoutDraft';
import { Icon } from './Icon';
import { InlineConfirmButton } from './InlineConfirmButton';

export function PendingWorkoutSaveCard({
  completion,
  saving,
  error,
  onRetry,
  onDiscard,
  onReview,
  onKeepMine,
  reviewBlocked = false,
}: {
  completion: PendingWorkoutSave;
  saving: boolean;
  error: string | null;
  onRetry: () => void;
  onDiscard: () => void;
  onReview?: () => void;
  /** The save was refused because the workout changed elsewhere; sends this version anyway. */
  onKeepMine?: () => void;
  /** Another workout is in progress, so this one cannot reopen in the logger yet. */
  reviewBlocked?: boolean;
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
        <span role={onReview || onKeepMine ? 'alert' : 'status'}>
          {saving ? 'Syncing workout…' : (error ?? 'Saved on this device. Waiting to sync.')}
          {onReview && reviewBlocked && ' Finish your current workout to review this one.'}
        </span>
        <span className="pending-workout-buttons">
          <InlineConfirmButton
            label="Discard"
            confirmLabel="Discard workout"
            workingLabel="Discarding…"
            confirmationMessage={
              completion.workoutId
                ? 'These changes have not synced and will be lost.'
                : 'This workout has not synced and will be lost.'
            }
            disabled={saving}
            onConfirm={onDiscard}
          />
          {onKeepMine ? (
            <button type="button" disabled={saving} onClick={onKeepMine}>
              Keep my version
            </button>
          ) : onReview ? (
            <button type="button" disabled={reviewBlocked} onClick={onReview}>
              Review workout
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={onRetry}>
              {saving ? 'Syncing…' : 'Retry sync'}
            </button>
          )}
        </span>
      </div>
    </section>
  );
}
