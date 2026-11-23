import { trainedWeeks, WEEKS_BEFORE_FIRST_BLOCK } from './trainingBlockSuggestion';
import { blockDay, blockOn, blockProgress } from './trainingBlocks';
import type { TrackedWorkout, TrainingBlock } from './types';

// Home's training block card: which card shows, and what it says.

/**
 * The card Home shows: the block covering today, or, before the first block, an offer to start
 * one once there are a few weeks of the person's own training to build on. Null shows no card,
 * including while the blocks are loading or could not be read.
 */
export function homeBlockCard({
  blocks,
  loading,
  error,
  workouts,
  today,
  weekStartDay,
}: {
  blocks: TrainingBlock[];
  loading: boolean;
  error: boolean;
  workouts: TrackedWorkout[];
  today: string;
  weekStartDay: number;
}): { kind: 'block'; block: TrainingBlock } | { kind: 'offer' } | null {
  const block = blockOn(blocks, today);
  if (block) return { kind: 'block', block };
  return !loading &&
    !error &&
    blocks.length === 0 &&
    trainedWeeks(workouts, weekStartDay) >= WEEKS_BEFORE_FIRST_BLOCK
    ? { kind: 'offer' }
    : null;
}

const dayIn = (day: string, today: string) => blockDay(day, day.slice(0, 4) !== today.slice(0, 4));

/** "Week 3 of 8", "Week 9 · planned 8", or "Week 3 · since 10 Aug" without a planned end. */
export function blockWeekLabel(block: TrainingBlock, today: string) {
  const { week, weeks } = blockProgress(block, today);
  if (weeks === null) return `Week ${week} · since ${dayIn(block.start_date, today)}`;
  return week > weeks ? `Week ${week} · planned ${weeks}` : `Week ${week} of ${weeks}`;
}

/** "8 weeks · ended 9 Aug", once the planned end has passed. */
export function blockEndedLabel(
  block: TrainingBlock & { planned_end_date: string },
  today: string,
) {
  const { weeks } = blockProgress(block, today);
  return `${weeks} week${weeks === 1 ? '' : 's'} · ended ${dayIn(block.planned_end_date, today)}`;
}
