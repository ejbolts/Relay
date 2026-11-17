import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { routineSessionTemplate, typeSessionTemplate } from './routines';
import { recentDistinctWorkouts } from './startChoices';
import { useWeightUnit } from './trainingPreferencesContext';
import {
  sessionTemplateFor,
  sessionTemplateFromWorkout,
  shortDate,
  type SessionTemplate,
} from './trainingSummary';
import { useWorkoutTypes } from './workoutTypesContext';
import type { Routine, RoutineDay, TrackedWorkout, WorkoutCategory, WorkoutType } from './types';
import './startChooser.css';

export interface ChosenStart {
  template: SessionTemplate | null;
  category: WorkoutCategory;
  type: WorkoutType | null;
}

const preview = (names: string[]) =>
  names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');

/**
 * Starts a workout other than the one Up next suggests: any training day of the active split,
 * or a past workout to do again.
 */
export function StartChooser({
  workouts,
  today,
  onStart,
  onClose,
}: {
  workouts: TrackedWorkout[];
  today: string;
  onStart: (choice: ChosenStart) => void;
  onClose: () => void;
}) {
  const unit = useWeightUnit();
  const { savedExercises } = useWorkoutTypes();
  const [routine, setRoutine] = useState<Routine | null>(null);
  // The choices wait for the split, so the rows do not move under a finger once it arrives.
  const [split, setSplit] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const recent = useMemo(() => recentDistinctWorkouts(workouts), [workouts]);

  useEffect(() => {
    let cancelled = false;
    setSplit('loading');
    void Promise.all([api.getTrainingSplit(), api.routines.list()])
      .then(([active, routines]) => {
        if (cancelled) return;
        setRoutine(routines.find((item) => item.id === active?.routine_id) ?? null);
        setSplit('ready');
      })
      .catch(() => {
        if (!cancelled) setSplit('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const days = (routine?.days ?? []).flatMap((day, index) =>
    day.workout_type ? [{ day, number: index + 1, type: day.workout_type }] : [],
  );

  function startDay(day: RoutineDay, type: WorkoutType) {
    const category = (type.is_custom ? 'other' : type.id) as WorkoutCategory;
    const name = `${type.name} workout`;
    const saved = savedExercises[type.id];
    // The same order Up next uses: the day's own plan, then the type's saved exercises, then
    // the last session of that type.
    const template = day.movements.length
      ? routineSessionTemplate(day, name, today, unit)
      : saved?.length
        ? typeSessionTemplate(type, saved, name, today, unit)
        : sessionTemplateFor(workouts, category, today, unit, type.is_custom ? type.id : null);
    onStart({ template, category, type });
  }

  return (
    <PopupDialog title="Choose a workout" className="start-chooser" onClose={onClose}>
      <div className="start-chooser-body">
        {split === 'loading' && (
          <p className="start-chooser-status" role="status">
            Loading…
          </p>
        )}
        {split === 'failed' && (
          <p className="start-chooser-status" role="alert">
            Could not load your split.{' '}
            <button type="button" className="text-link" onClick={() => setAttempt(attempt + 1)}>
              Retry
            </button>
          </p>
        )}
        {split === 'ready' && days.length === 0 && recent.length === 0 && (
          <p className="start-chooser-status">No split days or saved workouts yet.</p>
        )}
        {days.length > 0 && (
          <section aria-labelledby="start-chooser-split">
            <h3 id="start-chooser-split">{routine?.name}</h3>
            <ul>
              {days.map(({ day, number, type }) => (
                <li key={number}>
                  <button type="button" onClick={() => startDay(day, type)}>
                    <i
                      className="start-chooser-colour"
                      style={{ background: type.color }}
                      aria-hidden="true"
                    />
                    <span className="start-chooser-copy">
                      <strong>
                        Day {number} · {type.name}
                      </strong>
                      {day.movements.length > 0 && (
                        <small>{preview(day.movements.map((item) => item.exercise.name))}</small>
                      )}
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {split !== 'loading' && recent.length > 0 && (
          <section aria-labelledby="start-chooser-recent">
            <h3 id="start-chooser-recent">Do again</h3>
            <ul>
              {recent.map((workout) => (
                <li key={workout.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onStart({
                        template: sessionTemplateFromWorkout(workout, unit),
                        category: workout.category,
                        type: workout.workout_type ?? null,
                      })
                    }
                  >
                    <span className="start-chooser-icon" aria-hidden="true">
                      <Icon name="history" />
                    </span>
                    <span className="start-chooser-copy">
                      <strong>{workout.name}</strong>
                      <small>
                        {shortDate(workout.workout_date)} ·{' '}
                        {preview(workout.movements.map((item) => item.exercise.name))}
                      </small>
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PopupDialog>
  );
}
