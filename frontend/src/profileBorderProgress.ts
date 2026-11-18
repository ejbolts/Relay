import type { ProfileBorder } from './types';

const amount = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** "62 / 100 workouts", with a percent sign kept against its number. */
export function borderProgressLabel(progress: NonNullable<ProfileBorder['progress']>): string {
  const gap = progress.unit === '%' ? '' : ' ';
  const shown = Math.min(progress.current, progress.target);
  return `${amount(shown)} / ${amount(progress.target)}${gap}${progress.unit}`;
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
