import { describe, expect, it } from 'vitest';
import {
  filterMachines,
  machineDate,
  machineLastUsedLabel,
  machineUsedShort,
  timeSince,
} from './machineHistory';
import type { MachinePhotoUsage } from './types';

function machine(caption: string, exerciseName: string): MachinePhotoUsage {
  return {
    id: caption,
    exercise_id: exerciseName,
    caption,
    thumbnail_url: '',
    full_url: '',
    width: 1,
    height: 1,
    created_at: '2025-01-01T00:00:00Z',
    exercise_name: exerciseName,
    workout_count: 1,
    last_used_date: '2025-10-12',
  };
}

describe('machine history labels', () => {
  it('always shows the year, since a machine may be revisited after a long gap', () => {
    expect(machineDate('2025-10-12')).toBe('12 Oct 2025');
  });

  it.each([
    ['2026-10-16', 'today'],
    ['2026-10-15', 'yesterday'],
    ['2026-10-06', '10 days ago'],
    ['2026-09-30', '2 weeks ago'],
    ['2026-09-16', '1 month ago'],
    ['2026-04-17', '5 months ago'],
    ['2025-10-17', '11 months ago'],
    ['2025-10-16', '1 year ago'],
    ['2024-01-20', '2 years ago'],
  ])('describes %s as %s from 16 Oct 2026', (value, expected) => {
    expect(timeSince(value, '2026-10-16')).toBe(expected);
  });

  it('combines the date and elapsed time, or explains an unused machine', () => {
    expect(machineLastUsedLabel('2025-10-16', '2026-10-16')).toBe(
      'Last used 16 Oct 2025 · 1 year ago',
    );
    expect(machineLastUsedLabel(null, '2026-10-16')).toBe('Not in a saved workout yet');
    expect(machineUsedShort('2026-10-15', '2026-10-16')).toBe('Used yesterday');
    expect(machineUsedShort(null, '2026-10-16')).toBe('Not used yet');
  });
});

describe('filterMachines', () => {
  const machines = [
    machine('Hammer Strength press', 'Leg Press'),
    machine('Cybex press', 'Leg Press'),
    machine('Life Fitness curl', 'Seated Leg Curl'),
  ];

  it('matches every word against the machine name or its exercise', () => {
    expect(filterMachines(machines, '  ').map((item) => item.caption)).toHaveLength(3);
    expect(filterMachines(machines, 'HAMMER').map((item) => item.caption)).toEqual([
      'Hammer Strength press',
    ]);
    expect(filterMachines(machines, 'leg curl').map((item) => item.caption)).toEqual([
      'Life Fitness curl',
    ]);
    expect(filterMachines(machines, 'cybex leg')).toHaveLength(1);
    expect(filterMachines(machines, 'smith')).toEqual([]);
  });
});
