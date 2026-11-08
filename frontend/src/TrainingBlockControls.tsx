import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import {
  blockDay,
  blockOn,
  blockProgress,
  blockRange,
  daysLeftLabel,
  MONTHS,
} from './trainingBlocks';
import { useTrainingBlocks } from './trainingBlocksContext';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import { localDate } from './utils';
import type { TrainingBlock, TrainingBlocks } from './types';
import './trainingBlocks.css';

type View = 'pick' | 'blocks' | 'form' | 'remove';
type StartPreset = 'today' | 'january' | 'custom';
type PlanPreset = 'none' | '8' | '12' | 'custom';

const weeksEnd = (start: string, weeks: number) => addDays(start, weeks * 7 - 1);

function planFor(start: string, end: string | null | undefined): PlanPreset {
  if (!end) return 'none';
  if (end === weeksEnd(start, 8)) return '8';
  return end === weeksEnd(start, 12) ? '12' : 'custom';
}

const TONES = 4;

const workouts = (count: number | undefined) =>
  count === undefined ? '' : `${count.toLocaleString()} workout${count === 1 ? '' : 's'}`;
const joined = (...parts: string[]) => parts.filter(Boolean).join(' · ');

function presetFor(start: string): StartPreset {
  const today = localDate();
  if (start === today) return 'today';
  return start === `${today.slice(0, 4)}-01-01` ? 'january' : 'custom';
}

