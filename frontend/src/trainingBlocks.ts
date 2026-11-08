import { addDays, parseLocalDate } from './trainingSummary';
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
