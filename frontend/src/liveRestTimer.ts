import type { DraftStorage } from './workoutDraft';

/**
 * The live workout's rest timer, kept on this device beside the workout draft so a reload keeps
 * the countdown. It is a separate entry, tied to the draft's session, so the synced draft format
 * and older drafts are unchanged; an entry for another session is ignored.
 */
export const LIVE_REST_TIMER_KEY = 'relay.live-rest-timer.v1';

export interface StoredRestTimer {
  sessionId: string;
  /** The exercise (or first of its superset) whose logged set started the rest. */
  movementKey: string | null;
  totalSeconds: number;
  /** A rest counting down or paused; null once it has finished. */
  timer: { id: string; endsAt: number; pausedLeft: number | null } | null;
  /** When a finished rest ended, while its "go" prompt still waits. */
  doneAt: number | null;
}

export interface RestoredRestTimer {
  timer: { id: string; endsAt: number; pausedLeft: number | null } | null;
  secondsLeft: number;
  totalSeconds: number;
  movementKey: string | null;
  done: { endedAt: number; movementKey: string | null } | null;
}

const NO_REST: RestoredRestTimer = {
  timer: null,
  secondsLeft: 0,
  totalSeconds: 0,
  movementKey: null,
  done: null,
};

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isStoredRestTimer(value: unknown): value is StoredRestTimer {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const timer = item.timer as Record<string, unknown> | null;
  return (
    typeof item.sessionId === 'string' &&
    (item.movementKey === null || typeof item.movementKey === 'string') &&
    finite(item.totalSeconds) &&
    (item.doneAt === null || finite(item.doneAt)) &&
    (timer === null ||
      (typeof timer === 'object' &&
        typeof timer.id === 'string' &&
        finite(timer.endsAt) &&
        (timer.pausedLeft === null || (finite(timer.pausedLeft) && timer.pausedLeft > 0))))
  );
}

export function readStoredRestTimer(storage = browserStorage()): StoredRestTimer | null {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(LIVE_REST_TIMER_KEY) ?? 'null');
    return isStoredRestTimer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves the rest, or clears it with null; storage can be unavailable in private modes. */
export function writeStoredRestTimer(
  value: StoredRestTimer | null,
  storage = browserStorage(),
): void {
  try {
    if (value) storage?.setItem(LIVE_REST_TIMER_KEY, JSON.stringify(value));
    else storage?.removeItem(LIVE_REST_TIMER_KEY);
  } catch {
    // The rest still counts down in memory.
  }
}

/**
 * The rest to show for `sessionId` after a reload: still counting down, paused, or finished
 * while the app was closed, which shows the "go" prompt for the next set.
 */
export function restoreRestTimer(
  stored: StoredRestTimer | null,
  sessionId: string,
  now = Date.now(),
): RestoredRestTimer {
  if (!stored || stored.sessionId !== sessionId) return NO_REST;
  const { timer, movementKey, totalSeconds } = stored;
  if (timer?.pausedLeft != null)
    return { ...NO_REST, timer, secondsLeft: timer.pausedLeft, totalSeconds, movementKey };
  if (timer && timer.endsAt > now)
    return {
      ...NO_REST,
      timer,
      secondsLeft: Math.ceil((timer.endsAt - now) / 1000),
      totalSeconds,
      movementKey,
    };
  const endedAt = timer?.endsAt ?? stored.doneAt;
  return endedAt == null ? NO_REST : { ...NO_REST, movementKey, done: { endedAt, movementKey } };
}
