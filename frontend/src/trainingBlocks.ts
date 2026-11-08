import type { PersonalRecord, TrainingBlock } from './types';

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
