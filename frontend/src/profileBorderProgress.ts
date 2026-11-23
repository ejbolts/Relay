import type { ProfileBorder } from './types';

const amount = (value: number, places = 1) =>
  value.toLocaleString('en-GB', { maximumFractionDigits: places });

/** "62 / 100 workouts", with a percent sign kept against its number: "20 / 25% BW". */
export function borderProgressLabel(progress: NonNullable<ProfileBorder['progress']>): string {
  const shown = Math.min(progress.current, progress.target);
  const gap = progress.unit.startsWith('%') ? '' : ' ';
  return `${amount(shown)} / ${amount(progress.target)}${gap}${progress.unit}`;
}

/** How long a limited edition has left, or how soon it opens. */
export function borderTimeLabel(border: ProfileBorder): string | null {
  const days = border.days_left;
  if (border.status === 'active' && days != null) {
    return days === 1 ? 'Last day' : `${days} days left`;
  }
  if (border.status === 'upcoming' && days != null) {
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`;
  }
  if (border.status === 'ended') return 'Event over';
  return null;
}

/** The same, short enough for a tile: "43d" while open, "Soon" before it opens. */
export function borderTimeBadge(border: ProfileBorder): string | null {
  if (border.status === 'active' && border.days_left != null) return `${border.days_left}d`;
  return border.status === 'upcoming' ? 'Soon' : null;
}

/** How full the progress bar is, as a percentage with one decimal. */
export function borderProgressPercent(progress: NonNullable<ProfileBorder['progress']>): number {
  if (progress.target <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, progress.current / progress.target)) * 1000) / 10;
}

/** A single border, or a family's tiers from the easiest. */
export type BorderSet = ProfileBorder[];

/** Groups in order, each with its borders and families in the order the server lists them. */
export function borderSets(borders: ProfileBorder[]): [string, BorderSet[]][] {
  const groups = new Map<string, BorderSet[]>();
  const families = new Map<string, BorderSet>();
  for (const border of borders) {
    const sets = groups.get(border.group) ?? [];
    groups.set(border.group, sets);
    if (!border.family) {
      sets.push([border]);
      continue;
    }
    const family = families.get(border.family);
    if (family) family.push(border);
    else {
      const created = [border];
      families.set(border.family, created);
      sets.push(created);
    }
  }
  for (const family of families.values()) family.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  return [...groups];
}

/** The tier a set shows: the one worn, else the highest earned, else the first. */
export function shownTier(set: BorderSet, worn: string | null): ProfileBorder {
  return (
    set.find((border) => border.key === worn) ??
    [...set].reverse().find((border) => border.unlocked) ??
    set[0]
  );
}
