export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit - 1]}`;
}

export function localDate(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** The local calendar date (YYYY-MM-DD) of a timestamp, so 01:00 here is not yesterday in UTC. */
export function localDateOf(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`;
}

export function decimalNumberOrNull(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMinutesDuration(minutes: number | null): string {
  if (minutes === null) return '–';
  const normalized = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}min`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes}min`;
}

export function workoutTimeInputValue(value: string | null): string {
  return value?.slice(0, 5) ?? '';
}

/**
 * Whether start and end times can record a duration. Equal times mean no time at all, so a
 * 24-hour workout keeps its duration without them.
 */
export function timesCanRecordDuration(durationMinutes: number): boolean {
  return durationMinutes < 24 * 60;
}

export function workoutDurationMinutes(startTime: string, endTime: string): number | null {
  const parse = (value: string) => {
    const match = /^(\d{2}):(\d{2})/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const start = parse(startTime);
  const end = parse(endTime);
  if (start === null || end === null) return null;
  return end >= start ? end - start : 24 * 60 - start + end;
}

export function formatWorkoutTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return '';
  const start = workoutTimeInputValue(startTime);
  const end = workoutTimeInputValue(endTime);
  const duration = workoutDurationMinutes(start, end);
  const overnight = duration !== null && end < start;
  return `${start}–${end}${overnight ? ' next day' : ''}`;
}

export function itemsInSelectionOrder<T extends { id: string }>(
  items: T[],
  selectedIds: readonly string[],
): T[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return selectedIds.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
}

export function mergeUniqueById<T extends { id: string }>(existing: T[], selected: T[]): T[] {
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...selected.filter((item) => !seen.has(item.id))];
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
