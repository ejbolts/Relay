import { describe, expect, it } from 'vitest';
import type { Exercise, TrackedSet, TrackedWorkout } from './types';
import {
  historyOnMachine,
  machineAliases,
  machineSuggestionSource,
  recentExerciseHistory,
  withSuggestedSets,
} from './exerciseHistory';

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

function trackedSet(id: string, orderIndex: number, completed = true): TrackedSet {
  return {
    id,
    order_index: orderIndex,
    reps: 8,
    weight_kg: 80,
    rpe: 8,
    rest_seconds: 120,
    duration_seconds: null,
    distance_km: null,
    incline_percent: null,
    speed_kph: null,
    bodyweight_kg: null,
    percentile: null,
    warmup: false,
    set_type: 'normal',
    failed: false,
    target_reps: null,
    notes: orderIndex === 0 ? 'Pause on chest' : null,
    completed,
  };
}

function workout(
  id: string,
  workoutDate: string,
  createdAt: string,
  sets: TrackedSet[],
  movementNotes: string | null = null,
): TrackedWorkout {
  return {
    id,
    name: `${id} workout`,
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
        notes: movementNotes,
        exercise,
        sets,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
      },
    ],
  };
}

describe('recent exercise history', () => {
  it('returns completed sets and notes newest first', () => {
    const older = workout('older', '2026-07-01', '2026-07-01T09:00:00Z', [
      trackedSet('older-set', 0),
    ]);
    const latest = workout(
      'latest',
      '2026-07-08',
      '2026-07-08T09:00:00Z',
      [trackedSet('incomplete', 0, false), trackedSet('second-set', 1)],
      'Use rack height 4',
    );

    const history = recentExerciseHistory([older, latest], exercise.id);

    expect(history.map((entry) => entry.workoutId)).toEqual(['latest', 'older']);
    expect(history[0].sets.map((item) => item.id)).toEqual(['second-set']);
    expect(history[0].movementNotes).toBe('Use rack height 4');
  });

  it('excludes the workout being edited and respects the requested limit', () => {
    const workouts = [
      workout('current', '2026-07-10', '2026-07-10T09:00:00Z', [trackedSet('current-set', 0)]),
      workout('previous', '2026-07-08', '2026-07-08T09:00:00Z', [trackedSet('previous-set', 0)]),
      workout('oldest', '2026-07-01', '2026-07-01T09:00:00Z', [trackedSet('oldest-set', 0)]),
    ];

    expect(recentExerciseHistory(workouts, exercise.id, 'current', 1)[0].workoutId).toBe(
      'previous',
    );
  });

  it('adds the latest older session after the loaded ones, once', () => {
    const loaded = workout('loaded', '2026-07-08', '2026-07-08T09:00:00Z', [
      trackedSet('loaded-set', 0),
    ]);
    const older = {
      workout_id: 'older',
      workout_date: '2025-01-03',
      workout_name: 'Old push',
      movement_notes: 'Seat 3',
      sets: [trackedSet('older-set', 0)],
    };

    expect(
      recentExerciseHistory([loaded], exercise.id, undefined, 5, older).map(
        (entry) => entry.workoutId,
      ),
    ).toEqual(['loaded', 'older']);
    expect(recentExerciseHistory([], exercise.id, undefined, 5, older)[0]).toMatchObject({
      workoutName: 'Old push',
      movementNotes: 'Seat 3',
    });
    expect(recentExerciseHistory([loaded], exercise.id, undefined, 1, older)).toHaveLength(1);
    expect(recentExerciseHistory([], exercise.id, 'older', 5, older)).toEqual([]);
  });
});

