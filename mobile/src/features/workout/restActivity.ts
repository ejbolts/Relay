import { useEffect } from 'react';
import { nextSetAfterRest, type RestNextSet } from '../../../../frontend/src/restComplete';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { relayLiveActivity } from '../../../modules/relay-live-activity';
import type { LoggerState } from './loggerState';
import type { RestState } from './restTimer';

// On iPhone the running rest also shows as a Live Activity, on the Lock Screen and in the Dynamic
// Island: the exercise, the time left and the next set. It follows every change to the rest
// (start, pause, resume, ±30 s) and ends when the rest ends, is skipped or the workout finishes.
// Where there's no native module (Expo Go, Android) this does nothing; the rest alert in
// restAlerts.ts is unaffected either way.

/** What the activity shows; null when no rest is counting down. */
export interface RestActivityContent {
  sessionId: string;
  exercise: string;
  /** "Set 2 · 80 kg × 8", naming the exercise only when the next set is in another one. */
  nextSet: string | null;
  /** When the rest ends; while paused, when it would end if it carried on now. */
  endsAt: number;
  totalSeconds: number;
  pausedSeconds: number | null;
}

function nextSetText(next: RestNextSet | null, exercise: string): string | null {
  if (!next) return null;
  return [next.exercise === exercise ? null : next.exercise, next.set, next.target]
    .filter(Boolean)
    .join(' · ');
}

export function restActivityContent(
  rest: RestState,
  logger: Pick<LoggerState, 'clientSessionId' | 'movements'>,
  weightUnit: WeightUnit,
  now: number,
): RestActivityContent | null {
  const timer = rest.timer;
  if (!timer) return null;
  const exercise =
    logger.movements.find((movement) => movement.key === timer.movementKey)?.exercise.name ??
    'Rest';
  const paused = timer.pausedLeft === null ? null : Math.max(0, Math.round(timer.pausedLeft));
  return {
    sessionId: logger.clientSessionId,
    exercise,
    nextSet: nextSetText(
      nextSetAfterRest(logger.movements, timer.movementKey, weightUnit),
      exercise,
    ),
    endsAt: paused === null ? timer.endsAt : now + paused * 1000,
    totalSeconds: Math.max(0, Math.round(timer.totalSeconds)),
    pausedSeconds: paused,
  };
}

/** Paused content says the same thing whenever it's read, so its moving end date doesn't count. */
function keyOf(content: RestActivityContent | null): string {
  if (!content) return 'none';
  return JSON.stringify({
    ...content,
    endsAt: content.pausedSeconds === null ? content.endsAt : 0,
  });
}

let wanted: RestActivityContent | null = null;
/** What the activity shows now; unknown at launch, when one may be left from before. */
let applied: string | undefined;
let queue: Promise<void> = Promise.resolve();

async function apply() {
  const native = relayLiveActivity();
  if (!native) return;
  const target = wanted;
  const key = keyOf(target);
  if (key === applied) return;
  applied = key;
  try {
    if (target)
      await native.show(
        target.sessionId,
        target.exercise,
        target.nextSet,
        target.endsAt,
        target.totalSeconds,
        target.pausedSeconds,
      );
    else await native.end();
  } catch {
    // Live Activities turned off, or iOS refused one: the rest carries on in the app. The next
    // change tries again.
    applied = undefined;
  }
}

/** Keeps the activity in step with the rest. Changes apply in order; a burst settles on the latest. */
export function syncRestActivity(content: RestActivityContent | null): Promise<void> {
  wanted = content;
  queue = queue.then(apply).catch(() => undefined);
  return queue;
}

/**
 * The provider's hook: the activity follows the rest and the workout (so the next set stays
 * right), and ends when the workout engine goes away, such as on signing out. While a restored
 * workout is still `pending` (waiting for its exercises to load), an activity left from before the
 * relaunch stays as it is.
 */
export function useRestActivity(
  rest: RestState,
  logger: LoggerState | null,
  weightUnit: WeightUnit,
  pending: boolean,
) {
  useEffect(() => {
    if (pending) return;
    void syncRestActivity(
      logger ? restActivityContent(rest, logger, weightUnit, Date.now()) : null,
    );
  }, [rest, logger, weightUnit, pending]);
  useEffect(() => () => void syncRestActivity(null), []);
}

/** For tests: forget what the activity shows. */
export function resetRestActivityForTests() {
  wanted = null;
  applied = undefined;
  queue = Promise.resolve();
}
