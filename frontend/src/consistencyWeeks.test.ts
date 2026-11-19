import { describe, expect, it } from 'vitest';
import { CONSISTENCY_WEEKS, consistencyWeeks } from './consistencyWeeks';

describe('consistencyWeeks', () => {
  it('averages a first week of training over one week, not twelve', () => {
    expect(consistencyWeeks('2026-11-13', '2026-11-19')).toBe(1);
    expect(consistencyWeeks('2026-11-19', '2026-11-19')).toBe(1);
  });

  it('counts each started week since the first workout', () => {
    expect(consistencyWeeks('2026-11-12', '2026-11-19')).toBe(2);
    expect(consistencyWeeks('2026-10-01', '2026-11-19')).toBe(8);
  });

  it('stops at the card’s twelve weeks, and keeps twelve when history is unknown', () => {
    expect(consistencyWeeks('2025-01-01', '2026-11-19')).toBe(CONSISTENCY_WEEKS);
    expect(consistencyWeeks(null, '2026-11-19')).toBe(CONSISTENCY_WEEKS);
    expect(consistencyWeeks(undefined, '2026-11-19')).toBe(CONSISTENCY_WEEKS);
  });

  it('treats a future-dated first workout as this week', () => {
    expect(consistencyWeeks('2026-11-25', '2026-11-19')).toBe(1);
  });
});
