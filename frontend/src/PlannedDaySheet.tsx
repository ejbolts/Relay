import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { useBackdropDismiss } from './backdropDismiss';
import { workoutTypeColor } from './dayColors';
import { Icon } from './Icon';
import {
  categoryForType,
  nextTrainingDay,
  plannedDayOn,
  routineDayFor,
  type PlannedDay,
} from './plannedDay';
import { useWeightUnit } from './trainingPreferencesContext';
import {
  latestTopSets,
  parseLocalDate,
  upNextSetLabel,
  type SessionTemplate,
} from './trainingSummary';
import type {
  Routine,
  TrackedWorkout,
  TrainingSplit,
  WorkoutCategory,
  WorkoutType,
  WorkoutTypeColors,
} from './types';
import { splitDayTemplate } from './upNext';
import { useWorkoutTypes } from './workoutTypesContext';
import './calendarDay.css';

/** A split day to start, pre-filled the way Up next starts one. */
export interface PlannedStart {
  template: SessionTemplate | null;
  category: WorkoutCategory;
  type: WorkoutType;
}

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

function titleFor(plan: PlannedDay): string {
  switch (plan.kind) {
    case 'training':
      return `${plan.type.name} day`;
    case 'rest':
      return 'Rest day';
    case 'update':
      return 'Update your split';
    default:
      return 'Nothing planned';
  }
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
  const titleId = useId();
  const isToday = date === today;
  const plan = useMemo(() => plannedDayOn(split, date, today, types), [split, date, today, types]);
  // From today, a rest day can start the next training day early.
  const startPlan = useMemo(
    () => (plan.kind === 'training' ? plan : isToday ? nextTrainingDay(split, today, types) : null),
    [isToday, plan, split, today, types],
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

  const start = useMemo<PlannedStart | null>(() => {
    if (!startPlan || routine === 'loading') return null;
    const { type, step } = startPlan;
    const category = categoryForType(type);
    return {
      category,
      type,
      template: splitDayTemplate({
        routineDay: routineDayFor(routine, step, type),
        type,
        category,
        name: `${type.name} workout`,
        workouts,
        savedExercises,
        today,
        weightUnit,
      }),
    };
  }, [routine, savedExercises, startPlan, today, weightUnit, workouts]);
  const latestSets = useMemo(() => latestTopSets(workouts, today), [workouts, today]);
  const loading = needsRoutine && routine === 'loading';
  const shownTemplate = plan.kind === 'training' ? start?.template : null;

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const backdropDismiss = useBackdropDismiss(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) root?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const kicker = isToday
    ? 'Today'
    : parseLocalDate(date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
  const canStartEmpty = isToday && !activeWorkout;

  return createPortal(
    <div className="modal-backdrop calendar-day-backdrop" {...backdropDismiss}>
      <section
        className="calendar-day-detail planned-day-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <p className="section-kicker">
              {plan.kind === 'training' && (
                <i
                  className="category-dot"
                  style={{ background: workoutTypeColor(plan.type, categoryColors) }}
                  aria-hidden="true"
                />
              )}
              {kicker}
            </p>
            <h2 id={titleId}>{titleFor(plan)}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close planned day"
          >
            ×
          </button>
        </header>
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
        {activeWorkout ? (
          <div className="next-session-actions planned-day-actions">
            <button className="pulse-button primary" type="button" onClick={onResume}>
              <Icon name="play" filled />
              Resume workout
            </button>
          </div>
        ) : (startPlan && (isToday || plan.kind === 'training')) || canStartEmpty ? (
          <div className="next-session-actions planned-day-actions">
            {startPlan && (isToday || plan.kind === 'training') && (
              <button
                className="pulse-button primary"
                type="button"
                disabled={!start}
                aria-label={
                  isToday ? `Start ${startPlan.type.name}` : `Start ${startPlan.type.name} now`
                }
                onClick={() => start && onStart(start)}
              >
                <Icon name="play" filled />
                {isToday ? `Start ${startPlan.type.name}` : 'Start now'}
              </button>
            )}
            {canStartEmpty && (
              <button
                className={`pulse-button primary${startPlan ? ' next-session-empty' : ''}`}
                type="button"
                aria-label="Start empty workout"
                onClick={() => onStart(null)}
              >
                {startPlan ? (
                  'Empty'
                ) : (
                  <>
                    <Icon name="plus" />
                    Start empty workout
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
      </section>
    </div>,
    document.body,
  );
}
