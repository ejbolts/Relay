import {
  canShowTip,
  countTipEvent,
  isPriorityTip,
  TIP_DEFINITIONS,
  TIP_MAX_SHOWS,
  type TipId,
  type TipState,
} from './tipsState';

/**
 * When contextual tips appear and go, shared by the web's TipsProvider and the app's logger tips.
 * An event (such as a logged warm-up) asks for a nudge, which waits for a quiet moment on the same
 * page; a hint dot shows beside an eligible control that is on screen.
 */

/** Where the app is and whether a tip may show there now. */
export type TipEnvironment = {
  page: string;
  /** Nothing is in the way: no dialog, guide, announcement, toast or loading screen. */
  ready: boolean;
  resting: boolean;
  /** Saved workouts, leaving out sample data. */
  workoutCount: number;
};

/** A nudge an event asked for, waiting to show on `page` until `until`. */
export type TipRequest = { until: number; page: string };

/** A showing nudge's record, so an early interruption can put it back untouched. */
export type ShownNudge = {
  id: TipId;
  at: number;
  previousLastShown: number;
  request: TipRequest;
};

/** How long an event's nudge waits for a quiet moment. */
export const TIP_REQUEST_MS = 120_000;
/** How long the app must be quiet before a tip appears. */
export const TIP_QUIET_MS = 1500;
/** How long a nudge stays up by itself. */
export const NUDGE_VISIBLE_MS = 12_000;
/** How long a nudge must stay visible before an interruption counts as a showing. */
export const NUDGE_MIN_VISIBLE_MS = 3000;
/** In the logger, a nudge shows while resting or this soon after a logged set. */
export const LOG_NUDGE_WINDOW_MS = 20_000;

/**
 * Counts an event. Once it has happened `threshold` times, its tip is asked for (unless that tip
 * was already seen), to show on the current page.
 */
export function tipEventRequest(
  state: TipState,
  name: string,
  tip: TipId | undefined,
  threshold: number,
  page: string,
  now: number,
): { state: TipState; request: TipRequest | null } {
  const next = countTipEvent(state, name);
  return {
    state: next,
    request:
      tip && next.counts[name] >= threshold && !next.seen[tip]
        ? { until: now + TIP_REQUEST_MS, page }
        : null,
  };
}

/** The logger leaves nudges for moments between sets: while resting or just after logging one. */
function betweenSets(environment: TipEnvironment, completedSetAt: number, now: number) {
  return (
    environment.page !== 'log' || environment.resting || now - completedSetAt < LOG_NUDGE_WINDOW_MS
  );
}

/**
 * The showing tip goes when its page changes, and a nudge after a while (in the logger, also once
 * the moment between sets has passed).
 */
export function shownTipEnds(
  id: TipId,
  shown: { page: string; at: number },
  environment: TipEnvironment,
  completedSetAt: number,
  now: number,
): boolean {
  return (
    shown.page !== environment.page ||
    (TIP_DEFINITIONS[id].surface === 'nudge' &&
      (now - shown.at >= NUDGE_VISIBLE_MS ||
        (environment.page === 'log' &&
          !environment.resting &&
          now - completedSetAt >= LOG_NUDGE_WINDOW_MS)))
  );
}

/** A priority nudge is waiting on this page, which replaces an ordinary tip already showing. */
export function priorityTipWaiting(
  pending: ReadonlyMap<TipId, TipRequest>,
  state: TipState,
  page: string,
  now: number,
): boolean {
  return [...pending].some(
    ([id, request]) =>
      isPriorityTip(id) &&
      request.until > now &&
      request.page === page &&
      canShowTip(state, id, now),
  );
}

/**
 * The asked-for nudge to show now, if any. Before a first saved workout only priority tips may
 * appear; the back-swipe tip may show on any page.
 */
export function waitingNudge(
  pending: ReadonlyMap<TipId, TipRequest>,
  state: TipState,
  environment: TipEnvironment,
  completedSetAt: number,
  now: number,
): TipId | null {
  const established = environment.workoutCount > 0;
  const found = [...pending].find(
    ([id, request]) =>
      request.until > now &&
      (established || isPriorityTip(id)) &&
      (id === 'back' || request.page === environment.page) &&
      canShowTip(state, id, now) &&
      betweenSets(environment, completedSetAt, now),
  );
  return found?.[0] ?? null;
}

/** A hint beside a control may show once the account has saved a workout. */
export function hintMayShow(
  state: TipState,
  id: TipId,
  environment: TipEnvironment,
  now: number,
): boolean {
  return environment.workoutCount > 0 && !!canShowTip(state, id, now);
}

/**
 * When a nudge is closed by an interruption (a menu, sheet, prompt, dialog or backgrounding)
 * before the reader could see it, returns the state with that showing and `lastShown` undone and
 * a pending request so it can appear again once things are quiet; otherwise returns null.
 */
export function interruptedNudge(
  state: TipState,
  shown: ShownNudge,
  now: number,
): { state: TipState; request: TipRequest } | null {
  if (TIP_DEFINITIONS[shown.id].surface !== 'nudge') return null;
  if (now - shown.at >= NUDGE_MIN_VISIBLE_MS) return null;
  if (state.seen[shown.id] === 'dismissed' || state.seen[shown.id] === 'learned') return null;
  const currentShows = state.shows?.[shown.id] ?? 0;
  const nextShows = Math.max(0, currentShows - 1);
  const shows = { ...state.shows };
  if (nextShows > 0) shows[shown.id] = nextShows;
  else delete shows[shown.id];
  const seen = { ...state.seen };
  if (seen[shown.id] === 'seen' && currentShows >= TIP_MAX_SHOWS && nextShows < TIP_MAX_SHOWS) {
    delete seen[shown.id];
  }
  const lastShown = state.lastShown === shown.at ? shown.previousLastShown : state.lastShown;
  return {
    state: { ...state, lastShown, shows, seen },
    request: {
      page: shown.request.page,
      until: Math.max(shown.request.until, now + TIP_REQUEST_MS),
    },
  };
}
