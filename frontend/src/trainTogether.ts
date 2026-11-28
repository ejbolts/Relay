import { inactiveWorkoutFinishAt, RECENT_WORKOUT_ACTIVITY_MS } from './activeWorkoutTimeout';
import type { ColourThemeId } from './appearanceChoices';
import type { ActiveWorkoutDraft, StoredDraftMovement, StoredDraftSet } from './workoutDraft';

// Train together: friends at the gym link their live workouts with a code, and either phone can
// log sets for either person. The server applies a partner's edit to the owner's live draft
// through the same three-way merge another of the owner's devices would use, so the owner's own
// app receives it through its ordinary draft sync.
//
// Plain TypeScript with no packages, React or browser APIs: the web and the native app (mobile/)
// both import this module, so the rules, wording and numbers are the same on every screen.

// The API (GET/POST /api/train-together…)

export const TRAIN_MAX_MEMBERS = 4;
/** How long a code lasts, for the countdown before the first read of its `expires_at`. */
export const TRAIN_INVITE_SECONDS = 5 * 60;

/** Why a session ended. Older and newer servers may send other words: treat those as ended. */
export type TrainEndReason = 'left' | 'finished' | 'discarded' | 'expired' | 'unfriended';

export const TRAIN_ERRORS = {
  inviteExpired: 'train_invite_expired',
  ownInvite: 'train_own_invite',
  notFriends: 'train_not_friends',
  full: 'train_full',
  notPartner: 'train_not_partner',
  noWorkout: 'train_no_workout',
  changeNotAllowed: 'train_change_not_allowed',
} as const;

export interface TrainExercise {
  /** The partner's own exercise id; exercise ids are per account. */
  id: string;
  name: string;
  /** `strength` or `cardio` today; tolerate other values. */
  kind: string;
  category: string;
  muscle_group: string;
  equipment: string | null;
  /** The viewer's own exercise that is the same lift, matched on the server; null when none. */
  same_as_exercise_id: string | null;
}

export interface TrainPartnerWorkout {
  revision: number;
  draft: ActiveWorkoutDraft;
  /** Every exercise the draft's movements use. */
  exercises: TrainExercise[];
}

export interface TrainMember {
  user_id: string;
  username: string;
  display_name: string;
  photo_url: string | null;
  is_self: boolean;
  joined_at: string;
  /** Null for the caller (their app has its own draft) and for a partner with no workout. */
  workout: TrainPartnerWorkout | null;
}

export interface TrainSession {
  id: string;
  started_at: string;
  expires_at: string;
  /** Null once the account that started it has been deleted. */
  created_by: string | null;
  max_members: number;
  /** Active members: the caller first, then by when they joined. */
  members: TrainMember[];
}

export interface TrainEnded {
  session_id: string;
  reason: TrainEndReason | (string & {});
  /** Whose action ended it; null for expiry. */
  by_user_id: string | null;
  by_name: string | null;
}

export interface TrainTogetherRead {
  session: TrainSession | null;
  /** Why the caller's last session ended, for ten minutes after it ended. */
  ended: TrainEnded | null;
}

export interface TrainInvite {
  token: string;
  expires_at: string;
  session_id: string;
}

export interface TrainPartnerChange {
  revision: number;
  base: ActiveWorkoutDraft;
  draft: ActiveWorkoutDraft;
}

export interface TrainPartnerWriteResult {
  revision: number;
  draft: ActiveWorkoutDraft | null;
  /** The edit could not be merged; `revision` and `draft` are the server's copy. */
  conflict: boolean;
  exercises: TrainExercise[];
}

/** Someone a saved workout was trained with, as the viewer may see them. */
export interface TrainedWith {
  user_id: string;
  display_name: string;
  username: string;
  photo_url: string | null;
}

// Links

export const TRAIN_INVITE_HASH = /^#train=([A-Za-z0-9_-]{16,64})$/;

/** The link a train-together QR code holds: an ordinary Relay URL, so any camera opens it. */
export function trainInviteLink(token: string, origin: string): string {
  // The code stays in the fragment: browsers do not send it in requests or referrers.
  return `${origin}/#train=${token}`;
}

export function trainInviteTokenFromHash(hash: string): string | null {
  return TRAIN_INVITE_HASH.exec(hash)?.[1] ?? null;
}

/** Reads a scanned QR code as a train-together link on any of this server's addresses. */
export function trainInviteTokenFromScan(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return trainInviteTokenFromHash(url.hash);
}

// Members

export function memberName(member: { display_name?: string | null; username?: string | null }) {
  return member.display_name?.trim() || member.username?.trim() || 'Your partner';
}

