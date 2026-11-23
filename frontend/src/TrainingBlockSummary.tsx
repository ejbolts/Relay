import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { blockChange, blockFinished, nextBlockName } from './trainingBlocks';
import {
  deloadBlockInput,
  deloadMessage,
  nextBlockInput,
  nextBlockPlanOptions,
  type NextBlockPlan,
} from './trainingBlockForm';
import { summaryRange, summaryTiles } from './trainingBlockStats';
import { TrainingBlockDialog, type TrainingBlockDialogStart } from './TrainingBlockDialog';
import { TrainingBlockHomeCard, TrainingBlockStartCard } from './TrainingBlockHomeCard';
import { useToast } from './Toast';
import type { TrainingBlockCardStyle } from './homeLayout';
import { useTrainingBlocks } from './trainingBlocksContext';
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
      {summaryTiles(stats, previous, unit).map((tile) => (
        <Tile key={tile.label} label={tile.label} value={tile.value} change={tile.change} />
      ))}
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
  const [plan, setPlan] = useState<NextBlockPlan>('none');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const nextFormId = useId();
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

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
    void start(nextBlockInput(name, plan, today), 'Training block started');
  }

  const title =
    view === 'next' ? 'Start next block' : view === 'deload' ? 'Deload week' : block.name;

  return (
    <PopupDialog
      title={title}
      kicker={
        view === 'summary' ? (block.deload ? 'Deload complete' : 'Block complete') : undefined
      }
      onClose={onClose}
      onBack={view === 'summary' ? undefined : () => setView('summary')}
      busy={busy}
      className="training-block-dialog training-block-summary"
      actions={
        view === 'summary' ? (
          <>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProgress();
              }}
            >
              View progress
            </button>
            {!block.deload && (
              <button type="button" onClick={() => setView('deload')}>
                Deload week first
              </button>
            )}
            <button type="button" className="popup-primary-action" onClick={() => setView('next')}>
              Start next block
            </button>
          </>
        ) : view === 'next' ? (
          <>
            <button type="button" disabled={busy} onClick={() => setView('summary')}>
              Back
            </button>
            <button
              type="submit"
              form={nextFormId}
              className="popup-primary-action"
              disabled={busy || !name.trim()}
            >
              {busy ? 'Starting…' : 'Start block'}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setView('summary')}>
              Back
            </button>
            <button
              type="button"
              className="popup-primary-action"
              disabled={busy}
              onClick={() => void start(deloadBlockInput(today), 'Deload week started')}
            >
              {busy ? 'Starting…' : 'Start deload'}
            </button>
          </>
        )
      }
    >
      {view === 'summary' && (
        <div className="training-block-summary-body">
          <p className="training-block-summary-range">{summaryRange(block, today)}</p>
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
              <button type="button" className="pulse-button link small" onClick={load}>
                Retry
              </button>
            </p>
          )}
        </div>
      )}
      {view === 'next' && (
        <form id={nextFormId} onSubmit={submitNext} className="training-block-form">
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
              {nextBlockPlanOptions(today).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={plan === item.id}
                  onClick={() => setPlan(item.id)}
                >
                  <strong>{item.label}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      )}
      {view === 'deload' && (
        <div className="training-block-summary-body">
          <p>{deloadMessage(today)}</p>
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

/**
 * Home's training block card: it opens the training blocks dialog in place, or the block summary
 * once the planned end has passed. Without a block it starts the first one.
 */
export function TrainingBlockHome({
  block,
  config,
  today,
  style,
  onOpen,
}: {
  block: TrainingBlock | null;
  config: TrainingBlocks;
  today: string;
  style?: TrainingBlockCardStyle;
  /** Opens the block's exercise progress, from the summary. */
  onOpen: () => void;
}) {
  const [summarised, setSummarised] = useState<TrainingBlock | null>(null);
  const [managing, setManaging] = useState<TrainingBlockDialogStart | null>(null);
  const toast = useToast();
  const trigger = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLButtonElement>(null);
  const manage = (start: TrainingBlockDialogStart) => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setManaging(start);
  };
  const closeManaging = () => {
    setManaging(null);
    // Starting the first block swaps the empty card for the new block's card.
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : card.current)?.focus(),
    );
  };
  return (
    <>
      {block ? (
        <TrainingBlockHomeCard
          block={block}
          config={config}
          today={today}
          style={style}
          buttonRef={card}
          onOpen={() => manage('blocks')}
          onSummary={blockFinished(block, today) ? () => setSummarised(block) : undefined}
        />
      ) : (
        <TrainingBlockStartCard buttonRef={card} onStart={() => manage('new')} />
      )}
      {summarised && (
        <TrainingBlockSummaryDialog
          block={summarised}
          blocks={config.blocks}
          today={today}
          onClose={() => setSummarised(null)}
          onOpenProgress={onOpen}
          onStarted={toast.show}
        />
      )}
      {managing && (
        <TrainingBlockDialog start={managing} onClose={closeManaging} onNotice={toast.show} />
      )}
    </>
  );
}
