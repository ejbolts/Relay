import { describe, expect, it } from 'vitest';
import { cardioExerciseFor, cardioSessionEditInput, cardioSessionPayload } from './cardioForm';
import type { CardioSession, Exercise } from './types';

const rower = { id: 'ex-row', name: 'Rowing' } as Exercise;
const session = {
  id: 'c1',
  source_workout_id: null,
  session_date: '2026-11-01',
  activity_type: 'Rowing',
  duration_minutes: 25,
  calories_kcal: 210,
  distance_km: 5,
  intensity: 'moderate',
  zone: 'Zone 2',
  qualifies_zone2: true,
  notes: 'Easy',
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
} as CardioSession;

describe('cardio edit form', () => {
  it('matches the activity by name', () => {
    expect(cardioExerciseFor('Rowing', [rower])).toBe('ex-row');
    expect(cardioExerciseFor('Swimming', [rower])).toBeNull();
  });

  it('starts from the saved fields only and leaves zones to the server', () => {
    const input = cardioSessionEditInput(session, [rower]);
    expect(input).not.toHaveProperty('id');
    expect(input).toMatchObject({ exercise_id: 'ex-row', calories_kcal: 210, notes: 'Easy' });
    expect(input.average_heart_rate_bpm).toBeNull();
    expect(cardioSessionPayload(input)).toMatchObject({
      intensity: null,
      zone: null,
      qualifies_zone2: false,
      distance_km: 5,
    });
  });
});
