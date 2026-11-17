import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { Icon } from './Icon';
import { RoutineExerciseSearch } from './RoutineExerciseSearch';
import { REP_RANGE_PRESETS, repRangeFromKey, repRangeKey, repRangeLabel } from './repProgression';
import { exerciseMuscles } from './splitTargets';
import type { Exercise, RoutineMovement, RoutineSet } from './types';

const emptyRoutineSet = (): RoutineSet => ({
  reps: null,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: 180,
  set_type: 'normal',
});

/** A new planned exercise: three empty sets, or a 30 minute session for cardio. */
function newRoutineMovement(exercise: Exercise): RoutineMovement {
  return {
    exercise_id: exercise.id,
    exercise,
    sets:
      exercise.kind === 'cardio'
        ? [{ ...emptyRoutineSet(), duration_seconds: 1800 }]
        : [emptyRoutineSet(), emptyRoutineSet(), emptyRoutineSet()],
  };
}

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
        const minutes = Math.round(
          m.sets.reduce((total, set) => total + (set.duration_seconds ?? 0), 0) / 60,
        );
        const atMinimum = cardio ? minutes <= 5 : m.sets.length <= 1;
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
                  movement(mi, (current) => ({
                    ...current,
                    exercise_id: exercise.id,
                    exercise,
                    sets:
                      exercise.kind === current.exercise.kind ? current.sets : [emptyRoutineSet()],
                    rep_range: exercise.kind === 'cardio' ? null : current.rep_range,
                  }));
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
                onClick={() =>
                  movement(mi, (current) => {
                    if (atMinimum) return null;
                    if (!cardio) return { ...current, sets: current.sets.slice(0, -1) };
                    return {
                      ...current,
                      // One planned duration; earlier interval sets fold into it.
                      sets: [{ ...current.sets[0], duration_seconds: (minutes - 5) * 60 }],
                    };
                  })
                }
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
                disabled={cardio ? minutes >= 600 : m.sets.length >= 50}
                onClick={() =>
                  movement(mi, (current) =>
                    cardio
                      ? {
                          ...current,
                          sets: [{ ...current.sets[0], duration_seconds: (minutes + 5) * 60 }],
                        }
                      : {
                          ...current,
                          sets: [...current.sets, { ...current.sets.at(-1)!, set_type: 'normal' }],
                        },
                  )
                }
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
          disabled={movements.length >= 20 || exercises.length === 0}
          onAdd={(exercise) => onChange([...movements, newRoutineMovement(exercise)])}
        />
      )}
    </>
  );
}
