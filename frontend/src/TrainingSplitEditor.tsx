import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import { RoutinePanel } from './RoutinePanel';
import { useUserSession } from './userContext';
import { Icon } from './Icon';
import { WorkoutCalendar } from './WorkoutCalendar';
import { calendarMonths } from './calendarRange';
import { addDays, parseLocalDate, shortDate } from './trainingSummary';
import {
  MAX_SPLIT_DAYS,
  SPLIT_TEMPLATES,
  splitFromTemplate,
  splitPreview,
  splitPreviewLabel,
} from './trainingSplit';
import type { TrainingSplit } from './types';
import { localDate } from './utils';
import { useWorkoutTypes } from './workoutTypesContext';
import './trainingSplit.css';

type ActiveRoutine = { id: string | null; enabled: boolean };

export function TrainingSplitEditor({
  onSaved,
  initialView = 'schedule',
  initialRoutineId,
}: {
  onSaved: (split: TrainingSplit) => Promise<void>;
  initialView?: 'schedule' | 'saved';
  initialRoutineId?: string;
}) {
  const [view, setView] = useState(initialView);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine>({ id: null, enabled: false });
  const { user } = useUserSession();
  return (
    <div className="split-manager">
      <nav className="segmented-control split-manager-views" aria-label="Workout split views">
        <button
          type="button"
          className={view === 'saved' ? 'active' : ''}
          aria-pressed={view === 'saved'}
          onClick={() => setView('saved')}
        >
          My splits
        </button>
        <button
          type="button"
          className={view === 'schedule' ? 'active' : ''}
          aria-pressed={view === 'schedule'}
          onClick={() => setView('schedule')}
        >
          Schedule
        </button>
      </nav>
      {view === 'saved' && (
        <RoutinePanel
          ownerId={user?.id ?? 'my-splits'}
          own
          heading="My splits"
          embedded
          activeId={activeRoutine.enabled ? activeRoutine.id : null}
          initialOpenId={initialRoutineId}
          onUsed={(split) => {
            setActiveRoutine({ id: split.routine_id ?? null, enabled: split.enabled });
            setScheduleRevision((value) => value + 1);
          }}
          onChanged={(id) => {
            if (id === activeRoutine.id) setScheduleRevision((value) => value + 1);
          }}
        />
      )}
      <div hidden={view !== 'schedule'}>
        <SplitScheduleEditor
          key={scheduleRevision}
          onSaved={onSaved}
          onRoutineLoaded={setActiveRoutine}
        />
      </div>
    </div>
  );
}

