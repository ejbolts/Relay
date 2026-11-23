import { describe, expect, it } from 'vitest';
import {
  blockWeekCells,
  comparedBlockName,
  previousRegularBlock,
  prComparison,
  signedPercent,
  summaryKicker,
  summaryRange,
  summaryTiles,
  weeklyVolumeChange,
} from './trainingBlockStats';
import type { BlockStats, TrainingBlock } from './types';

const TODAY = '2026-11-18';
const block = (id: string, start: string, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id,
  name: id,
  start_date: start,
  end_date: null,
  ...extra,
});
const stats = (volume: number, prs: number, workouts = 12, sets = 180): BlockStats => ({
  block_id: 'b',
  name: 'B',
  start_date: '2026-09-07',
  workout_count: workouts,
  set_count: sets,
  volume_kg: volume,
  pr_count: prs,
});

describe('a block summary', () => {
  it('compares each tile with the previous block', () => {
    expect(summaryTiles(stats(24_000, 5), stats(20_000, 5, 10, 180), 'kg')).toEqual([
      { label: 'Volume', value: '24.0 t', change: { direction: 'up', text: '20% more' } },
      { label: 'PRs', value: '5', change: { direction: 'same', text: 'Same as last block' } },
      { label: 'Workouts', value: '12', change: { direction: 'up', text: '2 more' } },
      { label: 'Sets', value: '180', change: { direction: 'same', text: 'Same as last block' } },
    ]);
    expect(summaryTiles(stats(900, 1), null, 'kg')[0]).toEqual({
      label: 'Volume',
      value: '900 kg',
      change: null,
    });
  });

  it('describes its dates and whether it is over', () => {
    const planned = block('b', '2026-09-07', { planned_end_date: '2026-11-01' });
    expect(summaryRange(planned, TODAY)).toBe('7 Sep – 1 Nov 2026 · 8 weeks');
    expect(summaryKicker(planned, TODAY)).toBe('Block complete');
    expect(summaryKicker({ ...planned, deload: true }, TODAY)).toBe('Deload complete');
    expect(summaryKicker(block('now', '2026-11-02'), TODAY)).toBe('Current block');
    expect(summaryKicker(block('old', '2026-01-05', { end_date: '2026-03-02' }), TODAY)).toBe(
      'Block complete',
    );
  });
});

describe('the running block against the last regular one', () => {
  const blocks = [
    block('first', '2026-06-01', { end_date: '2026-08-24' }),
    block('deload', '2026-08-24', { end_date: '2026-08-31', deload: true }),
    block('now', '2026-08-31'),
  ];

  it('skips deload weeks, and a deload compares with nothing', () => {
    expect(previousRegularBlock({ blocks }, blocks[2])?.id).toBe('first');
    expect(previousRegularBlock({ blocks }, blocks[1])).toBeUndefined();
    expect(previousRegularBlock({ blocks }, blocks[0])).toBeUndefined();
  });

  it('compares volume per week, and names the earlier block with its year if it differs', () => {
    // 12,000 kg over 12 weeks before; 13,200 kg over the 80 days so far.
    const change = weeklyVolumeChange(
      stats(13_200, 3),
      stats(12_000, 4),
      blocks[2],
      blocks[0],
      TODAY,
    );
    expect(change).toBe(16);
    expect(signedPercent(change!)).toBe('+16%');
    expect(signedPercent(-4)).toBe('−4%');
    expect(weeklyVolumeChange(stats(1, 0), stats(0, 0), blocks[2], blocks[0], TODAY)).toBeNull();
    expect(comparedBlockName(blocks[0], blocks[2])).toBe('vs first');
    expect(comparedBlockName(block('x', '2025-03-03'), blocks[2])).toBe('vs x 2025');
    expect(prComparison(stats(0, 1), stats(0, 4))).toBe('1 PR vs 4');
  });

  it('draws its weeks when the planned length is known and short enough', () => {
    expect(blockWeekCells(2, 4)).toEqual([
      { state: 'done', label: 'W1' },
      { state: 'now', label: 'W2' },
      { state: 'next', label: 'W3' },
      { state: 'next', label: 'W4' },
    ]);
    expect(blockWeekCells(1, 16)[0].label).toBe('');
    expect(blockWeekCells(1, null)).toEqual([]);
    expect(blockWeekCells(1, 30)).toEqual([]);
  });
});
