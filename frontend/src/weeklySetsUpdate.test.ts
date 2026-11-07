import { describe, expect, it } from 'vitest';
import { weeklySetGains } from './weeklySetsUpdate';
import type { MuscleSetsWeek } from './liveMuscleSets';
import type { Exercise } from './types';

const exercise = (credits: { muscle_name: string; sets: number }[]): Exercise =>
  ({
    id: 'back-extension',
    name: 'Back extension machine',
    category: 'lower',
    kind: 'strength',
    muscle_group: 'Lower back',
    equipment: 'Machine',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    muscle_set_credits: credits,
  }) as Exercise;

const week: MuscleSetsWeek = {
  week_start: '2026-11-02',
  week_end: '2026-11-08',
  muscle_groups: [
    { muscle_group: 'Lower back', raw_sets: 6, contributions: [] },
    { muscle_group: 'Glutes', raw_sets: 9.5, contributions: [] },
  ],
};

describe('weeklySetGains', () => {
  it('adds one set of credits to each live weekly total, largest credit first', () => {
    const gains = weeklySetGains(
      exercise([
        { muscle_name: 'Hamstrings', sets: 0.5 },
        { muscle_name: 'Glutes', sets: 0.5 },
        { muscle_name: 'Lower back', sets: 1 },
      ]),
      week,
      '2026-11-06',
      '2026-11-06',
    );
    expect(gains).toEqual([
      { muscle: 'Lower back', before: 6, gain: 1, after: 7 },
      { muscle: 'Glutes', before: 9.5, gain: 0.5, after: 10 },
      { muscle: 'Hamstrings', before: 0, gain: 0.5, after: 0.5 },
    ]);
  });

  it('keeps the three largest credits', () => {
    const gains = weeklySetGains(
      exercise([
        { muscle_name: 'Quads', sets: 1 },
        { muscle_name: 'Adductors', sets: 0.5 },
        { muscle_name: 'Glutes', sets: 1 },
        { muscle_name: 'Lower back', sets: 0.5 },
      ]),
      week,
      '2026-11-06',
      '2026-11-06',
    );
    expect(gains.map((item) => item.muscle)).toEqual(['Glutes', 'Quads', 'Adductors']);
  });

  it('combines direct and partial credits across newly completed working sets', () => {
    const backExtension = exercise([
      { muscle_name: 'Lower back', sets: 1 },
      { muscle_name: 'Glutes', sets: 0.5 },
    ]);
    expect(weeklySetGains(backExtension, week, '2026-11-06', '2026-11-06', 3)).toEqual([
      { muscle: 'Lower back', before: 6, gain: 3, after: 9 },
      { muscle: 'Glutes', before: 9.5, gain: 1.5, after: 11 },
    ]);
    expect(weeklySetGains(backExtension, week, '2026-11-06', '2026-11-06', 0)).toEqual([]);
  });

  it('shows nothing for a workout outside the live week or without one', () => {
    const backExtension = exercise([{ muscle_name: 'Lower back', sets: 1 }]);
    expect(weeklySetGains(backExtension, week, '2026-11-01', '2026-11-06')).toEqual([]);
    expect(weeklySetGains(backExtension, week, '2026-11-07', '2026-11-06')).toEqual([]);
    expect(weeklySetGains(backExtension, undefined, '2026-11-06', '2026-11-06')).toEqual([]);
  });
});
