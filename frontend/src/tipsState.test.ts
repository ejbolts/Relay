// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  canShowTip,
  countTipEvent,
  freshTips,
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
