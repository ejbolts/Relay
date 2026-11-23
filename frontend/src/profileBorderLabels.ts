import { dayMonth } from './trainingSummary';
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
  const match = typeof day === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(day) : null;
  if (!match) return null;
  const [, year, month, date] = match.map(Number);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  // The app's own short date ("12 Nov"), so it matches the streak ranges beside it.
  return `Unlocked ${dayMonth(match[0])} ${year}`;
}
