import { describe, expect, it } from 'vitest';
import {
  bodyGoalKind,
  bodyGoalOn,
  bodyGoalName,
  maintenanceStatus,
  bodyHistoryWithWeightChanges,
  summarizeBodyHistory,
  weightChangeAmount,
} from './bodyMeasurementHistory';

const measurements = [
  { measurement_date: '2026-10-01', weight_kg: 90, body_fat_pct: null },
  { measurement_date: '2026-09-30', weight_kg: 80, body_fat_pct: 12 },
  { measurement_date: '2026-09-28', weight_kg: 70, body_fat_pct: 14 },
  { measurement_date: '2026-09-27', weight_kg: 60, body_fat_pct: 16 },
];

describe('bodyweight history summaries', () => {
  it('groups weeks from Monday through Sunday and keeps the newest week first', () => {
    expect(summarizeBodyHistory(measurements, 'week', 'average')).toEqual([
      {
        start_date: '2026-09-28',
        end_date: '2026-10-04',
        weight_kg: 80,
        body_fat_pct: 13,
        count: 3,
      },
      {
        start_date: '2026-09-21',
        end_date: '2026-09-27',
        weight_kg: 60,
        body_fat_pct: 16,
        count: 1,
      },
    ]);
  });

  it('uses calendar months, median values, and only known body fat readings', () => {
    expect(summarizeBodyHistory(measurements, 'month', 'median')).toEqual([
      {
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        weight_kg: 90,
        body_fat_pct: null,
        count: 1,
      },
      {
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        weight_kg: 70,
        body_fat_pct: 14,
        count: 3,
      },
    ]);
  });
});

