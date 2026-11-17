import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  restTimerPreferenceEnabled,
  saveRestTimerPreference,
  restTimesPreferenceEnabled,
  saveRestTimesPreference,
} from './restTimerPreference';

describe('rest timer preference', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults to enabled', () => {
    expect(restTimerPreferenceEnabled()).toBe(true);
  });

  it('persists disabled and enabled choices', () => {
    saveRestTimerPreference(false);
    expect(restTimerPreferenceEnabled()).toBe(false);

    saveRestTimerPreference(true);
    expect(restTimerPreferenceEnabled()).toBe(true);
  });

  it('persists rest visibility independently of the countdown', () => {
    expect(restTimesPreferenceEnabled()).toBe(true);
    saveRestTimesPreference(false);
    expect(restTimesPreferenceEnabled()).toBe(false);
    expect(restTimerPreferenceEnabled()).toBe(true);
    saveRestTimerPreference(false);
    saveRestTimesPreference(true);
    expect(restTimesPreferenceEnabled()).toBe(true);
    expect(restTimerPreferenceEnabled()).toBe(false);
  });
});
