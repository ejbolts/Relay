import { SPLIT_GUIDE_COPY } from './splitGuideCopy';
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
import { GuideCoach, type CoachStep } from './GuideCoach';
import { Icon } from './Icon';
import { Toast } from './Toast';
import { PopupDialog } from './PopupDialog';
import { RoutineMovementList } from './RoutineMovementList';
import { SplitVolumeChart } from './SplitVolumeChart';
import {
  canAddSplitDay,
  canAddSplitDayType,
  hasSplitTemplate,
  legacySplitRoutine,
  moveSplitDay,
  routineFromTemplate,
  routineSaveError,
  scheduledSplit,
  shareSplitError,
  splitDayContribution as dayContribution,
  splitDayCount as dayCount,
  splitDayExtraChoices,
  splitDayExtraTypes,
  splitDayName,
  splitDaySummary as daySummary,
  splitDayTotal,
  splitDayTypes,
  splitFailure as failure,
  splitsActiveFirst,
  splitTemplateName,
  splitTypeNameError,
  nextSplitDayType,
  withSplitDayExtraType,
  withSplitDayType,
} from './splitEditing';
import { dayStripes } from './dayColors';
import { exerciseMuscles } from './splitTargets';
import { useTrainingPreferences } from './trainingPreferencesContext';
import { useWorkoutTypes } from './workoutTypesContext';
import { exitGuide, finishGuide, updateGuide, useActiveGuide } from './setupGuides';
import { splitTemplateStep } from './setupGuideSteps';
import { formatWeight } from './weightUnits';
import { NEW_WORKOUT_TYPE_COLOR } from './workoutTypes';
import { localDate } from './utils';
import { SPLIT_TEMPLATES } from './trainingSplit';
import type { Exercise, Routine, RoutineDay, TrainingSplit, WorkoutType } from './types';
import './routines.css';

/** A day's colour: its workout type's, or stripes of each type on a mixed day. */
function dayColour(day: RoutineDay, types: WorkoutType[], direction?: string): string | null {
  const colours = splitDayTypes(day, types).map((type) => type.color);
  return colours.length ? dayStripes(colours, direction) : null;
}

