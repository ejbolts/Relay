import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  weeksEnd,
} from './trainingBlocks';
import { useTrainingBlocks } from './trainingBlocksContext';
import { addDays } from './trainingSummary';
import { localDate } from './utils';
import type { TrainingBlock, TrainingBlocks } from './types';
import { BlockTimeline, TONES } from './TrainingBlockTimeline';
import './trainingBlocks.css';

type View = 'blocks' | 'form' | 'remove';
/** Where the dialog opens: the blocks overview, or straight into a new block. */
export type TrainingBlockDialogStart = 'blocks' | 'new';
type StartPreset = 'today' | 'january' | 'custom';
type PlanPreset = 'none' | '8' | '12' | 'custom';

function planFor(start: string, end: string | null | undefined): PlanPreset {
  if (!end) return 'none';
  if (end === weeksEnd(start, 8)) return '8';
  return end === weeksEnd(start, 12) ? '12' : 'custom';
}

const workouts = (count: number | undefined) =>
  count === undefined ? '' : `${count.toLocaleString()} workout${count === 1 ? '' : 's'}`;
const joined = (...parts: string[]) => parts.filter(Boolean).join(' · ');

function presetFor(start: string): StartPreset {
  const today = localDate();
  if (start === today) return 'today';
  return start === `${today.slice(0, 4)}-01-01` ? 'january' : 'custom';
}

/** Brief confirmation after a block starts; clears itself after a few seconds. */
export function TrainingBlockToast({
  notice,
  onDismiss,
}: {
  notice: string;
  onDismiss: () => void;
}) {
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dismiss.current(), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return createPortal(
    <div className="undo-toast top-toast" role="status">
      <span>{notice}</span>
      <button
        type="button"
        className="undo-toast-close"
        aria-label="Dismiss training block notification"
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
    </div>,
    document.body,
  );
}

/** Lists, creates, edits and removes training blocks. */
export function TrainingBlockDialog({
  start: opening,
  onClose,
  onNotice,
}: {
  start: TrainingBlockDialogStart;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const { config, select, changed } = useTrainingBlocks();
  const [view, setView] = useState<View>(opening === 'new' ? 'form' : 'blocks');
  const [formBack, setFormBack] = useState<View | null>(null);
  const [editing, setEditing] = useState<TrainingBlock | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(localDate());
  const [preset, setPreset] = useState<StartPreset>('today');
  const [plan, setPlan] = useState<PlanPreset>('none');
  const [planEnd, setPlanEnd] = useState(() => weeksEnd(localDate(), 4));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const current = blockOn(config.blocks, localDate());
  const today = localDate();
  const january = `${today.slice(0, 4)}-01-01`;

  const close = () => {
    if (!busyRef.current) onClose();
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

  async function save(
    action: () => Promise<TrainingBlocks>,
    after: (next: TrainingBlocks) => void,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    let next: TrainingBlocks;
    try {
      next = await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save training blocks.');
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    changed(next);
    after(next);
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
          select(created.id === blockOn(next.blocks, today)?.id ? 'current' : created.id);
        onNotice('Training block started');
        onClose();
      },
    );
  }

  const plannedEnd =
    plan === 'none' ? null : plan === 'custom' ? planEnd : weeksEnd(start, Number(plan));
  const dialogTitle =
    view === 'form'
      ? editing
        ? 'Edit block'
        : 'New training block'
      : view === 'remove'
        ? 'Remove training block?'
        : 'Training blocks';

  return (
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
                      {item.deload && <span className="badge deload">Deload</span>}
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
                  ['custom', 'Pick date', preset === 'custom' ? blockDay(start, true) : '', start],
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
            Remove “{editing.name}”? Workouts stay saved. Block records will follow the remaining
            dates.
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
                    if (next.blocks.length) setView('blocks');
                    else onClose();
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
  );
}
