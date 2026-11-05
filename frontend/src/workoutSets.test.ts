import { describe, expect, it } from 'vitest';
import type { Exercise, TrackedSet, TrackedWorkout, WorkoutSetInput } from './types';
import {
  completeRemainingSets,
  createWorkoutSet,
  createSuggestedWorkoutSet,
  isCompletedWorkingSet,
  latestExerciseSet,
  latestExerciseSets,
  restTimerSecondsAfterSetUpdate,
  suggestNextSetFromLoggedSet,
} from './workoutSets';

const previousSet: WorkoutSetInput = {
  reps: 8,
  weight_kg: 80,
  rpe: 8,
  rest_seconds: 180,
  duration_seconds: null,
  distance_km: null,
  incline_percent: null,
  speed_kph: null,
  notes: null,
  completed: true,
};

describe('new workout sets', () => {
  it('carry the previous set rest time into the next set', () => {
    const nextSet = createWorkoutSet('strength', previousSet);

    expect(nextSet.rest_seconds).toBe(180);
    expect(nextSet.completed).toBe(false);
  });

  it('use the standard rest time for the first set', () => {
    expect(createWorkoutSet('strength').rest_seconds).toBe(180);
  });

  it('keeps the matching previous rest for a suggested set, including no rest', () => {
    expect(
      createSuggestedWorkoutSet('strength', { ...previousSet, rest_seconds: 120 }).rest_seconds,
    ).toBe(120);
    expect(
      createSuggestedWorkoutSet('strength', { ...previousSet, rest_seconds: null }).rest_seconds,
    ).toBeNull();
  });

  it('defaults the first set to a warm-up', () => {
    const firstSet = createWorkoutSet('strength');

    expect(firstSet.set_type).toBe('warmup');
    expect(firstSet.warmup).toBe(true);
  });

  it('prefills a first warm-up from a previous set without marking it complete', () => {
    const firstSet = createWorkoutSet('strength', previousSet, true);

    expect(firstSet).toMatchObject({
      weight_kg: 80,
      reps: 8,
      set_type: 'warmup',
      warmup: true,
      completed: false,
    });
  });

  it('preserves a previous warm-up when cloning the prior session set order', () => {
    const clonedSet = createWorkoutSet(
      'strength',
      { ...previousSet, set_type: 'warmup', warmup: true },
      false,
    );

    expect(clonedSet).toMatchObject({
      weight_kg: 80,
      reps: 8,
      set_type: 'warmup',
      warmup: true,
      completed: false,
    });
  });

  it('carry treadmill settings into the next cardio set', () => {
    const nextSet = createWorkoutSet('cardio', {
      ...previousSet,
      duration_seconds: 1_200,
      distance_km: 1.8,
      incline_percent: 12.5,
      speed_kph: 5.4,
    });

    expect(nextSet.incline_percent).toBe(12.5);
    expect(nextSet.speed_kph).toBe(5.4);
    expect(nextSet.rest_seconds).toBeNull();
  });

  it('does not add a rest duration to suggested cardio sets', () => {
    expect(createSuggestedWorkoutSet('cardio', previousSet).rest_seconds).toBeNull();
  });
});