/** Proportional strip showing how blocks divide the logged history. */
function BlockTimeline({ config, currentId }: { config: TrainingBlocks; currentId?: string }) {
  const today = localDate();
  const first = config.blocks[0];
  if (!first) return null;
  const earlierStart =
    config.history_start && config.history_start < first.start_date && config.earlier_workout_count
      ? config.history_start
      : null;
  const segments = [
    ...(earlierStart
      ? [{ id: 'earlier', name: 'Before blocks', start: earlierStart, end: first.start_date }]
      : []),
    ...config.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      start: block.start_date,
      end: block.end_date ?? addDays(today, 1),
    })),
  ];
  const origin = segments[0].start;
  return (
    <div className="training-block-timeline">
      <div
        className="training-block-bar"
        role="img"
        aria-label={`Timeline: ${segments.map((item) => item.name).join(', ')}`}
      >
        {segments.map((item) => {
          const index = config.blocks.findIndex((block) => block.id === item.id);
          const tone =
            item.id === 'earlier'
              ? 'earlier'
              : item.id === currentId
                ? 'current'
                : `tone-${index % TONES}`;
          return (
            <span
              key={item.id}
              className={`training-block-segment ${tone}`}
              style={{ flex: `${Math.max(1, daysBetween(item.start, item.end))} 1 0` }}
              title={item.name}
            >
              {item.id === 'earlier' ? 'Before' : item.name}
            </span>
          );
        })}
      </div>
      <div className="training-block-axis" aria-hidden="true">
        <span>{`${MONTHS[parseLocalDate(origin).getMonth()]} ${origin.slice(0, 4)}`}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export function TrainingBlockControls() {
  const { config, block, select, changed, loading, error: loadError, retry } = useTrainingBlocks();
  const helpId = useId();
  const [view, setView] = useState<View | null>(null);
  const [formBack, setFormBack] = useState<View | null>(null);
  const [lastBlock, setLastBlock] = useState('current');
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState<TrainingBlock | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(localDate());
  const [preset, setPreset] = useState<StartPreset>('today');
  const [plan, setPlan] = useState<PlanPreset>('none');
  const [planEnd, setPlanEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const trigger = useRef<HTMLButtonElement | null>(null);
  const helpRoot = useRef<HTMLDivElement>(null);
  const current = blockOn(config.blocks, localDate());
  const disabled = loading || !!loadError;
  const today = localDate();
  const january = `${today.slice(0, 4)}-01-01`;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!help) return;
    const closeOutside = (event: PointerEvent) => {
      if (!helpRoot.current?.contains(event.target as Node)) setHelp(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [help]);

  const open = (next: View, source: HTMLButtonElement) => {
    trigger.current = source;
    setError(null);
    setView(next);
  };
  const close = () => {
    if (busyRef.current) return;
    setView(null);
    setError(null);
    requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus());
  };
  const startForm = (item: TrainingBlock | null, back: View | null) => {
    setEditing(item);
    setName(item?.name ?? '');
    const date = item?.start_date ?? today;
    setStart(date);
    setPreset(presetFor(date));
    setPlan(planFor(date, item?.planned_end_date));
    setPlanEnd(item?.planned_end_date ?? weeksEnd(date, 4));
    setFormBack(back);
    setError(null);
    setView('form');
  };
  const choose = (id: string) => {
    setLastBlock(id);
    select(id);
  };

  async function save(
    action: () => Promise<TrainingBlocks>,
    after: (next: TrainingBlocks) => void,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      changed(next);
      after(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save training blocks.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = { name: name.trim(), start_date: start, planned_end_date: plannedEnd };
    if (editing) {
      void save(
        () => api.trainingBlocks.update(editing.id, payload),
        () => setView('blocks'),
      );
      return;
    }
    void save(
      () => api.trainingBlocks.create(payload),
      (next) => {
        const created = next.blocks.find((item) => item.start_date === start);
        if (created)
          choose(created.id === blockOn(next.blocks, today)?.id ? 'current' : created.id);
        setView(null);
        requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus());
        setNotice('Training block started');
      },
    );
  }

  const plannedEnd =
    plan === 'none' ? null : plan === 'custom' ? planEnd : weeksEnd(start, Number(plan));
  const viewing = block ?? null;
  const dialogTitle =
    view === 'pick'
      ? 'Choose block'
      : view === 'form'
        ? editing
          ? 'Edit block'
          : 'New training block'
        : view === 'remove'
          ? 'Remove training block?'
          : 'Training blocks';

  return (
    <>
      <div className="training-block-scope" ref={helpRoot}>
        {config.blocks.length ? (
          <>
            <div className="training-block-scope-row">
              <div
                className="segmented-control compact"
                role="radiogroup"
                aria-label="Progress scope"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!viewing}
                  className={viewing ? 'active' : ''}
                  disabled={disabled}
                  onClick={() =>
                    select(
                      config.blocks.some((item) => item.id === lastBlock) ? lastBlock : 'current',
                    )
                  }
                >
                  This block
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!viewing}
                  className={viewing ? '' : 'active'}
                  disabled={disabled}
                  onClick={() => select('all')}
                >
                  All time
                </button>
              </div>
              <button
                type="button"
                className="training-block-help"
                aria-label="How training blocks work"
                aria-expanded={help}
                aria-controls={helpId}
                onClick={() => setHelp((value) => !value)}
              >
                ?
              </button>
            </div>
            <button
              type="button"
              className="training-block-pill"
              aria-haspopup="dialog"
              aria-label={viewing ? `Training block: ${viewing.name}` : undefined}
              disabled={disabled || !viewing}
              onClick={(event) => open('pick', event.currentTarget)}
            >
              <span>
                <strong>{viewing ? viewing.name : 'Your whole history'}</strong>
                <small>
                  {viewing
                    ? joined(
                        blockRange(viewing.start_date, viewing.end_date),
                        workouts(viewing.workout_count),
                      )
                    : joined(
                        config.history_start ? `Since ${blockDay(config.history_start, true)}` : '',
                        workouts(
                          config.blocks.reduce(
                            (total, item) => total + (item.workout_count ?? 0),
                            config.earlier_workout_count ?? 0,
                          ),
                        ),
                      )}
                </small>
              </span>
              {viewing && <Icon name="chevron-down" />}
            </button>
          </>
        ) : (
          <div className="training-block-scope-row">
            <strong className="training-block-empty">All time</strong>
            <button
              type="button"
              className="training-block-help"
              aria-label="How training blocks work"
              aria-expanded={help}
              aria-controls={helpId}
              onClick={() => setHelp((value) => !value)}
            >
              ?
            </button>
            <button
              type="button"
              className="training-block-start"
              disabled={disabled}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                startForm(null, null);
              }}
            >
              <Icon name="plus" /> Start a block
            </button>
          </div>
        )}
        {help && (
          <div
            id={helpId}
            className="training-block-popover"
            role="region"
            aria-label="How training blocks work"
            onKeyDown={(event) => event.key === 'Escape' && setHelp(false)}
          >
            <p>
              <strong>Block PR</strong> Best since the block started.
            </p>
            <p>
              <strong>All-time PR</strong> Best across your whole history.
            </p>
            <p>Workouts are never deleted. Each one belongs to the block covering its date.</p>
          </div>
        )}
      </div>
      {loadError && (
        <p role="alert">
          {loadError}{' '}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {notice &&
        createPortal(
          <div className="undo-toast top-toast" role="status">
            <span>{notice}</span>
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss training block notification"
              onClick={() => setNotice('')}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
      {view && (
        <PopupDialog
          title={dialogTitle}
          onClose={close}
          className="training-block-dialog"
          headerActions={
            view === 'blocks' ? (
              <button
                type="button"
                className="training-block-new"
                disabled={busy}
                onClick={() => startForm(null, 'blocks')}
              >
                <Icon name="plus" /> New
              </button>
            ) : undefined
          }
        >
          {view === 'pick' && (
            <>
              <ul className="training-block-pick" role="radiogroup" aria-label="Training block">
                {[...config.blocks].reverse().map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={viewing?.id === item.id}
                      onClick={() => {
                        choose(item.id === current?.id ? 'current' : item.id);
                        close();
                      }}
                    >
                      <span className="training-block-radio" aria-hidden="true" />
                      <span>
                        <strong>
                          {item.name}
                          {item.id === current?.id && <span className="badge">Current</span>}
                        </strong>
                        <small>
                          {joined(
                            blockRange(item.start_date, item.end_date),
                            workouts(item.workout_count),
                          )}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="training-block-actions split">
                <button type="button" onClick={() => startForm(null, 'pick')}>
                  <Icon name="plus" /> New block
                </button>
                <button type="button" onClick={() => setView('blocks')}>
                  Edit blocks
                </button>
              </div>
            </>
          )}
          {view === 'blocks' && (
            <div className="training-block-page">
              <BlockTimeline config={config} currentId={current?.id} />
              <ul className="training-block-cards">
                {[...config.blocks].reverse().map((item) => {
                  const index = config.blocks.indexOf(item);
                  return (
                    <li key={item.id}>
                      <span
                        className={`training-block-swatch ${
                          item.id === current?.id ? 'current' : `tone-${index % TONES}`
                        }`}
                        aria-hidden="true"
                      />
                      <div>
                        <strong>
                          {item.name}
                          {item.id === current?.id && <span className="badge">Current</span>}
                        </strong>
                        <small>{blockRange(item.start_date, item.end_date)}</small>
                        {item.id === current?.id && item.planned_end_date && (
                          <small className="training-block-plan">
                            {joined(
                              daysLeftLabel(blockProgress(item, today).daysLeft!),
                              `Planned end ${blockDay(item.planned_end_date, item.planned_end_date.slice(0, 4) !== today.slice(0, 4))}`,
                            )}
                          </small>
                        )}
                        {item.workout_count !== undefined && (
                          <small>{workouts(item.workout_count)}</small>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        disabled={busy}
                        onClick={() => startForm(item, 'blocks')}
                      >
                        Edit
                      </button>
                    </li>
                  );
                })}
                {!!config.earlier_workout_count && config.history_start && (
                  <li className="earlier">
                    <span className="training-block-swatch earlier" aria-hidden="true" />
                    <div>
                      <strong>Before blocks</strong>
                      <small>{blockRange(config.history_start, config.blocks[0].start_date)}</small>
                      <small>{workouts(config.earlier_workout_count)}</small>
                    </div>
                  </li>
                )}
              </ul>
              <div className="training-block-yearly">
                <strong>New block each January</strong>
                <button
                  type="button"
                  role="switch"
                  aria-label="Start a new block each January"
                  aria-checked={config.auto_yearly}
                  className={config.auto_yearly ? 'is-on' : ''}
                  disabled={busy}
                  onClick={() =>
                    void save(
                      () => api.trainingBlocks.preferences(!config.auto_yearly),
                      () => {},
                    )
                  }
                >
                  <span />
                  {config.auto_yearly ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}
          {view === 'form' && (
            <form onSubmit={submit} className="training-block-form">
              <fieldset disabled={busy}>
                <label>
                  Block name
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Winter strength"
                  />
                </label>
                <div className="training-block-starts" role="radiogroup" aria-label="Starts">
                  <span aria-hidden="true">Starts</span>
                  {(
                    [
                      ['today', 'Today', blockDay(today, false), today],
                      ['january', '1 January', january.slice(0, 4), january],
                      [
                        'custom',
                        'Pick date',
                        preset === 'custom' ? blockDay(start, true) : '',
                        start,
                      ],
                    ] as const
                  ).map(([value, label, detail, date]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={preset === value}
                      onClick={() => {
                        setPreset(value);
                        setStart(date);
                      }}
                    >
                      <strong>{label}</strong>
                      {detail && <small>{detail}</small>}
                    </button>
                  ))}
                </div>
                {preset === 'custom' && (
                  <label>
                    Start date
                    <input
                      required
                      type="date"
                      max={today}
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                    />
                  </label>
                )}
                <div className="training-block-starts plan" role="radiogroup" aria-label="Ends">
                  <span aria-hidden="true">Ends</span>
                  {(
                    [
                      ['none', 'No end', ''],
                      ['8', '8 weeks', blockDay(weeksEnd(start, 8), false)],
                      ['12', '12 weeks', blockDay(weeksEnd(start, 12), false)],
                      ['custom', 'Pick date', plan === 'custom' ? blockDay(planEnd, false) : ''],
                    ] as const
                  ).map(([value, label, detail]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={plan === value}
                      onClick={() => setPlan(value)}
                    >
                      <strong>{label}</strong>
                      {detail && <small>{detail}</small>}
                    </button>
                  ))}
                </div>
                {plan === 'custom' && (
                  <label>
                    Planned end
                    <input
                      required
                      type="date"
                      min={addDays(start, 1)}
                      value={planEnd}
                      onChange={(event) => setPlanEnd(event.target.value)}
                    />
                  </label>
                )}
                <div className="training-block-actions">
                  {editing && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        setError(null);
                        setView('remove');
                      }}
                    >
                      Remove
                    </button>
                  )}
                  {formBack && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setView(formBack);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="primary-action" disabled={!name.trim()}>
                    {busy ? 'Saving…' : editing ? 'Save block' : 'Start block'}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {view === 'remove' && editing && (
            <>
              <p>
                Remove “{editing.name}”? Workouts stay saved. Block records will follow the
                remaining dates, and yearly rollover will turn off.
              </p>
              <div className="training-block-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setView('form');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      () => api.trainingBlocks.remove(editing.id),
                      (next) => {
                        setEditing(null);
                        setView(next.blocks.length ? 'blocks' : null);
                      },
                    )
                  }
                >
                  Remove block
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </PopupDialog>
      )}
    </>
  );
}
