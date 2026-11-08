import { blockDay, blockProgress, daysLeftLabel } from './trainingBlocks';
import type { TrainingBlock } from './types';

/** Home indicator for the block covering today, with days left when a planned end is set. */
export function TrainingBlockHomeCard({
  block,
  today,
  onOpen,
}: {
  block: TrainingBlock;
  today: string;
  onOpen: () => void;
}) {
  const { week, weeks, daysLeft, progress } = blockProgress(block, today);
  const since = blockDay(block.start_date, block.start_date.slice(0, 4) !== today.slice(0, 4));
  const weekLabel =
    weeks === null
      ? `Week ${week} · since ${since}`
      : week > weeks
        ? `Week ${week} · planned ${weeks}`
        : `Week ${week} of ${weeks}`;
  return (
    <button type="button" className="pulse-card training-block-home" onClick={onOpen}>
      <span className="training-block-home-top">
        <span>Training block</span>
        {daysLeft !== null && (
          <em className={daysLeft < 0 ? 'past' : ''}>{daysLeftLabel(daysLeft)}</em>
        )}
      </span>
      <strong>{block.name}</strong>
      <span className="training-block-home-week">{weekLabel}</span>
      {progress !== null && (
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
    </button>
  );
}
