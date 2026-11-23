import { describe, expect, it } from 'vitest';
import { splitCalendarMonths } from './splitCalendar';
import {
  currentSplitStep,
  nextTrainingStep,
  splitCalendarDays,
  splitFromTemplate,
  splitPreview,
  splitPreviewLabel,
  splitStepOnDate,
} from './trainingSplit';

describe('training split calendar cycles', () => {
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
    const split = { ...splitFromTemplate('fbeod', '2026-10-26'), progression: 'calendar' as const };
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

describe('workout-following split previews', () => {
  const split = {
    ...splitFromTemplate('upper-lower', '2026-10-01'),
    progression: 'workouts' as const,
  };
  it('starts at the next step and shows planned rests when no rest is saved', () => {
    const preview = splitPreview(
      { ...split, next_step: 1, next_date: '2026-11-08' },
      '2026-11-07',
      5,
    );
    expect(preview.map((day) => day.typeId)).toEqual([undefined, 'lower', null, 'upper', 'lower']);
  });
  it('lets a saved rest skip only the first planned rest', () => {
    const preview = splitPreview(
      { ...split, next_step: 0, rest_saved: true, next_date: '2026-11-07' },
      '2026-11-07',
      6,
    );
    expect(preview.map((day) => day.typeId)).toEqual([
      'upper',
      'lower',
      'upper',
      'lower',
      null,
      'upper',
    ]);
  });

  it('starts the two-month preview at the next logged step and keeps planned rest days', () => {
    const months = splitCalendarMonths(
      { ...split, next_step: 1, next_date: '2026-11-28' },
      '2026-11-15',
      0,
    );
    expect(months.map((month) => month.first)).toEqual(['2026-11-01', '2026-12-01']);
    expect(months[0].cells[0]?.getDate()).toBe(1);
    expect(months[0].days).toEqual([
      { date: '2026-11-28', typeId: 'lower', step: 1 },
      { date: '2026-11-29', typeId: null, step: 2 },
      { date: '2026-11-30', typeId: 'upper', step: 0 },
    ]);
    expect(months[1].days[0]).toEqual({ date: '2026-12-01', typeId: 'lower', step: 1 });
  });
});

describe('split days on the calendar', () => {
  const split = {
    ...splitFromTemplate('upper-lower', '2026-10-01'),
    progression: 'workouts' as const,
    next_step: 1,
    rest_saved: true,
    next_date: '2026-11-18',
    missed_days: [
      { workout_date: '2026-11-16', workout_type_id: 'lower' },
      { workout_date: '2026-11-17', workout_type_id: 'lower' },
    ],
  };

  it('marks missed past days, then today and the days ahead without rests', () => {
    // The saved rest absorbs the planned rest after Lower, so Upper follows straight on.
    expect([...splitCalendarDays(split, '2026-11-18', 4)]).toEqual([
      ['2026-11-16', 'lower'],
      ['2026-11-17', 'lower'],
      ['2026-11-18', 'lower'],
      ['2026-11-19', 'upper'],
      ['2026-11-20', 'lower'],
      ['2026-11-22', 'upper'],
    ]);
  });

  it('follows calendar dates, and shows nothing for a disabled or missing split', () => {
    const dated = {
      ...splitFromTemplate('upper-lower', '2026-11-16'),
      progression: 'calendar' as const,
    };
    expect([...splitCalendarDays(dated, '2026-11-18', 2)]).toEqual([
      ['2026-11-19', 'upper'],
      ['2026-11-20', 'lower'],
    ]);
    expect(splitCalendarDays({ ...split, enabled: false }, '2026-11-18', 4).size).toBe(0);
    expect(splitCalendarDays(null, '2026-11-18', 4).size).toBe(0);
  });
});

describe('skipped and caught-up splits', () => {
  const ppl = {
    ...splitFromTemplate('ppl', '2026-11-01'),
    progression: 'calendar' as const,
  };

  it('counts a By date split from its latest shift, leaving earlier days alone', () => {
    const shifted = { ...ppl, shift: { from_date: '2026-11-19', step: 1 } };
    // 1 Nov is Push, so the 18th is Pull (step 1) and the 19th's date says Lower (step 2).
    expect(splitStepOnDate(ppl, '2026-11-19')).toBe(2);
    expect(splitStepOnDate(shifted, '2026-11-18')).toBe(1);
    expect(splitStepOnDate(shifted, '2026-11-19')).toBe(1);
    expect(splitStepOnDate(shifted, '2026-11-21')).toBe(3);
    expect(splitPreview(shifted, '2026-11-19', 4).map((day) => day.typeId)).toEqual([
      'pull',
      'lower',
      null,
      'push',
    ]);
  });

  it('ignores a shift on a workout-following split, whose position comes from the server', () => {
    const followed = {
      ...ppl,
      progression: 'workouts' as const,
      next_step: 2,
      shift: { from_date: '2026-11-19', step: 0 },
    };
    expect(currentSplitStep(followed, '2026-11-19')).toBe(2);
    expect(currentSplitStep({ ...ppl, shift: followed.shift }, '2026-11-19')).toBe(0);
  });

  it('skips to the next workout day, passing over rests', () => {
    expect(nextTrainingStep(ppl, 0)).toBe(1);
    expect(nextTrainingStep(ppl, 2)).toBe(0);
    expect(nextTrainingStep(ppl, 3)).toBe(0);
    const everyOtherDay = splitFromTemplate('fbeod', '2026-11-01');
    expect(nextTrainingStep(everyOtherDay, 0)).toBe(0);
    expect(nextTrainingStep(everyOtherDay, 1)).toBe(0);
  });
});
