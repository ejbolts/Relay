import type { Ref } from 'react';
import type { TrainingBlockCardSettings, TrainingBlockCardStyle } from './homeLayout';
import { Icon } from './Icon';
import { blockEndedLabel, blockWeekLabel } from './trainingBlockHome';
import { blockProgress, daysLeftLabel } from './trainingBlocks';
import { BlockTimeline } from './TrainingBlockTimeline';
import type { TrainingBlock, TrainingBlocks } from './types';

/** Home's training block card before the first block, so starting one is a tap away. */
export function TrainingBlockStartCard({
  onStart,
  buttonRef,
}: {
  onStart: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="pulse-card training-block-home is-empty"
      aria-haspopup="dialog"
      onClick={onStart}
    >
      <span className="training-block-home-top">
        <span>Training block</span>
      </span>
      <strong>No block running</strong>
      <span className="training-block-home-cta">
        <Icon name="plus" /> Start a block
      </span>
    </button>
  );
}

/** Home indicator for the block covering today, with days left when a planned end is set. */
export function TrainingBlockHomeCard({
  block,
  config,
  today,
  style = 'both',
  onOpen,
  onSummary,
  buttonRef,
}: {
  block: TrainingBlock;
  config: TrainingBlocks;
  today: string;
  style?: TrainingBlockCardStyle;
  onOpen: () => void;
  /** Once the planned end has passed, the card opens the block's summary instead. */
  onSummary?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const { daysLeft, progress } = blockProgress(block, today);
  const weekLabel = blockWeekLabel(block, today);
  if (onSummary && block.planned_end_date) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className="pulse-card training-block-home is-finished"
        onClick={onSummary}
      >
        <span className="training-block-home-top">
          <span>Training block</span>
          <em>Finished</em>
        </span>
        <strong>{block.name}</strong>
        <span className="training-block-home-week">
          {blockEndedLabel({ ...block, planned_end_date: block.planned_end_date }, today)}
        </span>
        <span className="training-block-home-cta">
          See your summary <Icon name="chevron-right" />
        </span>
        {style !== 'progress' && (
          <BlockTimeline config={config} currentId={block.id} today={today} />
        )}
      </button>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className="pulse-card training-block-home"
      onClick={onOpen}
    >
      <span className="training-block-home-top">
        <span>Training block</span>
        {daysLeft !== null && (
          <em className={daysLeft < 0 ? 'past' : ''}>{daysLeftLabel(daysLeft)}</em>
        )}
      </span>
      <strong>{block.name}</strong>
      <span className="training-block-home-week">{weekLabel}</span>
      {style !== 'timeline' && progress !== null && (
        <span
          className={`training-block-home-bar${daysLeft! < 0 ? ' past' : ''}`}
          role="progressbar"
          aria-label={`${block.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </span>
      )}
      {style !== 'progress' && <BlockTimeline config={config} currentId={block.id} today={today} />}
    </button>
  );
}

const STYLES: { id: TrainingBlockCardStyle; label: string }[] = [
  { id: 'progress', label: 'Progress' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'both', label: 'Both' },
];

export function TrainingBlockCardSettingsForm({
  value,
  onChange,
}: {
  value: TrainingBlockCardSettings;
  onChange: (change: Partial<TrainingBlockCardSettings>) => void;
}) {
  return (
    <div className="cardio-card-settings">
      <fieldset>
        <legend>Design</legend>
        <div className="cardio-card-styles">
          {STYLES.map((style) => (
            <label key={style.id}>
              <input
                type="radio"
                name="training-block-card-style"
                checked={value.style === style.id}
                onChange={() => onChange({ style: style.id })}
              />
              <span className={`training-block-style-preview is-${style.id}`} aria-hidden="true">
                {style.id !== 'timeline' && <i className="bar" />}
                {style.id !== 'progress' && (
                  <span className="strip">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
              <span>{style.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
