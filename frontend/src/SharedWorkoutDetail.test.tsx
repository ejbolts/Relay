// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SharedSetList } from './SharedWorkoutDetail';
import { sharedSetCount } from './sharedProfileDisplay';
import type { PersonalRecord, TrackedSet } from './types';

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

it('lists every set in order, with W and D in the circle instead of a word', async () => {
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

  const rows = [...host.querySelectorAll('ol > li')];
  const numbers = rows.map((row) => row.querySelector('.shared-set-number'));
  expect(numbers.map((item) => item?.textContent)).toEqual(['W', 'W', '1', '2', 'D']);
  expect(numbers.map((item) => item?.getAttribute('aria-label'))).toEqual([
    'Warm-up',
    'Warm-up',
    'Set 1',
    'Set 2',
    'Drop set',
  ]);
  expect(rows.map((row) => row.getAttribute('data-set-type'))).toEqual([
    'warmup',
    'warmup',
    'normal',
    'normal',
    'drop',
  ]);
  expect(rows.map((row) => row.querySelector('.shared-set-result')?.textContent)).toEqual([
    '50 kg × 12',
    '90 kg × 12',
    '170 kg × 12',
    '210 kg × 12',
    '105 kg × 12',
  ]);
  expect(rows[2].textContent).toContain('RPE 6.5');
  expect(rows[3].classList).toContain('is-record');
  expect(rows[3].querySelector('.pr-badge')?.textContent).toBe('PR');
  expect(rows[3].querySelector('.pr-badge')?.classList.contains('is-all-time')).toBe(true);
  expect(rows[3].querySelector('.pr-badge')?.getAttribute('title')).toBe('All-time Weight PR');
  expect(rows[3].querySelector('.shared-set-detail')?.textContent).toBe('Slow last rep');
  expect(rows[1].querySelector('.shared-set-detail')?.textContent).toBe('Felt stiff');
  // The type is in the circle only; no Warm-up, Drop or Attempted word beside the result.
  expect(host.textContent).not.toMatch(/Warm-up|Drop|Attempted/);
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
  expect(host.querySelector('.pr-badge')?.classList.contains('is-all-time')).toBe(false);
  expect(sharedSetCount(sets)).toBe('3 sets');
  expect(sharedSetCount(sets.slice(0, 1))).toBe('1 warm-up set');
  expect(sharedSetCount(sets.slice(0, 2))).toBe('2 warm-up sets');
});
