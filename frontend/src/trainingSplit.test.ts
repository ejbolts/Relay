import { describe, expect, it } from 'vitest';
import {
  splitFromTemplate,
  splitCalendarPreview,
  splitPreview,
  splitPreviewLabel,
  splitStepOnDate,
} from './trainingSplit';

describe('training split calendar cycles', () => {
  it('lays out two full months across year boundaries without resetting the cycle', () => {
    const split = splitFromTemplate('ppl', '2026-12-30');
    const months = splitCalendarPreview(split, '2026-12-31');
    expect(months.map((month) => month.title)).toEqual(['December 2026', 'January 2027']);
    expect(months[0].cells[0]).toBeNull(); // December starts on Tuesday.
    const days = months.flatMap((month) => month.cells.filter((day) => day !== null));
    expect(days).toHaveLength(62);
    expect(days.find((day) => day.date === '2026-12-29')?.typeId).toBeUndefined();
    expect(days.find((day) => day.date === '2026-12-30')?.typeId).toBe('push');
    expect(days.find((day) => day.date === '2027-01-02')?.typeId).toBeNull();
    expect(days.find((day) => day.date === '2027-01-03')?.typeId).toBe('push');
    expect(splitCalendarPreview(split, '2026-12-31', 2)[0].first).toBe('2027-02-01');
  });

  it('includes leap day and aligns Sunday at the end of a Monday-first week', () => {
    const months = splitCalendarPreview(splitFromTemplate('fbeod', '2028-02-01'), '2028-02-29');
    const february = months[0].cells.filter((day) => day !== null);
    expect(february).toHaveLength(29);
    expect(february.at(-1)).toEqual({ date: '2028-02-29', typeId: 'full_body' });
    const sunday = splitCalendarPreview(splitFromTemplate('custom', '2026-11-01'), '2026-11-01')[0];
    expect(sunday.cells.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(sunday.cells[6]?.date).toBe('2026-11-01');
    expect(sunday.cells.length % 7).toBe(0);
  });
  it('keeps A/B workout labels distinct in compact previews', () => {
    expect(splitPreviewLabel('Full body A')).toBe('Full A');
    expect(splitPreviewLabel('Full body B')).toBe('Full B');
    expect(splitPreviewLabel('Upper body')).toBe('Upper');
    expect(splitPreviewLabel('Cardio')).toBe('Cardio');
  });
  it('builds the four templates and independent editable copies', () => {
    const expected = {
      'upper-lower': ['upper', 'lower', null],
      ppl: ['push', 'pull', 'lower', null],
      fbeod: ['full_body', null],
      cardio: ['cardio', null],
    };
    for (const [id, types] of Object.entries(expected)) {
      const split = splitFromTemplate(id, '2026-10-26');
      expect(split.steps.map((step) => step.workout_type_id)).toEqual(types);
      expect(split.enabled).toBe(true);
      split.steps[0].workout_type_id = 'other';
      expect(splitFromTemplate(id, '2026-10-26').steps[0].workout_type_id).toBe(types[0]);
    }
  });

  it('keeps every-other-day training rolling over Mondays, months and skipped dates', () => {
    const split = splitFromTemplate('fbeod', '2026-10-26');
    expect(splitStepOnDate(split, '2026-10-25')).toBeNull();
    expect(splitStepOnDate(split, '2026-10-26')).toBe(0);
    expect(splitPreview(split, '2026-11-02').map((day) => day.typeId)).toEqual([
      null,
      'full_body',
      null,
      'full_body',
      null,
      'full_body',
      null,
    ]);
    expect(splitStepOnDate(split, '2027-01-01')).toBe(1);
  });

  it('counts calendar days across daylight-saving changes', () => {
    const split = splitFromTemplate('upper-lower', '2026-10-03');
    expect(splitStepOnDate(split, '2026-10-05')).toBe(2);
    expect(splitStepOnDate(split, '2026-10-06')).toBe(0);
  });

  it('previews repeated custom types and distinguishes rest from a future start', () => {
    const split = {
      ...splitFromTemplate('custom', '2026-11-01'),
      steps: [
        { workout_type_id: 'custom-a' },
        { workout_type_id: 'custom-b' },
        { workout_type_id: null },
      ],
    };
    expect(splitPreview(split, '2026-10-31', 5).map((day) => day.typeId)).toEqual([
      undefined,
      'custom-a',
      'custom-b',
      null,
      'custom-a',
    ]);
  });
});