describe('previous exercise values', () => {
  const exercise: Exercise = {
    id: 'bench-press',
    name: 'Bench Press',
    category: 'push',
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: 'Barbell',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
  };

  function workout(id: string, workoutDate: string, createdAt: string, sets: TrackedSet[]) {
    return {
      id,
      name: 'Push workout',
      workout_date: workoutDate,
      category: 'push',
      notes: null,
      duration_minutes: 45,
      start_time: null,
      end_time: null,
      is_sample: false,
      created_at: createdAt,
      updated_at: createdAt,
      movements: [
        {
          id: `${id}-movement`,
          order_index: 0,
          notes: null,
          exercise,
          sets,
          machine_photos: [],
          superset_group_id: null,
          superset_name: null,
        },
      ],
    } satisfies TrackedWorkout;
  }

  function trackedSet(id: string, orderIndex: number, weight: number): TrackedSet {
    return {
      id,
      order_index: orderIndex,
      reps: 8,
      weight_kg: weight,
      rpe: 8,
      rest_seconds: 120,
      duration_seconds: null,
      distance_km: null,
      incline_percent: null,
      speed_kph: null,
      bodyweight_kg: null,
      percentile: null,
      warmup: orderIndex === 0,
      set_type: orderIndex === 0 ? 'warmup' : 'normal',
      failed: false,
      target_reps: null,
      notes: null,
      completed: true,
    };
  }

  it('uses the first completed set from the latest matching workout', () => {
    const older = workout('older', '2026-07-01', '2026-07-01T09:00:00Z', [
      trackedSet('older-set', 0, 40),
    ]);
    const latest = workout('latest', '2026-07-08', '2026-07-08T09:00:00Z', [
      trackedSet('latest-working', 1, 80),
      trackedSet('latest-warmup', 0, 50),
    ]);

    expect(latestExerciseSet([older, latest], exercise.id, '2026-07-09')?.weight_kg).toBe(50);
  });

  it('returns every completed set from the latest matching workout in set order', () => {
    const older = workout('older', '2026-07-01', '2026-07-01T09:00:00Z', [
      trackedSet('older-set', 0, 40),
    ]);
    const latest = workout('latest', '2026-07-08', '2026-07-08T09:00:00Z', [
      trackedSet('latest-working', 1, 80),
      { ...trackedSet('latest-incomplete', 2, 85), completed: false },
      trackedSet('latest-warmup', 0, 50),
    ]);

    expect(
      latestExerciseSets([older, latest], exercise.id, '2026-07-09').map((set) => set.id),
    ).toEqual(['latest-warmup', 'latest-working']);
  });

  it('ignores the workout being edited and workouts after the selected date', () => {
    const current = workout('current', '2026-07-08', '2026-07-08T09:00:00Z', [
      trackedSet('current-set', 0, 60),
    ]);
    const future = workout('future', '2026-07-10', '2026-07-10T09:00:00Z', [
      trackedSet('future-set', 0, 70),
    ]);
    const previous = workout('previous', '2026-07-01', '2026-07-01T09:00:00Z', [
      trackedSet('previous-set', 0, 45),
    ]);

    expect(
      latestExerciseSet([current, future, previous], exercise.id, '2026-07-08', 'current')
        ?.weight_kg,
    ).toBe(45);
  });
});

describe('completed working sets', () => {
  it('does not count completed warm-ups', () => {
    expect(isCompletedWorkingSet({ ...previousSet, set_type: 'warmup', warmup: true })).toBe(false);
  });

  it('counts completed normal and drop sets', () => {
    expect(isCompletedWorkingSet({ ...previousSet, set_type: 'normal' })).toBe(true);
    expect(isCompletedWorkingSet({ ...previousSet, set_type: 'drop' })).toBe(true);
  });

  it('only counts a failed set when at least one rep was completed', () => {
    expect(isCompletedWorkingSet({ ...previousSet, failed: true, reps: 0 })).toBe(false);
    expect(isCompletedWorkingSet({ ...previousSet, failed: true, reps: 1 })).toBe(true);
  });
});

describe('rest timer start', () => {
  it('starts when an incomplete set becomes complete', () => {
    expect(
      restTimerSecondsAfterSetUpdate(
        'strength',
        { completed: false, rest_seconds: 180 },
        { completed: true },
      ),
    ).toBe(180);
  });

  it('uses a newly selected rest duration from the same update', () => {
    expect(
      restTimerSecondsAfterSetUpdate(
        'strength',
        { completed: false, rest_seconds: 180 },
        { completed: true, rest_seconds: 150 },
      ),
    ).toBe(150);
  });

  it('does not restart when editing an already completed set', () => {
    expect(
      restTimerSecondsAfterSetUpdate(
        'strength',
        { completed: true, rest_seconds: 180 },
        { completed: true },
      ),
    ).toBeNull();
  });

  it('does not reuse the previous rest when the same save explicitly removes it', () => {
    expect(
      restTimerSecondsAfterSetUpdate(
        'strength',
        { completed: false, rest_seconds: 180 },
        { completed: true, rest_seconds: null },
      ),
    ).toBeNull();
    expect(
      restTimerSecondsAfterSetUpdate(
        'strength',
        { completed: false, rest_seconds: 180 },
        { completed: true, rest_seconds: 0 },
      ),
    ).toBeNull();
  });

  it('does not start for ordinary edits or a missing rest duration', () => {
    expect(
      restTimerSecondsAfterSetUpdate('strength', { completed: false, rest_seconds: 180 }, {}),
    ).toBeNull();
    expect(
      restTimerSecondsAfterSetUpdate(
        'strength',
        { completed: false, rest_seconds: null },
        { completed: true },
      ),
    ).toBeNull();
  });

  it('does not start for a completed cardio set', () => {
    expect(
      restTimerSecondsAfterSetUpdate(
        'cardio',
        { completed: false, rest_seconds: 180 },
        { completed: true },
      ),
    ).toBeNull();
  });
});

