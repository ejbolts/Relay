import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeDateLine } from './homeDateLine';

describe('homeDateLine', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads "Tuesday 24 November"', () => {
    expect(homeDateLine('2026-11-24')).toBe('Tuesday 24 November');
  });

  it("doesn't take the comma Android's combined format adds after the weekday", () => {
    const original = Date.prototype.toLocaleDateString;
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
      this: Date,
      locale?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      const combined = original.call(this, locale, options);
      return options?.weekday && options.day ? combined.replace(/^(\w+) /, '$1, ') : combined;
    });
    expect(homeDateLine('2026-11-24')).toBe('Tuesday 24 November');
  });
});
