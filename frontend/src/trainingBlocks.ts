import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import type { PersonalRecord, TrainingBlock } from './types';
import { localDate } from './utils';

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function blockOn(blocks: TrainingBlock[], day: string): TrainingBlock | null {
  return [...blocks].reverse().find((block) => block.start_date <= day) ?? null;
}

/** An all-time achievement also qualifies when browsing its training block. */
export function recordsForBlock(records: PersonalRecord[], block: TrainingBlock | null) {
  return records.filter((record) =>
    block
      ? record.achieved_date >= block.start_date &&
        (!block.end_date || record.achieved_date < block.end_date)
      : record.scope !== 'block',
  );
}

export function blockDay(value: string, withYear: boolean) {
  const date = parseLocalDate(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${withYear ? ` ${date.getFullYear()}` : ''}`;
}

/** “10 Aug – Today”, “12 Apr – 9 Aug 2026” or “1 Jan 2025 – 11 Apr 2026”. */
export function blockRange(start: string, endExclusive: string | null | undefined) {
  const today = localDate();
  if (!endExclusive) return `${blockDay(start, start.slice(0, 4) !== today.slice(0, 4))} – Today`;
  const last = addDays(endExclusive, -1);
  if (last <= start) return blockDay(start, true);
  return `${blockDay(start, start.slice(0, 4) !== last.slice(0, 4))} – ${blockDay(last, true)}`;
}

/** Week number, and the planned length and days left when the block has a planned end. */
export function blockProgress(block: TrainingBlock, today: string) {
  const elapsed = Math.max(0, daysBetween(block.start_date, today));
  const week = Math.floor(elapsed / 7) + 1;
  if (!block.planned_end_date) return { week, weeks: null, daysLeft: null, progress: null };
  const length = daysBetween(block.start_date, block.planned_end_date) + 1;
  return {
    week,
    weeks: Math.ceil(length / 7),
    daysLeft: daysBetween(today, block.planned_end_date),
    progress: Math.min(1, (elapsed + 1) / length),
  };
}

/** The inclusive last day of a block of `weeks` whole weeks starting on `start`. */
export const weeksEnd = (start: string, weeks: number) => addDays(start, weeks * 7 - 1);

/** The planned end has passed, so the block's summary and next-block offer are due. */
export function blockFinished(block: TrainingBlock, today: string) {
  return !!block.planned_end_date && today > block.planned_end_date;
}

/** How a block's total compares with the previous block, for the summary tiles. */
export function blockChange(current: number, previous: number | undefined, percent = false) {
  if (previous === undefined) return null;
  const difference = current - previous;
  const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'same';
  if (direction === 'same') return { direction, text: 'Same as last block' } as const;
  const amount = percent
    ? previous > 0
      ? `${Math.round((Math.abs(difference) / previous) * 100)}%`
      : null
    : Math.abs(difference).toLocaleString();
  return {
    direction,
    text: amount ? `${amount} ${direction === 'up' ? 'more' : 'less'}` : 'New',
  } as const;
}

/** “Block 3”: numbered after the regular blocks already saved. */
export function nextBlockName(blocks: TrainingBlock[]) {
  return `Block ${blocks.filter((block) => !block.deload).length + 1}`;
}

/** Days after today until the planned end: “Last day” on the planned end itself. */
export function daysLeftLabel(daysLeft: number) {
  if (daysLeft === 0) return 'Last day';
  const days = Math.abs(daysLeft);
  return `${days} day${days === 1 ? '' : 's'} ${daysLeft > 0 ? 'left' : 'past plan'}`;
}
