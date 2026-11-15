/** Saves a prepared file through the browser's normal download flow. */
export function downloadFile(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** A short, filesystem-safe name part, such as `push-day` for "Push Day!". */
export function fileNamePart(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/** For example `workout-2026-11-14-push-day.csv`. */
export function workoutExportFileName(workout: { workout_date: string; name: string }): string {
  const name = fileNamePart(workout.name);
  return `workout-${workout.workout_date}${name ? `-${name}` : ''}.csv`;
}
