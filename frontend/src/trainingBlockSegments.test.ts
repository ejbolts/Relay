import { describe, expect, it } from 'vitest';
import {
  blockStrip,
  blockYearSegments,
  blocksInYear,
  firstBlockYear,
  lastBlockYear,
  segmentInYear,
  toggledBlock,
  workoutCountLabel,
} from './trainingBlockSegments';
import type { TrainingBlock, TrainingBlocks } from './types';

const TODAY = '2026-11-18';
const block = (id: string, start: string, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id,
  name: id,
  start_date: start,
  end_date: null,
  ...extra,
});
const config: TrainingBlocks = {
  blocks: [
    block('Base', '2025-10-06', { end_date: '2026-02-02', color: '#2d4f9e' }),
    block('Strength', '2026-02-02', { end_date: '2026-09-07' }),
    block('Peak', '2026-09-07', { planned_end_date: '2026-12-27' }),
  ],
  history_start: '2025-06-02',
  earlier_workout_count: 40,
};

describe('Home’s block strip', () => {
  it('draws the history before blocks, each block, and the running one to its planned end', () => {
    const strip = blockStrip(config, 'Peak', TODAY)!;
    expect(strip.segments.map((item) => [item.label, item.tone])).toEqual([
      ['Before', 'earlier'],
      ['Base', 'tone-0'],
      ['Strength', 'tone-1'],
      ['Peak', 'current'],
    ]);
    expect(strip.segments[1]).toMatchObject({ color: '#2d4f9e', ink: '#ffffff' });
    expect(strip.segments[3]).toMatchObject({ marked: true, days: 112 });
    expect(strip.progress).toBeCloseTo(73 / 112);
    expect(strip).toMatchObject({ startLabel: 'Jun 2025', endLabel: '27 Dec' });
    expect(blockStrip({ blocks: [] }, undefined, TODAY)).toBeNull();
  });
});

describe('the blocks overview', () => {
  it('covers every year with history, through the running block’s planned end', () => {
    expect(firstBlockYear(config, TODAY)).toBe(2025);
    expect(lastBlockYear(config, TODAY)).toBe(2026);
    const later = { blocks: [block('Long', '2026-11-02', { planned_end_date: '2027-02-01' })] };
    expect(lastBlockYear(later, TODAY)).toBe(2027);
  });

  it('draws the planned rest of the running block after today', () => {
    const segments = blockYearSegments(config, TODAY);
    expect(segments.map((item) => item.key)).toEqual([
      'earlier',
      'Base',
      'Strength',
      'Peak',
      'Peak-planned',
    ]);
    expect(segments.at(-2)).toMatchObject({ end: '2026-11-19' });
    expect(segments.at(-1)).toMatchObject({
      start: '2026-11-19',
      end: '2026-12-28',
      planned: true,
    });
  });

  it('places a segment within a year, clipped to it', () => {
    expect(segmentInYear({ start: '2025-10-06', end: '2026-02-02' }, 2026)).toEqual({
      left: 0,
      width: 32 / 365,
    });
    expect(segmentInYear({ start: '2025-10-06', end: '2026-01-01' }, 2026)).toBeNull();
  });

  it('lists the blocks starting in a year, newest first, after any history before blocks', () => {
    expect(blocksInYear(config, 2026)).toMatchObject({ count: 2, earlier: false });
    expect(blocksInYear(config, 2026).listed.map((item) => item.id)).toEqual(['Peak', 'Strength']);
    expect(blocksInYear(config, 2025)).toMatchObject({ count: 1, earlier: true });
    expect(workoutCountLabel(1)).toBe('1 workout');
    expect(workoutCountLabel(undefined)).toBe('');
  });

  it('highlights a tapped block, and clears it on a second tap', () => {
    expect(toggledBlock(config.blocks, null, 'Base')).toBe('Base');
    expect(toggledBlock(config.blocks, 'Base', 'Base')).toBeNull();
    expect(toggledBlock(config.blocks, null, 'gone')).toBeNull();
  });
});
