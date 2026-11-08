import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import {
  blockChange,
  blockDay,
  blockFinished,
  blockProgress,
  blockRange,
  nextBlockName,
  weeksEnd,
} from './trainingBlocks';
import { TrainingBlockHomeCard } from './TrainingBlockHomeCard';
import type { TrainingBlockCardStyle } from './homeLayout';
import { useTrainingBlocks } from './trainingBlocksContext';
import { formatVolume, addDays } from './trainingSummary';
import { useWeightUnit } from './trainingPreferencesContext';
import type {
  BlockStats,
  TrainingBlock,
  TrainingBlockInput,
  TrainingBlockSummary,
  TrainingBlocks,
} from './types';
import './trainingBlocks.css';

type View = 'summary' | 'next' | 'deload';
type Plan = 'none' | '8' | '12';

const PLANS: { id: Plan; label: string }[] = [
  { id: 'none', label: 'No end' },
  { id: '8', label: '8 weeks' },
  { id: '12', label: '12 weeks' },
];

function Tile({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: ReturnType<typeof blockChange>;
}) {
  return (
    <div className="training-block-tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {change && (
        <small className={`is-${change.direction}`}>
          {change.direction !== 'same' && <Icon name={change.direction === 'up' ? 'up' : 'down'} />}
          {change.text}
        </small>
      )}
    </div>
  );
}

function Tiles({ stats, previous }: { stats: BlockStats; previous: BlockStats | null }) {
  const unit = useWeightUnit();
  return (
    <dl className="training-block-tiles">
      <Tile
        label="Volume"
        value={formatVolume(stats.volume_kg, unit)}
        change={blockChange(stats.volume_kg, previous?.volume_kg, true)}
      />
      <Tile
        label="PRs"
        value={stats.pr_count.toLocaleString()}
        change={blockChange(stats.pr_count, previous?.pr_count)}
      />
      <Tile
        label="Workouts"
        value={stats.workout_count.toLocaleString()}
        change={blockChange(stats.workout_count, previous?.workout_count)}
      />
      <Tile
        label="Sets"
        value={stats.set_count.toLocaleString()}
        change={blockChange(stats.set_count, previous?.set_count)}
      />
    </dl>
  );
}

