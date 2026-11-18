// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyTipReminders,
  canShowTip,
  countTipEvent,
  freshTips,
  loadTips,
  saveTips,
  scheduleTipReminders,
  TIP_COOLDOWN,
  tipAction,
  tipShown,
  tipStorageKey,
  withTipReminders,
  type TipState,
} from './tipsState';
beforeEach(() => localStorage.clear());
describe('tip persistence and allowance', () => {
  it('isolates settings, learning and counters by account', () => {
    const state = countTipEvent(
      { ...freshTips(), enabled: false, seen: { plates: 'learned' } },
      'menu-delete',
    );
    saveTips('alice', state);
    expect(loadTips('alice')).toEqual(state);
    expect(loadTips('bob')).toEqual(freshTips());
  });
  it('shares a rolling 24-hour limit across interrupting tips and never repeats a seen tip', () => {
    const state = { ...freshTips(), lastShown: 100, seen: { home: 'seen' as const } };
    expect(canShowTip(state, 'swap', 100 + TIP_COOLDOWN - 1)).toBe(false);
    expect(canShowTip(state, 'swap', 100 + TIP_COOLDOWN)).toBe(true);
    expect(canShowTip(state, 'home', 100 + TIP_COOLDOWN)).toBe(false);
    expect(canShowTip({ ...state, enabled: false }, 'swap', 100 + TIP_COOLDOWN)).toBe(false);
  });
  it('lets a quiet dot appear inside the cooldown without spending it', () => {
    const state = { ...freshTips(), lastShown: 100 };
    expect(canShowTip(state, 'plates', 101)).toBe(true);
    expect(tipShown(state, 'plates', 5000).lastShown).toBe(100);
    expect(tipShown(state, 'swap', 5000).lastShown).toBe(5000);
    expect(canShowTip({ ...state, seen: { plates: 'seen' } }, 'plates', 101)).toBe(false);
  });
  it('gives an untouched tip three showings before it counts as seen', () => {
    let state = tipShown(tipShown(freshTips(), 'swap', 1), 'swap', 2);
    expect(state.seen.swap).toBeUndefined();
    expect(state.shows?.swap).toBe(2);
    state = tipShown(state, 'swap', 3);
    expect(state.seen.swap).toBe('seen');
  });
  it('offers a button only on tips that have somewhere to go', () => {
    expect(tipAction('normalise')).toEqual({
      label: 'Open Machine weights',
      target: 'machine-weights',
    });
    expect(tipAction('swipe')).toBeNull();
  });
  it('lets the set type tip skip the daily cooldown but not the off switch or a seen status', () => {
    const state = { ...freshTips(), lastShown: 100 };
    expect(canShowTip(state, 'setType', 101)).toBe(true);
    expect(canShowTip({ ...state, enabled: false }, 'setType', 101)).toBe(false);
    expect(canShowTip({ ...state, seen: { setType: 'seen' } }, 'setType', 101)).toBe(false);
  });
  it('remembers which Home tips were read, ignoring unknown or repeated ids', () => {
    saveTips('alice', { ...freshTips(), homeRead: ['home', 'friends'] });
    expect(loadTips('alice').homeRead).toEqual(['home', 'friends']);
    localStorage.setItem(
      tipStorageKey('a'),
      JSON.stringify({ homeRead: ['home', 'unknown', 'home', 3], homeDismissedAt: 1000 }),
    );
    expect(loadTips('a')).toEqual({ ...freshTips(), homeRead: ['home'] });
    localStorage.setItem(tipStorageKey('b'), JSON.stringify({ homeRead: 'home' }));
    expect(loadTips('b').homeRead).toBeUndefined();
  });
  it('keeps tips put away on Home and showing counts, ignoring unknown ids', () => {
    saveTips('alice', { ...freshTips(), homeDone: ['blocks'], shows: { swap: 2 } });
    expect(loadTips('alice')).toMatchObject({ homeDone: ['blocks'], shows: { swap: 2 } });
    localStorage.setItem(
      tipStorageKey('a'),
      JSON.stringify({ homeDone: ['blocks', 'nope'], shows: { swap: 1, nope: 4, home: -1 } }),
    );
    expect(loadTips('a')).toEqual({ ...freshTips(), homeDone: ['blocks'], shows: { swap: 1 } });
  });
  it('recovers from malformed and partially invalid storage', () => {
    localStorage.setItem(tipStorageKey('a'), '{');
    expect(loadTips('a')).toEqual(freshTips());
    localStorage.setItem(
      tipStorageKey('a'),
      JSON.stringify({
        enabled: false,
        seen: { unknown: 'learned', home: 'learned', plates: 'invalid' },
        counts: { valid: 3, bad: -1 },
      }),
    );
    expect(loadTips('a')).toEqual({
      ...freshTips(),
      enabled: false,
      seen: { home: 'learned' },
      counts: { valid: 3 },
    });
  });
});

