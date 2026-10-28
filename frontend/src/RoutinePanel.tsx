import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { WeightInput } from './WeightInput';
import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeight } from './weightUnits';
import { useWorkoutTypes } from './workoutTypesContext';
import { localDate } from './utils';
import type { Exercise, Routine, RoutineDay, RoutineSet, TrainingSplit } from './types';
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
  reason instanceof Error ? reason.message : 'Could not save the routine. Try again.';

export function RoutinePanel({
  ownerId,
  own,
  active = true,
  revision,
  heading = 'Routines',
  initialOpenId,
  onOpenSplits,
  onUsed,
  onChanged,
}: {
  ownerId: string;
  own: boolean;
  active?: boolean;
  revision?: string | null;
  heading?: string;
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
  const [startDate, setStartDate] = useState(localDate());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string[]>([]);
  const [importedId, setImportedId] = useState<string | null>(null);
  const locked = useRef(false);
  const types = useWorkoutTypes();
  const unit = useWeightUnit();
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
      setNotice('Saved to My splits.');
    });
  }
  return (
    <section className="pulse-card routine-panel" aria-labelledby={headingId}>
      <header className="routine-heading">
        <h2 id={headingId}>{heading}</h2>
        {own && onOpenSplits && (
          <button type="button" onClick={() => onOpenSplits()}>
            My splits
          </button>
        )}
        {own && (
          <button
            type="button"
            disabled={busy || types.loading}
            onClick={() => {
              const type = types.types.find((item) => !item.archived);
              if (type)
                setEditing({
                  id: '',
                  name: 'My routine',
                  shared: false,
                  days: [{ workout_type_id: type.id, workout_type: type, movements: [] }],
                });
            }}
          >
            New routine
          </button>
        )}
      </header>
      {own && (
        <button
          type="button"
          className="routine-capture"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const saved = await api.routines.fromSplit();
              setRoutines((items) => [saved, ...(items ?? [])]);
              setEditing(saved);
            })
          }
        >
          Save current split
        </button>
      )}
      {error && !editing && !using && !deleting && (
        <p className="inline-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => setAttempt((x) => x + 1)}>
            Try again
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!own && copied.length > 0 && onOpenSplits && (
        <button type="button" onClick={() => onOpenSplits(importedId ?? undefined)}>
          View my splits
        </button>
      )}
      {!routines && !error && <p role="status">Loading routines…</p>}
      {routines?.length === 0 && (
        <p className="shared-card-empty">{own ? 'No saved routines.' : 'No shared routines.'}</p>
      )}
      <div className="routine-list">
        {routines?.map((routine) => (
          <details
            className="routine-card"
            key={routine.id}
            open={routine.id === initialOpenId || undefined}
          >
            <summary>
              <strong>{routine.name}</strong>
              <span>{routine.days.length} days</span>
              {own && <small>{routine.shared ? 'On profile' : 'Only you'}</small>}
            </summary>
            <ol className="routine-cycle">
              {routine.days.map((day, index) => (
                <li key={index} style={{ borderColor: day.workout_type?.color }}>
                  <span>Day {index + 1}</span>
                  <strong>{day.workout_type?.name ?? 'Rest'}</strong>
                  {day.movements.map((movement, mi) => (
                    <div className="routine-exercise" key={mi}>
                      <strong>{movement.exercise.name}</strong>
                      <span>
                        {movement.sets
                          .map((set) =>
                            movement.exercise.kind === 'cardio'
                              ? `${set.duration_seconds == null ? '–' : Number((set.duration_seconds / 60).toFixed(1))} min${set.distance_km == null ? '' : ` · ${set.distance_km} km`}`
                              : `${set.reps ?? '–'} × ${set.weight_kg == null ? '–' : formatWeight(set.weight_kg, unit)}`,
                          )
                          .join(' / ')}
                      </span>
                    </div>
                  ))}
                </li>
              ))}
            </ol>
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
                    Edit routine
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStartDate(localDate());
                      setUsing(routine);
                    }}
                  >
                    Use split
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setError(null);
                      setDeleting(routine);
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy || copied.includes(routine.id)}
                  onClick={() => void copy(routine)}
                >
                  {copied.includes(routine.id) ? 'Saved' : 'Save routine'}
                </button>
              )}
            </div>
          </details>
        ))}
      </div>
      {editing && (
        <RoutineEditor
          key={editing.id || 'new'}
          routine={editing}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setEditing(null);
              setError(null);
            }
          }}
          onSave={(next) =>
            void run(async () => {
              const saved = next.id
                ? await api.routines.save(next)
                : await api.routines.create(next);
              if (own)
                setRoutines((items) => [
                  saved,
                  ...(items ?? []).filter((item) => item.id !== saved.id),
                ]);
              setEditing(null);
              setNotice('Routine saved.');
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
                const saved = await api.routines.use(using.id, startDate);
                onUsed?.(saved);
                setUsing(null);
                setNotice(`${using.name} is your active split.`);
              });
            }}
          >
            <strong>{using.name}</strong>
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
            <p>Replaces your active split. Saved routines stay available.</p>
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
          title="Delete routine?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            {deleting.name} will be removed from your library and profile. Friends keep their saved
            copies.
          </p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <button
            className="popup-primary-action"
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
            Delete routine
          </button>
        </PopupDialog>
      )}
    </section>
  );
}

