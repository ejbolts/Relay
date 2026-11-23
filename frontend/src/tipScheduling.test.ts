import { describe, expect, it } from 'vitest';
import {
  hintMayShow,
  LOG_NUDGE_WINDOW_MS,
  NUDGE_VISIBLE_MS,
  priorityTipWaiting,
  shownTipEnds,
  TIP_REQUEST_MS,
  tipEventRequest,
  waitingNudge,
  type TipEnvironment,
  type TipRequest,
} from './tipScheduling';
import { freshTips, TIP_COOLDOWN, type TipId } from './tipsState';

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
});
