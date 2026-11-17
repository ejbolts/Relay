type GuideState = 'waiting' | 'done';

const sessionState = new Map<string, GuideState>();

function guideKey(userId: string): string {
  return `gym-logger-home-screen-guide:${encodeURIComponent(userId)}`;
}

function readState(userId: string): GuideState | null {
  const key = guideKey(userId);
  const remembered = sessionState.get(key);
  if (remembered) return remembered;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === 'waiting' || stored === 'done' ? stored : null;
  } catch {
    return null;
  }
}

function writeState(userId: string, state: GuideState): void {
  const key = guideKey(userId);
  sessionState.set(key, state);
  try {
    window.localStorage.setItem(key, state);
  } catch {
    // Still follow the guide's progress during this session if storage is unavailable.
  }
}

/** Called once a new account is created, so only that account sees the guide automatically. */
export function queueHomeScreenGuide(userId: string): void {
  if (readState(userId) !== 'done') writeState(userId, 'waiting');
}

export function finishHomeScreenGuide(userId: string): void {
  writeState(userId, 'done');
}

/** Already opened from the Home Screen, so there is nothing left to set up. */
export function runningAsInstalledApp(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    iosNavigator.standalone === true
  );
}

export function homeScreenGuideWaiting(userId: string): boolean {
  if (readState(userId) !== 'waiting') return false;
  if (!runningAsInstalledApp()) return true;
  finishHomeScreenGuide(userId);
  return false;
}
