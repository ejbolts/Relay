// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  BAR_TYPES,
  PLATES,
  barTypeForExercise,
  loadPlates,
  saveBar,
  savedBar,
} from './plateLoading';

afterEach(() => localStorage.clear());

describe('plate loading', () => {
  it('uses 25 to 2.5 kg plates and 45 to 2.5 lb plates, heaviest first', () => {
    expect(PLATES.kg.map((plate) => plate.weight)).toEqual([25, 20, 15, 10, 5, 2.5]);
    expect(PLATES.lb.map((plate) => plate.weight)).toEqual([45, 35, 25, 10, 5, 2.5]);
  });

  it('uses standard bar weights in each unit', () => {
    expect(BAR_TYPES.olympic.weight).toEqual({ kg: 20, lb: 45 });
    expect(BAR_TYPES.ez.weight).toEqual({ kg: 10, lb: 25 });
    expect(BAR_TYPES.trap.weight).toEqual({ kg: 25, lb: 55 });
  });

  it('fills each side heaviest plate first', () => {
    expect(loadPlates(100, 20, 'kg')).toEqual({ perSide: [25, 15], total: 100, shortPerSide: 0 });
    expect(loadPlates(175, 20, 'kg').perSide).toEqual([25, 25, 25, 2.5]);
    expect(loadPlates(225, 45, 'lb')).toEqual({ perSide: [45, 45], total: 225, shortPerSide: 0 });
    expect(loadPlates(185, 45, 'lb').perSide).toEqual([45, 25]);
    expect(loadPlates(135, 55, 'lb').perSide).toEqual([35, 5]);
  });

  it('reports what cannot be loaded and never goes over the target', () => {
    expect(loadPlates(67.5, 20, 'kg')).toEqual({
      perSide: [20, 2.5],
      total: 65,
      shortPerSide: 1.25,
    });
    expect(loadPlates(15, 20, 'kg')).toEqual({ perSide: [], total: 20, shortPerSide: 0 });
    expect(loadPlates(22.5, 10, 'kg')).toEqual({ perSide: [5], total: 20, shortPerSide: 1.25 });
  });

  it.each([
    [{ name: 'Barbell Bench Press', equipment: 'Barbell' }, 'olympic'],
    [{ name: 'Bench Press (Barbell)', equipment: null }, 'olympic'],
    [{ name: 'EZ Bar Biceps Curl', equipment: null }, 'ez'],
    [{ name: 'Skullcrusher', equipment: 'EZ curl bar' }, 'ez'],
    [{ name: 'Trap Bar Deadlift', equipment: null }, 'trap'],
    [{ name: 'Deadlift (Trap bar)', equipment: 'Barbell' }, 'trap'],
    [{ name: 'Hex bar shrug', equipment: null }, 'trap'],
    [{ name: 'Squat (Smith Machine)', equipment: 'Barbell' }, null],
    [{ name: 'Hammer Curl', equipment: 'Dumbbell' }, null],
    [{ name: 'Leg Press', equipment: 'Machine' }, null],
  ] as const)('recognises the bar for %o', (exercise, bar) => {
    expect(barTypeForExercise(exercise)).toBe(bar);
  });

  it('remembers the bar per exercise, falling back to the usual weight in another unit', () => {
    expect(savedBar('bench', 'olympic', 'kg')).toEqual({ type: 'olympic', weight: 20 });
    saveBar('curl', { type: 'ez', weight: 12, unit: 'kg' });
    expect(savedBar('curl', 'olympic', 'kg')).toEqual({ type: 'ez', weight: 12 });
    expect(savedBar('curl', 'olympic', 'lb')).toEqual({ type: 'ez', weight: 25 });
    localStorage.setItem('gym-plate-calculator-bars', 'not json');
    expect(savedBar('curl', 'trap', 'lb')).toEqual({ type: 'trap', weight: 55 });
  });
});
