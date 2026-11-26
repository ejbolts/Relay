import {
  finishedWorkoutKey,
  keepFinishedWorkoutsFor,
  readFinishedWorkouts,
  removeFinishedWorkout,
  type FinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutQueue';
import {
  finishedSaveFailure,
  finishedSaveRetryDelayMs,
} from '../../../../frontend/src/finishedWorkoutSend';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import type { DraftStorage } from '../../../../frontend/src/workoutDraft';

export interface QueueStatus {
  /** Finished workouts on this phone that the server has not confirmed. */
  waiting: number;
  sending: boolean;
  /** Workouts the server refused, by queue key, with its reason; they wait for review. */
  refusals: Record<string, string>;
  /** Refused because the saved workout changed on another device; this version can still win. */
  conflicts: string[];
  /** The server needs a newer app before it accepts these saves. */
  outdated: boolean;
  /**
   * Saves the server acknowledged in this run, by queue key, even if storage could not drop
   * them: they count as saved, not waiting.
   */
  sent?: string[];
}

export interface SenderDependencies {
  storage: DraftStorage;
  userId: string;
  send: (item: FinishedWorkout) => Promise<TrackedWorkout>;
  online: () => boolean;
  /** How a failed send went: its HTTP status (undefined when unreachable) and message. */
  describe: (error: unknown) => {
    status: number | undefined;
    outdated: boolean;
    message: string;
    /** The saved workout changed on another device since it was loaded. */
    conflict?: boolean;
  };
  onSaved: (workout: TrackedWorkout, item: FinishedWorkout, remaining: number) => void;
  onChange: (status: QueueStatus) => void;
  setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout> | undefined) => void;
}

/**
 * Sends finished workouts one at a time, oldest first, until the server confirms each, as the
 * web's useFinishedWorkoutQueue does. A workout stays stored on the phone until its save is
 * confirmed, and every retry carries the same client_session_id, so the server saves it once
 * however often the connection drops. Refused saves wait for review without blocking the rest;
 * connection failures retry with backoff, and `wake` retries at once (reconnecting, reopening).
 */
export class FinishedQueueSender {
  private running = false;
  private stopped = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  // Acknowledged in this run; never resent even if storage could not drop them.
  private sent = new Set<string>();
  private refusals: Record<string, string> = {};
  private conflicts = new Set<string>();
  private outdated = false;
  private sending = false;
  private readonly setTimer: NonNullable<SenderDependencies['setTimer']>;
  private readonly clearTimer: NonNullable<SenderDependencies['clearTimer']>;

  constructor(private deps: SenderDependencies) {
    this.setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
    this.clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
    // Another account's finished workouts never send from this one.
    keepFinishedWorkoutsFor(deps.userId, deps.storage);
  }

  private mine() {
    return readFinishedWorkouts(this.deps.storage).filter(
      (item) => item.pendingSave.userId === this.deps.userId,
    );
  }

  private waiting() {
    return this.mine().filter((item) => {
      const key = finishedWorkoutKey(item);
      return !(key in this.refusals) && !this.sent.has(key);
    });
  }

  status(): QueueStatus {
    return {
      waiting: this.mine().filter((item) => !this.sent.has(finishedWorkoutKey(item))).length,
      sending: this.sending,
      refusals: { ...this.refusals },
      conflicts: [...this.conflicts],
      outdated: this.outdated,
      sent: [...this.sent],
    };
  }

  private report() {
    if (!this.stopped) this.deps.onChange(this.status());
  }

  /** Tries now, for example after finishing, reconnecting or returning to the app. */
  wake() {
    this.clearTimer(this.timer);
    this.failures = 0;
    void this.drain();
  }

  stop() {
    this.stopped = true;
    this.clearTimer(this.timer);
  }

  /**
   * Lets go of a refused workout after it was reopened for review or discarded; it has already
   * left the queue in storage.
   */
  forget(key: string) {
    if (!(key in this.refusals)) return;
    const refusals = { ...this.refusals };
    delete refusals[key];
    this.refusals = refusals;
    this.conflicts.delete(key);
    this.report();
  }

  private stillQueued(key: string) {
    return readFinishedWorkouts(this.deps.storage).some((item) => finishedWorkoutKey(item) === key);
  }

  async drain(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped && !this.outdated && this.deps.online()) {
        const next = this.waiting()[0];
        if (!next) break;
        const key = finishedWorkoutKey(next);
        this.clearTimer(this.timer);
        this.sending = true;
        this.report();
        try {
          const workout = await this.deps.send(next);
          if (this.stopped) return;
          this.failures = 0;
          this.sent.add(key);
          removeFinishedWorkout(key, this.deps.storage);
          this.sending = false;
          this.deps.onSaved(workout, next, this.waiting().length);
          this.report();
        } catch (error) {
          this.sending = false;
          if (this.stopped) return;
          if (!this.stillQueued(key)) continue;
          const failure = this.deps.describe(error);
          const action = finishedSaveFailure(failure.status, failure.outdated);
          if (action === 'outdated') {
            // Every waiting workout stays on this phone; the updated app sends them.
            this.outdated = true;
            this.report();
            return;
          }
          if (action === 'refused') {
            this.refusals = { ...this.refusals, [key]: failure.message };
            if (failure.conflict) this.conflicts.add(key);
            else this.conflicts.delete(key);
            this.report();
            continue;
          }
          this.timer = this.setTimer(
            () => void this.drain(),
            finishedSaveRetryDelayMs(this.failures++),
          );
          this.report();
          return;
        }
      }
    } finally {
      this.running = false;
      this.sending = false;
    }
    this.report();
  }
}
