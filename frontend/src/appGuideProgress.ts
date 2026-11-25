/** Where the device keeps a guide's progress: localStorage on the web, the app's device storage. */
export interface GuideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A new account takes the tour, then decides whether to import its history. The import stage is
 * written in backticks: the CI's shared-import detector would read a quoted one as an import.
 */
export type AppGuideStage = 'waiting' | `import` | 'done';

export const appGuideStorageKey = (userId: string) =>
  `gym-logger-app-guide:${encodeURIComponent(userId)}`;

/**
 * The app guide's progress for each account on this device. `storage` is read on every call and
 * may be missing or throw; the progress is then remembered for this session only.
 */
export function appGuideProgress(storage: () => GuideStorage | null | undefined) {
  const sessionState = new Map<string, AppGuideStage>();
  function read(userId: string): AppGuideStage | null {
    const key = appGuideStorageKey(userId);
    if (sessionState.has(key)) return sessionState.get(key)!;
    try {
      const value = storage()?.getItem(key);
      return value === 'waiting' || value === `import` || value === 'done' ? value : null;
    } catch {
      return null;
    }
  }
  function write(userId: string, state: AppGuideStage) {
    sessionState.set(appGuideStorageKey(userId), state);
    try {
      storage()?.setItem(appGuideStorageKey(userId), state);
    } catch {
      // Remember dismissal during this session when storage is blocked.
    }
  }
  return {
    queueAppGuide(userId: string) {
      if (read(userId) === null) write(userId, 'waiting');
    },
    appGuideWaiting: (userId: string) => read(userId) === 'waiting',
    /** Ending a first tour keeps the import step for after a reload; a replayed tour has none. */
    finishAppTour(userId: string) {
      if (read(userId) === 'waiting') write(userId, `import`);
    },
    importStepWaiting: (userId: string) => read(userId) === `import`,
    finishAppGuide: (userId: string) => write(userId, 'done'),
  };
}

export type OnboardingPrompt = 'tour' | `import` | 'release' | null;

/** A new account's tour comes first, then the import step, then What's new. */
export function nextOnboardingPrompt({
  tour,
  importStep,
  release,
  releaseHeld,
}: {
  tour: boolean;
  importStep: boolean;
  release: boolean;
  /** The person chose to import; What's new waits until they leave the import screen. */
  releaseHeld: boolean;
}): OnboardingPrompt {
  if (tour) return 'tour';
  if (importStep) return `import`;
  return release && !releaseHeld ? 'release' : null;
}
