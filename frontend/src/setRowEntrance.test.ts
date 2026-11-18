import { afterEach, expect, it, vi } from 'vitest';
import { markSetAdded, takeSetAdded } from './setRowEntrance';

afterEach(() => vi.useRealTimers());

it('reports a just-added set once, so only its row animates in', () => {
  markSetAdded('set-1');
  expect(takeSetAdded('set-1')).toBe(true);
  expect(takeSetAdded('set-1')).toBe(false);
  expect(takeSetAdded('set-2')).toBe(false);
  expect(takeSetAdded(undefined)).toBe(false);
});

it('ignores a set marked long before its row mounts', () => {
  vi.useFakeTimers();
  markSetAdded('set-3');
  vi.advanceTimersByTime(5000);
  expect(takeSetAdded('set-3')).toBe(false);
});
