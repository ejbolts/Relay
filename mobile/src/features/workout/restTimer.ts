import { restoreRestTimer, type StoredRestTimer } from '../../../../frontend/src/liveRestTimer';

/** A rest counting down after a logged set, or paused with the workout. */
export interface RestTimer {
  id: string;
  endsAt: number;
  totalSeconds: number;
  /** Seconds left when the workout was paused; null while counting down. */
  pausedLeft: number | null;
  /** The exercise (or first of its superset) whose set started the rest. */
  movementKey: string | null;
}

export interface RestState {
  timer: RestTimer | null;
  /** A finished rest, which points to the next set until it is logged or dismissed. */
  done: { endedAt: number; movementKey: string | null } | null;
}

export const NO_REST: RestState = { timer: null, done: null };

export function restSecondsLeft(timer: RestTimer, now: number): number {
  return timer.pausedLeft ?? Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function startRest(
  seconds: number,
  movementKey: string | null,
  now: number,
  id: string,
): RestState {
  return {
    timer: {
      id,
      endsAt: now + seconds * 1000,
      totalSeconds: seconds,
      pausedLeft: null,
      movementKey,
    },
    done: null,
  };
}

/** Adds or takes off rest; taking off all of it ends the rest. */
export function adjustRest(state: RestState, deltaSeconds: number, now: number): RestState {
  const { timer } = state;
  if (!timer) return state;
  const left = restSecondsLeft(timer, now) + deltaSeconds;
  if (left <= 0) return NO_REST;
  const totalSeconds = Math.max(left, timer.totalSeconds);
  return {
    ...state,
    timer:
      timer.pausedLeft !== null
        ? { ...timer, pausedLeft: left, totalSeconds }
        : { ...timer, endsAt: now + left * 1000, totalSeconds },
  };
}

/** Pausing the workout freezes the rest; resuming carries on from there. */
export function pauseRest(state: RestState, now: number): RestState {
  const { timer } = state;
  if (!timer || timer.pausedLeft !== null) return state;
  const left = restSecondsLeft(timer, now);
  return left <= 0 ? state : { ...state, timer: { ...timer, pausedLeft: left } };
}

export function resumeRest(state: RestState, now: number): RestState {
  const { timer } = state;
  if (!timer || timer.pausedLeft === null) return state;
  return {
    ...state,
    timer: {
      ...timer,
      endsAt: now + timer.pausedLeft * 1000,
      pausedLeft: null,
    },
  };
}

/** A rest whose time is up becomes the finished rest. */
export function settleRest(state: RestState, now: number): RestState {
  const { timer } = state;
  if (!timer || timer.pausedLeft !== null || timer.endsAt > now) return state;
  return {
    timer: null,
    done: { endedAt: timer.endsAt, movementKey: timer.movementKey },
  };
}

/** The rest as the web stores it beside the draft (frontend/src/liveRestTimer.ts). */
export function restToStored(state: RestState, sessionId: string): StoredRestTimer | null {
  const { timer, done } = state;
  if (!timer && !done) return null;
  return {
    sessionId,
    movementKey: timer?.movementKey ?? done?.movementKey ?? null,
    totalSeconds: timer?.totalSeconds ?? 0,
    timer: timer && {
      id: timer.id,
      endsAt: timer.endsAt,
      pausedLeft: timer.pausedLeft,
    },
    doneAt: timer ? null : (done?.endedAt ?? null),
  };
}

/** The stored rest for this session, as it stands `now`. */
export function restFromStored(
  stored: StoredRestTimer | null,
  sessionId: string,
  now = Date.now(),
): RestState {
  const restored = restoreRestTimer(stored, sessionId, now);
  return {
    timer: restored.timer && {
      ...restored.timer,
      totalSeconds: restored.totalSeconds,
      movementKey: restored.movementKey,
    },
    done: restored.done,
  };
}