describe('next set suggestion after logging a set', () => {
  type DraftSet = WorkoutSetInput & { fromPrevious?: boolean };
  const working: DraftSet = { ...previousSet, set_type: 'normal', warmup: false, failed: false };
  const logged: DraftSet = { ...working, weight_kg: 87.5, reps: 10, completed: true };
  const suggested: DraftSet = {
    ...working,
    weight_kg: 70,
    reps: 9,
    completed: false,
    fromPrevious: true,
  };

  it('copies the logged weight and reps into the next suggested set', () => {
    const [, next] = suggestNextSetFromLoggedSet('strength', [logged, suggested], 0);

    expect(next).toEqual({ ...suggested, weight_kg: 87.5, reps: 10 });
    expect(next.fromPrevious).toBe(true);
  });

  it('only changes the set immediately after the logged one', () => {
    const third = { ...suggested, reps: 8 };
    const sets = suggestNextSetFromLoggedSet('strength', [logged, suggested, third], 0);

    expect(sets[2]).toBe(third);
  });

  it('keeps sets the lifter has already entered or logged', () => {
    const typed = { ...suggested, fromPrevious: false };
    const done = { ...suggested, completed: true };

    expect(suggestNextSetFromLoggedSet('strength', [logged, typed], 0)[1]).toBe(typed);
    expect(suggestNextSetFromLoggedSet('strength', [logged, done], 0)[1]).toBe(done);
  });

  it('ignores warm-ups, drop sets, cardio and sets that are not logged', () => {
    const warmup: DraftSet = { ...logged, set_type: 'warmup', warmup: true };
    const drop: DraftSet = { ...suggested, set_type: 'drop' };
    const unlogged = { ...logged, completed: false };

    expect(suggestNextSetFromLoggedSet('strength', [warmup, suggested], 0)[1]).toBe(suggested);
    expect(suggestNextSetFromLoggedSet('strength', [logged, drop], 0)[1]).toBe(drop);
    expect(suggestNextSetFromLoggedSet('cardio', [logged, suggested], 0)[1]).toBe(suggested);
    expect(suggestNextSetFromLoggedSet('strength', [unlogged, suggested], 0)[1]).toBe(suggested);
  });

  it('carries a set to failure forward like a working set', () => {
    const failure = { ...logged, failed: true };

    expect(suggestNextSetFromLoggedSet('strength', [failure, suggested], 0)[1].weight_kg).toBe(
      87.5,
    );
  });

  it('leaves the list alone when the logged set is the last one', () => {
    const sets = [suggested, logged];

    expect(suggestNextSetFromLoggedSet('strength', sets, 1)).toBe(sets);
  });
});

describe('completeRemainingSets', () => {
  const strengthSet = (update: Partial<WorkoutSetInput & { fromPrevious?: boolean }>) => ({
    ...createWorkoutSet('strength', undefined, false),
    ...update,
  });

  it('logs unticked sets with values, including suggestions, and leaves blank sets alone', () => {
    const sets = [
      strengthSet({ weight_kg: 60, reps: 10, completed: true }),
      strengthSet({ weight_kg: 62.5, reps: 8, fromPrevious: true }),
      strengthSet({ weight_kg: 62.5, reps: 8 }),
      strengthSet({}),
    ];

    const result = completeRemainingSets('strength', sets);

    expect(result.map((item) => item.completed)).toEqual([true, true, true, false]);
    expect(result[1]).toMatchObject({ weight_kg: 62.5, reps: 8, fromPrevious: false });
    expect(result[0]).toBe(sets[0]);
    expect(result[3]).toBe(sets[3]);
  });

  it('logs cardio sets that have a recorded metric', () => {
    const sets = [
      { ...createWorkoutSet('cardio'), duration_seconds: 600 },
      createWorkoutSet('cardio'),
    ];

    expect(completeRemainingSets('cardio', sets).map((item) => item.completed)).toEqual([
      true,
      false,
    ]);
  });
});
