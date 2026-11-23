import { storedReviewWeek, weeklyReviewShownKey } from './appNoticeRules';

/** The week (by its first day) whose review popup was last shown to this account on this device. */
const sessionState = new Map<string, string>();

const promptKey = weeklyReviewShownKey;

export function weeklyReviewShownFor(userId: string): string | null {
  const key = promptKey(userId);
  const remembered = sessionState.get(key);
  if (remembered) return remembered;
  try {
    return storedReviewWeek(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function markWeeklyReviewShown(userId: string, weekStart: string): void {
  const key = promptKey(userId);
  sessionState.set(key, weekStart);
  try {
    window.localStorage.setItem(key, weekStart);
  } catch {
    // Still show it only once during this session if storage is unavailable.
  }
}