/**
 * A name for tight controls: the first word of the display name, at most 16 characters ("Alex"
 * for "Alex Morgan"), or `memberName` when there is no display name.
 */
export function memberShortName(member: {
  display_name?: string | null;
  username?: string | null;
}): string {
  const first = member.display_name?.trim().split(/\s+/)[0] ?? '';
  return first ? Array.from(first).slice(0, 16).join('') : memberName(member);
}

/** The session's members who are not the caller, in the server's stable order. */
export function partners(session: TrainSession | null | undefined): TrainMember[] {
  return session?.members.filter((member) => !member.is_self) ?? [];
}

/** "Sam", "Sam & Priya", "Sam, Priya & Dev". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

const PARTNER_THEME_ORDER = [
  'plum',
  'amber',
  'coral',
  'emerald',
  'blue',
] as const satisfies readonly ColourThemeId[];

/**
 * Each partner's colour theme by position in `partners(session)`: a fixed order with the caller's
 * own theme left out, wrapping if needed. A partner keeps their colour for the session because
 * the server keeps the members' order.
 */
export function partnerThemeIds(ownThemeId: ColourThemeId, count: number): ColourThemeId[] {
  const order = PARTNER_THEME_ORDER.filter((id) => id !== ownThemeId);
  return Array.from({ length: Math.max(0, count) }, (_, index) => order[index % order.length]);
}

// What the live strip shows

export interface PartnerLastSet {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
}

export interface PartnerSummary {
  /** The movement the partner is on: the last with a completed set, else the first. */
  movementKey: string | null;
  exerciseId: string | null;
  exercise: TrainExercise | null;
  /** The exercise's name, or "Exercise" when the server sent none for it. */
  name: string;
  /** Completed sets in that movement. */
  setsDone: number;
  lastSet: PartnerLastSet | null;
  /** Completed sets in the whole workout. */
  totalSetsDone: number;
  /** Minutes since the workout was last active (logged on either phone). */
  minutesSinceActive: number;
}

const isDone = (item: StoredDraftSet) => item.completed === true;

function lastSet(item: StoredDraftSet): PartnerLastSet {
  return {
    weight_kg: item.weight_kg ?? null,
    reps: item.reps ?? null,
    duration_seconds: item.duration_seconds ?? null,
    distance_km: item.distance_km ?? null,
  };
}

export function partnerSummary(workout: TrainPartnerWorkout, now: number): PartnerSummary {
  const movements = workout.draft.movements ?? [];
  const current =
    [...movements].reverse().find((movement) => movement.sets.some(isDone)) ?? movements[0];
  const exercise = current
    ? (workout.exercises.find((item) => item.id === current.exerciseId) ?? null)
    : null;
  const done = current?.sets.filter(isDone) ?? [];
  const activeAt = workout.draft.lastActiveAt ?? workout.draft.updatedAt;
  return {
    movementKey: current?.key ?? null,
    exerciseId: current?.exerciseId ?? null,
    exercise,
    name: exercise?.name ?? 'Exercise',
    setsDone: done.length,
    lastSet: done.length ? lastSet(done[done.length - 1]) : null,
    totalSetsDone: movements.reduce(
      (total, movement) => total + movement.sets.filter(isDone).length,
      0,
    ),
    minutesSinceActive: Math.max(0, Math.floor((now - activeAt) / 60_000)),
  };
}

/** The partner's most recent completed set on the caller's own exercise, or null. */
export function partnerSetOnSameLift(
  workout: TrainPartnerWorkout,
  myExerciseId: string,
): { movementKey: string; exercise: TrainExercise; set: StoredDraftSet } | null {
  const same = new Map(
    workout.exercises
      .filter((item) => item.same_as_exercise_id === myExerciseId)
      .map((item) => [item.id, item]),
  );
  for (const movement of [...(workout.draft.movements ?? [])].reverse()) {
    const exercise = same.get(movement.exerciseId);
    const done = exercise ? movement.sets.filter(isDone) : [];
    if (exercise && done.length)
      return { movementKey: movement.key, exercise, set: done[done.length - 1] };
  }
  return null;
}

/** "Start with Sam's exercises": the caller's matching exercises, plus names with no match. */
export function exercisesToCopy(workout: TrainPartnerWorkout): {
  exerciseIds: string[];
  unmatched: string[];
} {
  const byId = new Map(workout.exercises.map((item) => [item.id, item]));
  const exerciseIds: string[] = [];
  const unmatched: string[] = [];
  for (const movement of workout.draft.movements ?? []) {
    const exercise = byId.get(movement.exerciseId);
    const mine = exercise?.same_as_exercise_id;
    if (mine) {
      if (!exerciseIds.includes(mine)) exerciseIds.push(mine);
    } else if (exercise && !unmatched.includes(exercise.name)) unmatched.push(exercise.name);
  }
  return { exerciseIds, unmatched };
}