function RoutinePattern({ days }: { days: RoutineDay[] }) {
  const { types } = useWorkoutTypes();
  return (
    <span className="routine-pattern" aria-hidden="true">
      {days.map((day, index) => {
        const colour = dayColour(day, types, 'to right');
        return (
          <i
            key={index}
            className={colour ? undefined : 'is-rest'}
            style={colour ? { background: colour } : undefined}
          />
        );
      })}
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
          const total = splitDayTotal(day);
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
                <strong>{splitDayName(day)}</strong>
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string[]>([]);
  const [importedId, setImportedId] = useState<string | null>(null);
  const locked = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialOpenId ?? activeId ?? null);
  const guideRunning = useActiveGuide('split');
  // The splits guide runs on your own splits page only.
  const guide = embedded && own ? guideRunning : null;
  // With an active split the guide adds rep ranges to it; otherwise it builds and starts one.
  const guideFlow: SplitGuideFlow = activeId ? 'edit' : 'new';
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
  const legacy = embedded ? legacySplitRoutine(trainingSplit, types.types) : null;
  const items = [...(legacy ? [legacy] : []), ...(routines ?? [])];
  const displayed = splitsActiveFirst(items, activeId);
  const hasTemplate = (preset: (typeof SPLIT_TEMPLATES)[number]) =>
    hasSplitTemplate(routines, preset);
  function template(id: string) {
    const existing = SPLIT_TEMPLATES.find((t) => t.id === id);
    if (existing && hasTemplate(existing)) return;
    setError(null);
    setEditing(routineFromTemplate(id, types.types));
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
            className="pulse-button link small routine-link"
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
            <button
              type="button"
              className="pulse-button link small routine-link"
              onClick={() => onOpenSplits()}
            >
              My splits
              <Icon name="chevron-right" />
            </button>
          )}
        </header>
      )}
      {own && !embedded && (
        <div className="routine-create">
          <button
            type="button"
            className="pulse-button tonal block"
            disabled={busy || types.loading}
            onClick={() => template('custom')}
          >
            <Icon name="plus" />
            New split
          </button>
        </div>
      )}
      {error && !editing && !using && !deleting && !options && (
        <p className="inline-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="pulse-button link small"
            onClick={() => setAttempt((x) => x + 1)}
          >
            Try again
          </button>
        </p>
      )}
      {notice && <Toast id={notice} message={notice} onDismiss={() => setNotice(null)} />}
      {showView && (
        <div className="routine-notice">
          <button
            type="button"
            className="pulse-button link small routine-link"
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
                    className="pulse-button secondary small"
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
                      className="pulse-button secondary small icon-only routine-options-button"
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
                    className={
                      routine.id === activeId
                        ? 'pulse-button secondary small'
                        : 'pulse-button primary small routine-primary'
                    }
                    onClick={() => {
                      setError(null);
                      setStartDate(
                        routine.id === activeId
                          ? (trainingSplit?.start_date ?? localDate())
                          : localDate(),
                      );
                      setUsing(routine);
                    }}
                  >
                    {routine.id === activeId ? 'Change schedule' : 'Use split'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="pulse-button primary small routine-primary routine-save"
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
                  <strong>{splitTemplateName(preset)}</strong>
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
      {guide && !editing && !using && !options && !deleting && !notice && (
        <GuideCoach
          floating
          {...pageGuideStep(guide, guideFlow, activeId, routines)}
          onExit={() => exitGuide('split')}
        />
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
                  const shareError = shareSplitError(options);
                  if (shareError) throw new Error(shareError);
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
          guide={guide ? editorGuide(guideFlow, editing) : undefined}
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
              if (schedule) onUsed?.(scheduledSplit(saved, schedule));
              focusCard.current = saved.id;
              setEditing(null);
              setExpandedId(saved.id);
              setNotice('Split saved.');
              if (guide) {
                // Saving the active split finishes the guide; a new one still needs starting.
                if (saved.id === activeId || legacyEdit) finishGuide('split');
                else updateGuide('split', { useRoutineId: saved.id });
              }
              onChanged?.(saved.id);
            })
          }
        />
      )}
      {using && (
        <PopupDialog
          title="Use split"
          className="routine-use-dialog"
          busy={busy}
          onClose={() => setUsing(null)}
          actions={
            <>
              <button type="button" disabled={busy} onClick={() => setUsing(null)}>
                Cancel
              </button>
              <button
                type="submit"
                form="routine-use-form"
                className="popup-primary-action"
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Use this split'}
              </button>
            </>
          }
        >
          <form
            id="routine-use-form"
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
                        // Splits follow logged workouts; saving here moves a By date split over.
                        progression: 'workouts',
                      })
                    : await api.routines.use(using.id, startDate);
                focusCard.current = using.id;
                onUsed?.(saved);
                setUsing(null);
                if (guide?.useRoutineId === using.id) finishGuide('split');
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
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </form>
          {guide?.useRoutineId === using.id && (
            <GuideCoach
              step={{
                title: 'Pick a start date',
                body: SPLIT_GUIDE_COPY.confirm.body,
                target: '.routine-use-dialog .popup-primary-action',
              }}
              index={NEW_SPLIT_STEPS - 1}
              total={NEW_SPLIT_STEPS}
              onBack={() => {
                if (!busy) setUsing(null);
              }}
              onExit={() => exitGuide('split')}
            />
          )}
        </PopupDialog>
      )}
      {deleting && (
        <PopupDialog
          title="Delete split?"
          size="compact"
          busy={busy}
          onClose={() => setDeleting(null)}
          actions={
            <>
              <button type="button" autoFocus disabled={busy} onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="popup-primary-action is-danger"
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
            </>
          }
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
          </div>
        </PopupDialog>
      )}
    </section>
  );
}

type SplitGuideFlow = 'new' | 'edit';
/** Template, plan days, rep range, save, then Use split and its confirmation. */
const NEW_SPLIT_STEPS = 6;

const hasExercises = (routine: Routine) =>
  routine.days.some((day) => day.workout_type_id !== null && day.movements.length > 0);

/** The editor's guide steps: planning days is skipped when an existing split already has them. */
function editorGuide(flow: SplitGuideFlow, routine: Routine) {
  const plan = flow === 'new' || !hasExercises(routine);
  return {
    flow,
    plan,
    offset: 1,
    total: flow === 'new' ? NEW_SPLIT_STEPS : 1 + (plan ? 1 : 0) + 2,
  };
}
type EditorGuide = ReturnType<typeof editorGuide>;

