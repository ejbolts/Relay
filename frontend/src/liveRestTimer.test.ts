import { describe, expect, it } from 'vitest';
import {
  LIVE_REST_TIMER_KEY,
  readStoredRestTimer,
  restoreRestTimer,
  writeStoredRestTimer,
  type StoredRestTimer,
} from './liveRestTimer';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const now = Date.UTC(2026, 10, 19, 9);
const stored = (overrides: Partial<StoredRestTimer> = {}): StoredRestTimer => ({
  sessionId: 'session-a',
  movementKey: 'bench',
  totalSeconds: 120,
  timer: { id: 'rest-1', endsAt: now + 75_500, pausedLeft: null },
  doneAt: null,
  ...overrides,
});

describe('live rest timer storage', () => {
  it('round-trips a rest and clears it', () => {
    const storage = memoryStorage();
    writeStoredRestTimer(stored(), storage);
    expect(readStoredRestTimer(storage)).toEqual(stored());
    writeStoredRestTimer(null, storage);
    expect(storage.getItem(LIVE_REST_TIMER_KEY)).toBeNull();
  });

  it('ignores damaged entries', () => {
    const storage = memoryStorage();
    storage.setItem(LIVE_REST_TIMER_KEY, '{"sessionId":1}');
    expect(readStoredRestTimer(storage)).toBeNull();
    storage.setItem(LIVE_REST_TIMER_KEY, 'not json');
    expect(readStoredRestTimer(storage)).toBeNull();
  });

  it('carries on a rest still counting down for the same workout', () => {
    expect(restoreRestTimer(stored(), 'session-a', now)).toEqual({
      timer: { id: 'rest-1', endsAt: now + 75_500, pausedLeft: null },
      secondsLeft: 76,
      totalSeconds: 120,
      movementKey: 'bench',
      done: null,
    });
  });

  it("ignores another workout's rest", () => {
    expect(restoreRestTimer(stored(), 'session-b', now).timer).toBeNull();
    expect(restoreRestTimer(null, 'session-a', now).timer).toBeNull();
  });

  it('keeps a paused rest paused', () => {
    const paused = stored({ timer: { id: 'rest-1', endsAt: now - 5_000, pausedLeft: 40 } });
    expect(restoreRestTimer(paused, 'session-a', now)).toMatchObject({
      timer: { pausedLeft: 40 },
      secondsLeft: 40,
    });
  });

  it('shows a rest that finished while the app was closed as done', () => {
    const ended = stored({ timer: { id: 'rest-1', endsAt: now - 5_000, pausedLeft: null } });
    expect(restoreRestTimer(ended, 'session-a', now)).toMatchObject({
      timer: null,
      secondsLeft: 0,
      done: { endedAt: now - 5_000, movementKey: 'bench' },
    });
    const done = stored({ timer: null, doneAt: now - 9_000 });
    expect(restoreRestTimer(done, 'session-a', now).done).toEqual({
      endedAt: now - 9_000,
      movementKey: 'bench',
    });
  });
});
