import { useId, useState, type FormEvent } from 'react';
import { PopupDialog } from './PopupDialog';
import { MAX_LIVE_CLOCK_SECONDS } from './workoutPause';

function wholeNumber(value: string, max: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
}

/**
 * Corrects the live workout clock, for a workout whose timer was started late or left running.
 * The clock keeps counting from the time entered.
 */
export function WorkoutTimeEditor({
  elapsedSeconds,
  onSave,
  onClose,
}: {
  elapsedSeconds: number;
  /** The corrected training time so far, in seconds. */
  onSave: (seconds: number) => void;
  onClose: () => void;
}) {
  const startingMinutes = Math.floor(Math.min(elapsedSeconds, MAX_LIVE_CLOCK_SECONDS) / 60);
  const [hours, setHours] = useState(String(Math.floor(startingMinutes / 60)));
  const [minutes, setMinutes] = useState(String(startingMinutes % 60));
  const formId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(
      Math.min(
        MAX_LIVE_CLOCK_SECONDS,
        wholeNumber(hours, 23) * 3600 + wholeNumber(minutes, 59) * 60,
      ),
    );
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
          <button type="submit" form={formId} className="popup-primary-action">
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
            />
          </label>
        </div>
      </form>
    </PopupDialog>
  );
}
