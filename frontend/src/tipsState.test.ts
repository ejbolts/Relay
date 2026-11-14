// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  canShowTip,
  countTipEvent,
  freshTips,
  HOME_TIP_SNOOZE_MS,
  homeTipSnoozed,
  loadTips,
  saveTips,
  TIP_COOLDOWN,
  tipStorageKey,
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
  it('shares a rolling 24-hour limit across surfaces and never repeats a seen tip', () => {
    const state = { ...freshTips(), lastShown: 100, seen: { home: 'seen' as const } };
    expect(canShowTip(state, 'plates', 100 + TIP_COOLDOWN - 1)).toBe(false);
    expect(canShowTip(state, 'plates', 100 + TIP_COOLDOWN)).toBe(true);
    expect(canShowTip(state, 'home', 100 + TIP_COOLDOWN)).toBe(false);
    expect(canShowTip({ ...state, enabled: false }, 'plates', 100 + TIP_COOLDOWN)).toBe(false);
  });
  it('lets the set type tip skip the daily cooldown but not the off switch or a seen status', () => {
    const state = { ...freshTips(), lastShown: 100 };
    expect(canShowTip(state, 'setType', 101)).toBe(true);
    expect(canShowTip({ ...state, enabled: false }, 'setType', 101)).toBe(false);
    expect(canShowTip({ ...state, seen: { setType: 'seen' } }, 'setType', 101)).toBe(false);
  });
  it('snoozes the Home tip slot for ten minutes after it is closed', () => {
    const state = { ...freshTips(), homeDismissedAt: 1000 };
    saveTips('alice', state);
    expect(loadTips('alice').homeDismissedAt).toBe(1000);
    expect(homeTipSnoozed(freshTips(), 1000)).toBe(false);
    expect(homeTipSnoozed(state, 1000 + HOME_TIP_SNOOZE_MS - 1)).toBe(true);
    expect(homeTipSnoozed(state, 1000 + HOME_TIP_SNOOZE_MS)).toBe(false);
    localStorage.setItem(tipStorageKey('a'), JSON.stringify({ homeDismissedAt: 'soon' }));
    expect(loadTips('a').homeDismissedAt).toBeUndefined();
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
