import { useId } from 'react';
import { prettyDate } from './appShared';
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

  return (
    <PopupDialog
      title={activeWorkout ? 'Cancel your current workout?' : 'Create a new workout?'}
      size="compact"
      className="calendar-create-dialog"
      describedBy={descriptionId}
      onClose={onCancel}
      actions={
        <>
          <button type="button" autoFocus onClick={onCancel}>
            {activeWorkout ? 'Keep current workout' : 'Cancel'}
          </button>
          <button
            type="button"
            className={activeWorkout ? 'popup-primary-action is-danger' : 'popup-primary-action'}
            onClick={onConfirm}
          >
            {activeWorkout ? 'Cancel & create new' : 'Create workout'}
          </button>
        </>
      }
    >
      <p id={descriptionId}>
        {activeWorkout
          ? `Creating a workout for ${prettyDate(workoutDate)} will discard your current unsaved workout.`
          : `Start a workout for ${prettyDate(workoutDate)}?`}
      </p>
    </PopupDialog>
  );
}
