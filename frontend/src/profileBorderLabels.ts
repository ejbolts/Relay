import type { BorderRarity } from './types';

export const RARITY_LABELS: Record<BorderRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

/** Rarities in the order of the art's grades, 1 to 5. */
export const RARITY_BY_GRADE: readonly BorderRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
];

/** "Unlocked 12 Nov 2026" for a border's unlock day, or null when it is missing or unreadable. */
export function borderUnlockedLabel(day?: string | null): string | null {
  const match = typeof day === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(day) : null;
  if (!match) return null;
  // Noon keeps the calendar day in every time zone.
  const date = new Date(`${match[0]}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const shown = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `Unlocked ${shown}`;
}
