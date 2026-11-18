import { describe, expect, it } from 'vitest';
import { nextSetAfterRest, restOvertimeLabel } from './restComplete';

const set = (key: string, completed: boolean, extra: Record<string, unknown> = {}) => ({
  key,
  completed,
  weight_kg: 80,
  reps: 8,
  set_type: 'normal' as const,
  warmup: false,
  failed: false,
  ...extra,
});

const movement = (key: string, name: string, sets: ReturnType<typeof set>[]) => ({
  key,
  exercise: { name, kind: 'strength' },
  sets,
});

describe('nextSetAfterRest', () => {
  it('names the next open set of the exercise that started the rest, numbering working sets', () => {
    const movements = [
      movement('bench', 'Bench press', [
        set('w', true, { set_type: 'warmup', warmup: true }),
        set('1', true),
        set('2', false, { weight_kg: 82.5, reps: 6 }),
      ]),
      movement('row', 'Cable row', [set('r1', false)]),
    ];
    expect(nextSetAfterRest(movements, 'bench')).toEqual({
      movementKey: 'bench',
      setKey: '2',
      exercise: 'Bench press',
      set: 'Set 2',
      target: '82.5 kg × 6',
    });
  });

  it('moves on to later exercises, then wraps round to earlier ones', () => {
    const movements = [
      movement('a', 'Squat', [set('a1', false)]),
      movement('b', 'Leg press', [set('b1', true)]),
      movement('c', 'Leg curl', [set('c1', false, { set_type: 'warmup', warmup: true })]),
    ];
    expect(nextSetAfterRest(movements, 'b')).toMatchObject({ setKey: 'c1', set: 'Warm-up' });
    movements[2].sets[0].completed = true;
    expect(nextSetAfterRest(movements, 'b')).toMatchObject({ setKey: 'a1', set: 'Set 1' });
  });

  it('leaves out an empty target and returns null once everything is logged', () => {
    const empty = [movement('a', 'Dips', [set('a1', false, { weight_kg: null, reps: null })])];
    expect(nextSetAfterRest(empty, null)?.target).toBeNull();
    expect(nextSetAfterRest([movement('a', 'Dips', [set('a1', true)])], 'a')).toBeNull();
  });
});

describe('restOvertimeLabel', () => {
  it('counts minutes and seconds since the rest ended, never below zero', () => {
    expect(restOvertimeLabel(10_000, 10_500)).toBe('+0:00');
    expect(restOvertimeLabel(0, 72_000)).toBe('+1:12');
    expect(restOvertimeLabel(5_000, 1_000)).toBe('+0:00');
  });
});
