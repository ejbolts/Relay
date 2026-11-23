import { describe, expect, it } from 'vitest';
import {
  chartDateTicks,
  chartLabelWidth,
  chartPointerX,
  evenlySpacedChartIndexes,
  goalLabelPlacement,
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

describe('chart date ticks', () => {
  const ticksFor = (start: Date, end: Date, plotWidth = 288) => {
    const tMin = start.getTime();
    const tMax = end.getTime();
    return chartDateTicks(
      tMin,
      tMax,
      plotWidth,
      (time) => 40 + ((time - tMin) / (tMax - tMin)) * plotWidth,
    );
  };

  it('spreads 2 to 4 day labels across a short span, from the first day to the last', () => {
    const ticks = ticksFor(new Date(2026, 10, 1, 12), new Date(2026, 10, 21, 12));
    expect(ticks.map((tick) => tick.label)).toEqual(['1 Nov', '11 Nov', '21 Nov']);
    expect(ticks[0].x).toBe(40);
    expect(ticks.at(-1)!.x).toBe(328);
  });

  it('labels each month over a long span, and adds the year past 400 days', () => {
    expect(
      ticksFor(new Date(2026, 7, 20, 12), new Date(2026, 10, 20, 12)).map((tick) => tick.label),
    ).toEqual(['Sep', 'Oct', 'Nov']);
    const year = ticksFor(new Date(2025, 0, 10, 12), new Date(2026, 3, 10, 12), 1200);
    expect(year[0].label).toBe('Feb ’25');
    expect(year.map((tick) => tick.label)).toContain('Jan ’26');
  });

  it('thins month labels to about one per 56px', () => {
    const ticks = ticksFor(new Date(2025, 0, 10, 12), new Date(2026, 0, 10, 12), 112);
    expect(ticks.length).toBeLessThanOrEqual(2);
  });
});

describe('goal label placement', () => {
  const chart = { width: 352, height: 200, plotRight: 340, plotBottom: 174 };
  const line = { x1: 40, y1: 40, x2: 330, y2: 120, label: 'Goal 80 kg' };

  it('ends the label at the line end, as the web does, when it fits', () => {
    expect(goalLabelPlacement(line, chart)).toEqual({ x: 326, y: 134, anchor: 'end' });
  });

  it('starts the label at the end when the goal is clipped to the start of the range', () => {
    const placed = goalLabelPlacement({ ...line, x1: 40, x2: 40 }, chart);
    expect(placed.anchor).toBe('start');
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.x + chartLabelWidth(line.label)).toBeLessThanOrEqual(chart.width);
  });

  it('keeps a goal on the top tick inside the chart', () => {
    const rising = goalLabelPlacement({ ...line, y1: 120, y2: 12 }, chart);
    expect(rising.y - 9).toBeGreaterThanOrEqual(0);
    const band = goalLabelPlacement(line, chart, 12);
    expect(band.y - 9).toBeGreaterThanOrEqual(0);
    expect(band.y).toBeLessThanOrEqual(chart.plotBottom);
  });
});
