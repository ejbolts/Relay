import { describe, expect, it } from 'vitest';
import type { TrainExercise, TrainPartnerWorkout } from './trainTogether';
import {
  partnerExerciseChips,
  partnerPace,
  partnerSetLabel,
  partnerStartTemplate,
  partnerTicker,
  partnerWorkoutName,
  unmatchedExercisesNotice,
} from './trainTogetherView';
import type { Exercise } from './types';
import type { ActiveWorkoutDraft, StoredDraftSet } from './workoutDraft';

const exercise = (id: string, name: string, sameAs: string | null): TrainExercise => ({
  id,
  name,
  kind: 'strength',
  category: 'push',
  muscle_group: 'Chest',
  equipment: null,
  same_as_exercise_id: sameAs,
});
const set = (
  key: string,
  weight_kg: number | null,
  reps: number | null,
  completed: boolean,
): StoredDraftSet => ({
  key,
  weight_kg,
  reps,
  rpe: null,
  rest_seconds: null,
  duration_seconds: null,
  distance_km: null,
  notes: null,
  completed,
});
function workout(movements: ActiveWorkoutDraft['movements'], name = ''): TrainPartnerWorkout {
  return {
    revision: 1,
    draft: {
      version: 1,
      clientSessionId: 'c',
      startedAt: 0,
      updatedAt: 0,
      name,
      workoutDate: '2026-11-28',
      category: 'push',
      notes: '',
      movements,
    },
    exercises: [
      exercise('p-bench', 'Bench Press', 'my-bench'),
      exercise('p-fly', 'Cable Fly', null),
      exercise('p-dip', 'Dips', 'my-dip'),
    ],
  };
}
const movement = (key: string, exerciseId: string, sets: StoredDraftSet[]) => ({
  key,
  exerciseId,
  notes: '',
  machinePhotoIds: [],
  supersetKey: null,
  sets,
});

describe('train together view wording', () => {
  it("names a partner's workout, falling back to its category", () => {
    expect(partnerWorkoutName(workout([], 'Leg day'))).toBe('Leg day');
    expect(partnerWorkoutName(workout([], '  '))).toBe('Push workout');
  });

  it('words a set in the viewer’s unit, and cardio by time and distance', () => {
    const base = { weight_kg: 80, reps: 8, duration_seconds: null, distance_km: null };
    expect(partnerSetLabel(base, 'kg')).toBe('80 kg × 8');
    expect(partnerSetLabel(base, 'lb')).toBe('176.37 lb × 8');
    expect(partnerSetLabel({ ...base, weight_kg: null }, 'kg')).toBe('8 reps');
    expect(partnerSetLabel({ ...base, reps: null }, 'kg')).toBe('80 kg');
    expect(
      partnerSetLabel(
        { weight_kg: null, reps: null, duration_seconds: 1800, distance_km: 4.8 },
        'kg',
      ),
    ).toBe('30 min · 4.8 km');
  });

  it('shows the lift a partner is on, or that they are starting', () => {
    const live = workout([
      movement('m1', 'p-bench', [set('a', 80, 8, true)]),
      movement('m2', 'p-fly', [set('b', 12, 15, false)]),
    ]);
    expect(partnerTicker(live, 'kg', 0)).toBe('Bench Press · 80 kg × 8');
    expect(partnerTicker(workout([movement('m1', 'p-fly', [])]), 'kg', 0)).toBe(
      'Cable Fly · Starting',
    );
    expect(partnerTicker(null, 'kg', 0)).toBe('No workout open');
  });

  it("paces your lift against the partner's latest set on it, with its number", () => {
    const live = workout([
      movement('m1', 'p-bench', [
        set('w', 40, 10, true),
        set('a', 80, 8, true),
        set('c', 82.5, 8, false),
      ]),
    ]);
    expect(partnerPace(live, 'my-bench', 'kg')).toEqual({ label: '80 kg × 8', setNumber: 2 });
    expect(partnerPace(live, 'my-squat', 'kg')).toBeNull();
  });

  it("starts from your own matches of a partner's exercises, naming those you lack", () => {
    const live = workout([
      movement('m1', 'p-bench', []),
      movement('m2', 'p-fly', []),
      movement('m3', 'p-dip', []),
    ]);
    expect(partnerExerciseChips(live)).toEqual([
      { id: 'p-bench', name: 'Bench Press', matched: true },
      { id: 'p-fly', name: 'Cable Fly', matched: false },
      { id: 'p-dip', name: 'Dips', matched: true },
    ]);
    // Your Dips have since gone from your library: counted as no match.
    const mine = [{ id: 'my-bench', name: 'Bench Press', kind: 'strength' } as Exercise];
    const { template, unmatched } = partnerStartTemplate(live, mine, '2026-11-28');
    expect(template.exercises.map((item) => item.exercise.id)).toEqual(['my-bench']);
    expect(template.category).toBe('push');
    expect(template.sourceWorkout.workout_type_id).toBeNull();
    expect(unmatched).toEqual(['Cable Fly', 'Dips']);
    expect(unmatchedExercisesNotice(unmatched.length)).toBe("2 exercises aren't in your library");
    expect(unmatchedExercisesNotice(1)).toBe("1 exercise isn't in your library");
    expect(unmatchedExercisesNotice(0)).toBeNull();
  });
});
