import { describe, expect, it } from 'vitest';
import type { CsvImportPreview, ImportBatch } from './types';
import {
  importAddsAnything,
  importBatchCounts,
  importFormFields,
  importReviewTotals,
  importSavedMessage,
  importSourceSummary,
  importUndoneMessage,
  importUndoWarning,
  mappedExerciseId,
  mappingChoices,
  reviewSessionDetails,
  reviewSessionsOverflow,
  withExerciseMapping,
} from './workoutImport';

const preview = (overrides: Partial<CsvImportPreview> = {}): CsvImportPreview => ({
  sessions: [
    { workout_date: '2026-10-13', name: 'Push', exercises: ['Bench'], sets: 1, duplicate: false },
  ],
  workouts_to_create: 1,
  workouts_to_skip: 0,
  sets_to_import: 1,
  new_exercises: [],
  warnings: [],
  ...overrides,
});

const batch = (overrides: Partial<ImportBatch> = {}): ImportBatch => ({
  id: 'b1',
  file_name: 'history.csv',
  source: 'hevy',
  created_at: '2026-10-13T10:00:00Z',
  workouts: 2,
  body_measurements: 0,
  ...overrides,
});

describe('workout import rules', () => {
  it('names the source and a Strong file’s units', () => {
    expect(importSourceSummary({ source: 'gym', weight_unit: 'kg', distance_unit: 'km' })).toBe(
      'Relay / spreadsheet',
    );
    expect(importSourceSummary({ source: 'hevy', weight_unit: 'kg', distance_unit: 'km' })).toBe(
      'Hevy',
    );
    expect(importSourceSummary({ source: 'strong', weight_unit: 'lb', distance_unit: 'mi' })).toBe(
      'Strong · Workout units: lb, mi. Measurement units come from the file.',
    );
  });

  it('sends options as form fields without automatic mappings', () => {
    expect(
      importFormFields({
        source: 'strong',
        weight_unit: 'lb',
        distance_unit: 'mi',
        exercise_mappings: { Bench: 'e1', Squat: '' },
      }),
    ).toEqual({
      source: 'strong',
      weight_unit: 'lb',
      distance_unit: 'mi',
      exercise_mappings: '{"Bench":"e1"}',
    });
  });

  it('maps imported names and lists the best matches first', () => {
    const options = withExerciseMapping(
      { source: 'gym', weight_unit: 'kg', distance_unit: 'km' },
      'Bench',
      'e2',
    );
    expect(mappedExerciseId(options, { incoming_name: 'Bench', exercise_id: 'e1' })).toBe('e2');
    expect(mappedExerciseId(options, { incoming_name: 'Squat', exercise_id: null })).toBe('');
    const exercises = [{ name: 'Deadlift' }, { name: 'Bench Press' }];
    expect(mappingChoices('Bench', exercises)).toEqual({
      best: [{ name: 'Bench Press' }],
      rest: [{ name: 'Deadlift' }],
    });
  });

  it('words the review totals', () => {
    expect(importReviewTotals(preview({ workouts_to_skip: 2, new_exercises: ['Bench'] }))).toEqual({
      sessions: {
        added: '1 session',
        sets: '1 set',
        skipped: '2 identical existing sessions will be skipped.',
      },
      bodyweight: null,
      newExercises: 'New exercises: Bench.',
    });
    const bodyOnly = preview({
      sessions: [],
      workouts_to_create: 0,
      body_measurements_to_create: 1,
      body_measurements_to_skip: 3,
    });
    expect(importReviewTotals(bodyOnly)).toEqual({
      sessions: null,
      bodyweight: { added: '1 body-weight check-in', kept: '3 existing dates will be kept.' },
      newExercises: null,
    });
    expect(importAddsAnything(bodyOnly)).toBe(true);
    expect(importAddsAnything(preview({ workouts_to_create: 0 }))).toBe(false);
    expect(reviewSessionDetails(preview().sessions[0])).toBe('2026-10-13 · 1 set · Bench');
    expect(reviewSessionsOverflow(50)).toBeNull();
    expect(reviewSessionsOverflow(51)).toBe(
      'Showing the first 50 of 51 sessions. Totals include all rows.',
    );
  });

  it('confirms saved and undone imports', () => {
    const result = {
      workouts_created: 2,
      workouts_skipped: 1,
      exercises_created: 1,
      sets_imported: 9,
      body_measurements_created: 1,
      body_measurements_updated: 0,
      warnings: [],
    };
    expect(importSavedMessage(result)).toBe(
      'Imported 9 sets across 2 workouts and added 1 exercise; added 1 body-weight check-in; skipped 1 identical session.',
    );
    expect(
      importSavedMessage({
        ...result,
        workouts_created: 0,
        workouts_skipped: 0,
        sets_imported: 0,
        body_measurements_created: 3,
      }),
    ).toBe('Imported 3 body-weight check-ins.');
    expect(
      importUndoneMessage({
        workouts_removed: 1,
        body_measurements_removed: 2,
        body_measurements_preserved: 1,
        exercises_removed: 0,
      }),
    ).toBe('Import undone: removed 1 session and 2 check-ins. Kept 1 edited check-in.');
  });

  it('describes import batches', () => {
    expect(importBatchCounts(batch({ body_measurements: 1 }))).toBe('2 sessions · 1 check-in');
    expect(importBatchCounts(batch({ workouts: 0 }))).toBe('');
    expect(importUndoWarning(batch({ body_measurements: 1 }))).toBe(
      'Sessions are permanently deleted, including later edits. Edited check-ins are kept.',
    );
    expect(importUndoWarning(batch({ workouts: 0, body_measurements: 1 }))).toBe(
      'Edited check-ins are kept.',
    );
  });
});
