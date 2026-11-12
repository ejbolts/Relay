import { describe, expect, it } from 'vitest';
import { dayRing, workoutTypeColor } from './dayColors';
import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from './workoutTypes';

describe('dayRing', () => {
  it('uses one flat colour for a single workout type', () => {
    expect(dayRing(['#8b5cf6'])).toBe('#8b5cf6');
    expect(dayRing([])).toBe('');
  });

  it('splits a mixed day into equal arcs', () => {
    expect(dayRing(['#8b5cf6', '#22c55e'])).toBe(
      'conic-gradient(from -45deg, #8b5cf6 0deg 180deg, #22c55e 180deg 360deg)',
    );
    expect(dayRing(['#111111', '#222222', '#333333'])).toContain('#333333 240deg 360deg');
  });
});

describe('workoutTypeColor', () => {
  it('reads built-in types from the palette and custom types from themselves', () => {
    const palette = { ...builtinTypeColors(DEFAULT_WORKOUT_TYPES), upper: '#101010' };
    expect(workoutTypeColor(DEFAULT_WORKOUT_TYPES[0], palette)).toBe('#101010');
    expect(workoutTypeColor(DEFAULT_WORKOUT_TYPES[0])).toBe('#8b5cf6');
    expect(
      workoutTypeColor(
        { id: 'climb', name: 'Climbing', color: '#abcdef', is_custom: true, archived: false },
        palette,
      ),
    ).toBe('#abcdef');
  });
});
