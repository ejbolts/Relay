import type { WeightUnit } from './weightUnits';

/** Example sets in the recommended import layout, in the person's chosen weight unit. */
export function workoutCsvTemplateRows(unit: WeightUnit): string[][] {
  const [light, working, squat, accessory] =
    unit === 'lb' ? [135, 175, 225, 55] : [60, 80, 100, 26];
  return [
    ['Date Lifted', 'Exercise', `Weight (${unit})`, 'Reps', 'Warmup', 'Workout ID', 'Workout name'],
    ['2026-10-13', 'Barbell Bench Press', `${light}`, '10', '1', 'w1', 'Push day'],
    ['2026-10-13', 'Barbell Bench Press', `${working}`, '8', '0', 'w1', 'Push day'],
    ['2026-10-13', 'Barbell Bench Press', `${working}`, '7', '0', 'w1', 'Push day'],
    ['2026-10-13', 'Incline Dumbbell Press', `${accessory}`, '10', '0', 'w1', 'Push day'],
    ['2026-10-15', 'Back Squat', `${squat}`, '5', '0', 'w2', 'Leg day'],
    ['2026-10-15', 'Back Squat', `${squat}`, '5', '0', 'w2', 'Leg day'],
    ['2026-10-16', 'Pull-up', '', '8', '0', 'w3', 'Pull day'],
  ];
}

export function workoutCsvTemplate(unit: WeightUnit): string {
  return workoutCsvTemplateRows(unit)
    .map((row) => `${row.join(',')}\r\n`)
    .join('');
}

export function downloadWorkoutCsvTemplate(unit: WeightUnit) {
  // The byte order mark lets spreadsheet apps open the file as UTF-8.
  const blob = new Blob(['﻿', workoutCsvTemplate(unit)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relay-workout-template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
