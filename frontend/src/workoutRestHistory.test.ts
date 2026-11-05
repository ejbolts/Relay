import { describe, expect, it } from 'vitest';
import { previousSetRests } from './workoutRestHistory';
import { createWorkoutSet } from './workoutSets';
import type { ExerciseHistoryEntry } from './exerciseHistory';

const working = { ...createWorkoutSet('strength'), set_type: 'normal' as const, warmup: false };
const warmup = createWorkoutSet('strength');
const entry: ExerciseHistoryEntry = {
  workoutId: 'previous',
  workoutDate: '2026-11-01',
  workoutName: 'Sample workout',
  movementNotes: null,
  sets: [warmup, warmup, working, working].map((set, index) => ({
    ...set,
    id: `previous-${index}`,
    order_index: index,
    bodyweight_kg: null,
    percentile: null,
    incline_percent: null,
    speed_kph: null,
    failed: false,
    target_reps: null,
    warmup: Boolean(set.warmup),
    set_type: set.warmup ? ('warmup' as const) : ('normal' as const),
    completed: true,
    rest_seconds: [60, 90, 150, 210][index],
  })),
};

describe('previous rest matching', () => {
  it('matches working sets by their position within the set kind', () => {
    expect(previousSetRests([warmup, working, working], 1, [entry])).toEqual([
      { workoutId: 'previous', date: '2026-11-01', seconds: 150 },
    ]);
    expect(previousSetRests([working, working], 1, [entry])[0].seconds).toBe(210);
    expect(previousSetRests([warmup], 0, [entry])[0].seconds).toBe(60);
  });

  it('does not invent history for extra sets or other kinds', () => {
    expect(previousSetRests([working, working, working], 2, [entry])).toEqual([]);
    expect(previousSetRests([{ ...working, set_type: 'drop' }], 0, [entry])).toEqual([]);
    expect(previousSetRests([working], 0, [])).toEqual([]);
  });

  it('retains explicit no-rest history', () => {
    const noRest = { ...entry, sets: [{ ...entry.sets[2], rest_seconds: null }] };
    expect(previousSetRests([working], 0, [noRest])[0].seconds).toBeNull();
  });
});
