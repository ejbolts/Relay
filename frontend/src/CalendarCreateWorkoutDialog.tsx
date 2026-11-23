import { useId } from 'react';
import { calendarCreatePrompt } from './plannedDay';
import { PopupDialog } from './PopupDialog';
import './appDialogs.css';

/** Confirms starting a workout from an empty calendar day; red when it would discard the live one. */
export function CalendarCreateWorkoutDialog({
  workoutDate,
  activeWorkout,
  onCancel,
  onConfirm,
}: {
  workoutDate: string;
  activeWorkout: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const descriptionId = useId();
  const prompt = calendarCreatePrompt(workoutDate, activeWorkout);

  return (
    <PopupDialog
      title={prompt.title}
      size="compact"
      className="calendar-create-dialog"
      describedBy={descriptionId}
      onClose={onCancel}
      actions={
        <>
          <button type="button" autoFocus onClick={onCancel}>
            {prompt.cancel}
          </button>
          <button
            type="button"
            className={
              prompt.destructive ? 'popup-primary-action is-danger' : 'popup-primary-action'
            }
            onClick={onConfirm}
          >
            {prompt.confirm}
          </button>
        </>
      }
    >
      <p id={descriptionId}>{prompt.message}</p>
    </PopupDialog>
  );
}
