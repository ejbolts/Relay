import { inactiveWorkoutTimes } from './activeWorkoutTimeout';
import { PopupDialog } from './PopupDialog';

/** Asks what to do with a workout left running, instead of saving it unasked. */
export function InactiveWorkoutDialog({
  name,
  startedAt,
  endedAt,
  loggedSets,
  resuming,
  saving,
  onSave,
  onResume,
  onDiscard,
  onClose,
}: {
  name: string;
  startedAt: number;
  /** Its last activity, which Save records as the end. */
  endedAt: number;
  loggedSets: number;
  resuming: boolean;
  saving: boolean;
  onSave: () => void;
  onResume: () => void;
  onDiscard: () => void;
  /** Closing keeps the workout running without opening it. */
  onClose: () => void;
}) {
  const times = inactiveWorkoutTimes(startedAt, endedAt);
  return (
    <PopupDialog
      title="Unfinished workout"
      className="inactive-workout-dialog"
      onClose={onClose}
      actionsClassName="inactive-workout-actions"
      actions={
        <>
          <button
            type="button"
            className="popup-tertiary-action is-danger inactive-workout-discard"
            onClick={onDiscard}
          >
            {resuming ? 'Discard session' : 'Discard'}
          </button>
          <button type="button" autoFocus onClick={onResume}>
            Resume
          </button>
          <button type="button" className="popup-primary-action" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save workout'}
          </button>
        </>
      }
    >
      <p>
        <strong>{name}</strong>
        <span>
          Started {times.started} · ended&nbsp;{times.ended} · {loggedSets}&nbsp;
          {loggedSets === 1 ? 'set' : 'sets'}&nbsp;logged
        </span>
      </p>
    </PopupDialog>
  );
}
