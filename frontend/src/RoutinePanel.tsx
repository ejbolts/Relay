import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { api } from './api';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { Icon } from './Icon';
import { NotificationDialog } from './NotificationDialog';
import { PopupDialog } from './PopupDialog';
import { RoutineExerciseSearch } from './RoutineExerciseSearch';
import { CARDIO_ROW, SplitVolumeChart } from './SplitVolumeChart';
import { dayCardioMinutes, daySetCredits, exerciseSetCredits, formatVolume } from './splitTargets';
import { useTrainingPreferences } from './trainingPreferencesContext';
import { useWorkoutTypes } from './workoutTypesContext';
import { localDate } from './utils';
import { SplitScheduleChoice } from './SplitScheduleChoice';
import { SPLIT_TEMPLATES } from './trainingSplit';
import type {
  Exercise,
  Routine,
  RoutineDay,
  RoutineSet,
  SplitProgression,
  TrainingSplit,
} from './types';
import './routines.css';

const emptySet = (): RoutineSet => ({
  reps: null,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: 180,
  set_type: 'normal',
});
const failure = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Could not save the split. Try again.';
const dayCount = (days: RoutineDay[]) => `${days.length} ${days.length === 1 ? 'day' : 'days'}`;

function RoutinePattern({ days }: { days: RoutineDay[] }) {
  return (
    <span className="routine-pattern" aria-hidden="true">
      {days.map((day, index) => (
        <i
          key={index}
          className={day.workout_type ? undefined : 'is-rest'}
          style={day.workout_type ? { background: day.workout_type.color } : undefined}
        />
      ))}
    </span>
  );
}

const MAX_PIPS = 10;

