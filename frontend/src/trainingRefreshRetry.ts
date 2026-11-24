import { syncRetryDelay } from './syncBackoff';

/** The reads a training-data refresh makes, in the order it starts them. */
export const TRAINING_READS = [
  'dashboard',
  'exercises',
  'workouts',
  'checkIns',
  'records',
] as const;
export type TrainingRead = (typeof TRAINING_READS)[number];

/** What a refresh reads for. The server's answers stay current for as long as all three match. */
export interface RefreshTarget {
  /** The account's training revision; null when the server did not report one. */
  revision: string | null;
  /** The day the dashboard was read for. */
  date: string;
  /** How far back the history window reaches. */
  windowStart: string;
}

/** A refresh the server did not fully answer, and what it still owes. */
export interface UnansweredRefresh extends RefreshTarget {
  /** The reads that failed or were answered from this device's saved copy. */
  reads: readonly TrainingRead[];
  /** Refreshes in a row that were not fully answered. */
  attempts: number;
  /** Timed checks leave the server alone until this time, in epoch milliseconds. */
  retryAt: number;
}

/**
 * The reads to make now. Trying again for the same revision, day and window only asks for what
 * the server has not answered yet: its other answers are still current, and asking for all of
 * them again is what keeps a slow server slow.
 */
export function readsToRequest(
  previous: UnansweredRefresh | null,
  target: RefreshTarget,
): readonly TrainingRead[] {
  return previous &&
    previous.revision !== null &&
    previous.revision === target.revision &&
    previous.date === target.date &&
    previous.windowStart === target.windowStart
    ? previous.reads
    : TRAINING_READS;
}

/** Records a refresh that left `reads` unanswered, and when timed checks may try again. */
export function unansweredRefresh(
  previous: UnansweredRefresh | null,
  target: RefreshTarget,
  reads: readonly TrainingRead[],
  now: number,
): UnansweredRefresh {
  const attempts = (previous?.attempts ?? 0) + 1;
  return { ...target, reads, attempts, retryAt: now + syncRetryDelay(attempts) };
}
