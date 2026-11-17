import { describe, expect, it } from 'vitest';
import { loggerSessionKey, nextLoggerSession } from './loggerSession';

describe('live logger session', () => {
  it('keeps the same logger when a new workout names its own session', () => {
    const started = nextLoggerSession(null, '1000', undefined);
    const named = nextLoggerSession(started, '1000', 'mine');
    expect(loggerSessionKey(named)).toBe(loggerSessionKey(started));
    expect(loggerSessionKey(nextLoggerSession(named, '1000', 'mine'))).toBe(
      loggerSessionKey(started),
    );
  });

  it('rebuilds the logger when another session takes the workout over', () => {
    const started = nextLoggerSession(null, '1000', undefined);
    const named = nextLoggerSession(started, '1000', 'mine');
    const replaced = nextLoggerSession(named, '1000', 'other-device');
    expect(loggerSessionKey(replaced)).not.toBe(loggerSessionKey(named));
    expect(replaced.mountedId).toBe('other-device');
  });

  it('rebuilds a restored workout only when its session changes', () => {
    const restored = nextLoggerSession(null, '1000', 'mine');
    expect(nextLoggerSession(restored, '1000', 'mine')).toBe(restored);
    expect(loggerSessionKey(nextLoggerSession(restored, '1000', 'other-device'))).not.toBe(
      loggerSessionKey(restored),
    );
  });

  it('starts over for a different workout and ignores a draft that is briefly missing', () => {
    const first = nextLoggerSession(nextLoggerSession(null, '1000', undefined), '1000', 'mine');
    expect(nextLoggerSession(first, '1000', undefined)).toBe(first);
    expect(nextLoggerSession(first, '2000', undefined)).toEqual({
      workout: '2000',
      mountedId: '',
      ownId: null,
    });
  });
});