/** A day's cycle as one row per exercise, with a block for each planned set. */
function RoutineCycle({ routine }: { routine: Routine }) {
  const [showMuscles, setShowMuscles] = useState(false);
  return (
    <div className="routine-cycle-view">
      <div className="routine-cycle-tools">
        <button
          type="button"
          className="routine-muscle-toggle"
          aria-pressed={showMuscles}
          onClick={() => setShowMuscles((value) => !value)}
        >
          Muscles
        </button>
      </div>
      <ol className="routine-cycle">
        {routine.days.map((day, index) => {
          const sets = day.movements
            .filter(({ exercise }) => exercise.kind !== 'cardio')
            .reduce((total, movement) => total + movement.sets.length, 0);
          const minutes = Math.round(dayCardioMinutes(day));
          const total = [
            sets && `${sets} ${sets === 1 ? 'set' : 'sets'}`,
            minutes && `${minutes} min`,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={index}
              className={day.workout_type ? undefined : 'is-rest'}
              style={
                { '--day-colour': day.workout_type?.color ?? 'var(--p-deemph)' } as CSSProperties
              }
            >
              <div className="routine-cycle-day">
                <span className="routine-cycle-number">{index + 1}</span>
                <strong>
                  {day.workout_type?.name ?? (day.workout_type_id ? 'Removed type' : 'Rest')}
                </strong>
                {total && <span className="routine-cycle-total">{total}</span>}
              </div>
              {day.movements.length ? (
                <ul>
                  {day.movements.map((movement, mi) => {
                    const cardio = movement.exercise.kind === 'cardio';
                    const length = Math.round(
                      movement.sets.reduce((sum, set) => sum + (set.duration_seconds ?? 0), 0) / 60,
                    );
                    const count = movement.sets.length;
                    return (
                      <li className="routine-exercise" key={mi}>
                        <span className="routine-exercise-label">
                          {movement.exercise.name}
                          {showMuscles && <small>{exerciseMuscles(movement.exercise)}</small>}
                        </span>
                        {cardio ? (
                          <span className="routine-cardio-length">
                            <span
                              className="routine-cardio-bar"
                              aria-hidden="true"
                              style={{ width: `${Math.max(6, Math.min(length, 120) * 0.6)}px` }}
                            />
                            {length} min
                          </span>
                        ) : (
                          <span
                            className="routine-pips"
                            role="img"
                            aria-label={`${count} ${count === 1 ? 'set' : 'sets'}`}
                          >
                            {Array.from({ length: Math.min(count, MAX_PIPS) }, (_, pip) => (
                              <i key={pip} />
                            ))}
                            {count > MAX_PIPS && <span>+{count - MAX_PIPS}</span>}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="routine-cycle-empty">
                  {day.workout_type_id ? 'No exercises' : 'Rest day'}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function RoutinePanel({
  ownerId,
  own,
  active = true,
  revision,
  heading = 'Splits',
  embedded = false,
  activeId,
  initialOpenId,
  onOpenSplits,
  onUsed,
  onChanged,
  trainingSplit,
  renderPreview,
}: {
  trainingSplit?: TrainingSplit | null;
  renderPreview?: (split: TrainingSplit) => ReactNode;
  ownerId: string;
  own: boolean;
  active?: boolean;
  revision?: string | null;
  heading?: string;
  /** Sits inside a page that already names it, so the card chrome and title are hidden. */
  embedded?: boolean;
  activeId?: string | null;
  initialOpenId?: string;
  onOpenSplits?: (routineId?: string) => void;
  onUsed?: (split: TrainingSplit) => void;
  onChanged?: (routineId: string) => void;
}) {
  const headingId = useId();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [using, setUsing] = useState<Routine | null>(null);
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const [options, setOptions] = useState<Routine | null>(null);
  const [startDate, setStartDate] = useState(localDate());
  const [progression, setProgression] = useState<SplitProgression>('workouts');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string[]>([]);
  const [importedId, setImportedId] = useState<string | null>(null);
  const locked = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialOpenId ?? activeId ?? null);
  const previousActive = useRef(activeId);
  const panelRef = useRef<HTMLElement>(null);
  const focusCard = useRef<string | null>(null);
  useEffect(() => {
    if (activeId !== previousActive.current) {
      previousActive.current = activeId;
      if (activeId) setExpandedId(activeId);
    }
  }, [activeId]);
  useEffect(() => {
    if (!embedded || !focusCard.current) return;
    const card = [...(panelRef.current?.querySelectorAll<HTMLElement>('.routine-card') ?? [])].find(
      (el) => el.dataset.routineId === focusCard.current,
    );
    if (!card) return;
    card.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
    card.scrollIntoView?.({ block: 'nearest' });
    focusCard.current = null;
  }, [embedded, expandedId, routines, activeId]);
  const types = useWorkoutTypes();
  useEffect(() => {
    if (!active) return;
    let live = true;
    (own ? api.routines.list() : api.routines.profile(ownerId)).then(
      (items) => {
        if (live) {
          setRoutines(items);
          setError(null);
        }
      },
      (reason) => {
        if (live) setError(failure(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [ownerId, own, active, revision, attempt]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      window.dispatchEvent(new Event('focus'));
    } catch (reason) {
      setError(failure(reason));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function copy(routine: Routine) {
    await run(async () => {
      const saved = await api.routines.copy(ownerId, routine.id);
      setImportedId(saved.id);
      setCopied((ids) => [...ids, routine.id]);
      await types.reload();
      setEditing(saved);
    });
  }
  const legacy: Routine | null =
    embedded && trainingSplit && !trainingSplit.routine_id
      ? {
          id: 'current-split',
          name: trainingSplit.name,
          shared: false,
          days: trainingSplit.steps.map((step) => ({
            workout_type_id: step.workout_type_id,
            workout_type: types.types.find((t) => t.id === step.workout_type_id) ?? null,
            movements: [],
          })),
        }
      : null;
  const items = [...(legacy ? [legacy] : []), ...(routines ?? [])];
  // The active plan leads; stable ordering keeps the rest of the library in place.
  const displayed = [...items].sort(
    (a, b) => Number(b.id === activeId) - Number(a.id === activeId),
  );
  const hasTemplate = (preset: (typeof SPLIT_TEMPLATES)[number]) =>
    (routines ?? []).some(
      (routine) =>
        routine.days.length === preset.types.length &&
        routine.days.every((day, index) => day.workout_type_id === preset.types[index]),
    );
  function template(id: string) {
    const existing = SPLIT_TEMPLATES.find((t) => t.id === id);
    if (existing && hasTemplate(existing)) return;
    const preset = SPLIT_TEMPLATES.find((t) => t.id === id) ?? {
      name: 'My split',
      types: [types.types.find((t) => !t.archived)?.id ?? 'upper'],
    };
    setError(null);
    setEditing({
      id: '',
      name: preset.name === 'FBEOD' ? 'Full body / Rest' : preset.name,
      shared: false,
      days: preset.types.map((typeId) => ({
        workout_type_id: typeId,
        workout_type: types.types.find((t) => t.id === typeId) ?? null,
        movements: [],
      })),
    });
  }
  const showView = !own && copied.length > 0 && onOpenSplits;
  return (
    <section
      className={embedded ? 'routine-panel routine-panel-embedded' : 'pulse-card routine-panel'}
      aria-labelledby={headingId}
      ref={panelRef}
    >
      {embedded ? (
        <header className="routine-heading split-library-heading">
          <h2 id={headingId}>{heading}</h2>
          <button
            type="button"
            className="routine-link"
            disabled={busy || types.loading}
            onClick={() => template('custom')}
          >
            <Icon name="plus" />
            New split
          </button>
        </header>
      ) : (
        <header className="routine-heading">
          <h2 id={headingId}>{heading}</h2>
          {own && onOpenSplits && (
            <button type="button" className="routine-link" onClick={() => onOpenSplits()}>
              My splits
              <Icon name="chevron-right" />
            </button>
          )}
        </header>
      )}
      {own && !embedded && (
        <div className="routine-create">
          <button type="button" disabled={busy || types.loading} onClick={() => template('custom')}>
            <Icon name="plus" />
            New split
          </button>
        </div>
      )}
      {error && !editing && !using && !deleting && !options && (
        <p className="inline-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => setAttempt((x) => x + 1)}>
            Try again
          </button>
        </p>
      )}
      {notice && <NotificationDialog message={notice} onClose={() => setNotice(null)} />}
      {showView && (
        <div className="routine-notice">
          <button
            type="button"
            className="routine-link"
            onClick={() => onOpenSplits(importedId ?? undefined)}
          >
            View my splits
            <Icon name="chevron-right" />
          </button>
        </div>
      )}
      {!routines && !error && <p role="status">Loading splits…</p>}
      {routines && displayed.length === 0 && (
        <p className="shared-card-empty">{own ? 'No saved splits.' : 'No shared splits.'}</p>
      )}
      <div className="routine-list">
        {displayed.map((routine) => (
          <details
            className="routine-card"
            key={routine.id}
            data-routine-id={routine.id}
            open={embedded ? expandedId === routine.id : routine.id === initialOpenId || undefined}
          >
            <summary
              onClick={
                embedded
                  ? (event) => {
                      event.preventDefault();
                      setExpandedId((current) => (current === routine.id ? null : routine.id));
                    }
                  : undefined
              }
            >
              <span className="routine-card-title">
                <strong>{routine.name}</strong>
                <span className="routine-card-meta">
                  <span>{dayCount(routine.days)}</span>
                  {own && <span>{routine.shared ? 'On profile' : 'Only you'}</span>}
                </span>
              </span>
              {own && routine.id === activeId && <span className="routine-active">Active</span>}
              <Icon name="chevron-down" />
              <RoutinePattern days={routine.days} />
            </summary>
            {embedded && routine.id === activeId && trainingSplit && renderPreview && (
              <div className="split-card-preview">{renderPreview(trainingSplit)}</div>
            )}
            {embedded && routine.id === activeId ? (
              routine.days.some((day) => day.movements.length > 0) && (
                <details className="split-plan-exercises">
                  <summary>Exercises &amp; sets</summary> <RoutineCycle routine={routine} />
                </details>
              )
            ) : (
              <RoutineCycle routine={routine} />
            )}
            <div className="routine-actions">
              {own ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setEditing(structuredClone(routine));
                    }}
                  >
                    Edit split
                  </button>
                  {routine.id !== 'current-split' && (
                    <button
                      type="button"
                      className="routine-options-button"
                      aria-label={`Options for ${routine.name}`}
                      onClick={() => {
                        setError(null);
                        setOptions(routine);
                      }}
                    >
                      <Icon name="more" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={routine.id === activeId ? 'routine-secondary' : 'routine-primary'}
                    onClick={() => {
                      setError(null);
                      setStartDate(
                        routine.id === activeId
                          ? (trainingSplit?.start_date ?? localDate())
                          : localDate(),
                      );
                      setProgression(trainingSplit?.progression ?? 'workouts');
                      setUsing(routine);
                    }}
                  >
                    {routine.id === activeId ? 'Change schedule' : 'Use split'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="routine-primary routine-save"
                  disabled={busy || copied.includes(routine.id)}
                  onClick={() => void copy(routine)}
                >
                  {copied.includes(routine.id) ? (
                    <>
                      <Icon name="check" />
                      Saved
                    </>
                  ) : (
                    'Save split'
                  )}
                </button>
              )}
            </div>
          </details>
        ))}
      </div>
      {embedded && (
        <section className="split-library-templates" aria-label="Split templates">
          <h2>Templates</h2>
          <div className="split-templates">
            {SPLIT_TEMPLATES.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className="split-template"
                disabled={
                  busy || !routines || types.loading || !!types.error || hasTemplate(preset)
                }
                title={hasTemplate(preset) ? 'Already in My splits' : undefined}
                onClick={() => template(preset.id)}
              >
                <span>
                  <strong>{preset.id === 'fbeod' ? 'Full body / Rest' : preset.name}</strong>
                  <Icon name={hasTemplate(preset) ? 'check' : 'plus'} />
                </span>
                <span className="split-template-pattern" aria-hidden="true">
                  {preset.types.map((id, index) => (
                    <i
                      key={index}
                      className={id === null ? 'is-rest' : ''}
                      style={
                        id
                          ? { backgroundColor: types.types.find((t) => t.id === id)?.color }
                          : undefined
                      }
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {options && (
        <PopupDialog
          title="Split options"
          onClose={() => {
            if (!busy) {
              setOptions(null);
              setError(null);
            }
          }}
        >
          <div className="routine-options">
            <strong>{options.name}</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (
                    !options.shared &&
                    options.days.some(
                      (day) => day.workout_type_id !== null && !day.movements.length,
                    )
                  ) {
                    throw new Error(
                      'Add an exercise to each workout day in Edit split, then try again.',
                    );
                  }
                  const saved = await api.routines.save({ ...options, shared: !options.shared });
                  setRoutines((items) =>
                    items!.map((item) => (item.id === saved.id ? saved : item)),
                  );
                  setOptions(null);
                  setNotice(
                    saved.shared
                      ? 'Split shown on your profile.'
                      : 'Split hidden from your profile.',
                  );
                  onChanged?.(saved.id);
                })
              }
            >
              <Icon name={options.shared ? 'hide' : 'people'} />
              {options.shared ? 'Hide from my profile' : 'Show on my profile'}
            </button>
            {options.id !== activeId && (
              <button
                type="button"
                className="routine-delete"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setDeleting(options);
                  setOptions(null);
                }}
              >
                <Icon name="close" />
                Delete split
              </button>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </PopupDialog>
      )}
      {editing && (
        <RoutineEditor
          key={editing.id || 'new'}
          routine={editing}
          schedule={
            editing.id === 'current-split' || editing.id === trainingSplit?.routine_id
              ? (trainingSplit ?? undefined)
              : undefined
          }
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setEditing(null);
              setError(null);
            }
          }}
          onSave={(next, schedule) =>
            void run(async () => {
              const legacyEdit = next.id === 'current-split';
              const content = { name: next.name, shared: next.shared, days: next.days };
              const saved =
                next.id && !legacyEdit
                  ? await (schedule ? api.routines.save(next, schedule) : api.routines.save(next))
                  : await (schedule
                      ? api.routines.create(content, schedule)
                      : api.routines.create(content));
              if (own)
                setRoutines((items) => [
                  saved,
                  ...(items ?? []).filter((item) => item.id !== saved.id),
                ]);
              if (schedule)
                onUsed?.({
                  name: saved.name,
                  routine_id: saved.id,
                  ...schedule,
                  steps: saved.days.map((day) => ({ workout_type_id: day.workout_type_id })),
                });
              focusCard.current = saved.id;
              setEditing(null);
              setExpandedId(saved.id);
              setNotice('Split saved.');
              onChanged?.(saved.id);
            })
          }
        />
      )}
      {using && (
        <PopupDialog
          title="Use split"
          onClose={() => {
            if (!busy) setUsing(null);
          }}
        >
          <form
            className="routine-use"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const saved =
                  using.id === 'current-split'
                    ? await api.saveTrainingSplit({
                        ...trainingSplit!,
                        start_date: startDate,
                        enabled: true,
                        progression,
                      })
                    : await api.routines.use(using.id, startDate, progression);
                focusCard.current = using.id;
                onUsed?.(saved);
                setUsing(null);
              });
            }}
          >
            <div className="routine-use-summary">
              <strong>{using.name}</strong>
              <span>{dayCount(using.days)}</span>
              <RoutinePattern days={using.days} />
            </div>
            <label>
              Start date
              <input
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={busy}
              />
            </label>
            <SplitScheduleChoice value={progression} disabled={busy} onChange={setProgression} />
            <p className="routine-note">Replaces your active split. Saved splits stay available.</p>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button className="popup-primary-action" disabled={busy}>
              {busy ? 'Saving…' : 'Use this split'}
            </button>
          </form>
        </PopupDialog>
      )}
      {deleting && (
        <PopupDialog
          title="Delete split?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <div className="routine-confirm">
            <p>
              {deleting.name} will be removed from your library and profile. Friends keep their
              saved copies.
            </p>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <div className="popup-dialog-actions">
              <button type="button" disabled={busy} onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="popup-primary-action routine-danger-action"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.routines.remove(deleting.id);
                    onChanged?.(deleting.id);
                    setRoutines((items) => items!.filter((item) => item.id !== deleting.id));
                    setDeleting(null);
                  })
                }
              >
                {busy ? 'Deleting…' : 'Delete split'}
              </button>
            </div>
          </div>
        </PopupDialog>
      )}
    </section>
  );
}

function daySummary(day: RoutineDay) {
  if (!day.workout_type_id) return 'Rest';
  if (!day.movements.length) return 'No exercises';
  const sets = day.movements
    .filter(({ exercise }) => exercise.kind !== 'cardio')
    .reduce((total, movement) => total + movement.sets.length, 0);
  const minutes = Math.round(dayCardioMinutes(day));
  const parts = [
    `${day.movements.length} ${day.movements.length === 1 ? 'exercise' : 'exercises'}`,
  ];
  if (sets) parts.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`);
  if (minutes) parts.push(`${minutes} min`);
  return parts.join(' · ');
}

/** What one session of a day adds to the selected chart row, such as "+3 sets". */
function dayContribution(day: RoutineDay, selected: string | null) {
  if (!selected || !day.workout_type_id) return null;
  if (selected === CARDIO_ROW) {
    const minutes = Math.round(dayCardioMinutes(day));
    return minutes ? `${minutes} min` : null;
  }
  const sets = daySetCredits(day).get(selected);
  return sets ? `+${formatVolume(sets)} ${sets === 1 ? 'set' : 'sets'}` : null;
}

function exerciseMuscles(exercise: Exercise) {
  if (exercise.kind === 'cardio') return 'Cardio';
  return exerciseSetCredits(exercise)
    .map(({ muscle, sets }) => (sets < 1 ? `${muscle} ½` : muscle))
    .join(' · ');
}

function RoutineEditor({
  routine,
  schedule,
  busy,
  error,
  onSave,
  onClose,
}: {
  routine: Routine;
  schedule?: TrainingSplit;
  busy: boolean;
  error: string | null;
  onSave: (
    value: Routine,
    schedule?: Pick<TrainingSplit, 'start_date' | 'enabled' | 'progression'>,
  ) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const [startDate, setStartDate] = useState(schedule?.start_date ?? localDate());
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [typeName, setTypeName] = useState('');
  const [addingType, setAddingType] = useState(false);
  const [value, setValue] = useState(() => structuredClone(routine));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openDay, setOpenDay] = useState<number | null>(() => {
    const first = routine.days.findIndex((item) => item.workout_type_id);
    return first < 0 ? 0 : first;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [cardioGoal, setCardioGoal] = useState<number | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const types = useWorkoutTypes();
  const musclePreferences = useTrainingPreferences().preferences;
  const muscleGoal = musclePreferences?.weekly_muscle_set_goal ?? 10;
  const muscleGoals = musclePreferences?.weekly_muscle_set_goals;
  // The library's copies reflect partial-set changes made from the credits popup.
  const libraryExercises = useContext(ExerciseCreditsContext)?.exercises;
  const latest = (exercise: Exercise) =>
    libraryExercises?.find((item) => item.id === exercise.id) ?? exercise;
  const creditDays = value.days.map((item) => ({
    ...item,
    movements: item.movements.map((m) => ({ ...m, exercise: latest(m.exercise) })),
  }));
  const message = validation || error;
  useEffect(() => {
    let live = true;
    // Without cardio goals the chart still shows planned minutes.
    api.getCardioPreferences().then(
      (preferences) => {
        if (live)
          setCardioGoal(preferences.goals.reduce((total, goal) => total + goal.minutes, 0) || null);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    api.listExercises().then(
      (items) => {
        if (live) {
          setExercises(items);
          setLoadError(null);
        }
      },
      (reason) => {
        if (live) setLoadError(failure(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (message) alertRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);
  function day(index: number, next: RoutineDay) {
    setValue((current) => ({
      ...current,
      days: current.days.map((item, i) => (i === index ? next : item)),
    }));
  }
  function movement(
    dayIndex: number,
    movementIndex: number,
    change: (item: RoutineDay['movements'][number]) => RoutineDay['movements'][number] | null,
  ) {
    const item = value.days[dayIndex];
    day(dayIndex, {
      ...item,
      movements: item.movements.flatMap((m, i) => {
        if (i !== movementIndex) return [m];
        const next = change(m);
        return next ? [next] : [];
      }),
    });
  }
  function move(index: number, direction: number) {
    setValue((current) => {
      const days = [...current.days];
      [days[index], days[index + direction]] = [days[index + direction], days[index]];
      return { ...current, days };
    });
    setOpenDay(index + direction);
  }
  function addDay(next: RoutineDay) {
    setValue((current) => ({ ...current, days: [...current.days, next] }));
    setOpenDay(value.days.length);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || addingType || types.loading || types.error) return;
    if (!value.name.trim()) {
      setValidation('Enter a split name.');
      return;
    }
    const workoutDays = value.days.filter((item) => item.workout_type_id !== null);
    if (!workoutDays.length) {
      setValidation('Include at least one workout day.');
      return;
    }
    if (value.shared && workoutDays.some((item) => item.movements.length === 0)) {
      setValidation('Add exercises to every workout day before sharing.');
      return;
    }
    if (
      value.days.some((item) =>
        item.movements.some((m) => m.sets.some((set) => (set.weight_kg ?? 0) > 10000)),
      )
    ) {
      setValidation('Starting weights must be no more than 10,000 kg.');
      return;
    }
    setValidation(null);
    if (
      value.days.some(
        (item) =>
          item.workout_type_id && types.types.find((t) => t.id === item.workout_type_id)?.archived,
      )
    ) {
      setValidation('Choose an active workout type for every workout day.');
      return;
    }
    onSave(
      value,
      schedule
        ? { start_date: startDate, enabled, progression: schedule.progression ?? 'workouts' }
        : undefined,
    );
  }
  const canSave = !busy && !addingType && !types.loading && !types.error && !loadError;
  return (
    <PopupDialog
      title={routine.id ? 'Edit split' : 'New split'}
      className="routine-editor-dialog routine-editor-screen"
      closeLabel={
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        </svg>
      }
      headerActions={
        <button type="submit" form={formId} className="routine-editor-save" disabled={!canSave}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      }
      onClose={onClose}
    >
      <form id={formId} onSubmit={submit} className="routine-editor">
        <fieldset disabled={busy}>
          <div className="routine-title-row">
            <input
              className="routine-name-input"
              aria-label="Split name"
              required
              maxLength={40}
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
            />
            {schedule && (
              <div className="split-editor-schedule">
                <input
                  type="date"
                  aria-label="Starts"
                  required
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
                <label className="routine-active-toggle">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                  />
                  <span>Active</span>
                </label>
              </div>
            )}
          </div>
          {types.error && (
            <p className="inline-error" role="alert">
              {types.error}{' '}
              <button type="button" onClick={() => void types.reload()}>
                Retry workout types
              </button>
            </p>
          )}
          {loadError && (
            <p role="alert" className="inline-error">
              {loadError}{' '}
              <button type="button" onClick={() => setAttempt((x) => x + 1)}>
                Try again
              </button>
            </p>
          )}
          {message && (
            <p role="alert" className="inline-error" ref={alertRef}>
              {message}
            </p>
          )}
          <SplitVolumeChart
            days={creditDays}
            muscleGoal={muscleGoal}
            muscleGoals={muscleGoals}
            cardioGoal={cardioGoal}
            selected={selected}
            onSelect={setSelected}
          />
          <h3 className="routine-cycle-heading">Cycle · {dayCount(value.days)}</h3>
          <ol className="routine-day-list">
            {value.days.map((item, di) => {
              const open = openDay === di;
              const contribution = dayContribution(creditDays[di], selected);
              const bodyId = `${formId}-day-${di}`;
              return (
                <li
                  key={di}
                  className={[
                    'routine-day',
                    open ? 'is-open' : '',
                    selected && !contribution ? 'is-dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    {
                      '--day-colour': item.workout_type?.color ?? 'var(--p-deemph)',
                    } as CSSProperties
                  }
                >
                  <button
                    type="button"
                    className="routine-day-toggle"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setOpenDay(open ? null : di)}
                  >
                    <span className="routine-day-bar" aria-hidden="true" />
                    <span className="routine-day-title">
                      <strong>
                        Day {di + 1} ·{' '}
                        {item.workout_type?.name ??
                          (item.workout_type_id ? 'Removed type' : 'Rest')}
                      </strong>
                      <small>{daySummary(item)}</small>
                    </span>
                    {contribution && <span className="routine-day-hit">{contribution}</span>}
                    <Icon name="chevron-down" />
                  </button>
                  {/* Kept mounted so it can slide shut; inert keeps a closed day out of reach. */}
                  <div className="routine-day-panel" inert={!open}>
                    <div className="routine-day-clip">
                      <section
                        className="routine-day-body"
                        id={bodyId}
                        aria-label={`Day ${di + 1}`}
                      >
                        <div className="routine-day-tools">
                          <select
                            className="routine-day-type"
                            aria-label={`Day ${di + 1} workout type`}
                            value={item.workout_type_id ?? ''}
                            onChange={(event) => {
                              const type =
                                types.types.find((t) => t.id === event.target.value) ?? null;
                              day(di, {
                                ...item,
                                workout_type_id: type?.id ?? null,
                                workout_type: type,
                                movements: type ? item.movements : [],
                              });
                            }}
                          >
                            <option value="">Rest</option>
                            {types.types
                              .filter((t) => !t.archived || t.id === item.workout_type_id)
                              .map((t) => (
                                <option value={t.id} key={t.id}>
                                  {t.name}
                                  {t.archived ? ' (removed)' : ''}
                                </option>
                              ))}
                          </select>
                          <span className="routine-day-spacer" />
                          <button
                            type="button"
                            className="routine-icon-button"
                            aria-label={`Move day ${di + 1} earlier`}
                            disabled={di === 0}
                            onClick={() => move(di, -1)}
                          >
                            <Icon name="up" />
                          </button>
                          <button
                            type="button"
                            className="routine-icon-button"
                            aria-label={`Move day ${di + 1} later`}
                            disabled={di === value.days.length - 1}
                            onClick={() => move(di, 1)}
                          >
                            <Icon name="down" />
                          </button>
                          <button
                            type="button"
                            className="routine-icon-button"
                            aria-label={`Remove day ${di + 1}`}
                            disabled={value.days.length === 1}
                            onClick={() => {
                              setValue({ ...value, days: value.days.filter((_, i) => i !== di) });
                              setOpenDay(null);
                            }}
                          >
                            <Icon name="close" />
                          </button>
                        </div>
                        {item.movements.map((m, mi) => {
                          const cardio = m.exercise.kind === 'cardio';
                          const minutes = Math.round(
                            m.sets.reduce((total, set) => total + (set.duration_seconds ?? 0), 0) /
                              60,
                          );
                          const atMinimum = cardio ? minutes <= 5 : m.sets.length <= 1;
                          const name = m.exercise.name;
                          return (
                            <div
                              className="routine-exercise-row"
                              key={`${di}-${mi}-${m.exercise_id}`}
                            >
                              <div className="routine-exercise-main">
                                <select
                                  className="routine-exercise-name"
                                  aria-label={`Day ${di + 1} exercise ${mi + 1}`}
                                  value={m.exercise_id}
                                  onChange={(event) => {
                                    const exercise = exercises.find(
                                      (e) => e.id === event.target.value,
                                    )!;
                                    movement(di, mi, (current) => ({
                                      ...current,
                                      exercise_id: exercise.id,
                                      exercise,
                                      sets:
                                        exercise.kind === current.exercise.kind
                                          ? current.sets
                                          : [emptySet()],
                                    }));
                                  }}
                                >
                                  {[
                                    m.exercise,
                                    ...exercises.filter((e) => e.id !== m.exercise_id),
                                  ].map((e) => (
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
                                      ? `Remove ${name} from day ${di + 1}`
                                      : cardio
                                        ? `5 fewer minutes of ${name} on day ${di + 1}`
                                        : `One fewer set of ${name} on day ${di + 1}`
                                  }
                                  onClick={() =>
                                    movement(di, mi, (current) => {
                                      if (atMinimum) return null;
                                      if (!cardio)
                                        return { ...current, sets: current.sets.slice(0, -1) };
                                      return {
                                        ...current,
                                        // One planned duration; earlier interval sets fold into it.
                                        sets: [
                                          {
                                            ...current.sets[0],
                                            duration_seconds: (minutes - 5) * 60,
                                          },
                                        ],
                                      };
                                    })
                                  }
                                >
                                  <Icon name={atMinimum ? 'close' : 'minus'} />
                                </button>
                                <output>{cardio ? `${minutes} min` : m.sets.length}</output>
                                <button
                                  type="button"
                                  aria-label={
                                    cardio
                                      ? `5 more minutes of ${name} on day ${di + 1}`
                                      : `One more set of ${name} on day ${di + 1}`
                                  }
                                  disabled={cardio ? minutes >= 600 : m.sets.length >= 50}
                                  onClick={() =>
                                    movement(di, mi, (current) =>
                                      cardio
                                        ? {
                                            ...current,
                                            sets: [
                                              {
                                                ...current.sets[0],
                                                duration_seconds: (minutes + 5) * 60,
                                              },
                                            ],
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
                            </div>
                          );
                        })}
                        {item.workout_type_id && (
                          <RoutineExerciseSearch
                            day={di + 1}
                            exercises={exercises}
                            disabled={item.movements.length >= 20 || exercises.length === 0}
                            onAdd={(exercise) =>
                              day(di, {
                                ...item,
                                movements: [
                                  ...item.movements,
                                  {
                                    exercise_id: exercise.id,
                                    exercise,
                                    sets:
                                      exercise.kind === 'cardio'
                                        ? [{ ...emptySet(), duration_seconds: 1800 }]
                                        : [emptySet(), emptySet(), emptySet()],
                                  },
                                ],
                              })
                            }
                          />
                        )}
                      </section>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="routine-add-days">
            <button
              type="button"
              className="routine-add"
              disabled={value.days.length >= 28 || types.loading}
              onClick={() => {
                const type = types.types.find((t) => !t.archived);
                if (type) addDay({ workout_type_id: type.id, workout_type: type, movements: [] });
              }}
            >
              <Icon name="plus" />
              Add workout day
            </button>
            <button
              type="button"
              className="routine-add"
              disabled={value.days.length >= 28}
              onClick={() => addDay({ workout_type_id: null, workout_type: null, movements: [] })}
            >
              <Icon name="plus" />
              Add rest day
            </button>
          </div>
          <details className="split-new-type">
            <summary>New workout type</summary>
            <div>
              <input
                aria-label="Workout type name"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.parentElement?.querySelector('button')?.click();
                  }
                }}
                maxLength={40}
                value={typeName}
                onChange={(event) => setTypeName(event.target.value)}
                placeholder="e.g. Full body A"
              />
              <button
                type="button"
                disabled={addingType || !typeName.trim()}
                onClick={() =>
                  void (async () => {
                    if (
                      types.types.some(
                        (t) => t.name.toLocaleLowerCase() === typeName.trim().toLocaleLowerCase(),
                      )
                    ) {
                      setValidation('That workout type already exists, including removed types.');
                      return;
                    }
                    setAddingType(true);
                    setValidation(null);
                    try {
                      const created = await api.createWorkoutType({
                        name: typeName.trim(),
                        color: '#a855f7',
                      });
                      types.applySaved([...types.types, created]);
                      if (value.days.length < 28)
                        addDay({
                          workout_type_id: created.id,
                          workout_type: created,
                          movements: [],
                        });
                      setTypeName('');
                    } catch (reason) {
                      setValidation(failure(reason));
                    } finally {
                      setAddingType(false);
                    }
                  })()
                }
              >
                {addingType ? 'Adding...' : 'Add type'}
              </button>
            </div>
          </details>
        </fieldset>
      </form>
    </PopupDialog>
  );
}
