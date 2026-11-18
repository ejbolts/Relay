import type {
  AccountLimitName,
  AccountLimits,
  AccountLimitsSettings,
  ServerStatus,
  VideoUploadMode,
} from './types';

export const VIDEO_UPLOAD_OPTIONS: { value: VideoUploadMode; label: string; detail: string }[] = [
  {
    value: 'off',
    label: 'Off',
    detail: 'Nobody can upload or process videos. Keeps the server’s CPU free.',
  },
  { value: 'admin', label: 'Admins', detail: 'Only administrators can upload videos.' },
  { value: 'everyone', label: 'Everyone', detail: 'Every account can upload videos.' },
];

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

export function formatJoined(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A coarse "how long ago" label; activity is only recorded every few minutes anyway. */
export function formatLastActive(lastActiveAt: string | null, now: Date = new Date()): string {
  if (!lastActiveAt) return 'Never';
  const date = new Date(lastActiveAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 10) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return formatJoined(lastActiveAt);
}

const QUEUE_LABELS: Record<string, string> = {
  queued: 'waiting',
  normalizing: 'encoding',
  stitching: 'stitching',
  uploading_to_youtube: 'uploading to YouTube',
  youtube_processing: 'processing on YouTube',
};

export function videoQueueSummary(queue: ServerStatus['video_queue']): string {
  const parts = Object.entries(queue)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${QUEUE_LABELS[status] ?? status.replaceAll('_', ' ')}`);
  return parts.length ? parts.join(' · ') : 'Idle';
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export const LIMIT_GROUPS: {
  title: string;
  detail: string;
  fields: { name: AccountLimitName; label: string; unit?: string }[];
}[] = [
  {
    title: 'Per account',
    detail: 'Totals for each person. Admins aren’t held to these.',
    fields: [
      { name: 'workouts_per_account', label: 'Workouts' },
      { name: 'cardio_sessions_per_account', label: 'Cardio sessions' },
      { name: 'custom_exercises_per_account', label: 'Custom exercises' },
      { name: 'photos_per_account', label: 'Machine photos' },
      { name: 'workout_photos_per_account', label: 'Workout photos' },
      { name: 'saves_per_minute', label: 'Changes per minute' },
    ],
  },
  {
    title: 'Per workout',
    detail: 'The size of one workout, for everyone.',
    fields: [
      { name: 'exercises_per_workout', label: 'Exercises' },
      { name: 'sets_per_workout', label: 'Sets' },
      { name: 'workout_note_characters', label: 'Workout note', unit: 'characters' },
      { name: 'exercise_note_characters', label: 'Exercise note', unit: 'characters' },
      { name: 'set_note_characters', label: 'Set note', unit: 'characters' },
    ],
  },
  {
    title: 'Photos',
    detail: 'The largest photo anyone can upload. People are told this one.',
    fields: [{ name: 'photo_upload_megabytes', label: 'Upload size', unit: 'MB' }],
  },
];

export type LimitDraft = Record<AccountLimitName, string>;

export function limitDraft(values: AccountLimits): LimitDraft {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, String(value)]),
  ) as LimitDraft;
}

export function validLimit(text: string, bound: { minimum: number; maximum: number }): boolean {
  if (!/^\d+$/.test(text.trim())) return false;
  const value = Number(text);
  return value >= bound.minimum && value <= bound.maximum;
}

/** The typed limits as whole numbers, or null while any of them is out of range. */
export function parseLimitDraft(
  draft: LimitDraft,
  bounds: AccountLimitsSettings['bounds'],
): AccountLimits | null {
  const names = Object.keys(bounds) as AccountLimitName[];
  if (!names.every((name) => validLimit(draft[name] ?? '', bounds[name]))) return null;
  const values = {} as AccountLimits;
  for (const name of names) values[name] = Number(draft[name]);
  return values;
}
