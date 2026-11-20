import { describe, expect, it } from 'vitest';
import {
  commitsDrag,
  dismissDistance,
  dragOpenness,
  dragVelocity,
  settleOpen,
  trackDragSample,
  type DragSample,
} from './drawerGesture';

describe('drawer gesture', () => {
  it('follows the finger, opening as it moves down and staying within shut and open', () => {
    expect(dragOpenness(1, -40, 160)).toBe(0.75);
    expect(dragOpenness(0, 80, 160)).toBe(0.5);
    expect(dragOpenness(1, 60, 160)).toBe(1);
    expect(dragOpenness(0, -60, 160)).toBe(0);
    // Before the chart has a height there is nothing to drag.
    expect(dragOpenness(1, -60, 0)).toBe(1);
  });

  it('settles on the nearer side, unless flicked', () => {
    expect(settleOpen(0.7, 0)).toBe(true);
    expect(settleOpen(0.3, 0)).toBe(false);
    // A quick flick up shuts it even from mostly open, and a flick down opens it.
    expect(settleOpen(0.8, -0.6)).toBe(false);
    expect(settleOpen(0.2, 0.6)).toBe(true);
    // A slow drag is judged by position alone.
    expect(settleOpen(0.4, 0.2)).toBe(false);
  });
});

describe('sheet drag rule', () => {
  it('needs 12% of the screen height, between 72 and 140 pixels', () => {
    expect(dismissDistance(500)).toBe(72);
    expect(dismissDistance(844)).toBeCloseTo(101.28);
    expect(dismissDistance(1400)).toBe(140);
  });

  it('closes on a long enough slow drag', () => {
    expect(commitsDrag(110, 0, 0.1, 844)).toBe(true);
    expect(commitsDrag(90, 0, 0.1, 844)).toBe(false);
  });

  it('closes on a short quick flick, but not on a twitch', () => {
    expect(commitsDrag(40, 4, 0.6, 844)).toBe(true);
    expect(commitsDrag(12, 0, 2, 844)).toBe(false);
  });

  it('never closes on an upward or mostly sideways drag', () => {
    expect(commitsDrag(-120, 0, 1, 844)).toBe(false);
    expect(commitsDrag(120, 90, 1, 844)).toBe(false);
    expect(commitsDrag(120, 80, 0, 844)).toBe(true);
  });
});

describe('drag velocity', () => {
  const track = (points: [number, number][]) => {
    const samples: DragSample[] = [];
    for (const [y, t] of points) trackDragSample(samples, y, t);
    return samples;
  };

  it('measures the speed over the last tenth of a second', () => {
    // Slow at first, then 60 pixels in the last 80 ms.
    expect(
      dragVelocity(
        track([
          [0, 0],
          [10, 200],
          [20, 400],
          [50, 440],
          [80, 480],
        ]),
      ),
    ).toBeCloseTo(0.75);
  });

  it('has no speed when the finger stopped before letting go', () => {
    expect(
      dragVelocity(
        track([
          [0, 0],
          [60, 40],
          [60, 400],
        ]),
      ),
    ).toBe(0);
    expect(
      dragVelocity(
        track([
          [0, 0],
          [60, 40],
        ]).slice(0, 1),
      ),
    ).toBe(0);
  });

  it('is negative when moving up', () => {
    expect(
      dragVelocity(
        track([
          [100, 0],
          [40, 50],
        ]),
      ),
    ).toBeCloseTo(-1.2);
  });
});