describe('machine history', () => {
  const entry = (id: string, machinePhotoIds: string[] | undefined, weight: number) => ({
    workoutId: id,
    workoutDate: '2026-07-01',
    workoutName: id,
    movementNotes: null,
    sets: [{ ...trackedSet(`${id}-set`, 0), weight_kg: weight }],
    machinePhotoIds,
  });
  const history = [
    entry('recent-cybex', ['cybex'], 100),
    entry('both', ['cybex', 'hammer'], 110),
    entry('merged-hammer', ['hammer-old'], 120),
    entry('older-baseline', undefined, 130),
  ];
  const aliases = machineAliases([
    {
      id: 'hammer',
      exercise_id: exercise.id,
      caption: 'Hammer',
      thumbnail_url: '',
      full_url: '',
      width: 1,
      height: 1,
      created_at: '',
      images: [
        {
          id: 'hammer-old',
          exercise_id: exercise.id,
          caption: 'Hammer',
          thumbnail_url: '',
          full_url: '',
          width: 1,
          height: 1,
          created_at: '',
        },
      ],
    },
  ]);

  it('keeps only sessions that pinned that one machine, including merged photos', () => {
    expect(historyOnMachine(history, 'hammer', aliases).map((item) => item.workoutId)).toEqual([
      'merged-hammer',
    ]);
    expect(historyOnMachine(history, 'cybex', aliases).map((item) => item.workoutId)).toEqual([
      'recent-cybex',
    ]);
    expect(historyOnMachine(history, undefined, aliases)).toBe(history);
  });

  it("suggests the machine's latest sets, or the exercise's when it has none", () => {
    const weights = (machine: string | null) =>
      machineSuggestionSource(history, machine, aliases).map((item) => item.weight_kg);
    expect(weights('hammer')).toEqual([120]);
    expect(weights('new-machine')).toEqual([100]);
    expect(weights(null)).toEqual([100]);
  });

  it('uses only the assigned sets from a mixed session, including merged aliases', () => {
    const mixed = {
      ...history[1],
      sets: [
        { ...trackedSet('a', 0), weight_kg: 50, machine_photo_id: 'cybex' },
        { ...trackedSet('b', 1), weight_kg: 90, machine_photo_id: 'hammer-old' },
        { ...trackedSet('unknown', 2), weight_kg: 200, machine_photo_id: null },
      ],
    };
    expect(machineSuggestionSource([mixed], 'hammer', aliases).map((s) => s.weight_kg)).toEqual([
      90,
    ]);
    expect(historyOnMachine([mixed], 'cybex', aliases)[0].sets.map((s) => s.id)).toEqual(['a']);
    expect(
      historyOnMachine(
        [{ ...mixed, machinePhotoIds: ['cybex'], sets: [mixed.sets[2]] }],
        'cybex',
        aliases,
      ),
    ).toEqual([]);
  });
});

describe('replacing suggested sets', () => {
  const draftSet = (key: string, weight: number, completed = false, fromPrevious = true) => ({
    ...trackedSet(key, 0, completed),
    key,
    weight_kg: weight,
    fromPrevious,
  });
  const previous = [100, 110, 120].map((weight, index) => ({
    ...trackedSet(`previous-${index}`, index),
    weight_kg: weight,
    reps: 6,
  }));

  it('keeps a set explicitly assigned to a machine when another pin changes suggestions', () => {
    const assigned = { ...draftSet('assigned', 75), machine_photo_id: 'hammer' };
    expect(withSuggestedSets([assigned, draftSet('free', 80)], previous, 'strength')[0]).toEqual(
      assigned,
    );
  });

  it('keeps logged and edited sets and swaps untouched suggestions row by row', () => {
    const sets = withSuggestedSets(
      [
        draftSet('logged', 80, true, false),
        draftSet('edited', 85, false, false),
        draftSet('s', 90),
      ],
      previous,
      'strength',
    );
    expect(sets.map(({ key, weight_kg }) => ({ key, weight_kg }))).toEqual([
      { key: 'logged', weight_kg: 80 },
      { key: 'edited', weight_kg: 85 },
      { key: 's', weight_kg: 120 },
    ]);
    expect(sets[2]).toMatchObject({ reps: 6, fromPrevious: true, completed: false });
  });

  it('adds rows the other session had and drops untouched rows it did not', () => {
    const longer = withSuggestedSets([draftSet('a', 90)], previous, 'strength');
    expect(longer.map((item) => item.weight_kg)).toEqual([100, 110, 120]);
    expect(longer[0].key).toBe('a');

    const shorter = withSuggestedSets(
      [draftSet('a', 90), draftSet('b', 90), draftSet('c', 90), draftSet('d', 90)],
      previous.slice(0, 2),
      'strength',
    );
    expect(shorter.map((item) => item.key)).toEqual(['a', 'b']);
  });

  it('leaves the sets alone when there is nothing to suggest', () => {
    const current = [draftSet('a', 90)];
    expect(withSuggestedSets(current, [], 'strength')).toBe(current);
  });
});
