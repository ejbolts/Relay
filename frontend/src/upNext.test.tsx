import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { useUpNextSession } from './upNext';
import type { WorkoutRecommendation } from './types';

function read(recommendation: WorkoutRecommendation) {
  let result!: ReturnType<typeof useUpNextSession>;
  function Harness() {
    result = useUpNextSession(recommendation, [], '2026-10-26');
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result;
}
const custom = {
  id: 'custom-a',
  name: 'Full body A',
  color: '#123456',
  is_custom: true,
  archived: false,
};
const scheduled: WorkoutRecommendation = {
  category: 'other',
  session_name: 'Full body A workout',
  rotation_next: 'other',
  reason: 'Day 1',
  muscle_frequency: [],
  workout_type: custom,
  split_name: 'My split',
  scheduled_date: '2026-10-26',
};

it('uses custom metadata even before the local type catalogue refreshes', () => {
  const result = read(scheduled);
  expect(result.label).toBe('Full body A');
  expect(result.type).toEqual(custom);
  expect(result.needsSplitUpdate).toBe(false);
});
it('represents rest without creating a workout template', () => {
  const result = read({ ...scheduled, workout_type: null, is_rest_day: true });
  expect(result.isRestDay).toBe(true);
  expect(result.label).toBe('Rest');
  expect(result.template).toBeNull();
});
it('retains the split warning for a type removed after it was scheduled', () => {
  const result = read({
    ...scheduled,
    workout_type: { ...custom, archived: true },
    needs_split_update: true,
  });
  expect(result.recommendation).not.toBeNull();
  expect(result.needsSplitUpdate).toBe(true);
  expect(result.template).toBeNull();
});
