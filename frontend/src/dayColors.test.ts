import { describe, expect, it } from 'vitest';
import { dayFill, readableInk, workoutTypeColor } from './dayColors';
import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from './workoutTypes';

describe('readableInk', () => {
  it('puts black on light fills and white on dark ones', () => {
    expect(readableInk(['#f59e0b'])).toBe('#000000');
    expect(readableInk(['#5ccdf5'])).toBe('#000000');
    expect(readableInk(['#fff'])).toBe('#000000');
    expect(readableInk(['#1e3a8a'])).toBe('#ffffff');
    expect(readableInk(['#7f1d1d'])).toBe('#ffffff');
    expect(readableInk(['#000000'])).toBe('#ffffff');
  });

  it('picks the ink with the higher contrast ratio for mid-tone fills', () => {
    // Violet reads 5.0:1 with black against 4.2:1 with white.
    expect(readableInk(['#8b5cf6'])).toBe('#000000');
    // A deeper violet flips: 7.1:1 with white against 3.0:1 with black.
    expect(readableInk(['#6d28d9'])).toBe('#ffffff');
  });

  it('keeps a split day readable on its weakest colour', () => {
    // White would vanish on the yellow half; black still reads on the mid blue.
    expect(readableInk(['#3b82f6', '#fde047'])).toBe('#000000');
    expect(readableInk(['#1e3a8a', '#7f1d1d'])).toBe('#ffffff');
  });

  it('falls back to white when no fill can be read', () => {
    expect(readableInk([])).toBe('#ffffff');
    expect(readableInk(['var(--p-good)', 'teal'])).toBe('#ffffff');
    // An unreadable colour is ignored rather than deciding the result.
    expect(readableInk(['teal', '#fde047'])).toBe('#000000');
  });
});

describe('dayFill', () => {
  it('uses one flat colour for a single workout type', () => {
    expect(dayFill(['#8b5cf6'])).toBe('#8b5cf6');
    expect(dayFill([])).toBe('');
  });

  it('splits a mixed day into equal diagonal bands', () => {
    expect(dayFill(['#8b5cf6', '#22c55e'])).toBe(
      'linear-gradient(135deg, #8b5cf6 0% 50%, #22c55e 50% 100%)',
    );
    expect(dayFill(['#111111', '#222222', '#333333', '#444444'])).toContain('#333333 50% 75%');
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