function RoutineEditor({
  routine,
  busy,
  error,
  onSave,
  onClose,
}: {
  routine: Routine;
  busy: boolean;
  error: string | null;
  onSave: (value: Routine) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => structuredClone(routine));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const types = useWorkoutTypes();
  const unit = useWeightUnit();
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
  function day(index: number, next: RoutineDay) {
    setValue((current) => ({
      ...current,
      days: current.days.map((item, i) => (i === index ? next : item)),
    }));
  }
  function move(index: number, direction: number) {
    setValue((current) => {
      const days = [...current.days];
      [days[index], days[index + direction]] = [days[index + direction], days[index]];
      return { ...current, days };
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.name.trim()) {
      setValidation('Enter a routine name.');
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
        item.movements.some((movement) =>
          movement.sets.some((set) => (set.weight_kg ?? 0) > 10000),
        ),
      )
    ) {
      setValidation('Starting weights must be no more than 10,000 kg.');
      return;
    }
    setValidation(null);
    onSave(value);
  }
  return (
    <PopupDialog title="Edit routine" className="routine-editor-dialog" onClose={onClose}>
      <form onSubmit={submit} className="routine-editor">
        <fieldset disabled={busy}>
          <label>
            Routine name
            <input
              required
              maxLength={40}
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
            />
          </label>
          <label className="routine-share">
            Show on my profile
            <input
              type="checkbox"
              role="switch"
              checked={value.shared}
              onChange={(event) => setValue({ ...value, shared: event.target.checked })}
            />
          </label>
          {loadError && (
            <p role="alert" className="inline-error">
              {loadError}{' '}
              <button type="button" onClick={() => setAttempt((x) => x + 1)}>
                Try again
              </button>
            </p>
          )}
          {value.days.map((item, di) => (
            <section className="routine-edit-day" key={di} aria-label={`Day ${di + 1}`}>
              <header>
                <strong>Day {di + 1}</strong>
                <div>
                  <button
                    type="button"
                    aria-label={`Move day ${di + 1} earlier`}
                    disabled={di === 0}
                    onClick={() => move(di, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move day ${di + 1} later`}
                    disabled={di === value.days.length - 1}
                    onClick={() => move(di, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove day ${di + 1}`}
                    disabled={value.days.length === 1}
                    onClick={() =>
                      setValue({ ...value, days: value.days.filter((_, i) => i !== di) })
                    }
                  >
                    ×
                  </button>
                </div>
              </header>
              <label>
                Workout type
                <select
                  aria-label={`Day ${di + 1} workout type`}
                  value={item.workout_type_id ?? ''}
                  onChange={(event) => {
                    const type = types.types.find((t) => t.id === event.target.value) ?? null;
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
              </label>
              {item.movements.map((movement, mi) => (
                <div className="routine-edit-exercise" key={`${di}-${mi}-${movement.exercise_id}`}>
                  <div className="routine-exercise-select">
                    <select
                      aria-label={`Day ${di + 1} exercise ${mi + 1}`}
                      value={movement.exercise_id}
                      onChange={(event) => {
                        const exercise = exercises.find((e) => e.id === event.target.value)!;
                        day(di, {
                          ...item,
                          movements: item.movements.map((m, i) =>
                            i === mi
                              ? {
                                  ...m,
                                  exercise_id: exercise.id,
                                  exercise,
                                  sets: exercise.kind === m.exercise.kind ? m.sets : [emptySet()],
                                }
                              : m,
                          ),
                        });
                      }}
                    >
                      {[
                        movement.exercise,
                        ...exercises.filter((e) => e.id !== movement.exercise_id),
                      ].map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`Remove exercise ${mi + 1} from day ${di + 1}`}
                      onClick={() =>
                        day(di, { ...item, movements: item.movements.filter((_, i) => i !== mi) })
                      }
                    >
                      ×
                    </button>
                  </div>
                  <div className="routine-set-labels">
                    <span>Set</span>
                    <span>{movement.exercise.kind === 'cardio' ? 'Min' : 'Reps'}</span>
                    <span>{movement.exercise.kind === 'cardio' ? 'km' : unit}</span>
                    <span />
                  </div>
                  {movement.sets.map((set, si) => {
                    const change = (patch: Partial<RoutineSet>) =>
                      day(di, {
                        ...item,
                        movements: item.movements.map((m, i) =>
                          i === mi
                            ? {
                                ...m,
                                sets: m.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)),
                              }
                            : m,
                        ),
                      });
                    const label = `Day ${di + 1} exercise ${mi + 1} set ${si + 1}`;
                    return (
                      <div className="routine-set" key={si}>
                        <select
                          aria-label={`${label} type`}
                          value={set.set_type}
                          onChange={(event) =>
                            change({ set_type: event.target.value as RoutineSet['set_type'] })
                          }
                        >
                          <option value="normal">{si + 1}</option>
                          <option value="warmup">W</option>
                          <option value="drop">D</option>
                          <option value="failure">F</option>
                        </select>
                        {movement.exercise.kind === 'cardio' ? (
                          <>
                            <input
                              aria-label={`${label} minutes`}
                              type="number"
                              min="0"
                              max="2880"
                              step="0.1"
                              value={set.duration_seconds == null ? '' : set.duration_seconds / 60}
                              onChange={(event) =>
                                change({
                                  duration_seconds:
                                    event.target.value === ''
                                      ? null
                                      : Math.round(Number(event.target.value) * 60),
                                })
                              }
                            />
                            <input
                              aria-label={`${label} distance km`}
                              type="number"
                              min="0"
                              max="10000"
                              step="0.01"
                              value={set.distance_km ?? ''}
                              onChange={(event) =>
                                change({
                                  distance_km:
                                    event.target.value === '' ? null : Number(event.target.value),
                                })
                              }
                            />
                          </>
                        ) : (
                          <>
                            <input
                              aria-label={`${label} reps`}
                              type="number"
                              min="0"
                              max="10000"
                              value={set.reps ?? ''}
                              onChange={(event) =>
                                change({
                                  reps:
                                    event.target.value === '' ? null : Number(event.target.value),
                                })
                              }
                            />
                            <WeightInput
                              aria-label={`${label} weight ${unit}`}
                              weightKg={set.weight_kg}
                              onWeightChange={(weight_kg) => change({ weight_kg })}
                            />
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${label.toLowerCase()}`}
                          disabled={movement.sets.length === 1}
                          onClick={() =>
                            day(di, {
                              ...item,
                              movements: item.movements.map((m, i) =>
                                i === mi ? { ...m, sets: m.sets.filter((_, j) => j !== si) } : m,
                              ),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    disabled={movement.sets.length >= 50}
                    onClick={() =>
                      day(di, {
                        ...item,
                        movements: item.movements.map((m, i) =>
                          i === mi ? { ...m, sets: [...m.sets, { ...m.sets.at(-1)! }] } : m,
                        ),
                      })
                    }
                  >
                    Add set
                  </button>
                </div>
              ))}
              {item.workout_type_id && (
                <select
                  aria-label={`Add exercise to day ${di + 1}`}
                  value=""
                  disabled={item.movements.length >= 20 || exercises.length === 0}
                  onChange={(event) => {
                    const exercise = exercises.find((e) => e.id === event.target.value)!;
                    day(di, {
                      ...item,
                      movements: [
                        ...item.movements,
                        { exercise_id: exercise.id, exercise, sets: [emptySet()] },
                      ],
                    });
                  }}
                >
                  <option value="">Add exercise…</option>
                  {exercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </section>
          ))}
          <div className="routine-actions">
            <button
              type="button"
              disabled={value.days.length >= 28 || types.loading}
              onClick={() => {
                const type = types.types.find((t) => !t.archived);
                if (type)
                  setValue({
                    ...value,
                    days: [
                      ...value.days,
                      { workout_type_id: type.id, workout_type: type, movements: [] },
                    ],
                  });
              }}
            >
              Add workout day
            </button>
            <button
              type="button"
              disabled={value.days.length >= 28}
              onClick={() =>
                setValue({
                  ...value,
                  days: [
                    ...value.days,
                    { workout_type_id: null, workout_type: null, movements: [] },
                  ],
                })
              }
            >
              Add rest day
            </button>
          </div>
          {(validation || error) && (
            <p role="alert" className="inline-error">
              {validation || error}
            </p>
          )}
          <button className="popup-primary-action" disabled={busy || !!loadError}>
            {busy ? 'Saving…' : 'Save routine'}
          </button>
        </fieldset>
      </form>
    </PopupDialog>
  );
}
