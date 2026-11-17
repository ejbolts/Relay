import { describe, expect, it } from 'vitest';
import { dayRing, workoutTypeColor } from './dayColors';
import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from './workoutTypes';

describe('dayRing', () => {
  it('uses one flat colour for a single workout type', () => {
    expect(dayRing(['#8b5cf6'])).toBe('#8b5cf6');
    expect(dayRing([])).toBe('');
  });

  it('splits a mixed day into equal arcs with clear gaps between them', () => {
    expect(dayRing(['#8b5cf6', '#22c55e'])).toBe(
      'conic-gradient(from -45deg, transparent 0deg 5deg, #8b5cf6 5deg 175deg, ' +
        'transparent 175deg 180deg, transparent 180deg 185deg, #22c55e 185deg 355deg, ' +
        'transparent 355deg 360deg)',
    );
    expect(dayRing(['#111111', '#222222', '#333333'])).toContain('#333333 245deg 355deg');
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
