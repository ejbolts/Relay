import { prettyDate } from './appShared';
import { PopupDialog } from './PopupDialog';
import { sharedBodyweight } from './relativeStrength';
import { useWeightUnit } from './trainingPreferencesContext';
import type { DashboardData, WorkoutTypeColors } from './types';
import { formatMinutesDuration } from './utils';
import { formatWeight } from './weightUnits';
import { effectiveWorkoutType } from './workoutTypes';
import { useWorkoutTypes } from './workoutTypesContext';
import './calendarDay.css';

/** A logged calendar day: its workouts, each opening its session card or the editor. */
export function CalendarDayDetail({
  day,
  categoryColors,
  onClose,
  onStartWorkout,
  onEditWorkout,
  onOpenWorkout,
}: {
  day: DashboardData['heatmap'][number];
  categoryColors: WorkoutTypeColors;
  onClose: () => void;
  onStartWorkout: (workoutDate: string) => void;
  onEditWorkout: (workoutId: string) => void;
  /** Opens the workout's session card; the row falls back to the editor without it. */
  onOpenWorkout?: (workoutId: string) => void;
}) {
  const weightUnit = useWeightUnit();
  const { types } = useWorkoutTypes();

  return (
    <PopupDialog
      variant="sheet"
      title={prettyDate(day.workout_date)}
      kicker="TRAINING DAY"
      className="calendar-day-detail"
      onClose={onClose}
    >
      <div className="calendar-day-body">
        <div className="calendar-day-workouts">
          {day.workouts.map((workout) => (
            <article key={workout.id}>
              <button
                type="button"
                className="calendar-workout-open"
                onClick={() => (onOpenWorkout ?? onEditWorkout)(workout.id)}
                aria-label={
                  onOpenWorkout ? `Open ${workout.name}` : `View and edit ${workout.name}`
                }
              >
                <i
                  style={{
                    background: workout.workout_type_id
                      ? effectiveWorkoutType(workout, types).color
                      : categoryColors[workout.category],
                  }}
                />
                <span>
                  <strong>{workout.name}</strong>
                  <small>
                    {effectiveWorkoutType(workout, types).name} ·{' '}
                    {formatMinutesDuration(workout.duration_minutes)}
                    {sharedBodyweight(workout.exercises) !== null &&
                      ` · at ${formatWeight(sharedBodyweight(workout.exercises)!, weightUnit)} BW`}
                  </small>
                </span>
                <svg className="disclosure-chevron" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m7 4 6 6-6 6" />
                </svg>
              </button>
              {workout.exercises.map((exercise) => (
                <p key={exercise.exercise_name}>
                  <span>
                    {exercise.exercise_name}
                    {exercise.bodyweight_kg !== null &&
                      sharedBodyweight(workout.exercises) === null &&
                      ` · at ${formatWeight(exercise.bodyweight_kg, weightUnit)} BW`}
                  </span>
                  <b>
                    {exercise.set_count} {exercise.set_count === 1 ? 'set' : 'sets'}
                  </b>
                </p>
              ))}
              <button
                type="button"
                className="calendar-edit-workout pulse-button secondary block"
                onClick={() => onEditWorkout(workout.id)}
              >
                {onOpenWorkout ? 'Edit workout' : <>View &amp; edit workout</>}
              </button>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="calendar-add-workout pulse-button tonal block"
          onClick={() => onStartWorkout(day.workout_date)}
        >
          Add another workout
        </button>
      </div>
    </PopupDialog>
  );
}
