import { describe, expect, it } from 'vitest';
import {
  exerciseLibraryMuscles,
  exerciseMuscles,
  filterExerciseLibrary,
  type ExerciseLibraryFilters,
} from './exerciseLibraryFilter';
import type { Exercise, ExerciseLibrarySummary } from './types';

function exercise(id: string, name: string, fields: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name,
    category: 'upper',
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: 'Barbell',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    ...fields,
  };
}

function summary(exercise_id: string, last_date: string, change_percent: number | null) {
  return {
    exercise_id,
    session_count: 3,
    last_date,
    latest_estimated_1rm: 100,
    change_kg: change_percent,
    change_percent,
    trend: [],
  } satisfies ExerciseLibrarySummary;
}

const bench = exercise('bench', 'Bench Press');
const row = exercise('row', 'Cable Row', {
  muscle_group: 'Back',
  equipment: 'Cable',
  muscle_set_credits: [
    { muscle_name: 'Lats', sets: 1 },
    { muscle_name: 'Biceps', sets: 0 },
  ],
});
const curl = exercise('curl', 'Zottman Curl', {
  muscle_group: 'Biceps',
  equipment: 'Dumbbell',
  is_custom: true,
});
const hidden = exercise('hidden', 'Old Press', { hidden: true });
const all = [bench, row, curl, hidden];
const summaries = new Map([
  ['bench', summary('bench', '2026-11-10', 5)],
  ['row', summary('row', '2026-11-20', -2)],
  ['curl', summary('curl', '2026-10-01', 12)],
]);
const filters: ExerciseLibraryFilters = {
  query: '',
  muscle: 'All',
  equipment: '',
  customOnly: false,
  hiddenOnly: false,
  sort: 0,
};
const ids = (list: Exercise[]) => list.map((item) => item.id);

describe('exercise library filters', () => {
  it('lists visible exercises, most recently trained first', () => {
    expect(ids(filterExerciseLibrary(all, summaries, filters))).toEqual(['row', 'bench', 'curl']);
  });

  it('sorts A–Z or by the biggest improvement', () => {
    expect(ids(filterExerciseLibrary(all, summaries, { ...filters, sort: 1 }))).toEqual([
      'bench',
      'row',
      'curl',
    ]);
    expect(ids(filterExerciseLibrary(all, summaries, { ...filters, sort: 2 }))).toEqual([
      'curl',
      'bench',
      'row',
    ]);
  });

  it('filters by search, muscle, equipment and custom', () => {
    expect(ids(filterExerciseLibrary(all, summaries, { ...filters, query: 'bench' }))).toEqual([
      'bench',
    ]);
    expect(ids(filterExerciseLibrary(all, summaries, { ...filters, muscle: 'Lats' }))).toEqual([
      'row',
    ]);
    expect(
      ids(filterExerciseLibrary(all, summaries, { ...filters, equipment: 'Dumbbell' })),
    ).toEqual(['curl']);
    expect(ids(filterExerciseLibrary(all, summaries, { ...filters, customOnly: true }))).toEqual([
      'curl',
    ]);
  });

  it('shows only hidden exercises when asked, and ignores that while none are hidden', () => {
    expect(ids(filterExerciseLibrary(all, summaries, { ...filters, hiddenOnly: true }))).toEqual([
      'hidden',
    ]);
    expect(
      ids(filterExerciseLibrary([bench], summaries, { ...filters, hiddenOnly: true })),
    ).toEqual(['bench']);
  });

  it('names each exercise’s credited muscles, or its muscle group', () => {
    expect(exerciseMuscles(row)).toEqual(['Lats']);
    expect(exerciseMuscles(bench)).toEqual(['Chest']);
    expect(exerciseLibraryMuscles(all)).toEqual(['Biceps', 'Chest', 'Lats']);
  });
});
