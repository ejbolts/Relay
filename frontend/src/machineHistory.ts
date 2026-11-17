import { parseLocalDate } from './trainingSummary';
import type { MachinePhotoUsage } from './types';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** “12 Oct 2025”: machine history spans years, so the year is always shown. */
export function machineDate(value: string): string {
  const date = parseLocalDate(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Calendar distance from a past workout date to today, such as “3 weeks ago”. */
export function timeSince(value: string, today: string): string {
  const then = parseLocalDate(value);
  const now = parseLocalDate(today);
  const days = Math.round((now.getTime() - then.getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 +
    now.getMonth() -
    then.getMonth() -
    (now.getDate() < then.getDate() ? 1 : 0);
  if (months < 1) return `${Math.floor(days / 7)} weeks ago`;
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function machineLastUsedLabel(lastUsed: string | null, today: string): string {
  return lastUsed
    ? `Last used ${machineDate(lastUsed)} · ${timeSince(lastUsed, today)}`
    : 'Not in a saved workout yet';
}

/** Match saved machines by their name or exercise, ignoring case and extra spaces. */
export function filterMachines(machines: MachinePhotoUsage[], query: string): MachinePhotoUsage[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return machines;
  return machines.filter((machine) => {
    const text = `${machine.caption} ${machine.exercise_name}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** Compact form for narrow photo cards, such as “Used 1 year ago”. */
export function machineUsedShort(lastUsed: string | null, today: string): string {
  return lastUsed ? `Used ${timeSince(lastUsed, today)}` : 'Not used yet';
}