// Editing a partner's draft. Every edit returns a new draft, keeps fields it does not know and
// marks the workout active, so it does not time out while someone else logs it. An edit that
// finds nothing to change returns the same draft.

/**
 * The activity times after an edit at `now`. The finish time only moves later: an owner's own
 * cutoff is kept, extended by the usual grace after activity.
 */
export function touchPartnerDraft(draft: ActiveWorkoutDraft, now: number): ActiveWorkoutDraft {
  const finishAt = draft.inactiveFinishAt ?? inactiveWorkoutFinishAt(draft.startedAt, now);
  return {
    ...draft,
    updatedAt: Math.max(draft.updatedAt, now),
    lastActiveAt: Math.max(draft.lastActiveAt ?? draft.startedAt, now),
    inactiveFinishAt: Math.max(finishAt, now + RECENT_WORKOUT_ACTIVITY_MS),
  };
}

function editMovement(
  draft: ActiveWorkoutDraft,
  movementKey: string,
  edit: (movement: StoredDraftMovement) => StoredDraftMovement | null,
  now: number,
): ActiveWorkoutDraft {
  const index = draft.movements.findIndex((movement) => movement.key === movementKey);
  if (index < 0) return draft;
  const changed = edit(draft.movements[index]);
  if (changed === draft.movements[index]) return draft;
  const movements = [...draft.movements];
  if (changed) movements[index] = changed;
  else movements.splice(index, 1);
  return touchPartnerDraft({ ...draft, movements }, now);
}

export function updatePartnerSet(
  draft: ActiveWorkoutDraft,
  movementKey: string,
  setKey: string,
  patch: Partial<Omit<StoredDraftSet, 'key'>>,
  now: number,
): ActiveWorkoutDraft {
  return editMovement(
    draft,
    movementKey,
    (movement) => {
      const index = movement.sets.findIndex((item) => item.key === setKey);
      if (index < 0) return movement;
      const sets = [...movement.sets];
      sets[index] = { ...sets[index], ...patch, key: setKey };
      return { ...movement, sets };
    },
    now,
  );
}

function blankSet(key: string, previous?: StoredDraftSet): StoredDraftSet {
  return {
    key,
    reps: previous?.reps ?? null,
    weight_kg: previous?.weight_kg ?? null,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    notes: null,
    completed: false,
  };
}

/** A new set after the movement's last, with its weight and reps, not completed. */
export function addPartnerSet(
  draft: ActiveWorkoutDraft,
  movementKey: string,
  newKey: string,
  now: number,
): ActiveWorkoutDraft {
  return editMovement(
    draft,
    movementKey,
    (movement) =>
      movement.sets.some((item) => item.key === newKey)
        ? movement
        : {
            ...movement,
            sets: [...movement.sets, blankSet(newKey, movement.sets[movement.sets.length - 1])],
          },
    now,
  );
}

export function removePartnerSet(
  draft: ActiveWorkoutDraft,
  movementKey: string,
  setKey: string,
  now: number,
): ActiveWorkoutDraft {
  return editMovement(
    draft,
    movementKey,
    (movement) =>
      movement.sets.some((item) => item.key === setKey)
        ? { ...movement, sets: movement.sets.filter((item) => item.key !== setKey) }
        : movement,
    now,
  );
}

/**
 * Adds the partner's exercise (their own id) at the end, with one empty set. Returns the draft
 * unchanged when that exercise (or the key) is already in the workout.
 */
export function addPartnerMovement(
  draft: ActiveWorkoutDraft,
  exerciseId: string,
  keys: { movementKey: string; setKey: string },
  now: number,
): ActiveWorkoutDraft {
  // A workout cannot be saved with the same exercise twice, so a repeated pick changes nothing.
  if (
    draft.movements.some(
      (movement) => movement.key === keys.movementKey || movement.exerciseId === exerciseId,
    )
  )
    return draft;
  const movement: StoredDraftMovement = {
    key: keys.movementKey,
    exerciseId,
    notes: '',
    machinePhotoIds: [],
    supersetKey: null,
    sets: [blankSet(keys.setKey)],
  };
  return touchPartnerDraft({ ...draft, movements: [...draft.movements, movement] }, now);
}

export function removePartnerMovement(
  draft: ActiveWorkoutDraft,
  movementKey: string,
  now: number,
): ActiveWorkoutDraft {
  return editMovement(draft, movementKey, () => null, now);
}

