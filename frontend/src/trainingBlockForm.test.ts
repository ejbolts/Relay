import { describe, expect, it } from 'vitest';
import {
  blockFormDraft,
  blockFormInput,
  blockPlanOptions,
  blockStartOptions,
  createdBlockSelection,
  deloadBlockInput,
  deloadMessage,
  nextBlockInput,
  nextBlockPlanOptions,
  planFor,
  presetFor,
} from './trainingBlockForm';
import type { TrainingBlock } from './types';

const TODAY = '2026-11-18';
const block = (id: string, start: string, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id,
  name: id,
  start_date: start,
  end_date: null,
  ...extra,
});

describe('the training block form', () => {
  it('starts a new block today with no set end', () => {
    const draft = blockFormDraft(null, TODAY);
    expect(draft).toEqual({
      name: '',
      color: null,
      start: TODAY,
      preset: 'today',
      plan: 'none',
      planEnd: '2026-12-15',
    });
    expect(blockFormInput({ ...draft, name: ' Winter strength ' })).toEqual({
      name: 'Winter strength',
      start_date: TODAY,
      planned_end_date: null,
      color: null,
    });
  });

  it('recognises a saved block’s start and planned end', () => {
    expect(presetFor('2026-01-01', TODAY)).toBe('january');
    expect(presetFor('2026-03-04', TODAY)).toBe('custom');
    expect(planFor('2026-11-02', '2026-12-27')).toBe('8');
    expect(planFor('2026-11-02', '2027-01-24')).toBe('12');
    expect(planFor('2026-11-02', '2026-12-01')).toBe('custom');
    const draft = blockFormDraft(
      block('cut', '2026-03-04', { planned_end_date: '2026-05-01', color: 'nope' }),
      TODAY,
    );
    expect(draft).toMatchObject({ preset: 'custom', plan: 'custom', color: null });
    expect(blockFormInput(draft).planned_end_date).toBe('2026-05-01');
  });

  it('shows each choice’s date', () => {
    expect(blockStartOptions({ start: TODAY, preset: 'today' }, TODAY)).toEqual([
      { value: 'today', label: 'Today', detail: '18 Nov', date: TODAY },
      { value: 'january', label: '1 January', detail: '2026', date: '2026-01-01' },
      { value: 'custom', label: 'Custom', detail: '', date: TODAY },
    ]);
    expect(
      blockPlanOptions({ start: TODAY, plan: '8', planEnd: '2027-01-01' }).map(
        (option) => option.detail,
      ),
    ).toEqual(['', '12 Jan', '9 Feb', '']);
  });

  it('shows a new block covering today as the current one', () => {
    const next = { blocks: [block('old', '2026-01-05'), block('new', TODAY)] };
    expect(createdBlockSelection(next, TODAY, TODAY)).toBe('current');
    expect(createdBlockSelection(next, '2026-01-05', TODAY)).toBe('old');
    expect(createdBlockSelection(next, '2026-02-01', TODAY)).toBeNull();
  });
});

describe('starting the next block from a summary', () => {
  it('starts today, with an optional planned length', () => {
    expect(nextBlockPlanOptions(TODAY).map((option) => option.detail)).toEqual([
      '',
      '12 Jan',
      '9 Feb',
    ]);
    expect(nextBlockInput(' Block 3 ', '8', TODAY)).toEqual({
      name: 'Block 3',
      start_date: TODAY,
      planned_end_date: '2027-01-12',
    });
    expect(nextBlockInput('Block 3', 'none', TODAY).planned_end_date).toBeNull();
  });

  it('starts a 7-day deload week', () => {
    expect(deloadBlockInput(TODAY)).toEqual({
      name: 'Deload week',
      start_date: TODAY,
      planned_end_date: '2026-11-24',
      deload: true,
    });
    expect(deloadMessage(TODAY)).toBe(
      'A 7-day deload block starts today and runs to 24 Nov. Start your next block when it ends.',
    );
  });
});
