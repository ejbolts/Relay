import { describe, expect, it } from 'vitest';
import {
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
});
