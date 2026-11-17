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

/** Asks what to do with a workout left running, instead of saving it unasked. */
export function InactiveWorkoutDialog({
  name,
  startedAt,
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
    <PopupDialog title="Unfinished workout" className="inactive-workout-dialog" onClose={onClose}>
      <p>
        <strong>{name}</strong>
        <span>
          Started {startedLabel(startedAt)} · {loggedSets} {loggedSets === 1 ? 'set' : 'sets'}{' '}
          logged
        </span>
      </p>
      <div className="popup-dialog-actions inactive-workout-actions">
        <button type="button" className="inactive-workout-discard" onClick={onDiscard}>
          {resuming ? 'Discard session' : 'Discard'}
        </button>
        <button type="button" autoFocus onClick={onResume}>
          Resume
        </button>
        <button type="button" className="popup-primary-action" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save workout'}
        </button>
      </div>
    </PopupDialog>
  );
}