/** The guide's step on the splits page itself, outside the editor. */
function pageGuideStep(
  guide: { useRoutineId?: string; facts: { rotation: string[] } },
  flow: SplitGuideFlow,
  activeId: string | null | undefined,
  routines: Routine[] | null,
): { step: CoachStep; index: number; total: number } {
  if (guide.useRoutineId)
    return {
      step: {
        title: SPLIT_GUIDE_COPY.use.title,
        body: SPLIT_GUIDE_COPY.use.body,
        target: `.routine-card[data-routine-id="${guide.useRoutineId}"] .routine-primary`,
      },
      index: NEW_SPLIT_STEPS - 2,
      total: NEW_SPLIT_STEPS,
    };
  if (flow === 'edit') {
    const active = routines?.find((routine) => routine.id === activeId);
    return {
      step: {
        title: 'Open your split',
        body: 'Rep ranges live on each planned exercise. Tap Edit split.',
        target: `.routine-card[data-routine-id="${activeId}"] .routine-actions > button:first-child`,
      },
      index: 0,
      total: active ? editorGuide('edit', active).total : 3,
    };
  }
  return {
    step: { ...splitTemplateStep(guide.facts.rotation), target: '.split-library-templates' },
    index: 0,
    total: NEW_SPLIT_STEPS,
  };
}

