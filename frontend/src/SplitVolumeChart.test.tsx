import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SplitVolumeChart } from './SplitVolumeChart';
import type { Exercise, RoutineDay } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

it('compares planned volume and target status with each muscle goal', () => {
  const exercise: Exercise = {
    id: 'bench',
    name: 'Bench',
    category: 'push',
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: null,
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    muscle_set_credits: [
      { muscle_name: 'Chest', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ],
  };
  const day: RoutineDay = {
    workout_type_id: 'upper',
    workout_type: DEFAULT_WORKOUT_TYPES[0],
    movements: [
      {
        exercise_id: exercise.id,
        exercise,
        sets: [
          {
            reps: 8,
            weight_kg: null,
            duration_seconds: null,
            distance_km: null,
            rest_seconds: null,
            set_type: 'normal',
          },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(
    <SplitVolumeChart
      days={[day]}
      muscleGoal={10}
      muscleGoals={{ Chest: 18, Triceps: 3 }}
      cardioGoal={null}
      selected={null}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain('Chest: 7 of 18 sets a week, under target');
  expect(html).toContain('Triceps: 3.5 of 3 sets a week, on target');
});