function SplitScheduleEditor({
  onSaved,
  onRoutineLoaded,
}: {
  onSaved: (split: TrainingSplit) => Promise<void>;
  onRoutineLoaded: (routine: ActiveRoutine) => void;
}) {
  const workoutTypes = useWorkoutTypes();
  const [split, setSplit] = useState<TrainingSplit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [typeName, setTypeName] = useState('');
  const [previewWeek, setPreviewWeek] = useState(0);
  const [previewMonth, setPreviewMonth] = useState(0);
  const [calendarView, setCalendarView] = useState(false);
  const busy = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    api.getTrainingSplit().then(
      (saved) => {
        if (active) {
          setSplit(saved ?? splitFromTemplate('upper-lower', localDate()));
          onRoutineLoaded({ id: saved?.routine_id ?? null, enabled: saved?.enabled ?? false });
        }
      },
      (reason) => {
        if (active)
          setLoadError(reason instanceof Error ? reason.message : 'Could not load your split.');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, onRoutineLoaded]);

  if (!split) {
    return (
      <section className="content-page split-editor">
        {loadError ? (
          <div className="panel split-load-error">
            <p role="alert">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <p role="status">Loading your split…</p>
        )}
      </section>
    );
  }

  const types = workoutTypes.types;
  const activeTypes = types.filter((type) => !type.archived);
  const typeFor = (id: string | null | undefined) => types.find((type) => type.id === id);
  const colourFor = (id: string | null | undefined) => typeFor(id)?.color ?? 'var(--p-muted)';
  const labelFor = (id: string | null | undefined) =>
    id === null ? 'Rest' : id === undefined ? 'Not started' : (typeFor(id)?.name ?? 'Removed type');
  const selectedTemplate = SPLIT_TEMPLATES.find(
    (preset) =>
      preset.name === split.name &&
      JSON.stringify(preset.types) ===
        JSON.stringify(split.steps.map((step) => step.workout_type_id)),
  );
  const today = localDate();
  const previewAnchor = split.start_date > today ? split.start_date : today;
  const previewStart = addDays(previewAnchor, previewWeek * 7);
  const preview = splitPreview(split, previewStart);
  const months = calendarView ? calendarMonths(previewAnchor, 2, previewMonth) : [];
  const plannedDays = months.flatMap((month) =>
    splitPreview(split, month.first, month.cells.filter(Boolean).length).map(
      ({ date, typeId }) => ({
        date,
        label: labelFor(typeId),
        shortLabel: typeId === undefined ? '—' : splitPreviewLabel(labelFor(typeId)),
        color: typeId === undefined ? undefined : colourFor(typeId),
      }),
    ),
  );
  const monthLabel = (date: string) =>
    parseLocalDate(date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  const disabled = saving || creating;

  function update(next: TrainingSplit) {
    setSplit(next);
    setError(null);
  }
  function updateStep(index: number, id: string | null) {
    update({
      ...split!,
      steps: split!.steps.map((step, i) => (i === index ? { workout_type_id: id } : step)),
    });
  }
  function addDay(id: string | null) {
    if (split!.steps.length < MAX_SPLIT_DAYS)
      update({ ...split!, steps: [...split!.steps, { workout_type_id: id }] });
  }
  function moveDay(index: number, direction: number) {
    const steps = [...split!.steps];
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    update({ ...split!, steps });
    requestAnimationFrame(() =>
      page.current
        ?.querySelector<HTMLButtonElement>(`[data-move-day="${target}:${direction}"]`)
        ?.focus(),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!split || busy.current || workoutTypes.loading || workoutTypes.error) return;
    if (!split.name.trim()) {
      setError('Enter a split name.');
      nameInput.current?.focus();
      return;
    }
    if (!split.steps.some((step) => step.workout_type_id !== null)) {
      setError('Include at least one workout day.');
      return;
    }
    const invalidDay = split.steps.findIndex(
      (step) =>
        step.workout_type_id !== null &&
        (!typeFor(step.workout_type_id) ||
          (split.enabled && typeFor(step.workout_type_id)?.archived)),
    );
    if (invalidDay >= 0) {
      setError(`Choose an active workout type for day ${invalidDay + 1}.`);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveTrainingSplit({ ...split, name: split.name.trim() });
      await onSaved(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your split. Try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function createType() {
    const name = typeName.trim();
    if (busy.current || workoutTypes.loading || workoutTypes.error) return;
    if (!name) {
      setError('Enter a workout type name.');
      return;
    }
    if (types.some((type) => type.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError('That workout type already exists, including removed types.');
      return;
    }
    busy.current = true;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createWorkoutType({ name, color: '#a855f7' });
      workoutTypes.applySaved([...types, created]);
      setSplit(
        (current) =>
          current && {
            ...current,
            steps:
              current.steps.length < MAX_SPLIT_DAYS
                ? [...current.steps, { workout_type_id: created.id }]
                : current.steps,
          },
      );
      setTypeName('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add that workout type.');
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }

  return (
    <section className="content-page split-editor" ref={page} aria-label="Training split editor">
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={disabled} className="split-fields">
          <div className="split-enabled-row">
            <label htmlFor="split-enabled">Use this split</label>
            <input
              id="split-enabled"
              type="checkbox"
              role="switch"
              checked={split.enabled}
              onChange={(event) => update({ ...split, enabled: event.target.checked })}
            />
            <HelpPopup title="Your split">
              <p>
                Each step is one calendar day, including rest days. Your cycle repeats across weeks
                from its start date. Logging or skipping a workout does not change the schedule.
              </p>
              <p>Switch this off and save to use automatic workout suggestions again.</p>
            </HelpPopup>
          </div>
          <section aria-labelledby="split-templates-title">
            <div className="split-section-heading">
              <h2 id="split-templates-title">Templates</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  update(splitFromTemplate('custom', split.start_date));
                  setPreviewWeek(0);
                  setPreviewMonth(0);
                  nameInput.current?.focus();
                }}
              >
                Start custom
              </button>
            </div>
            <div className="split-templates">
              {SPLIT_TEMPLATES.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="split-template"
                  aria-pressed={selectedTemplate?.id === preset.id}
                  aria-label={
                    preset.id === 'fbeod' ? 'Full body every other day (FBEOD)' : preset.name
                  }
                  onClick={() => {
                    update(splitFromTemplate(preset.id, split.start_date));
                    setPreviewWeek(0);
                    setPreviewMonth(0);
                  }}
                >
                  <span>
                    <strong>{preset.name}</strong>
                    {selectedTemplate?.id === preset.id && <Icon name="check" />}
                  </span>
                  <span className="split-template-pattern" aria-hidden="true">
                    {preset.types.map((id, index) => (
                      <i
                        key={index}
                        className={id === null ? 'is-rest' : ''}
                        style={{ backgroundColor: id === null ? undefined : colourFor(id) }}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <div className="split-form-row">
            <label>
              Split name
              <input
                ref={nameInput}
                type="text"
                required
                maxLength={40}
                value={split.name}
                onChange={(event) => update({ ...split, name: event.target.value })}
              />
            </label>
            <label>
              Starts
              <input
                type="date"
                required
                value={split.start_date}
                onChange={(event) => {
                  if (event.target.value) {
                    update({ ...split, start_date: event.target.value });
                    setPreviewWeek(0);
                    setPreviewMonth(0);
                  }
                }}
              />
            </label>
          </div>
          <section aria-labelledby="split-cycle-title">
            <div className="split-section-heading">
              <h2 id="split-cycle-title">Your cycle</h2>
              <span className="split-repeat">{split.steps.length}-day repeat</span>
            </div>
            {workoutTypes.error && (
              <div className="split-type-error">
                <p role="alert">{workoutTypes.error}</p>
                <button type="button" onClick={() => void workoutTypes.reload()}>
                  Retry workout types
                </button>
              </div>
            )}
            {workoutTypes.loading && <p role="status">Loading workout types…</p>}
            <ol className="split-cycle">
              {split.steps.map((step, index) => (
                <li
                  key={index}
                  style={
                    { '--split-type-colour': colourFor(step.workout_type_id) } as CSSProperties
                  }
                >
                  <span className="split-day-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <i aria-hidden="true" />
                  <select
                    aria-label={`Day ${index + 1} workout type`}
                    disabled={workoutTypes.loading || !!workoutTypes.error}
                    value={step.workout_type_id ?? ''}
                    onChange={(event) => updateStep(index, event.target.value || null)}
                  >
                    <option value="">Rest</option>
                    {types
                      .filter((type) => !type.archived || type.id === step.workout_type_id)
                      .map((type) => (
                        <option key={type.id} value={type.id} disabled={type.archived}>
                          {type.name}
                          {type.archived ? ' (removed)' : ''}
                        </option>
                      ))}
                    {step.workout_type_id && !typeFor(step.workout_type_id) && (
                      <option value={step.workout_type_id} disabled>
                        Removed type
                      </option>
                    )}
                  </select>
                  <span className="split-day-actions">
                    <button
                      type="button"
                      className="split-icon-button"
                      aria-label={`Move day ${index + 1} earlier`}
                      data-move-day={`${index}:-1`}
                      disabled={index === 0}
                      onClick={() => moveDay(index, -1)}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="split-icon-button"
                      aria-label={`Move day ${index + 1} later`}
                      data-move-day={`${index}:1`}
                      disabled={index === split.steps.length - 1}
                      onClick={() => moveDay(index, 1)}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="split-icon-button"
                      aria-label={`Remove day ${index + 1}`}
                      disabled={split.steps.length === 1}
                      onClick={() =>
                        update({ ...split, steps: split.steps.filter((_, i) => i !== index) })
                      }
                    >
                      <Icon name="close" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="split-add-actions">
              <button
                type="button"
                disabled={
                  split.steps.length >= MAX_SPLIT_DAYS ||
                  !activeTypes.length ||
                  workoutTypes.loading ||
                  !!workoutTypes.error
                }
                onClick={() => addDay(activeTypes[0].id)}
              >
                <Icon name="plus" />
                Workout
              </button>
              <button
                type="button"
                disabled={split.steps.length >= MAX_SPLIT_DAYS}
                onClick={() => addDay(null)}
              >
                <Icon name="plus" />
                Rest day
              </button>
            </div>
            <details className="split-new-type">
              <summary>New workout type</summary>
              <div>
                <label className="sr-only" htmlFor="split-type-name">
                  Workout type name
                </label>
                <input
                  id="split-type-name"
                  type="text"
                  maxLength={40}
                  placeholder="e.g. Full body A"
                  value={typeName}
                  onChange={(event) => setTypeName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void createType();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={workoutTypes.loading || !!workoutTypes.error || !typeName.trim()}
                  onClick={() => void createType()}
                >
                  {creating ? 'Adding…' : 'Add type'}
                </button>
              </div>
            </details>
          </section>
          <section aria-labelledby="split-preview-title">
            <div className="split-section-heading split-preview-heading">
              <h2 id="split-preview-title">{calendarView ? 'Next 2 months' : 'Next 7 days'}</h2>
              <span className="split-preview-controls">
                <button
                  type="button"
                  className="split-icon-button split-calendar-toggle"
                  aria-label="Two-month calendar"
                  title={calendarView ? 'Show next 7 days' : 'Show two-month calendar'}
                  aria-pressed={calendarView}
                  onClick={() => setCalendarView((current) => !current)}
                >
                  <Icon name="calendar" />
                </button>
                <button
                  type="button"
                  className="split-icon-button"
                  aria-label={calendarView ? 'Previous two months' : 'Previous preview week'}
                  disabled={calendarView ? previewMonth === 0 : previewWeek === 0}
                  onClick={() =>
                    calendarView
                      ? setPreviewMonth((month) => Math.max(0, month - 2))
                      : setPreviewWeek((week) => Math.max(0, week - 1))
                  }
                >
                  <Icon name="chevron-left" />
                </button>
                <span>
                  {calendarView
                    ? `${monthLabel(months[0].first)} – ${monthLabel(months[1].first)}`
                    : `${shortDate(previewStart)} – ${shortDate(addDays(previewStart, 6))}`}
                </span>
                <button
                  type="button"
                  className="split-icon-button"
                  aria-label={calendarView ? 'Next two months' : 'Next preview week'}
                  onClick={() =>
                    calendarView
                      ? setPreviewMonth((month) => month + 2)
                      : setPreviewWeek((week) => week + 1)
                  }
                >
                  <Icon name="chevron-right" />
                </button>
              </span>
            </div>
            {calendarView ? (
              <div className="calendar-panel">
                <WorkoutCalendar preview={{ from: months[0].first, days: plannedDays }} />
              </div>
            ) : (
              <ol className="split-preview">
                {preview.map(({ date, typeId }) => (
                  <li
                    key={date}
                    style={{ '--split-type-colour': colourFor(typeId) } as CSSProperties}
                    aria-label={`${parseLocalDate(date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}: ${labelFor(typeId)}`}
                  >
                    <span>
                      {parseLocalDate(date).toLocaleDateString('en-AU', { weekday: 'short' })}
                    </span>
                    <b>{parseLocalDate(date).getDate()}</b>
                    <i aria-hidden="true" />
                    <strong title={labelFor(typeId)}>{splitPreviewLabel(labelFor(typeId))}</strong>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </fieldset>
        <footer className="split-save">
          <button
            type="submit"
            className="pulse-button primary"
            disabled={disabled || workoutTypes.loading || !!workoutTypes.error}
          >
            {saving ? 'Saving…' : 'Save split'}
          </button>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </footer>
      </form>
    </section>
  );
}