function RoutineEditor({
  routine,
  schedule,
  busy,
  error,
  guide,
  onSave,
  onClose,
}: {
  routine: Routine;
  schedule?: TrainingSplit;
  busy: boolean;
  error: string | null;
  /** The splits guide's steps inside the editor, while it runs. */
  guide?: EditorGuide;
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
  const [guideStep, setGuideStep] = useState<'plan' | 'reps' | 'save'>(() =>
    guide?.plan ? 'plan' : 'reps',
  );
  const guideFacts = useActiveGuide('split')?.facts;
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
  function move(index: number, direction: -1 | 1) {
    setValue((current) => ({ ...current, days: moveSplitDay(current.days, index, direction) }));
    setOpenDay(index + direction);
  }
  function addDay(next: RoutineDay) {
    setValue((current) => ({ ...current, days: [...current.days, next] }));
    setOpenDay(value.days.length);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || addingType || types.loading || types.error) return;
    const invalid = routineSaveError(value, types.types);
    setValidation(invalid);
    if (invalid) return;
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
      variant="screen"
      title={routine.id ? 'Edit split' : 'New split'}
      className="routine-editor-dialog routine-editor-screen"
      headerActions={
        <button
          type="submit"
          form={formId}
          className="overlay-header-save routine-editor-save"
          disabled={!canSave}
        >
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
              <button
                type="button"
                className="pulse-button link small"
                onClick={() => void types.reload()}
              >
                Retry workout types
              </button>
            </p>
          )}
          {loadError && (
            <p role="alert" className="inline-error">
              {loadError}{' '}
              <button
                type="button"
                className="pulse-button link small"
                onClick={() => setAttempt((x) => x + 1)}
              >
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
                      '--day-colour': dayColour(item, types.types) ?? 'var(--p-deemph)',
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
                        Day {di + 1} · {splitDayName(item, types.types)}
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
                          <span className="routine-day-types">
                            <select
                              className="routine-day-type"
                              aria-label={`Day ${di + 1} workout type`}
                              value={item.workout_type_id ?? ''}
                              onChange={(event) => {
                                const type =
                                  types.types.find((t) => t.id === event.target.value) ?? null;
                                day(di, withSplitDayType(item, type));
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
                            {splitDayExtraTypes(item, types.types).map((extra, ei) => {
                              const name = extra?.name ?? 'Removed type';
                              return (
                                <span
                                  className="routine-day-extra"
                                  key={item.extra_workout_type_ids?.[ei] ?? ei}
                                >
                                  <select
                                    className="routine-day-type"
                                    aria-label={`Day ${di + 1} workout type ${ei + 2}`}
                                    value={item.extra_workout_type_ids?.[ei] ?? ''}
                                    onChange={(event) => {
                                      const type = types.types.find(
                                        (t) => t.id === event.target.value,
                                      );
                                      if (type) day(di, withSplitDayExtraType(item, ei, type));
                                    }}
                                  >
                                    {!extra && <option value="">Removed type</option>}
                                    {splitDayExtraChoices(item, ei, types.types).map((t) => (
                                      <option value={t.id} key={t.id}>
                                        {t.name}
                                        {t.archived ? ' (removed)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="routine-icon-button routine-day-extra-remove"
                                    aria-label={`Remove ${name} from day ${di + 1}`}
                                    title={`Remove ${name}`}
                                    onClick={() => day(di, withSplitDayExtraType(item, ei, null))}
                                  >
                                    <Icon name="close" />
                                  </button>
                                </span>
                              );
                            })}
                            {canAddSplitDayType(item, types.types) && (
                              <button
                                type="button"
                                className="routine-icon-button routine-day-add-type"
                                aria-label={`Add a workout type to day ${di + 1}`}
                                title="Add a workout type"
                                onClick={() =>
                                  day(
                                    di,
                                    withSplitDayExtraType(
                                      item,
                                      item.extra_workout_type_ids?.length ?? 0,
                                      nextSplitDayType(item, types.types),
                                    ),
                                  )
                                }
                              >
                                <Icon name="plus" />
                              </button>
                            )}
                          </span>
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
                        <RoutineMovementList
                          movements={item.movements}
                          exercises={exercises}
                          target={`day ${di + 1}`}
                          fieldLabel={(mi) => `Day ${di + 1} exercise ${mi + 1}`}
                          latest={latest}
                          canAdd={!!item.workout_type_id}
                          onChange={(movements) => day(di, { ...item, movements })}
                        />
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
              className="pulse-button tonal small routine-add"
              disabled={!canAddSplitDay(value.days) || types.loading}
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
              className="pulse-button tonal small routine-add"
              disabled={!canAddSplitDay(value.days)}
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
                className="pulse-button tonal small"
                disabled={addingType || !typeName.trim()}
                onClick={() =>
                  void (async () => {
                    const taken = splitTypeNameError(typeName, types.types);
                    if (taken) {
                      setValidation(taken);
                      return;
                    }
                    setAddingType(true);
                    setValidation(null);
                    try {
                      const created = await api.createWorkoutType({
                        name: typeName.trim(),
                        color: NEW_WORKOUT_TYPE_COLOR,
                      });
                      types.applySaved([...types.types, created]);
                      if (canAddSplitDay(value.days))
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
                {addingType ? 'Adding…' : 'Add type'}
              </button>
            </div>
          </details>
        </fieldset>
      </form>
      {guide && (
        <GuideCoach
          step={editorCoachStep()}
          index={
            guide.offset +
            (guideStep === 'plan'
              ? 0
              : guideStep === 'reps'
                ? Number(guide.plan)
                : Number(guide.plan) + 1)
          }
          total={guide.total}
          onBack={editorBack()}
          onExit={() => exitGuide('split')}
        />
      )}
    </PopupDialog>
  );

  function editorBack(): (() => void) | undefined {
    if (guideStep === 'save') return () => setGuideStep('reps');
    if (guideStep === 'reps' && guide?.plan) return () => setGuideStep('plan');
    return JSON.stringify(value) === JSON.stringify(routine) ? onClose : undefined;
  }

  function editorCoachStep(): CoachStep {
    if (guideStep === 'plan')
      return {
        title: SPLIT_GUIDE_COPY.plan.title,
        body: SPLIT_GUIDE_COPY.plan.body,
        target: '.routine-day-list',
        next: { disabled: !hasExercises(value), onClick: () => setGuideStep('reps') },
      };
    if (guideStep === 'reps') {
      const lift = guideFacts?.lift;
      const unit = musclePreferences?.preferred_weight_unit ?? 'kg';
      return {
        title: SPLIT_GUIDE_COPY.reps.title,
        body: lift
          ? `Choose Reps on an exercise. With 8–12, stay at ${formatWeight(lift.latestTopKg, unit, 1)} on ${lift.name} until every top set reaches 12 reps, then add weight. Relay says which while you log.`
          : SPLIT_GUIDE_COPY.reps.body,
        target: '.routine-day.is-open .routine-rep-range',
        next: {
          disabled: !value.days.some((item) => item.movements.some((m) => m.rep_range)),
          onClick: () => setGuideStep('save'),
        },
      };
    }
    return {
      title: SPLIT_GUIDE_COPY.save.title,
      body:
        guide?.flow === 'new'
          ? SPLIT_GUIDE_COPY.save.body
          : 'Tap Save. Your next workout shows the target as you log.',
      target: '.routine-editor-save',
    };
  }
}
