import type { WeightUnit } from './weightUnits';
import { WORKOUT_CSV_TEMPLATE_NAME, workoutCsvTemplate } from './workoutCsvTemplate';

/** Saves the template through the browser's download flow. */
export function downloadWorkoutCsvTemplate(unit: WeightUnit) {
  // The byte order mark lets spreadsheet apps open the file as UTF-8.
  const blob = new Blob(['﻿', workoutCsvTemplate(unit)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = WORKOUT_CSV_TEMPLATE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
