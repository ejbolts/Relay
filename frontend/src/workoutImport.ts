import { bestExerciseMatches } from './importExerciseMatches';
import type {
  CsvImportPreview,
  CsvImportResult,
  ImportBatch,
  ImportUndoResult,
  WorkoutImportOptions,
} from './types';

// The rules and wording of the workout CSV import, shared by the web and the app: the source
// apps, the review's totals, and the confirmations after saving or undoing an import.

export type ImportSource = WorkoutImportOptions['source'];

/** The apps an import can come from, in the order both apps show them. */
export const IMPORT_SOURCES: ReadonlyArray<{ id: ImportSource; name: string }> = [
  { id: 'strengthlevel', name: 'Strength Level' },
  { id: 'hevy', name: 'Hevy' },
  { id: 'strong', name: 'Strong' },
  { id: 'gym', name: 'Relay' },
];

export const IMPORT_SOURCE_HINTS: Record<ImportSource, string> = {
  strengthlevel:
    'Choose your original Strength Level CSV. Weights, reps, warmups and body weight are read directly. Rows on the same date form one workout.',
  hevy: 'Choose your original Hevy workout CSV. Workout names, sessions, notes, RPE and timed sets are kept.',
  strong:
    'Choose a Strong workout or measurement CSV. Rest-timer rows are skipped. Body weights add missing check-ins without replacing yours.',
  gym: 'Choose a Relay or Gym Logger workout or bodyweight CSV, or a spreadsheet using the template columns. Review before saving; existing check-ins are kept.',
};

export const STRONG_WEIGHT_UNITS = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
] as const;

export const STRONG_DISTANCE_UNITS = [
  { value: 'km', label: 'Kilometres (km)' },
  { value: 'mi', label: 'Miles (mi)' },
] as const;

export const STRONG_UNITS_NOTE =
  'Match Strong’s export settings. Measurement files include their own units.';

/** The server's limit on an imported file, so a phone can refuse a larger one before sending. */
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_TOO_LARGE = 'CSV imports are limited to 20 MB.';

/** The file types the import accepts, for a file picker. */
export const IMPORT_FILE_TYPES = ['.csv', '.tsv', '.txt', 'text/csv', 'text/tab-separated-values'];

export const IMPORT_SAFETY_NOTE =
  'Nothing is saved until you choose Save import. Existing workouts and body-weight check-ins are kept. Missing body-weight dates may be added from this file. Duplicates and save limits are checked again when saving.';

export const IMPORT_GUIDE_INTRO =
  'Select the app your CSV came from. Export your history as CSV from that app, then choose the original file below. No column changes are needed.';

export const IMPORT_PROMPT_TEXT =
  'Bring your workout CSV straight from Strength Level, Hevy or Strong, or use a spreadsheet or Relay export. Review it before saving so your charts, records and suggestions start from your real training.';

/** The sessions the review lists; totals still cover every row. */
export const REVIEW_SESSION_LIMIT = 50;

export function defaultImportOptions(weightUnit: 'kg' | 'lb'): WorkoutImportOptions {
  return { source: 'gym', weight_unit: weightUnit, distance_unit: 'km' };
}

export function importSourceName(source: string): string {
  return IMPORT_SOURCES.find((app) => app.id === source)?.name ?? source;
}

/** The review's line naming the source, and the units a Strong file is read in. */
export function importSourceSummary(options: WorkoutImportOptions): string {
  const name = options.source === 'gym' ? 'Relay / spreadsheet' : importSourceName(options.source);
  return options.source === 'strong'
    ? `${name} · Workout units: ${options.weight_unit}, ${options.distance_unit}. Measurement units come from the file.`
    : name;
}

/** The form fields sent with the file, leaving out mappings back to the automatic match. */
export function importFormFields(options: WorkoutImportOptions): Record<string, string> {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      key === 'exercise_mappings'
        ? JSON.stringify(
            Object.fromEntries(
              Object.entries(value as Record<string, string>).filter(([, id]) => id),
            ),
          )
        : (value as string),
    ]),
  );
}

/** Options with one imported exercise mapped to an existing one ('' for the automatic match). */
export function withExerciseMapping(
  options: WorkoutImportOptions,
  incomingName: string,
  exerciseId: string,
): WorkoutImportOptions {
  return {
    ...options,
    exercise_mappings: { ...options.exercise_mappings, [incomingName]: exerciseId },
  };
}

/** The exercise an imported name maps to now: the chosen one, else the server's match. */
export function mappedExerciseId(
  options: WorkoutImportOptions | undefined,
  match: { incoming_name: string; exercise_id: string | null },
): string {
  return options?.exercise_mappings?.[match.incoming_name] ?? match.exercise_id ?? '';
}

/** An imported name's mapping choices: its best matches first, then every other exercise. */
export function mappingChoices<T extends { name: string }>(
  incomingName: string,
  exercises: T[],
): { best: T[]; rest: T[] } {
  const best = bestExerciseMatches(incomingName, exercises);
  return { best, rest: exercises.filter((exercise) => !best.includes(exercise)) };
}

