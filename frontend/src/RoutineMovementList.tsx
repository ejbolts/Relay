import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { Icon } from './Icon';
import { RoutineExerciseSearch } from './RoutineExerciseSearch';
import { REP_RANGE_PRESETS, repRangeFromKey, repRangeKey, repRangeLabel } from './repProgression';
import {
  atPlannedMinimum,
  canPlanMore,
  MAX_PLANNED_EXERCISES,
  newRoutineMovement,
  planFewer,
  planMore,
  plannedMinutes,
  swapPlannedExercise,
} from './splitEditing';
import { exerciseMuscles } from './splitTargets';
import type { Exercise, RoutineMovement } from './types';

/**
 * Planned exercises with set (or cardio minute) steppers and a search to add more, shared by
 * split days and workout types.
 */
export function RoutineMovementList({
  movements,
  exercises,
  target,
  fieldLabel,
  latest = (exercise) => exercise,
  canAdd = true,
  layout = 'rows',
  onChange,
}: {
  movements: RoutineMovement[];
  exercises: Exercise[];
  /** What the exercises belong to in labels, such as "day 2" or "Push". */
  target: string;
  /** The accessible name of an exercise's picker, such as "Day 2 exercise 1". */
  fieldLabel: (index: number) => string;
  /** The library's latest copy of an exercise, for up-to-date muscle credits. */
  latest?: (exercise: Exercise) => Exercise;
  canAdd?: boolean;
  layout?: 'rows' | 'cards';
  onChange: (movements: RoutineMovement[]) => void;
}) {
  const cards = layout === 'cards';
  function movement(index: number, change: (item: RoutineMovement) => RoutineMovement | null) {
    onChange(
      movements.flatMap((item, i) => {
        if (i !== index) return [item];
        const next = change(item);
        return next ? [next] : [];
      }),
    );
  }
  return (
    <>
      {movements.map((m, mi) => {
        const cardio = m.exercise.kind === 'cardio';
        const minutes = plannedMinutes(m);
        const atMinimum = atPlannedMinimum(m);
        const name = m.exercise.name;
        return (
          <div
            className={`routine-exercise-row${cards ? ' routine-exercise-card' : ''}`}
            key={`${mi}-${m.exercise_id}`}
          >
            {cards && (
              <span className="routine-exercise-number">{String(mi + 1).padStart(2, '0')}</span>
            )}
            <div className="routine-exercise-main">
              {cards && (
                <span className="routine-exercise-card-name" aria-hidden="true">
                  {name}
                </span>
              )}
              <select
                className="routine-exercise-name"
                aria-label={fieldLabel(mi)}
                value={m.exercise_id}
                onChange={(event) => {
                  const exercise = exercises.find((e) => e.id === event.target.value)!;
                  movement(mi, (current) => swapPlannedExercise(current, exercise));
                }}
              >
                {[m.exercise, ...exercises.filter((e) => e.id !== m.exercise_id)].map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <small>{exerciseMuscles(latest(m.exercise))}</small>
            </div>
            <ExerciseMuscleHelp exercise={m.exercise} />
            <div className="routine-stepper">
              <button
                type="button"
                aria-label={
                  atMinimum
                    ? `Remove ${name} from ${target}`
                    : cardio
                      ? `5 fewer minutes of ${name} on ${target}`
                      : `One fewer set of ${name} on ${target}`
                }
                onClick={() => movement(mi, planFewer)}
              >
                <Icon name={atMinimum && !cards ? 'close' : 'minus'} />
              </button>
              <output>{cardio ? `${minutes} min` : m.sets.length}</output>
              <button
                type="button"
                aria-label={
                  cardio
                    ? `5 more minutes of ${name} on ${target}`
                    : `One more set of ${name} on ${target}`
                }
                disabled={!canPlanMore(m)}
                onClick={() => movement(mi, planMore)}
              >
                <Icon name="plus" />
              </button>
            </div>
            {!cardio && (
              <label className="routine-rep-range">
                Reps
                <select
                  aria-label={`Rep range for ${name} on ${target}`}
                  value={repRangeKey(m.rep_range)}
                  onChange={(event) =>
                    movement(mi, (current) => ({
                      ...current,
                      rep_range: repRangeFromKey(event.target.value),
                    }))
                  }
                >
                  <option value="">Any</option>
                  {[
                    ...REP_RANGE_PRESETS,
                    // A range saved elsewhere that is not one of the usual choices.
                    ...(m.rep_range &&
                    !REP_RANGE_PRESETS.some(
                      (range) => repRangeKey(range) === repRangeKey(m.rep_range),
                    )
                      ? [m.rep_range]
                      : []),
                  ].map((range) => (
                    <option key={repRangeKey(range)} value={repRangeKey(range)}>
                      {repRangeLabel(range)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}
      {canAdd && (
        <RoutineExerciseSearch
          target={target}
          label={cards ? 'Add exercise' : undefined}
          exercises={exercises}
          disabled={movements.length >= MAX_PLANNED_EXERCISES || exercises.length === 0}
          onAdd={(exercise) => onChange([...movements, newRoutineMovement(exercise)])}
        />
      )}
    </>
  );
}
