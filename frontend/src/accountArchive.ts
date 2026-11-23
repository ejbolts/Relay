import type { ArchiveCounts, ArchivePreview } from './types';

// The full backup's wording and its restore confirmation, shared by the web and the app.

export const ARCHIVE_COUNT_LABELS: Array<[keyof ArchiveCounts, string]> = [
  ['workouts', 'Workouts'],
  ['cardio_sessions', 'Cardio sessions'],
  ['body_check_ins', 'Body check-ins'],
  ['custom_exercises', 'Custom exercises'],
  ['photos', 'Machine photos'],
  ['workout_photos', 'Workout photos'],
];

export const ARCHIVE_FILE_TYPES = ['.zip', 'application/zip'];

export const ARCHIVE_RESTORE_WARNING =
  'This replaces your current training data. A copy of it is kept on the server.';

export const ARCHIVE_DOWNLOAD_FAILED = 'Your backup could not be prepared. Try again.';
export const ARCHIVE_READ_FAILED = 'That backup could not be read.';
export const ARCHIVE_RESTORE_FAILED = 'The backup could not be restored. Nothing was changed.';
export const ARCHIVE_RESTORED = 'Backup restored.';

export const archiveFileName = (today: string) => `relay-backup-${today}.zip`;

/** The confirmation's rows: each count in the backup and now. */
export function archiveCountRows(preview: ArchivePreview) {
  return ARCHIVE_COUNT_LABELS.filter(
    // A server from before workout photos does not count them.
    ([key]) => preview.archive[key] !== undefined || preview.current[key] !== undefined,
  ).map(([key, label]) => ({
    key,
    label,
    archive: preview.archive[key],
    current: preview.current[key],
  }));
}

/** When the backup was made, or null when it doesn't say. */
export function archiveSavedOn(createdAt: string | null): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The confirmation's kicker. */
export function archiveKicker(preview: ArchivePreview): string {
  const created = archiveSavedOn(preview.created_at);
  return created ? `SAVED ${created.toUpperCase()}` : 'RESTORE';
}

export function archiveSkippedNote(skipped: number): string | null {
  if (skipped <= 0) return null;
  return skipped === 1
    ? '1 photo in this backup is missing and will be left out.'
    : `${skipped} photos in this backup are missing and will be left out.`;
}