// Sending a partner's draft

export type PartnerSyncStatus = 'synced' | 'syncing' | 'failed' | 'conflict';

export interface PartnerSyncState {
  revision: number;
  /** The partner's draft as this phone shows it, unsent edits included. */
  draft: ActiveWorkoutDraft | null;
  status: PartnerSyncStatus;
  /** The server's copy replaced this phone's last edit (`conflict`). */
  notApplied: boolean;
  /** Why the last request failed (`failed`), for the screen to word; the edit is kept. */
  error: unknown;
  /** The exercises from the latest answer, when the server sent them. */
  exercises: TrainExercise[] | null;
}

export interface PartnerSyncDependencies {
  put: (change: TrainPartnerChange) => Promise<TrainPartnerWriteResult>;
  changed: (state: PartnerSyncState) => void;
}

type PartnerEdit = (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft;
type PartnerCopy = { revision: number; draft: ActiveWorkoutDraft | null };

/**
 * The request loop for one partner's draft. One PUT at a time, against the last acknowledged
 * copy. The edits not yet acknowledged are kept as functions, so after each answer the ones made
 * while the request ran are replayed on the server's copy and sent next. On a conflict the
 * server's copy wins: the edits that request carried are reported as not applied (`notApplied`)
 * and later ones are replayed and sent. A failed request keeps its edits until `retry()` or the
 * next edit. A newer copy read while a request runs is applied once the queue has settled, and
 * an answer to a request that is no longer current changes nothing.
 */
export class PartnerWorkoutSync {
  private base: PartnerCopy;
  private local: ActiveWorkoutDraft | null;
  private edits: PartnerEdit[] = [];
  private newest: PartnerCopy | null = null;
  private generation = 0;
  private running: Promise<void> | null = null;
  private stopped = false;
  private state: PartnerSyncState;

  constructor(
    private deps: PartnerSyncDependencies,
    initial: PartnerCopy,
  ) {
    this.base = initial;
    this.local = initial.draft;
    this.state = {
      revision: initial.revision,
      draft: initial.draft,
      status: 'synced',
      notApplied: false,
      error: null,
      exercises: null,
    };
  }

  get current(): PartnerSyncState {
    return this.state;
  }

  /** Whether an edit has not been acknowledged yet. */
  get unsent(): boolean {
    return this.edits.length > 0;
  }

  stop() {
    this.stopped = true;
  }

  private report(update: Partial<PartnerSyncState>) {
    this.state = { ...this.state, revision: this.base.revision, draft: this.local, ...update };
    if (!this.stopped) this.deps.changed(this.state);
  }

  /** Puts the queued edits on top of `copy`, dropping any that no longer change anything. */
  private rebase(copy: PartnerCopy, edits: PartnerEdit[]) {
    this.base = copy;
    let draft = copy.draft;
    this.edits = [];
    for (const edit of draft ? edits : []) {
      const next = edit(draft!);
      if (next !== draft) {
        this.edits.push(edit);
        draft = next;
      }
    }
    this.local = draft;
  }

  /** Apply an edit (for example `draft => addPartnerSet(draft, …)`) and send it. */
  edit(change: PartnerEdit): Promise<void> {
    if (this.stopped || !this.local) return Promise.resolve();
    const next = change(this.local);
    if (next === this.local) return this.running ?? Promise.resolve();
    this.edits.push(change);
    this.local = next;
    this.report({ status: 'syncing', notApplied: false, error: null });
    return this.send();
  }

  /** Send the edits kept after a failed request. */
  retry(): Promise<void> {
    return this.unsent ? this.send() : (this.running ?? Promise.resolve());
  }

  /**
   * A newer copy from GET /api/train-together. With nothing unsent and no request running it is
   * adopted at once; otherwise the newest one is kept and applied when the queue settles, unless
   * the queue's own answers are newer. A different workout (the partner started again) replaces
   * everything at once, and the request running for the old one no longer counts.
   */
  refresh(remote: PartnerCopy) {
    if (this.stopped || remote.revision <= this.base.revision) return;
    const otherWorkout =
      !remote.draft || remote.draft.clientSessionId !== this.base.draft?.clientSessionId;
    if (otherWorkout) {
      this.generation += 1;
      this.newest = null;
      this.rebase(remote, []);
      this.report({ status: 'synced', error: null });
      return;
    }
    if (this.running || this.unsent) {
      if (!this.newest || remote.revision > this.newest.revision) this.newest = remote;
      return;
    }
    this.rebase(remote, []);
    this.report({ status: 'synced', error: null });
  }

  private send(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private settle() {
    const newest = this.newest;
    if (!newest || this.unsent || this.stopped) return;
    this.newest = null;
    if (newest.revision > this.base.revision) {
      this.rebase(newest, []);
      this.report({ status: 'synced', error: null });
    }
  }

  private async drain() {
    while (!this.stopped && this.unsent && this.local && this.base.draft) {
      const generation = this.generation;
      const sent = this.local;
      const base = this.base;
      const count = this.edits.length;
      this.report({ status: 'syncing', error: null });
      let response: TrainPartnerWriteResult;
      try {
        response = await this.deps.put({ revision: base.revision, base: base.draft!, draft: sent });
      } catch (reason) {
        if (this.stopped) return;
        if (generation !== this.generation) continue;
        this.report({ status: 'failed', error: reason });
        return;
      }
      if (this.stopped) return;
      if (generation !== this.generation) continue;
      const later = this.edits.slice(count);
      this.rebase({ revision: response.revision, draft: response.draft }, later);
      if (response.conflict) {
        this.report({ status: 'conflict', notApplied: true, exercises: response.exercises });
      } else {
        this.report({
          status: this.unsent ? 'syncing' : 'synced',
          exercises: response.exercises,
        });
      }
    }
    this.settle();
  }
}

// Wording both apps share

export const TRAIN_TOGETHER_LABEL = 'Train together';
export const TRAIN_TOGETHER_ENDED = 'Training together ended';

export function loggingForLabel(name: string): string {
  return `Logging for ${name}`;
}

export function partnerConflictNotice(name: string): string {
  return `${name}'s workout changed. Your last edit wasn't applied.`;
}

/** Whole seconds until a code expires, never below zero. */
export function inviteSecondsLeft(expiresAt: string | number, now: number): number {
  const at = typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

/** "4:32", "0:07". */
export function inviteCountdownLabel(secondsLeft: number): string {
  const seconds = Math.max(0, Math.floor(secondsLeft));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The pill on a saved workout: "with Sam & Priya", "with You & 1 other", or null. */
export function trainedWithLabel(
  trainedWith: TrainedWith[] | null | undefined,
  trainedWithCount: number | null | undefined,
  viewerId: string | null | undefined,
): string | null {
  const people = trainedWith ?? [];
  const count = Math.max(trainedWithCount ?? 0, people.length);
  if (count === 0) return null;
  const you = people.filter((person) => person.user_id === viewerId);
  const others = people.filter((person) => person.user_id !== viewerId);
  const names = [...you.map(() => 'You'), ...others.map(memberName)];
  const hidden = count - people.length;
  if (hidden > 0) names.push(`${hidden} ${hidden === 1 ? 'other' : 'others'}`);
  return `with ${nameList(names)}`;
}

/**
 * The one-line notice for what changed between two reads of GET /api/train-together, or null.
 * `previous` is null before the first read, which announces nothing, so reopening the app does
 * not repeat a notice. Each change is reported once, by the read that first shows it.
 */
export function trainTogetherNotice(
  previous: TrainTogetherRead | null,
  next: TrainTogetherRead,
): string | null {
  if (!previous) return null;
  const before = previous.session;
  const after = next.session;
  if (after && after.id !== before?.id) {
    // A session new to this reader: they joined it, or someone joined the code they showed.
    const self = after.members.find((member) => member.is_self);
    const since = self ? Date.parse(self.joined_at) : NaN;
    const newer = partners(after).filter((member) => Date.parse(member.joined_at) > since);
    if (newer.length) return `${nameList(newer.map(memberName))} joined`;
    const names = partners(after).map(memberName);
    return names.length ? `Training with ${nameList(names)}` : null;
  }
  if (before && !after) {
    const ended = next.ended?.session_id === before.id ? next.ended : null;
    const byPartner = ended?.by_user_id
      ? partners(before).find((member) => member.user_id === ended.by_user_id)
      : undefined;
    const name = byPartner ? memberName(byPartner) : ended?.by_name;
    if (byPartner && name && ended?.reason === 'finished') return `${name} finished their workout`;
    if (byPartner && name && (ended?.reason === 'left' || ended?.reason === 'discarded'))
      return `${name} left`;
    return TRAIN_TOGETHER_ENDED;
  }
  if (!before || !after) return null;
  const was = new Set(partners(before).map((member) => member.user_id));
  const now = new Set(partners(after).map((member) => member.user_id));
  const joined = partners(after).filter((member) => !was.has(member.user_id));
  if (joined.length) return `${nameList(joined.map(memberName))} joined`;
  const left = partners(before).filter((member) => !now.has(member.user_id));
  if (left.length) return `${nameList(left.map(memberName))} left`;
  return null;
}
