import { blockChange, blockFinished, blockProgress, blockRange } from './trainingBlocks';
import { addDays, daysBetween, formatVolume } from './trainingSummary';
import type { BlockStats, TrainingBlock, TrainingBlocks } from './types';
import type { WeightUnit } from './weightUnits';

// What a training block added up to: its summary tiles, and the running block's comparison with
// the last regular block.

/** The summary's four tiles, each compared with the previous regular block when there is one. */
export function summaryTiles(stats: BlockStats, previous: BlockStats | null, unit: WeightUnit) {
  return [
    {
      label: 'Volume',
      value: formatVolume(stats.volume_kg, unit),
      change: blockChange(stats.volume_kg, previous?.volume_kg, true),
    },
    {
      label: 'PRs',
      value: stats.pr_count.toLocaleString(),
      change: blockChange(stats.pr_count, previous?.pr_count),
    },
    {
      label: 'Workouts',
      value: stats.workout_count.toLocaleString(),
      change: blockChange(stats.workout_count, previous?.workout_count),
    },
    {
      label: 'Sets',
      value: stats.set_count.toLocaleString(),
      change: blockChange(stats.set_count, previous?.set_count),
    },
  ];
}

/** "12 Apr – 9 Aug 2026 · 8 weeks": to the planned end when there is one. */
export function summaryRange(block: TrainingBlock, today: string) {
  const weeks = blockProgress(block, today).weeks;
  const range = block.planned_end_date
    ? blockRange(block.start_date, addDays(block.planned_end_date, 1))
    : blockRange(block.start_date, block.end_date);
  return `${range}${weeks ? ` · ${weeks} week${weeks === 1 ? '' : 's'}` : ''}`;
}

/** The summary's kicker: complete once it has ended or its planned end has passed. */
export function summaryKicker(block: TrainingBlock, today: string) {
  if (!block.end_date && !blockFinished(block, today)) return 'Current block';
  return block.deload ? 'Deload complete' : 'Block complete';
}

/** The last regular block before this one, which a regular block is compared with. */
export function previousRegularBlock(config: TrainingBlocks, block: TrainingBlock) {
  if (block.deload) return undefined;
  return config.blocks.filter((item) => item.start_date < block.start_date && !item.deload).at(-1);
}

/**
 * How the running block's volume per week compares with the previous block's, as a whole
 * percentage, or null when the previous block had no volume.
 */
export function weeklyVolumeChange(
  now: BlockStats,
  before: BlockStats,
  block: TrainingBlock,
  previous: TrainingBlock,
  today: string,
): number | null {
  const perWeek = (volume: number, days: number) => volume / Math.max(1, days / 7);
  const current = perWeek(now.volume_kg, daysBetween(block.start_date, today) + 1);
  const earlier = perWeek(
    before.volume_kg,
    daysBetween(previous.start_date, previous.end_date ?? today),
  );
  return earlier > 0 ? Math.round((current / earlier - 1) * 100) : null;
}

/** "vs Block 2 2025": the previous block's name, with its year when that differs. */
export function comparedBlockName(previous: TrainingBlock, block: TrainingBlock) {
  return `vs ${previous.name}${
    previous.start_date.slice(0, 4) !== block.start_date.slice(0, 4)
      ? ` ${previous.start_date.slice(0, 4)}`
      : ''
  }`;
}

/** A signed whole percentage: "+12%", "−4%" or "0%". */
export const signedPercent = (change: number) =>
  `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}%`;

/** "3 PRs vs 5". */
export const prComparison = (now: BlockStats, before: BlockStats) =>
  `${now.pr_count} PR${now.pr_count === 1 ? '' : 's'} vs ${before.pr_count}`;

/**
 * The running block's weeks for its strip, when it has a planned length of up to 26 weeks:
 * done, this week, or still to come, labelled W1… up to 12 weeks.
 */
export function blockWeekCells(week: number, weeks: number | null) {
  if (!weeks || weeks > 26) return [];
  return Array.from({ length: weeks }, (_, index) => ({
    state: index + 1 < week ? 'done' : index + 1 === week ? 'now' : 'next',
    label: weeks <= 12 ? `W${index + 1}` : '',
  })) satisfies { state: 'done' | 'now' | 'next'; label: string }[];
}
