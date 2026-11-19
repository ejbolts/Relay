import { describe, expect, it } from 'vitest';
import { dragOpenness, settleOpen } from './drawerGesture';

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
