import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BODY_TREND_PREFERENCE,
  loadBodyTrendPreference,
  saveBodyTrendPreference,
} from './bodyTrendPreference';

describe('bodyweight trend preference', () => {
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

  it('defaults to the 30-day average', () => {
    expect(loadBodyTrendPreference()).toEqual(DEFAULT_BODY_TREND_PREFERENCE);
  });

  it('persists a selected duration and statistic', () => {
    saveBodyTrendPreference({ duration: '6m', statistic: 'median' });
    expect(loadBodyTrendPreference()).toEqual({ duration: '6m', statistic: 'median' });
  });

  it('falls back safely when stored values are invalid', () => {
    values.set('gym-logger-body-trend', '{"duration":"forever","statistic":"mode"}');
    expect(loadBodyTrendPreference()).toEqual(DEFAULT_BODY_TREND_PREFERENCE);
  });
});
