import { PopupDialog } from './PopupDialog';

function startedLabel(startedAt: number): string {
  return new Date(startedAt).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The end time alone on the day it started, or with its own day after midnight. */
function endedLabel(endedAt: number, startedAt: number): string {
  if (new Date(endedAt).toDateString() !== new Date(startedAt).toDateString())
    return startedLabel(endedAt);
  return new Date(endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

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
          Started {startedLabel(startedAt)} · ended&nbsp;{endedLabel(endedAt, startedAt)} ·{' '}
          {loggedSets}&nbsp;{loggedSets === 1 ? 'set' : 'sets'}&nbsp;logged
        </span>
      </p>
    </PopupDialog>
  );
}