describe('bodyweight history changes', () => {
  const goal = (start_date: string, start_weight_kg: number, target_weight_kg: number) => ({
    start_date,
    start_weight_kg,
    target_weight_kg,
  });
  const cut = [goal('2026-01-01', 90, 80)];
  const bulk = [goal('2026-01-01', 80, 90)];
  const dated = (weights: number[], first = '2026-10-20') =>
    weights.map((weight_kg, index) => {
      const day = new Date(`${first}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - index);
      return { measurement_date: day.toISOString().slice(0, 10), weight_kg };
    });
  const byDate = (entry: { measurement_date: string }) => entry.measurement_date;
  const history = dated([82, 83, 82]);
  const down = { direction: 'down', current_kg: 82, previous_kg: 83 } as const;
  const up = { direction: 'up', current_kg: 83, previous_kg: 82 } as const;

  it('marks losses favorably and gains unfavorably for a cutting goal', () => {
    expect(
      bodyHistoryWithWeightChanges(history, cut, byDate).map((entry) => entry.weight_change),
    ).toEqual([
      { ...down, status: 'favorable', goalDirection: 'loss' },
      { ...up, status: 'unfavorable', goalDirection: 'loss' },
      null,
    ]);
  });

  it('reverses the goal status for a bulking goal without reversing arrow direction', () => {
    expect(
      bodyHistoryWithWeightChanges(history, bulk, byDate).map((entry) => entry.weight_change),
    ).toEqual([
      { ...down, status: 'unfavorable', goalDirection: 'gain' },
      { ...up, status: 'favorable', goalDirection: 'gain' },
      null,
    ]);
  });

  it('shows neutral direction before any goal has started', () => {
    for (const goals of [[], [goal('2026-12-01', 90, 80)]]) {
      expect(bodyHistoryWithWeightChanges(history, goals, byDate)[0].weight_change).toEqual({
        ...down,
        status: 'neutral',
        goalDirection: null,
      });
    }
  });

  it('judges each change by the goal in force on the newer row and marks where goals change', () => {
    const cutThenBulk = [goal('2026-09-01', 90, 82), goal('2026-10-18', 82, 86)];
    const rows = bodyHistoryWithWeightChanges(dated([84, 84.5, 84.2, 83.6]), cutThenBulk, byDate);
    // 20 and 19 Oct fall under the bulk, 18 Oct is its first day and 17 Oct is still the cut.
    expect(rows.map((row) => row.weight_change?.status ?? null)).toEqual([
      'unfavorable',
      'favorable',
      'favorable',
      null,
    ]);
    expect(rows.map((row) => row.weight_change?.goalDirection ?? null)).toEqual([
      'gain',
      'gain',
      'gain',
      null,
    ]);
    expect(rows.map((row) => row.goal_change)).toEqual([null, null, cutThenBulk[1], null]);
  });

  it('marks the first goal against earlier check-ins but not below the oldest row', () => {
    const first = [goal('2026-10-19', 84, 80)];
    const rows = bodyHistoryWithWeightChanges(dated([83, 84, 85]), first, byDate);
    expect(rows.map((row) => row.goal_change)).toEqual([null, first[0], null]);
    expect(rows[1].weight_change?.status).toBe('favorable');
    expect(rows[2].weight_change).toBeNull();
    const onlyGoalRows = bodyHistoryWithWeightChanges(dated([83, 84]), cut, byDate);
    expect(onlyGoalRows.map((row) => row.goal_change)).toEqual([null, null]);
  });

  it('uses the latest goal set on the same day', () => {
    const sameDay = [
      { ...goal('2026-10-01', 84, 80), created_at: '2026-10-01T08:00:00Z' },
      { ...goal('2026-10-01', 84, 88), created_at: '2026-10-01T09:00:00Z' },
    ];
    expect(bodyHistoryWithWeightChanges(history, sameDay, byDate)[0].weight_change).toMatchObject({
      status: 'unfavorable',
      goalDirection: 'gain',
    });
  });

  it('rewards moving back towards the target weight for a maintain goal', () => {
    const maintain = [goal('2026-01-01', 83, 83)];
    const rows = bodyHistoryWithWeightChanges(dated([83.2, 83.6, 82.5, 82.5]), maintain, byDate);
    expect(rows.map((row) => row.weight_change?.status ?? null)).toEqual([
      'favorable',
      'unfavorable',
      null,
      null,
    ]);
    expect(rows[0].weight_change?.goalDirection).toBe('maintain');
    // 83.5 and 82.5 kg are equally far from 83 kg, so crossing the target is neutral.
    const crossing = bodyHistoryWithWeightChanges(dated([83.5, 82.5]), maintain, byDate);
    expect(crossing[0].weight_change?.status).toBe('neutral');
  });

  it('treats movement inside the band as neutral and rewards approaching it from either side', () => {
    const band = { ...goal('2026-01-01', 84, 84), maintenance_min_kg: 82, maintenance_max_kg: 86 };
    for (const [current, previous, status] of [
      [82, 86, 'neutral'],
      [84, 82, 'neutral'],
      [86, 87, 'favorable'],
      [82, 81, 'favorable'],
      [81, 82, 'unfavorable'],
      [87, 86, 'unfavorable'],
      [81, 87, 'neutral'],
      [88, 89, 'favorable'],
    ] as const) {
      const [row] = bodyHistoryWithWeightChanges(dated([current, previous]), [band], byDate);
      expect(row.weight_change?.status, `${previous} → ${current}`).toBe(status);
    }
    expect(bodyGoalName(band, 'kg')).toBe('Maintain 82–86 kg');
    expect(bodyGoalName(band, 'lb')).toBe('Maintain 180.78–189.6 lb');
    expect(
      bodyGoalName({ ...band, maintenance_min_kg: 82.01, maintenance_max_kg: 82.02 }, 'kg'),
    ).toBe('Maintain 82.01–82.02 kg');
    expect(maintenanceStatus(band, 82)).toBe('In range');
    expect(maintenanceStatus(band, 86)).toBe('In range');
    expect(maintenanceStatus(band, 81)).toBe('Below range');
    expect(maintenanceStatus(band, 87)).toBe('Above range');
  });

  it('omits arrows for ties, floating-point aggregate noise, missing or invalid comparisons', () => {
    const entries = dated([82, 82, 82 + Number.EPSILON * 82, Number.NaN, 80]);
    expect(
      bodyHistoryWithWeightChanges(entries, cut, byDate).map((entry) => entry.weight_change),
    ).toEqual([null, null, null, null, null]);
    expect(bodyHistoryWithWeightChanges([], cut, byDate)).toEqual([]);
  });

  it('compares adjacent available period statistics rather than individual measurements', () => {
    const entries = [
      { measurement_date: '2026-10-12', weight_kg: 80, body_fat_pct: null },
      { measurement_date: '2026-10-13', weight_kg: 90, body_fat_pct: null },
      { measurement_date: '2026-09-07', weight_kg: 84, body_fat_pct: null },
      { measurement_date: '2026-08-03', weight_kg: 86, body_fat_pct: null },
    ];
    for (const period of ['week', 'month'] as const) {
      for (const statistic of ['average', 'median'] as const) {
        const rows = bodyHistoryWithWeightChanges(
          summarizeBodyHistory(entries, period, statistic),
          cut,
          (summary) => summary.end_date,
        );
        expect(rows.map((row) => row.weight_kg)).toEqual([85, 84, 86]);
        expect(rows.map((row) => row.weight_change?.status ?? null)).toEqual([
          'unfavorable',
          'favorable',
          null,
        ]);
      }
    }
  });

  it('retains the comparison across a page boundary and does not modify source weights', () => {
    const entries = dated(Array.from({ length: 10 }, (_, index) => 80 + index / 10));
    const rows = bodyHistoryWithWeightChanges(entries, cut, byDate);
    expect(rows.slice(0, 8)[7].weight_change).toEqual({
      direction: 'down',
      current_kg: 80.7,
      previous_kg: 80.8,
      status: 'favorable',
      goalDirection: 'loss',
    });
    expect(rows.slice(8)[0].weight_change?.status).toBe('favorable');
    expect(rows.at(-1)?.weight_change).toBeNull();
    expect(entries[0]).toEqual({ measurement_date: '2026-10-20', weight_kg: 80 });
  });
});

describe('bodyweight goal kinds', () => {
  it('treats an unchanged target as maintaining and finds the goal in force on a date', () => {
    expect(bodyGoalKind({ start_weight_kg: 84, target_weight_kg: 84 })).toBe('maintain');
    expect(bodyGoalKind({ start_weight_kg: 84, target_weight_kg: 80 })).toBe('loss');
    expect(bodyGoalKind({ start_weight_kg: 80, target_weight_kg: 84 })).toBe('gain');
    const goals = [
      { start_date: '2026-09-01', start_weight_kg: 90, target_weight_kg: 82 },
      { start_date: '2026-10-17', start_weight_kg: 82, target_weight_kg: 86 },
    ];
    expect(bodyGoalOn(goals, '2026-08-31')).toBeNull();
    expect(bodyGoalOn(goals, '2026-10-16')).toBe(goals[0]);
    expect(bodyGoalOn(goals, '2026-10-17')).toBe(goals[1]);
  });
});

describe('bodyweight change amounts', () => {
  const change = (current_kg: number, previous_kg: number) => ({
    direction: current_kg > previous_kg ? ('up' as const) : ('down' as const),
    current_kg,
    previous_kg,
    status: 'neutral' as const,
    goalDirection: null,
  });

  it('matches the difference between the rounded weights shown in each row', () => {
    // 84.14 and 83.36 kg are shown as 84.1 and 83.4 kg, a 0.7 kg change.
    expect(weightChangeAmount(change(84.14, 83.36), 'kg', 1)).toBe('0.7');
    expect(weightChangeAmount(change(84.15, 83.4), 'kg', 2)).toBe('0.75');
    expect(weightChangeAmount(change(90, 80), 'kg', 1)).toBe('10');
    expect(weightChangeAmount(change(90, 80), 'kg', 1, true)).toBe('10.0');
    expect(weightChangeAmount(change(80.5, 80.3), 'kg', 2)).toBe('0.2');
    expect(weightChangeAmount(change(80, 79), 'lb', 1)).toBe('2.2');
  });

  it('shows the smallest visible step rather than zero for changes hidden by rounding', () => {
    expect(weightChangeAmount(change(80.02, 80.01), 'kg', 1)).toBe('<0.1');
    expect(weightChangeAmount(change(80.004, 80.001), 'kg', 2)).toBe('<0.01');
  });
});
