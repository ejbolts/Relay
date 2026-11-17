import { describe, expect, it } from 'vitest';
import {
  chartPointerX,
  evenlySpacedChartIndexes,
  paddedChartRange,
  responsiveChartWidth,
} from './chartLayout';

describe('chart pointer coordinates', () => {
  it('accounts for scaling and an offset from the viewport', () => {
    expect(chartPointerX(230, 100, { a: 2, b: 0, c: 0, d: 2, e: 30, f: 20 })).toBe(100);
  });

  it('reads along the vertical screen axis in the rotated portrait viewer', () => {
    const rotated = { a: 0, b: 1, c: -1, d: 0, e: 330, f: 16 };
    expect(chartPointerX(105, 816, rotated)).toBe(800);
    expect(chartPointerX(318, 56, rotated)).toBe(40);
  });

  it('handles a counterclockwise rotation and ignores collapsed geometry', () => {
    expect(chartPointerX(100, 150, { a: 0, b: -2, c: 2, d: 0, e: 20, f: 350 })).toBe(100);
    expect(chartPointerX(100, 150, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toBeNull();
  });
});

describe('responsive chart layout', () => {
  it('keeps the compact chart geometry in a normal card', () => {
    expect(responsiveChartWidth(340, 190)).toBe(340);
    expect(responsiveChartWidth(300, 300)).toBe(340);
  });

  it('widens the chart view box to match a landscape canvas', () => {
    expect(responsiveChartWidth(1200, 400)).toBe(570);
  });

  it('adds evenly spaced labels when there is room', () => {
    expect(evenlySpacedChartIndexes(12, 5)).toEqual([0, 3, 6, 8, 11]);
    expect(evenlySpacedChartIndexes(3, 5)).toEqual([0, 1, 2]);
  });

  it('pads chart values without forcing the scale down to zero', () => {
    expect(paddedChartRange([80, 90])).toEqual({ min: 78.5, max: 91.5 });
    expect(paddedChartRange([100, 100])).toEqual({ min: 99.7, max: 100.3 });
    expect(paddedChartRange([null, Number.NaN])).toBeNull();
  });
});
