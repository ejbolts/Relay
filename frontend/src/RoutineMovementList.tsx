import { useId, useRef, useState } from 'react';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { Icon } from './Icon';
import { RoutineExerciseSearch } from './RoutineExerciseSearch';
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
  const controlsId = useId();
  const [expanded, setExpanded] = useState<number | null>(null);
  const countButtons = useRef<(HTMLButtonElement | null)[]>([]);
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
            onKeyDown={
              cards && expanded === mi
                ? (event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setExpanded(null);
                      countButtons.current[mi]?.focus();
                    }
                  }
                : undefined
            }
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
            {cards && (
              <button
                type="button"
                className="routine-exercise-count"
                ref={(element) => {
                  countButtons.current[mi] = element;
                }}
                aria-label={`Edit ${cardio ? 'minutes' : 'sets'} for ${name} on ${target}`}
                aria-expanded={expanded === mi}
                aria-controls={expanded === mi ? `${controlsId}-${mi}` : undefined}
                onClick={() => setExpanded(expanded === mi ? null : mi)}
              >
                {cardio
                  ? `${minutes} min`
                  : `${m.sets.length} ${m.sets.length === 1 ? 'set' : 'sets'}`}
                <Icon name="chevron-down" />
              </button>
            )}
            {(!cards || expanded === mi) && (
              <div
                className={
                  cards ? 'routine-exercise-card-controls' : 'routine-exercise-inline-controls'
                }
                id={cards ? `${controlsId}-${mi}` : undefined}
              >
                {cards && !cardio && (
                  <div
                    className="routine-exercise-presets"
                    role="group"
                    aria-label={`Set count for ${name}`}
                  >
                    {[2, 3, 4, 5].map((count) => (
                      <button
                        type="button"
                        key={count}
                        aria-pressed={m.sets.length === count}
                        onClick={() => {
                          movement(mi, (current) => ({
                            ...current,
                            sets: Array.from(
                              { length: count },
                              (_, index) =>
                                current.sets[index] ?? {
                                  ...current.sets.at(-1)!,
                                  set_type: 'normal',
                                },
                            ),
                          }));
                          setExpanded(null);
                          countButtons.current[mi]?.focus();
                        }}
                      >
                        {count} sets
                      </button>
                    ))}
                  </div>
                )}
                <div className="routine-stepper">
                  <button
                    type="button"
                    aria-label={
                      atMinimum && !cards
                        ? `Remove ${name} from ${target}`
                        : cardio
                          ? `5 fewer minutes of ${name} on ${target}`
                          : `One fewer set of ${name} on ${target}`
                    }
                    disabled={cards && atMinimum}
                    onClick={() =>
                      movement(mi, (current) => {
                        if (atMinimum) {
                          setExpanded(null);
                          return null;
                        }
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
                              sets: [
                                ...current.sets,
                                { ...current.sets.at(-1)!, set_type: 'normal' },
                              ],
                            },
                      )
                    }
                  >
                    <Icon name="plus" />
                  </button>
                </div>
                {cards && (
                  <button
                    type="button"
                    className="routine-exercise-card-remove"
                    aria-label={`Remove ${name} from ${target}`}
                    onClick={() => {
                      movement(mi, () => null);
                      setExpanded(null);
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
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
