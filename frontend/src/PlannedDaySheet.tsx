import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from './api';
import { workoutTypeColor } from './dayColors';
import { Icon } from './Icon';
import {
  plannedDayButtons,
  plannedDayKicker,
  plannedDayOn,
  plannedDayStart,
  plannedDayTitle,
  plannedStartPlan,
  type PlannedStart,
} from './plannedDay';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import { latestTopSets, upNextSetLabel } from './trainingSummary';
import type { Routine, TrackedWorkout, TrainingSplit, WorkoutTypeColors } from './types';
import { useWorkoutTypes } from './workoutTypesContext';
import './calendarDay.css';

export type { PlannedStart } from './plannedDay';

// One request per split as saved; a refreshed dashboard hands over a new split object.
const routineRequests = new WeakMap<TrainingSplit, Promise<Routine | null>>();

function loadSplitRoutine(split: TrainingSplit): Promise<Routine | null> {
  let request = routineRequests.get(split);
  if (!request) {
    request = api.routines
      .list()
      .then((routines) => routines.find((routine) => routine.id === split.routine_id) ?? null);
    routineRequests.set(split, request);
    request.catch(() => routineRequests.delete(split));
  }
  return request;
}

/**
 * Today or a later day in the calendar: what the split plans there and a way to start it now.
 * Workouts always start today, so a later day never gets a workout dated ahead.
 */
export function PlannedDaySheet({
  date,
  today,
  split,
  workouts,
  categoryColors,
  activeWorkout,
  onStart,
  onResume,
  onEditSplit,
  onClose,
}: {
  date: string;
  today: string;
  split: TrainingSplit | null | undefined;
  workouts: TrackedWorkout[];
  categoryColors: WorkoutTypeColors;
  activeWorkout: boolean;
  /** Starts the planned day, or an empty workout when given null. */
  onStart: (start: PlannedStart | null) => void;
  onResume: () => void;
  onEditSplit?: () => void;
  onClose: () => void;
}) {
  const { types, savedExercises } = useWorkoutTypes();
  const weightUnit = useWeightUnit();
  const plan = useMemo(() => plannedDayOn(split, date, today, types), [split, date, today, types]);
  // From today, a rest day can start the next training day early.
  const startPlan = useMemo(
    () => plannedStartPlan(plan, split, today, types),
    [plan, split, today, types],
  );
  const needsRoutine = Boolean(startPlan && split?.routine_id);
  const [routine, setRoutine] = useState<Routine | null | 'loading'>(
    needsRoutine ? 'loading' : null,
  );
  useEffect(() => {
    if (!needsRoutine || !split) return;
    let cancelled = false;
    // Without the routine, the day still starts from its type's saved exercises or last session.
    loadSplitRoutine(split)
      .catch(() => null)
      .then((loaded) => {
        if (!cancelled) setRoutine(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [needsRoutine, split]);

  const start = useMemo<PlannedStart | null>(
    () =>
      !startPlan || routine === 'loading'
        ? null
        : plannedDayStart({ startPlan, routine, workouts, savedExercises, today, weightUnit }),
    [routine, savedExercises, startPlan, today, weightUnit, workouts],
  );
  const latestSets = useMemo(() => latestTopSets(workouts, today), [workouts, today]);
  const loading = needsRoutine && routine === 'loading';
  const shownTemplate = plan.kind === 'training' ? start?.template : null;

  const kicker = plannedDayKicker(date, today);
  const buttons = plannedDayButtons({ plan, startPlan, today, activeWorkout });

  return (
    <PopupDialog
      variant="sheet"
      title={plannedDayTitle(plan)}
      kicker={kicker}
      className={`calendar-day-detail planned-day-sheet${plan.kind === 'training' ? ' has-type-dot' : ''}`}
      // The kicker's dot shows the training day's type colour.
      style={
        plan.kind === 'training'
          ? ({
              '--planned-day-color': workoutTypeColor(plan.type, categoryColors),
            } as CSSProperties)
          : undefined
      }
      onClose={onClose}
    >
      <div className="calendar-day-body">
        {plan.kind === 'training' &&
          (loading ? (
            <p className="planned-day-status" role="status">
              Loading…
            </p>
          ) : (
            shownTemplate &&
            shownTemplate.exercises.length > 0 && (
              <ul className="next-session-exercises planned-day-exercises">
                {shownTemplate.exercises.map((item) => {
                  const label = upNextSetLabel(item, latestSets.get(item.exercise.id), weightUnit);
                  return (
                    <li key={item.exercise.id}>
                      <span>{item.exercise.name}</span>
                      <b className="num" title={label.title}>
                        {label.text}
                      </b>
                    </li>
                  );
                })}
              </ul>
            )
          ))}
        {buttons.resume ? (
          <div className="next-session-actions planned-day-actions">
            <button className="pulse-button primary" type="button" onClick={onResume}>
              <Icon name="play" filled />
              Resume workout
            </button>
          </div>
        ) : buttons.start || buttons.empty ? (
          <div className="next-session-actions planned-day-actions">
            {buttons.start && (
              <button
                className="pulse-button primary"
                type="button"
                disabled={!start}
                aria-label={buttons.start.accessibilityLabel}
                onClick={() => start && onStart(start)}
              >
                <Icon name="play" filled />
                {buttons.start.label}
              </button>
            )}
            {buttons.empty && (
              <button
                className={`pulse-button primary${buttons.empty.compact ? ' next-session-empty' : ''}`}
                type="button"
                aria-label="Start empty workout"
                onClick={() => onStart(null)}
              >
                {buttons.empty.compact ? (
                  buttons.empty.label
                ) : (
                  <>
                    <Icon name="plus" />
                    {buttons.empty.label}
                  </>
                )}
              </button>
            )}
          </div>
        ) : null}
        {onEditSplit && (
          <button
            type="button"
            className="pulse-button link small planned-day-edit-split"
            onClick={onEditSplit}
          >
            {split?.enabled ? 'Edit split' : 'Set up split'}
          </button>
        )}
      </div>
    </PopupDialog>
  );
}
