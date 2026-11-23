import { useId, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { GuideCoach, type CoachStep } from './GuideCoach';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { exitGuide, finishGuide, useActiveGuide } from './setupGuides';
import {
  blockFormDraft,
  blockFormInput,
  blockFormTitle,
  blockPlanOptions,
  blockRemoveMessage,
  blockStartOptions,
  createdBlockSelection,
  type PlanPreset,
  type StartPreset,
} from './trainingBlockForm';
import { weeksEnd } from './trainingBlocks';
import { useTrainingBlocks } from './trainingBlocksContext';
import { addDays } from './trainingSummary';
import { localDate } from './utils';
import type { TrainingBlock, TrainingBlocks } from './types';
import { blockColor } from './blockColors';
import { BlockColorField, TrainingBlockYearView } from './TrainingBlockYear';
import './trainingBlocks.css';

type View = 'blocks' | 'form' | 'remove';
/** Where the dialog opens: the blocks overview, or straight into a new block. */
export type TrainingBlockDialogStart = 'blocks' | 'new';

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
  // Null uses the app's palette.
  const [color, setColor] = useState<string | null>(null);
  const [start, setStart] = useState(localDate());
  const [preset, setPreset] = useState<StartPreset>('today');
  const [plan, setPlan] = useState<PlanPreset>('none');
  const [planEnd, setPlanEnd] = useState(() => weeksEnd(localDate(), 4));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const guide = useActiveGuide('blocks');
  const [guideStep, setGuideStep] = useState(0);
  const formId = useId();
  const today = localDate();

  const close = () => {
    if (busyRef.current) return;
    exitGuide('blocks');
    onClose();
  };
  // A form or confirmation steps back to the view it came from.
  const back =
    view === 'remove'
      ? () => {
          setError(null);
          setView('form');
        }
      : view === 'form' && formBack
        ? () => {
            setError(null);
            setView(formBack);
          }
        : undefined;
  const startForm = (item: TrainingBlock | null, back: View | null) => {
    setEditing(item);
    const draft = blockFormDraft(item, today);
    setName(draft.name);
    setColor(draft.color);
    setStart(draft.start);
    setPreset(draft.preset);
    setPlan(draft.plan);
    setPlanEnd(draft.planEnd);
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
    const payload = blockFormInput({ name, color, start, preset, plan, planEnd });
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
        const selection = createdBlockSelection(next, start, today);
        if (selection) select(selection);
        finishGuide('blocks');
        onNotice('Training block started');
        onClose();
      },
    );
  }

  // The colour a block gets without a choice: its tone, or the accent for a new current block.
  const automaticColor = editing
    ? blockColor(config.blocks, { ...editing, color: null }, today)
    : 'var(--p-accent-text)';
  const dialogTitle =
    view === 'form'
      ? blockFormTitle(!!editing)
      : view === 'remove'
        ? 'Remove training block?'
        : 'Training blocks';

  const lift = guide?.facts.lift;
  const coachSteps: CoachStep[] = [
    {
      title: 'Name this phase',
      body: 'Something like Strength or Summer cut. Your first session of each lift in a block sets a fresh baseline, so you can earn Block PRs below your all-time best.',
      target: '.training-block-form fieldset > label:first-of-type input',
      next: { disabled: !name.trim(), onClick: () => setGuideStep(1) },
    },
    {
      title: 'Pick a start',
      body: 'Today, 1 January, or Custom for a past date so recent workouts count towards this block.',
      target: '.training-block-starts:not(.plan)',
      next: { onClick: () => setGuideStep(2) },
    },
    {
      title: 'Plan an end, if you like',
      body: 'Home counts down the days left. A block never closes by itself.',
      target: '.training-block-starts.plan',
      next: { onClick: () => setGuideStep(3) },
    },
    {
      title: 'Start the block',
      body: lift
        ? `Home then shows the week you’re on, and ${lift.name} records start fresh from your next session.`
        : 'Home then shows the week you’re on, and records start fresh from your next session.',
      target: '.training-block-dialog .popup-dialog-footer button[type="submit"]',
    },
  ];

  return (
    <PopupDialog
      title={dialogTitle}
      onClose={close}
      onBack={back}
      busy={busy}
      className="training-block-dialog"
      actions={
        view === 'form' ? (
          <>
            {editing && (
              <button
                type="button"
                className="popup-tertiary-action is-danger"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setView('remove');
                }}
              >
                Remove
              </button>
            )}
            {back && (
              <button type="button" disabled={busy} onClick={back}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              form={formId}
              className="popup-primary-action"
              disabled={busy || !name.trim()}
            >
              {busy ? 'Saving…' : editing ? 'Save block' : 'Start block'}
            </button>
          </>
        ) : view === 'remove' && editing ? (
          <>
            {/* Keyed, so it mounts fresh and takes focus instead of reusing the Remove button. */}
            <button key="keep" type="button" autoFocus disabled={busy} onClick={back}>
              Cancel
            </button>
            <button
              type="button"
              className="popup-primary-action is-danger"
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
          </>
        ) : undefined
      }
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
        <TrainingBlockYearView
          config={config}
          today={today}
          busy={busy}
          onEdit={(item) => startForm(item, 'blocks')}
        />
      )}
      {view === 'form' && (
        <form id={formId} onSubmit={submit} className="training-block-form">
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
            <BlockColorField value={color} automatic={automaticColor} onChange={setColor} />
            <div className="training-block-starts" role="radiogroup" aria-label="Starts">
              <span aria-hidden="true">Starts</span>
              {blockStartOptions({ start, preset }, today).map(({ value, label, detail, date }) => (
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
              {blockPlanOptions({ start, plan, planEnd }).map(({ value, label, detail }) => (
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
          </fieldset>
        </form>
      )}
      {view === 'remove' && editing && <p>{blockRemoveMessage(editing.name)}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {guide && view === 'form' && !editing && (
        <GuideCoach
          step={coachSteps[guideStep]}
          index={guideStep}
          total={coachSteps.length}
          onBack={guideStep > 0 ? () => setGuideStep(guideStep - 1) : undefined}
          onExit={() => exitGuide('blocks')}
        />
      )}
    </PopupDialog>
  );
}