/** Whether the review adds anything, so Save import can be chosen. */
export function importAddsAnything(preview: CsvImportPreview): boolean {
  return preview.workouts_to_create > 0 || !!preview.body_measurements_to_create;
}

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

export interface ImportReviewTotals {
  /** Sessions and sets added, and the identical sessions skipped. */
  sessions: { added: string; sets: string; skipped: string | null } | null;
  /** Body-weight check-ins added, and the dates already logged that are kept. */
  bodyweight: { added: string; kept: string } | null;
  newExercises: string | null;
}

/** The review's totals, as both apps word them. */
export function importReviewTotals(preview: CsvImportPreview): ImportReviewTotals {
  const bodyweightRows =
    (preview.body_measurements_to_create ?? 0) + (preview.body_measurements_to_skip ?? 0);
  const created = preview.body_measurements_to_create ?? 0;
  const kept = preview.body_measurements_to_skip ?? 0;
  return {
    sessions:
      preview.sessions.length > 0 || !bodyweightRows
        ? {
            added: count(preview.workouts_to_create, 'session', 'sessions'),
            sets: count(preview.sets_to_import, 'set', 'sets'),
            skipped:
              preview.workouts_to_skip > 0
                ? `${preview.workouts_to_skip} identical existing ${preview.workouts_to_skip === 1 ? 'session' : 'sessions'} will be skipped.`
                : null,
          }
        : null,
    bodyweight:
      bodyweightRows > 0
        ? {
            added: count(created, 'body-weight check-in', 'body-weight check-ins'),
            kept: `${kept} existing ${kept === 1 ? 'date' : 'dates'} will be kept.`,
          }
        : null,
    newExercises:
      preview.sessions.length > 0
        ? preview.new_exercises.length
          ? `New exercises: ${preview.new_exercises.join(', ')}.`
          : 'No new exercises.'
        : null,
  };
}

/** One session row in the review. */
export function reviewSessionDetails(session: CsvImportPreview['sessions'][number]): string {
  return `${session.workout_date} · ${count(session.sets, 'set', 'sets')} · ${session.exercises.join(', ')}`;
}

export const reviewSessionAction = (session: { duplicate: boolean }) =>
  session.duplicate ? 'Skip duplicate' : 'Add session';

export function reviewSessionsOverflow(total: number): string | null {
  return total > REVIEW_SESSION_LIMIT
    ? `Showing the first ${REVIEW_SESSION_LIMIT} of ${total} sessions. Totals include all rows.`
    : null;
}

function plural(value: number, word: string) {
  return `${value} ${value === 1 ? word : `${word}s`}`;
}

/** The confirmation after an import saves. */
export function importSavedMessage(result: CsvImportResult): string {
  const bodyweightCount = result.body_measurements_created + result.body_measurements_updated;
  if (
    !result.sets_imported &&
    !result.workouts_created &&
    !result.workouts_skipped &&
    bodyweightCount
  )
    return `Imported ${plural(bodyweightCount, 'body-weight check-in')}.`;
  return `Imported ${plural(result.sets_imported, 'set')} across ${plural(result.workouts_created, 'workout')}${
    result.exercises_created ? ` and added ${plural(result.exercises_created, 'exercise')}` : ''
  }${bodyweightCount ? `; added ${plural(bodyweightCount, 'body-weight check-in')}` : ''}${
    result.workouts_skipped
      ? `; skipped ${plural(result.workouts_skipped, 'identical session')}`
      : ''
  }.`;
}

/** The confirmation after an import is undone. */
export function importUndoneMessage(result: ImportUndoResult): string {
  return `Import undone: removed ${plural(result.workouts_removed, 'session')} and ${plural(result.body_measurements_removed, 'check-in')}.${
    result.body_measurements_preserved
      ? ` Kept ${plural(result.body_measurements_preserved, 'edited check-in')}.`
      : ''
  }`;
}

/** What an import batch still holds, or '' when nothing is left to remove. */
export function importBatchCounts(batch: ImportBatch): string {
  return [
    batch.workouts && count(batch.workouts, 'session', 'sessions'),
    batch.body_measurements && count(batch.body_measurements, 'check-in', 'check-ins'),
  ]
    .filter(Boolean)
    .join(' · ');
}

export const NOTHING_LEFT_TO_REMOVE = 'Nothing left to remove';

/** An import batch's source app and when it was saved. */
export function importBatchDetails(batch: ImportBatch): string {
  const time = new Date(batch.created_at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${importSourceName(batch.source)} · ${time}`;
}

/** What undoing a batch removes and keeps, for its confirmation. */
export function importUndoWarning(batch: ImportBatch): string {
  return `${batch.workouts > 0 ? 'Sessions are permanently deleted, including later edits. ' : ''}${
    batch.body_measurements > 0 ? 'Edited check-ins are kept.' : ''
  }`.trim();
}

export const NO_TRACKED_IMPORTS =
  'No tracked imports yet. Earlier imports cannot be undone as a batch.';
