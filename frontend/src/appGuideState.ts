/** A new account takes the tour, then decides whether to import its history. */
type GuideState = 'waiting' | 'import' | 'done';
const sessionState = new Map<string, GuideState>();
const keyFor = (userId: string) => `gym-logger-app-guide:${encodeURIComponent(userId)}`;

function read(userId: string): GuideState | null {
  const key = keyFor(userId);
  if (sessionState.has(key)) return sessionState.get(key)!;
  try {
    const value = window.localStorage.getItem(key);
    return value === 'waiting' || value === 'import' || value === 'done' ? value : null;
  } catch {
    return null;
  }
}

function write(userId: string, state: GuideState) {
  sessionState.set(keyFor(userId), state);
  try {
    window.localStorage.setItem(keyFor(userId), state);
  } catch {
    // Remember dismissal during this session when storage is blocked.
  }
}

export function queueAppGuide(userId: string) {
  if (read(userId) === null) write(userId, 'waiting');
}

export const appGuideWaiting = (userId: string) => read(userId) === 'waiting';
/** Ending a first tour keeps the import step for after a reload; a replayed tour has none. */
export function finishAppTour(userId: string) {
  if (read(userId) === 'waiting') write(userId, 'import');
}
export const importStepWaiting = (userId: string) => read(userId) === 'import';
export const finishAppGuide = (userId: string) => write(userId, 'done');

export type OnboardingPrompt = 'tour' | 'import' | 'release' | null;

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
  if (importStep) return 'import';
  return release && !releaseHeld ? 'release' : null;
}
