import { describe, expect, it } from 'vitest';
import { serverHasCheckIn } from './checkInSync';
import { syncRetryDelay } from './syncBackoff';
import { TRAINING_READS, readsToRequest, unansweredRefresh } from './trainingRefreshRetry';

const values = { measurement_date: '2026-11-24', weight_kg: 84.2, body_fat_pct: 18.5, notes: 'AM' };
const row = { ...values, is_sample: false };
const save = { date: values.measurement_date, payload: values };

describe('a check-in the server already holds', () => {
  it('matches a save whose values the server has on that date', () => {
    expect(serverHasCheckIn(save, [{ ...row, measurement_date: '2026-11-23' }, row])).toBe(true);
  });

  it('compares notes the way the server stores them: trimmed, and empty as none', () => {
    expect(serverHasCheckIn({ ...save, payload: { ...values, notes: ' AM ' } }, [row])).toBe(true);
    expect(
      serverHasCheckIn({ ...save, payload: { ...values, notes: '  ' } }, [{ ...row, notes: null }]),
    ).toBe(true);
  });

  it.each([
    ['no check-in on that date', [{ ...row, measurement_date: '2026-11-23' }]],
    ['another weight', [{ ...row, weight_kg: 84.3 }]],
    ['another body fat', [{ ...row, body_fat_pct: null }]],
    ['other notes', [{ ...row, notes: 'PM' }]],
    // Saving over a sample check-in makes it the person's own.
    ['a sample check-in', [{ ...row, is_sample: true }]],
  ])('still sends a save when the server has %s', (_case, rows) => {
    expect(serverHasCheckIn(save, rows)).toBe(false);
  });

  it('treats a removal as done once the date has no check-in', () => {
    const removal = { date: values.measurement_date, payload: null };
    expect(serverHasCheckIn(removal, [])).toBe(true);
    expect(serverHasCheckIn(removal, [{ ...row, measurement_date: '2026-11-23' }])).toBe(true);
    expect(serverHasCheckIn(removal, [row])).toBe(false);
  });
});

describe('waiting after unanswered attempts', () => {
  it('retries once with the next check, then waits longer each time up to a minute', () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(syncRetryDelay)).toEqual([
      0, 0, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });
});

describe('a refresh the server did not fully answer', () => {
  const target = { revision: 'rev-2', date: '2026-11-24', windowStart: '2026-08-01' };

  it('asks for every read when nothing is owed', () => {
    expect(readsToRequest(null, target)).toEqual(TRAINING_READS);
  });

  it('asks again only for the reads still owed at the same revision, day and window', () => {
    const owed = unansweredRefresh(null, target, ['dashboard', 'records'], 1_000);
    expect(readsToRequest(owed, target)).toEqual(['dashboard', 'records']);
  });

  it.each([
    ['revision', { revision: 'rev-3' }],
    ['day', { date: '2026-11-25' }],
    ['history window', { windowStart: '2026-05-01' }],
  ])('asks for every read once the %s changed', (_case, change) => {
    const owed = unansweredRefresh(null, target, ['dashboard'], 1_000);
    expect(readsToRequest(owed, { ...target, ...change })).toEqual(TRAINING_READS);
  });

  it('asks for every read when the server never reported a revision', () => {
    const unknown = { ...target, revision: null };
    const owed = unansweredRefresh(null, unknown, ['dashboard'], 1_000);
    expect(readsToRequest(owed, unknown)).toEqual(TRAINING_READS);
  });

  it('pauses timed checks for longer after each unanswered refresh, whatever it was for', () => {
    const first = unansweredRefresh(null, target, ['dashboard'], 1_000);
    const second = unansweredRefresh(first, target, ['dashboard'], 6_000);
    const third = unansweredRefresh(second, { ...target, revision: 'rev-3' }, ['records'], 30_000);
    expect([first, second, third].map((refresh) => [refresh.attempts, refresh.retryAt])).toEqual([
      [1, 1_000],
      [2, 21_000],
      [3, 60_000],
    ]);
    expect(third).toMatchObject({ revision: 'rev-3', reads: ['records'] });
  });
});
