// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HistorySetTable } from './HistorySetTable';
import type { MachinePhoto, PersonalRecord, TrackedSet } from './types';

function set(id: string, values: Partial<TrackedSet> = {}): TrackedSet {
  return {
    id,
    order_index: 0,
    reps: 8,
    weight_kg: 80,
    rpe: 8,
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
    ...values,
  };
}

function record(setId: string, scope: PersonalRecord['scope']): PersonalRecord {
  return { set_id: setId, scope, record_type: 'weight' } as PersonalRecord;
}

function machine(id: string, caption: string): MachinePhoto {
  return { id, caption } as MachinePhoto;
}

function render(props: Partial<Parameters<typeof HistorySetTable>[0]> & { sets: TrackedSet[] }) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <HistorySetTable
      personalRecords={[]}
      formatSet={(item) => `${item.distance_km} km`}
      recordLabel={() => 'Weight PR'}
      {...props}
    />,
  );
  const cells = (row: Element) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent);
  return {
    head: cells(host.querySelector('thead tr')!),
    rows: [...host.querySelectorAll('tbody tr')],
    cells,
  };
}

describe('a saved workout’s sets as a table', () => {
  it('numbers working sets from 1 and puts each lift under Weight, Reps and RPE', () => {
    const { head, rows, cells } = render({
      sets: [
        set('a', { set_type: 'warmup', weight_kg: 40, reps: 12, rpe: 6.5 }),
        set('b', { weight_kg: 80, reps: 8, rpe: 8.5 }),
        set('c', { weight_kg: 82.5, reps: 6, rpe: null }),
      ],
    });
    expect(head).toEqual(['Set', 'Weight', 'Reps', 'RPE']);
    expect(rows.map(cells)).toEqual([
      ['WWarm-up', '40 kg', '12', '6.5'],
      ['1', '80 kg', '8', '8.5'],
      ['2', '82.5 kg', '6', '–'],
    ]);
    expect(rows.map((row) => row.querySelector('[data-rpe]')?.getAttribute('data-rpe'))).toEqual([
      '6.5',
      '8.5',
      undefined,
    ]);
  });

  it('adds the bodyweight ratio as a column only when a set has one', () => {
    const { head, rows, cells } = render({
      bodyweight: 80,
      sets: [set('a', { weight_kg: 100 }), set('b', { weight_kg: 60, bodyweight_kg: 75 })],
    });
    expect(head).toEqual(['Set', 'Weight', 'Reps', 'RPE', '× BW']);
    expect(rows.map((row) => cells(row)[4])).toEqual(['1.25×', '0.80×']);
  });

  it('marks all-time and block records in a last column', () => {
    const { head, rows } = render({
      sets: [set('a'), set('b'), set('c')],
      personalRecords: [record('a', 'all_time'), record('a', 'block'), record('c', 'block')],
    });
    expect(head.at(-1)).toBe('Record');
    const badges = rows.map((row) => row.querySelector('.pr-badge'));
    expect(badges.map((badge) => badge?.textContent ?? null)).toEqual([
      'All-time PR',
      null,
      'Block PR',
    ]);
    expect(badges[0]?.getAttribute('title')).toBe('All-time Weight PR, Block Weight PR');
  });

  it('shows a bodyweight set as BW and a cardio set as one result across Weight and Reps', () => {
    const lifts = render({ sets: [set('a', { weight_kg: 0, reps: 12 })] });
    expect(lifts.cells(lifts.rows[0])).toEqual(['1', 'BW', '12', '8']);

    const cardio = render({
      sets: [set('a', { weight_kg: null, reps: null, distance_km: 4.8, duration_seconds: 1920 })],
    });
    expect(cardio.head).toEqual(['Set', 'Result', 'RPE']);
    expect(cardio.cells(cardio.rows[0])).toEqual(['1', '4.8 km', '8']);
    expect(cardio.rows[0].querySelector('td[colspan="2"]')).not.toBeNull();
  });

  it('puts a set’s machine and note in a row under it', () => {
    const { rows, cells } = render({
      machinePhotos: [machine('m1', 'Hammer Strength'), machine('m2', 'Cable stack')],
      sets: [
        set('a', { machine_photo_id: 'm2', notes: 'Felt heavy' }),
        set('b', { machine_photo_id: null }),
      ],
    });
    expect(rows.map((row) => row.className)).toEqual([
      '',
      'history-set-extra',
      '',
      'history-set-extra',
    ]);
    expect(cells(rows[1])).toEqual(['', 'Cable stackFelt heavy']);
    expect(cells(rows[3])).toEqual(['', 'Machine not assigned']);
  });

  it('keeps the ratio and record columns when the workout asks, except for cardio', () => {
    const lifts = render({ sets: [set('a')], ratioColumn: true, recordColumn: true });
    expect(lifts.head).toEqual(['Set', 'Weight', 'Reps', 'RPE', '× BW', 'Record']);
    expect(lifts.cells(lifts.rows[0])).toEqual(['1', '80 kg', '8', '8', '', '']);

    const cardio = render({
      sets: [set('a', { weight_kg: null, reps: null, distance_km: 4.8 })],
      ratioColumn: true,
      recordColumn: true,
    });
    expect(cardio.head).toEqual(['Set', 'Result', 'RPE']);
  });
});
