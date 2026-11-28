import type { DateRange } from './dateRanges';

// The data export's choices and wording, shared by the web and the app.

export const EXPORT_CHOICES = {
  workouts: {
    label: 'Workout history',
    detail: 'Completed sets, exercise names, weights, reps, warmups and session names.',
  },
  bodyweight: {
    label: 'Bodyweight check-ins',
    detail: 'Date, weight, body-fat percentage and notes.',
  },
} as const;

export const EXPORT_EXCLUDED =
  'Photos, videos, supersets, goals, RPE and workout notes are excluded.';

/**
 * The dates an export's time frame counts back from. Only recent workouts are loaded, so the
 * latest workout logged is added from the history summary.
 */
export function exportWorkoutDates(
  workouts: Array<{ workout_date: string }>,
  lastWorkoutDate: string | null | undefined,
): string[] {
  return [
    ...workouts.map((workout) => workout.workout_date),
    ...(lastWorkoutDate ? [lastWorkoutDate] : []),
  ];
}

/** The time frame's dates, or what an all-time export holds. */
export function exportRangeLabel(range: DateRange, dates: string[]): string {
  if (range.start_date && range.end_date)
    return `${range.start_date} – ${range.end_date} · ends at your latest selected entry`;
  return dates.length ? 'All saved entries' : 'No saved entries — exports an empty CSV template';
}

/** Which files the export makes, given what is selected. `verb` is how the platform saves them. */
export function exportFilesNote(
  workouts: boolean,
  bodyweight: boolean,
  verb: 'Downloads' | 'Shares' = 'Downloads',
): string {
  if (workouts && bodyweight)
    return `${verb} two CSV files: workout history and bodyweight check-ins.`;
  if (bodyweight) return `${verb} one bodyweight CSV file.`;
  if (workouts) return `${verb} one workout CSV file.`;
  return 'Select at least one type of data.';
}

/** The exported files' names: the time frame's dates, or today's for all time. */
export function exportFileNames(range: DateRange, today: string) {
  const suffix = range.start_date ? `${range.start_date}-to-${range.end_date}` : today;
  return { workouts: `relay-workouts-${suffix}.csv`, bodyweight: `body-weight-${suffix}.csv` };
}
