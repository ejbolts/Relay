import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBodyFigure, saveBodyFigure } from './bodyFigurePreference';

describe('body figure preference', () => {
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

  it('defaults to the male outline and ignores an unknown stored value', () => {
    expect(loadBodyFigure('fresh')).toBe('male');
    values.set('gym-logger-body-figure:odd', 'robot');
    expect(loadBodyFigure('odd')).toBe('male');
  });

  it('keeps each account’s choice separately on the device', () => {
    saveBodyFigure('ada', 'female');
    expect(values.get('gym-logger-body-figure:ada')).toBe('female');
    expect(loadBodyFigure('ada')).toBe('female');
    expect(loadBodyFigure('ben')).toBe('male');
  });

  it('remembers the choice for the session when storage is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(loadBodyFigure('cat')).toBe('male');
    saveBodyFigure('cat', 'female');
    expect(loadBodyFigure('cat')).toBe('female');
  });

  it('does not store a choice without a signed-in account', () => {
    saveBodyFigure(null, 'female');
    expect(values.size).toBe(0);
    expect(loadBodyFigure(null)).toBe('male');
  });
});