/** What the block added up to, compared with the last regular block, and how to carry on. */
export function TrainingBlockSummaryDialog({
  block,
  blocks,
  today,
  onClose,
  onOpenProgress,
  onStarted,
}: {
  block: TrainingBlock;
  blocks: TrainingBlock[];
  today: string;
  onClose: () => void;
  onOpenProgress: () => void;
  onStarted: (notice: string) => void;
}) {
  const { changed, select } = useTrainingBlocks();
  const [view, setView] = useState<View>('summary');
  const [summary, setSummary] = useState<TrainingBlockSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState(() => nextBlockName(blocks));
  const [plan, setPlan] = useState<Plan>('none');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const deloadEnd = weeksEnd(today, 1);

  const load = useCallback(() => {
    const request = ++generation.current;
    setLoadFailed(false);
    setSummary(null);
    api.trainingBlocks
      .summary(block.id)
      .then((next) => request === generation.current && setSummary(next))
      .catch(() => request === generation.current && setLoadFailed(true));
  }, [block.id]);
  useEffect(() => {
    load();
    return () => {
      // A request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
    };
  }, [load]);

  async function start(payload: TrainingBlockInput, notice: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      changed(await api.trainingBlocks.create(payload));
      select('current');
      onStarted(notice);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start the block.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function submitNext(event: FormEvent) {
    event.preventDefault();
    void start(
      {
        name: name.trim(),
        start_date: today,
        planned_end_date: plan === 'none' ? null : weeksEnd(today, Number(plan)),
      },
      'Training block started',
    );
  }

  const weeks = blockProgress(block, today).weeks;
  const range = block.planned_end_date
    ? blockRange(block.start_date, addDays(block.planned_end_date, 1))
    : blockRange(block.start_date, block.end_date);
  const title =
    view === 'next' ? 'Start next block' : view === 'deload' ? 'Deload week' : block.name;

  return (
    <PopupDialog
      title={title}
      kicker={
        view === 'summary' ? (block.deload ? 'Deload complete' : 'Block complete') : undefined
      }
      onClose={() => !busyRef.current && onClose()}
      className="training-block-dialog training-block-summary"
    >
      {view === 'summary' && (
        <div className="training-block-summary-body">
          <p className="training-block-summary-range">
            {range}
            {weeks ? ` · ${weeks} week${weeks === 1 ? '' : 's'}` : ''}
          </p>
          {summary && (
            <>
              <Tiles stats={summary.block} previous={summary.previous} />
              {summary.previous && (
                <p className="training-block-summary-compare">
                  Compared with {summary.previous.name}
                </p>
              )}
            </>
          )}
          {!summary && !loadFailed && (
            <p role="status" className="training-block-summary-compare">
              Loading summary…
            </p>
          )}
          {loadFailed && (
            <p role="alert" className="error-message">
              Could not load the summary.{' '}
              <button type="button" onClick={load}>
                Retry
              </button>
            </p>
          )}
          <div className="training-block-summary-actions">
            <button type="button" className="primary-action" onClick={() => setView('next')}>
              Start next block
            </button>
            {!block.deload && (
              <button type="button" onClick={() => setView('deload')}>
                Deload week first
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProgress();
              }}
            >
              View progress
            </button>
          </div>
        </div>
      )}
      {view === 'next' && (
        <form onSubmit={submitNext} className="training-block-form">
          <fieldset disabled={busy}>
            <label>
              Block name
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="training-block-starts plan three" role="radiogroup" aria-label="Ends">
              <span aria-hidden="true">Ends</span>
              {PLANS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={plan === item.id}
                  onClick={() => setPlan(item.id)}
                >
                  <strong>{item.label}</strong>
                  {item.id !== 'none' && (
                    <small>{blockDay(weeksEnd(today, Number(item.id)), false)}</small>
                  )}
                </button>
              ))}
            </div>
            <div className="training-block-actions">
              <button type="button" onClick={() => setView('summary')}>
                Back
              </button>
              <button type="submit" className="primary-action" disabled={!name.trim()}>
                {busy ? 'Starting…' : 'Start block'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {view === 'deload' && (
        <div className="training-block-summary-body">
          <p>
            A 7-day deload block starts today and runs to {blockDay(deloadEnd, false)}. Start your
            next block when it ends.
          </p>
          <div className="training-block-actions">
            <button type="button" disabled={busy} onClick={() => setView('summary')}>
              Back
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={busy}
              onClick={() =>
                void start(
                  {
                    name: 'Deload week',
                    start_date: today,
                    planned_end_date: deloadEnd,
                    deload: true,
                  },
                  'Deload week started',
                )
              }
            >
              {busy ? 'Starting…' : 'Start deload'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </PopupDialog>
  );
}

/** Home's training block card: after the planned end it opens the block summary. */
export function TrainingBlockHome({
  block,
  config,
  today,
  style,
  onOpen,
}: {
  block: TrainingBlock;
  config: TrainingBlocks;
  today: string;
  style?: TrainingBlockCardStyle;
  onOpen: () => void;
}) {
  const [summarised, setSummarised] = useState<TrainingBlock | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <>
      <TrainingBlockHomeCard
        block={block}
        config={config}
        today={today}
        style={style}
        onOpen={onOpen}
        onSummary={blockFinished(block, today) ? () => setSummarised(block) : undefined}
      />
      {summarised && (
        <TrainingBlockSummaryDialog
          block={summarised}
          blocks={config.blocks}
          today={today}
          onClose={() => setSummarised(null)}
          onOpenProgress={onOpen}
          onStarted={setNotice}
        />
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
    </>
  );
}