const DAY = 24 * 60 * 60 * 1000;
describe('reminders for guided tips', () => {
  it('schedules a guided tip put away before its feature is used to come back in a week', () => {
    const put = {
      ...freshTips(),
      homeDone: ['normalise' as const],
      seen: { home: 'seen' as const },
    };
    const scheduled = scheduleTipReminders(put, 1000);
    expect(scheduled.reminders).toEqual({ normalise: { count: 0, at: 1000 + 7 * DAY } });
    // Ordinary tips do not come back, and a waiting reminder keeps its date.
    expect(scheduleTipReminders(scheduled, 5 * DAY)).toBe(scheduled);
    // Nothing is scheduled once the feature is in use.
    const learned = { ...freshTips(), seen: { blocks: 'learned' as const } };
    expect(scheduleTipReminders(learned, 1000)).toBe(learned);
    // Opening the guide, dismissing and Got it all count as putting the tip away.
    expect(
      Object.keys(
        scheduleTipReminders(
          { ...freshTips(), seen: { split: 'seen', repRange: 'dismissed' } },
          1000,
        ).reminders ?? {},
      ),
    ).toEqual(['split', 'repRange']);
  });

  it('brings the tip back unread when due, at 7, 14 and 28 days, then stops', () => {
    let state: TipState = {
      ...freshTips(),
      seen: { blocks: 'seen' },
      homeRead: ['blocks', 'home'],
      homeDone: ['blocks'],
      shows: { blocks: 3 },
    };
    let now = 0;
    const gaps: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      state = withTipReminders(state, now);
      const at = state.reminders?.blocks?.at;
      if (at === undefined) break;
      gaps.push((at - now) / DAY);
      // Not due a moment early.
      expect(applyTipReminders(state, at - 1)).toBe(state);
      now = at;
      state = withTipReminders(state, now);
      expect(state.seen.blocks).toBeUndefined();
      expect(state.homeDone).toEqual([]);
      expect(state.homeRead).toEqual(['home']);
      expect(state.shows?.blocks).toBeUndefined();
      // Put away again.
      state = { ...state, homeDone: ['blocks'] };
    }
    expect(gaps).toEqual([7, 14, 28]);
    expect(state.reminders?.blocks).toEqual({ count: 3 });
  });

  it('does not bring a tip back once its feature is in use', () => {
    const state = withTipReminders({ ...freshTips(), homeDone: ['normalise'] }, 0);
    const used = { ...state, seen: { normalise: 'learned' as const } };
    expect(applyTipReminders(used, 30 * DAY)).toBe(used);
  });

  it('keeps reminders in storage, ignoring unknown or ordinary tips and bad values', () => {
    localStorage.setItem(
      tipStorageKey('alice'),
      JSON.stringify({
        reminders: {
          normalise: { count: 1, at: 5 },
          split: { count: 2 },
          home: { count: 0, at: 5 },
          gone: { count: 0, at: 5 },
          blocks: { count: -1, at: 5 },
          repRange: { count: 1, at: 'soon' },
        },
      }),
    );
    expect(loadTips('alice').reminders).toEqual({
      normalise: { count: 1, at: 5 },
      split: { count: 2 },
      repRange: { count: 1 },
    });
  });
});
