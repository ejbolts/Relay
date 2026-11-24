import { describe, expect, it } from 'vitest';
import {
  hintMayShow,
  interruptedNudge,
  LOG_NUDGE_WINDOW_MS,
  NUDGE_MIN_VISIBLE_MS,
  NUDGE_VISIBLE_MS,
  priorityTipWaiting,
  shownTipEnds,
  TIP_REQUEST_MS,
  tipEventRequest,
  waitingNudge,
  type TipEnvironment,
  type TipRequest,
} from './tipScheduling';
import { freshTips, TIP_COOLDOWN, TIP_MAX_SHOWS, tipShown, type TipId } from './tipsState';

const NOW = 10_000_000;
const log: TipEnvironment = { page: 'log', ready: true, resting: false, workoutCount: 5 };
const pending = (entries: [TipId, TipRequest][]) => new Map(entries);

describe('tip scheduling', () => {
  it('asks for a tip once its event reaches the threshold, unless it was seen', () => {
    const first = tipEventRequest(freshTips(), 'menu-delete', 'swipe', 3, 'log', NOW);
    expect(first.request).toBeNull();
    expect(first.state.counts['menu-delete']).toBe(1);
    let state = first.state;
    state = tipEventRequest(state, 'menu-delete', 'swipe', 3, 'log', NOW).state;
    const third = tipEventRequest(state, 'menu-delete', 'swipe', 3, 'log', NOW);
    expect(third.request).toEqual({ until: NOW + TIP_REQUEST_MS, page: 'log' });
    const seen = { ...third.state, seen: { swipe: 'dismissed' as const } };
    expect(tipEventRequest(seen, 'menu-delete', 'swipe', 3, 'log', NOW).request).toBeNull();
  });

  it('shows a logger nudge just after a logged set or while resting', () => {
    const waiting = pending([['swipe', { until: NOW + 1000, page: 'log' }]]);
    expect(waitingNudge(waiting, freshTips(), log, NOW - 1000, NOW)).toBe('swipe');
    expect(waitingNudge(waiting, freshTips(), log, NOW - LOG_NUDGE_WINDOW_MS, NOW)).toBeNull();
    expect(waitingNudge(waiting, freshTips(), { ...log, resting: true }, 0, NOW)).toBe('swipe');
    // Another page, an expired request or tips turned off: nothing.
    expect(waitingNudge(waiting, freshTips(), { ...log, page: 'home' }, NOW, NOW)).toBeNull();
    expect(waitingNudge(waiting, freshTips(), log, NOW, NOW + 2000)).toBeNull();
    expect(waitingNudge(waiting, { ...freshTips(), enabled: false }, log, NOW, NOW)).toBeNull();
  });

  it('keeps ordinary tips for accounts with a saved workout and to one a day', () => {
    const waiting = pending([
      ['swipe', { until: NOW + 1000, page: 'log' }],
      ['setType', { until: NOW + 1000, page: 'log' }],
    ]);
    const fresh = { ...log, workoutCount: 0 };
    // The priority set type tip still shows on a new account.
    expect(waitingNudge(waiting, freshTips(), fresh, NOW, NOW)).toBe('setType');
    const shownToday = { ...freshTips(), lastShown: NOW - 1000 };
    expect(
      waitingNudge(
        pending([['swipe', { until: NOW + 1, page: 'log' }]]),
        shownToday,
        log,
        NOW,
        NOW,
      ),
    ).toBeNull();
    expect(
      waitingNudge(
        pending([['swipe', { until: NOW + TIP_COOLDOWN + 1000, page: 'log' }]]),
        shownToday,
        log,
        NOW + TIP_COOLDOWN,
        NOW + TIP_COOLDOWN,
      ),
    ).toBe('swipe');
    expect(priorityTipWaiting(waiting, freshTips(), 'log', NOW)).toBe(true);
    expect(priorityTipWaiting(waiting, freshTips(), 'home', NOW)).toBe(false);
  });

  it('closes a nudge after a while, when the page changes, or once the set break ends', () => {
    const shown = { page: 'log', at: NOW };
    expect(shownTipEnds('swipe', shown, { ...log, resting: true }, 0, NOW + 1000)).toBe(false);
    expect(shownTipEnds('swipe', shown, { ...log, resting: true }, 0, NOW + NUDGE_VISIBLE_MS)).toBe(
      true,
    );
    expect(shownTipEnds('swipe', shown, log, NOW - LOG_NUDGE_WINDOW_MS, NOW)).toBe(true);
    expect(shownTipEnds('swipe', shown, { ...log, page: 'home' }, NOW, NOW)).toBe(true);
    // A hint beside a control stays while its page does.
    expect(shownTipEnds('machine', shown, log, 0, NOW + NUDGE_VISIBLE_MS)).toBe(false);
  });

  it('shows hints once the account has saved a workout', () => {
    expect(hintMayShow(freshTips(), 'machine', log, NOW)).toBe(true);
    expect(hintMayShow(freshTips(), 'machine', { ...log, workoutCount: 0 }, NOW)).toBe(false);
    expect(hintMayShow({ ...freshTips(), seen: { machine: 'learned' } }, 'machine', log, NOW)).toBe(
      false,
    );
  });

  it('reverts and re-queues a nudge interrupted shortly after appearing, at most once without extending its deadline', () => {
    const deadline = NOW + TIP_REQUEST_MS;
    const request: TipRequest = { page: 'log', until: deadline };
    const before = { ...freshTips(), lastShown: 500 };
    const afterShow = tipShown(before, 'setType', NOW);
    const shown = { id: 'setType' as const, at: NOW, previousLastShown: 500, request };

    const reverted = interruptedNudge(afterShow, shown, NOW + NUDGE_MIN_VISIBLE_MS - 1);
    expect(reverted).not.toBeNull();
    expect(reverted!.state.lastShown).toBe(500);
    expect(reverted!.state.shows?.setType).toBeUndefined();
    expect(reverted!.request).toEqual({ page: 'log', until: deadline, retried: true });

    // A second interruption of the retried request counts as a normal showing (no infinite replay).
    const afterSecondShow = tipShown(reverted!.state, 'setType', NOW + 5000);
    expect(
      interruptedNudge(
        afterSecondShow,
        { id: 'setType', at: NOW + 5000, previousLastShown: 500, request: reverted!.request },
        NOW + 5500,
      ),
    ).toBeNull();

    // An already-expired request is never revived by an interruption.
    expect(
      interruptedNudge(
        tipShown(before, 'setType', deadline - 500),
        { id: 'setType', at: deadline - 500, previousLastShown: 500, request },
        deadline,
      ),
    ).toBeNull();

    // On the final showing (which auto-marks 'seen'), an early interruption also undoes 'seen'.
    const beforeLast = { ...freshTips(), shows: { swipe: TIP_MAX_SHOWS - 1 } };
    const afterLast = tipShown(beforeLast, 'swipe', NOW);
    expect(afterLast.seen.swipe).toBe('seen');
    const revertedLast = interruptedNudge(
      afterLast,
      { id: 'swipe', at: NOW, previousLastShown: 0, request },
      NOW + 500,
    );
    expect(revertedLast!.state.shows?.swipe).toBe(TIP_MAX_SHOWS - 1);
    expect(revertedLast!.state.seen.swipe).toBeUndefined();

    // Once visible long enough, or for a hint, or after explicit dismiss, it is not reverted.
    expect(interruptedNudge(afterShow, shown, NOW + NUDGE_MIN_VISIBLE_MS)).toBeNull();
    expect(
      interruptedNudge({ ...afterShow, seen: { setType: 'dismissed' } }, shown, NOW + 500),
    ).toBeNull();
    expect(
      interruptedNudge(
        tipShown(freshTips(), 'machine', NOW),
        { id: 'machine', at: NOW, previousLastShown: 0, request },
        NOW + 500,
      ),
    ).toBeNull();
  });
});
