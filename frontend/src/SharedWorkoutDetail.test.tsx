// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SharedSetList, SharedWorkoutSummary } from './SharedWorkoutDetail';
import { sharedSetCount } from './sharedProfileDisplay';
import type { PersonalRecord, TrackedSet, TrackedWorkout } from './types';

let root: Root;
let host: HTMLDivElement;

function set(id: string, order_index: number, weight_kg: number | null, extra = {}): TrackedSet {
  return {
    id,
    order_index,
    reps: 12,
    weight_kg,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    incline_percent: null,
    speed_kph: null,
    bodyweight_kg: null,
    percentile: null,
    warmup: false,
    set_type: 'normal',
    failed: false,
    target_reps: null,
    notes: null,
    completed: true,
    ...extra,
  };
}
const sets = [
  set('warm-1', 0, 50, { set_type: 'warmup' }),
  set('warm-2', 1, 90, { warmup: true, notes: 'Felt stiff' }),
  set('work-1', 2, 170, { rpe: 6.5 }),
  set('work-2', 3, 210, { rpe: 7.5, notes: 'Slow last rep' }),
  set('drop', 4, 105, { set_type: 'drop' }),
  set('skipped', 5, 210, { completed: false }),
];
const record = (set_id: string, scope: PersonalRecord['scope'] = 'all_time') =>
  ({
    id: `pr-${set_id}`,
    set_id,
    workout_id: 'w1',
    scope,
    record_type: 'weight',
  }) as PersonalRecord;
const formatSet = (item: TrackedSet) => `${item.weight_kg} kg × ${item.reps}`;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('puts warm-ups on one line and gives each working set a numbered row with its result', async () => {
  await act(async () =>
    root.render(
      <SharedSetList
        sets={sets}
        personalRecords={[record('work-2')]}
        formatSet={formatSet}
        describeRecord={() => 'All-time Weight PR'}
      />,
    ),
  );

  expect(host.querySelector('.shared-set-warmups')?.textContent).toBe(
    'Warm-up50 kg × 12 · 90 kg × 12',
  );
  const rows = [...host.querySelectorAll('ol > li')];
  expect(rows.map((row) => row.querySelector('.shared-set-number')?.textContent)).toEqual([
    '1',
    '2',
    'D',
  ]);
  expect(rows.map((row) => row.getAttribute('data-set-type'))).toEqual([
    'normal',
    'normal',
    'drop',
  ]);
  expect(rows.map((row) => row.querySelector('.shared-set-result')?.textContent)).toEqual([
    '170 kg × 12',
    '210 kg × 12',
    '105 kg × 12',
  ]);
  expect(rows[0].textContent).toContain('RPE 6.5');
  expect(rows[1].classList).toContain('is-record');
  expect(rows[1].querySelector('.pr-badge')?.textContent).toBe('PR');
  expect(rows[1].querySelector('.pr-badge')?.getAttribute('title')).toBe('All-time Weight PR');
  expect(rows[1].querySelector('.shared-set-detail')?.textContent).toBe('Slow last rep');
  expect(rows[2].querySelector('em')?.textContent).toBe('Drop');
  expect(host.textContent).toContain('Warm-up: Felt stiff');
  expect(host.textContent).not.toContain('skipped');
});

it('labels a block record, and counts working sets apart from warm-ups', async () => {
  await act(async () =>
    root.render(
      <SharedSetList
        sets={sets}
        personalRecords={[record('work-1', 'block')]}
        formatSet={formatSet}
      />,
    ),
  );
  expect(host.querySelector('.pr-badge')?.textContent).toBe('Block PR');
  expect(sharedSetCount(sets)).toBe('3 sets');
  expect(sharedSetCount(sets.slice(0, 1))).toBe('1 warm-up set');
  expect(sharedSetCount(sets.slice(0, 2))).toBe('2 warm-up sets');
});

it('shows the session totals and lists the sets that earned a record', async () => {
  const workout = {
    id: 'w1',
    name: 'Lower body',
    duration_minutes: 95,
    start_time: null,
    end_time: null,
    movements: [{ id: 'm1', exercise: { id: 'leg-press', name: 'Leg Press' }, sets }],
  } as unknown as TrackedWorkout;
  await act(async () =>
    root.render(
      <SharedWorkoutSummary
        workout={workout}
        personalRecords={[
          record('work-2'),
          { ...record('work-2'), id: 'second', record_type: 'reps_at_weight' },
          { ...record('work-1'), id: 'estimate', record_type: 'estimated_1rm' },
          { ...record('work-1'), id: 'other-workout', workout_id: 'w0' },
        ]}
        formatSet={formatSet}
      />,
    ),
  );

  const stats = [...host.querySelectorAll('.shared-session-stats > div')].map(
    (item) => item.textContent,
  );
  expect(stats).toEqual(['Time1h 35min', 'Sets3+2 warm-up', 'Reps60', 'Volume5,820 kg']);
  const records = host.querySelector('.shared-session-records')!;
  expect(records.querySelector('h3')?.textContent).toBe('1 personal record');
  expect([...records.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
    'Leg Press210 kg × 12',
  ]);

  await act(async () =>
    root.render(
      <SharedWorkoutSummary workout={workout} personalRecords={[]} formatSet={formatSet} />,
    ),
  );
  expect(host.querySelector('.shared-session-records')).toBeNull();
});
