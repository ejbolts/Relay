import { describe, expect, it } from 'vitest';
import { personalBestProgressPoint, progressPointsForChart } from './progressChart';
import type { ProgressPoint } from './types';

function point(workout_date: string, estimated_1rm: number): ProgressPoint {
  return {
    workout_date,
    workout_id: workout_date,
    best_weight_kg: estimated_1rm,
    best_reps: 8,
    estimated_1rm,
    volume_kg: estimated_1rm * 8,
    best_rpe: null,
  };
}

describe('exercise progress chart points', () => {
  it('removes missing zero values, sorts by date, and applies the selected range', () => {
    const points = [
      point('2026-09-20', 100),
      point('2022-08-05', 0),
      point('2026-08-19', 80),
      point('2026-09-01', 90),
    ];

    expect(
      progressPointsForChart(points, 'estimated_1rm', '1m').map(
        (progressPoint) => progressPoint.workout_date,
      ),
    ).toEqual(['2026-09-01', '2026-09-20']);
    expect(
      progressPointsForChart(points, 'estimated_1rm', 'all').map(
        (progressPoint) => progressPoint.workout_date,
      ),
    ).toEqual(['2026-08-19', '2026-09-01', '2026-09-20']);
  });

  it('finds the workout date for each personal best and uses the latest tied result', () => {
    const points = [point('2026-08-19', 80), point('2026-09-01', 100), point('2026-09-20', 100)];
    points[0].best_weight_kg = 120;

    expect(personalBestProgressPoint(points, 'best_weight_kg')?.workout_date).toBe('2026-08-19');
    expect(personalBestProgressPoint(points, 'estimated_1rm')?.workout_date).toBe('2026-09-20');
  });
});
