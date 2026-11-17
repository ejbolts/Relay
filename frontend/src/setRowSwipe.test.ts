import { describe, expect, it } from 'vitest';
import {
  completesSetRowDeleteSwipe,
  SET_ROW_DELETE_SWIPE_PX,
  SET_ROW_SWIPE_MAX_PX,
  setRowSwipeOffset,
  setRowSwipeProgress,
} from './setRowSwipe';

describe('set row swipe-to-delete gesture', () => {
  it('commits a decisive right-to-left swipe', () => {
    expect(completesSetRowDeleteSwipe(-SET_ROW_DELETE_SWIPE_PX, 12)).toBe(true);
  });

  it('rejects short, rightward, and mostly vertical gestures', () => {
    expect(completesSetRowDeleteSwipe(-(SET_ROW_DELETE_SWIPE_PX - 1), 0)).toBe(false);
    expect(completesSetRowDeleteSwipe(120, 0)).toBe(false);
    expect(completesSetRowDeleteSwipe(-100, 90)).toBe(false);
  });

  it('clamps the row movement and delete-layer progress', () => {
    expect(setRowSwipeOffset(25)).toBe(0);
    expect(setRowSwipeOffset(-40)).toBe(-40);
    expect(setRowSwipeOffset(-500)).toBe(-SET_ROW_SWIPE_MAX_PX);
    expect(setRowSwipeProgress(-SET_ROW_DELETE_SWIPE_PX / 2)).toBe(0.5);
    expect(setRowSwipeProgress(-500)).toBe(1);
  });
});
