import { useId, useState, type FormEvent } from 'react';
import { PopupDialog } from './PopupDialog';
import {
  workoutTimeBelowSaved,
  workoutTimeFields,
  workoutTimeSeconds,
} from './workoutTimeCorrection';

/**
 * Corrects the live workout clock, for a workout whose timer was started late or left running.
 * The clock keeps counting from the time entered, and a finished workout starts that long before
 * it ends.
 */
export function WorkoutTimeEditor({
  elapsedSeconds,
  savedMinutes = 0,
  onSave,
  onClose,
}: {
  /** The whole workout's training time so far, including minutes saved before a resume. */
  elapsedSeconds: number;
  /** Minutes a resumed workout already saved: the total can't go below them. */
  savedMinutes?: number;
  /** The corrected training time so far, in seconds, for the whole workout. */
  onSave: (seconds: number) => void;
  onClose: () => void;
}) {
  const [starting] = useState(() => workoutTimeFields(elapsedSeconds));
  const [hours, setHours] = useState(starting.hours);
  const [minutes, setMinutes] = useState(starting.minutes);
  const formId = useId();
  const errorId = useId();
  const belowSaved = workoutTimeBelowSaved(hours, minutes, savedMinutes);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (belowSaved) return;
    onSave(workoutTimeSeconds(hours, minutes));
  }

  return (
    <PopupDialog
      title="Workout time so far"
      className="workout-time-editor"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            className="popup-primary-action"
            disabled={Boolean(belowSaved)}
          >
            Set time
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <div className="workout-time-fields">
          <label>
            Hours
            <input
              type="number"
              min="0"
              max="23"
              inputMode="numeric"
              value={hours}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setHours(event.target.value)}
            />
          </label>
          <label>
            Minutes
            <input
              type="number"
              min="0"
              max="59"
              inputMode="numeric"
              value={minutes}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setMinutes(event.target.value)}
              aria-invalid={belowSaved ? true : undefined}
              aria-describedby={belowSaved ? errorId : undefined}
            />
          </label>
        </div>
        {belowSaved && (
          <p id={errorId} className="inline-error workout-time-error" role="alert">
            {belowSaved}
          </p>
        )}
      </form>
    </PopupDialog>
  );
}
