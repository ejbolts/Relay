import { describe, expect, it } from 'vitest';
import {
  acknowledgedBodyMeasurements,
  bodyMeasurementDate,
  bodyMeasurementInputError,
  bodyMeasurementQueueStatus,
  bodyMeasurementSendRefused,
  nextBodyMeasurementChange,
  overlayBodyMeasurements,
  parseBodyMeasurementQueue,
  withBodyMeasurementChange,
  withRefusedBodyMeasurementChange,
  withRetriedBodyMeasurementChanges,
  withoutBodyMeasurementChange,
  type BodyMeasurementChange,
} from './bodyMeasurementQueue';
import type { BodyMeasurement } from './types';

const row = (date: string, weight: number): BodyMeasurement => ({
  id: `server-${date}`,
  measurement_date: date,
  weight_kg: weight,
  body_fat_pct: null,
  notes: null,
  created_at: `${date}T07:00:00Z`,
  is_sample: false,
});
const change = (date: string, weight: number | null, token = date): BodyMeasurementChange => ({
  token,
  date,
  createdAt: `${date}T08:00:00Z`,
  payload:
    weight === null
      ? null
      : { measurement_date: date, weight_kg: weight, body_fat_pct: null, notes: null },
});

describe('body measurement queue', () => {
  it('overlays saves and deletions by day, newest first', () => {
    const rows = [row('2026-11-01', 80), row('2026-11-02', 81)];
    const shown = overlayBodyMeasurements(rows, [
      change('2026-11-02', 82),
      change('2026-11-01', null),
      change('2026-11-03', 83),
    ]);
    expect(shown.map((item) => [item.id, item.weight_kg])).toEqual([
      ['local-body:2026-11-03', 83],
      ['server-2026-11-02', 82],
    ]);
  });

  it('keeps one change per day and drops only the acknowledged one', () => {
    let queue = withBodyMeasurementChange({ owner: 'a', changes: [] }, change('2026-11-01', 80));
    queue = withBodyMeasurementChange(queue, change('2026-11-01', 81, 'newer'));
    expect(queue.changes.map((item) => item.token)).toEqual(['newer']);
    expect(withoutBodyMeasurementChange(queue, '2026-11-01').changes).toHaveLength(1);
    expect(withoutBodyMeasurementChange(queue, 'newer').changes).toHaveLength(0);
  });

  it('ignores another account’s queue and rejects unreadable ones', () => {
    const raw = JSON.stringify({ owner: 'b', changes: [change('2026-11-01', 80)] });
    expect(parseBodyMeasurementQueue(raw, 'a').changes).toEqual([]);
    expect(parseBodyMeasurementQueue(raw, 'b').changes).toHaveLength(1);
    expect(() => parseBodyMeasurementQueue('{}', 'a')).toThrow();
  });

  it('holds refused changes for a retry without blocking the rest', () => {
    let queue = {
      owner: 'a',
      changes: [change('2026-11-01', 80), change('2026-11-02', 81)],
    };
    queue = withRefusedBodyMeasurementChange(queue, '2026-11-01', 'Too heavy');
    expect(nextBodyMeasurementChange(queue)?.date).toBe('2026-11-02');
    expect(bodyMeasurementQueueStatus(queue)).toEqual({ pending: 2, error: 'Too heavy' });
    expect(bodyMeasurementQueueStatus(withRetriedBodyMeasurementChanges(queue)).error).toBeNull();
  });

  it('marks only real refusals', () => {
    expect([undefined, 401, 408, 426, 429, 500].map(bodyMeasurementSendRefused)).toEqual(
      Array(6).fill(false),
    );
    expect([400, 404, 422].map(bodyMeasurementSendRefused)).toEqual([true, true, true]);
  });

  it('finds the day of a check-in and applies acknowledgements', () => {
    const rows = [row('2026-11-01', 80)];
    expect(bodyMeasurementDate('local-body:2026-11-05', rows)).toBe('2026-11-05');
    expect(bodyMeasurementDate('server-2026-11-01', rows)).toBe('2026-11-01');
    expect(bodyMeasurementDate('missing', rows)).toBeNull();
    expect(acknowledgedBodyMeasurements(rows, { date: '2026-11-01' }, null)).toEqual([]);
    expect(
      acknowledgedBodyMeasurements(rows, { date: '2026-11-01' }, row('2026-11-01', 79))[0]
        .weight_kg,
    ).toBe(79);
  });

  it('validates check-ins', () => {
    const valid = { measurement_date: '2026-11-01', weight_kg: 80, body_fat_pct: 20, notes: null };
    expect(bodyMeasurementInputError(valid)).toBeNull();
    expect(bodyMeasurementInputError({ ...valid, measurement_date: '2026-02-30' })).not.toBeNull();
    expect(bodyMeasurementInputError({ ...valid, weight_kg: 0 })).not.toBeNull();
    expect(bodyMeasurementInputError({ ...valid, body_fat_pct: 80 })).not.toBeNull();
  });
});
