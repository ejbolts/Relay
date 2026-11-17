import { describe, expect, it } from 'vitest';
import {
  RUNNING,
  MAX_LIVE_CLOCK_SECONDS,
  activeElapsedSeconds,
  clockOffsetMsAt,
  draftPause,
  pauseWorkout,
  pausedMsAt,
  resumeWorkout,
  validStoredPause,
  withElapsedSeconds,
} from './workoutPause';

const start = 1_000_000;

describe('workout pause', () => {
  it('leaves paused time out of the live clock, including a pause still going', () => {
    const paused = pauseWorkout(RUNNING, start + 60_000);
    expect(activeElapsedSeconds(start, paused, start + 60_000)).toBe(60);
    expect(activeElapsedSeconds(start, paused, start + 300_000)).toBe(60);
    const resumed = resumeWorkout(paused, start + 300_000);
    expect(resumed).toEqual({ pausedMs: 240_000, pausedAt: null });
    expect(activeElapsedSeconds(start, resumed, start + 330_000)).toBe(90);
  });

  it('adds up separate pauses and ignores repeated pause or resume', () => {
    let pause = pauseWorkout(RUNNING, start + 10_000);
    expect(pauseWorkout(pause, start + 20_000)).toBe(pause);
    pause = resumeWorkout(pause, start + 30_000);
    expect(resumeWorkout(pause, start + 40_000)).toBe(pause);
    pause = pauseWorkout(pause, start + 50_000);
    expect(pausedMsAt(pause, start + 55_000)).toBe(25_000);
  });

  it('treats drafts without pause fields as running and validates stored values', () => {
    expect(draftPause(null)).toEqual(RUNNING);
    expect(draftPause({})).toEqual(RUNNING);
    expect(draftPause({ pausedMs: 5000, pausedAt: 123 })).toEqual({
      pausedMs: 5000,
      pausedAt: 123,
    });
    expect(validStoredPause(undefined, undefined)).toBe(true);
    expect(validStoredPause(0, null)).toBe(true);
    expect(validStoredPause(-1, null)).toBe(false);
    expect(validStoredPause(10, 'soon')).toBe(false);
    expect(validStoredPause(Number.NaN, null)).toBe(false);
  });
});

describe('correcting the live clock', () => {
  it('adds time for a timer started late and keeps counting from the corrected time', () => {
    const now = start + 10 * 60_000;
    const corrected = withElapsedSeconds(RUNNING, start, 45 * 60, now);
    expect(corrected).toEqual({ pausedMs: 0, pausedAt: null, adjustedMs: 35 * 60_000 });
    expect(activeElapsedSeconds(start, corrected, now)).toBe(45 * 60);
    expect(activeElapsedSeconds(start, corrected, now + 90_000)).toBe(45 * 60 + 90);
    // More time was added than was paused, so the clock offset is negative.
    expect(clockOffsetMsAt(corrected, now)).toBe(-35 * 60_000);
  });

  it('takes time off a timer that was left running', () => {
    const now = start + 3 * 60 * 60_000;
    const corrected = withElapsedSeconds(RUNNING, start, 50 * 60, now);
    expect(corrected.adjustedMs).toBe(-130 * 60_000);
    expect(activeElapsedSeconds(start, corrected, now + 60_000)).toBe(51 * 60);
  });

  it('keeps past and current pauses, staying frozen until the workout resumes', () => {
    let pause = resumeWorkout(pauseWorkout(RUNNING, start + 60_000), start + 120_000);
    pause = pauseWorkout(pause, start + 300_000);
    const now = start + 600_000;
    const corrected = withElapsedSeconds(pause, start, 20 * 60, now);
    expect(corrected.pausedMs).toBe(60_000);
    expect(corrected.pausedAt).toBe(start + 300_000);
    expect(activeElapsedSeconds(start, corrected, now)).toBe(20 * 60);
    expect(activeElapsedSeconds(start, corrected, now + 500_000)).toBe(20 * 60);
    const resumed = resumeWorkout(corrected, now + 500_000);
    expect(resumed.adjustedMs).toBe(corrected.adjustedMs);
    expect(activeElapsedSeconds(start, resumed, now + 530_000)).toBe(20 * 60 + 30);
  });

  it('replaces an earlier correction instead of stacking on it', () => {
    const now = start + 600_000;
    const first = withElapsedSeconds(RUNNING, start, 45 * 60, now);
    const second = withElapsedSeconds(first, start, 15 * 60, now + 60_000);
    expect(activeElapsedSeconds(start, second, now + 60_000)).toBe(15 * 60);
  });

  it('limits the corrected time and ignores fractions and negatives', () => {
    const now = start + 600_000;
    expect(activeElapsedSeconds(start, withElapsedSeconds(RUNNING, start, -5, now), now)).toBe(0);
    expect(activeElapsedSeconds(start, withElapsedSeconds(RUNNING, start, 90.9, now), now)).toBe(
      90,
    );
    expect(activeElapsedSeconds(start, withElapsedSeconds(RUNNING, start, 999_999, now), now)).toBe(
      MAX_LIVE_CLOCK_SECONDS,
    );
  });

  it('reads a stored correction and rejects one that is not a finite number', () => {
    expect(draftPause({ pausedMs: 0, pausedAt: null, adjustedMs: -5000 })).toEqual({
      pausedMs: 0,
      pausedAt: null,
      adjustedMs: -5000,
    });
    expect(validStoredPause(0, null, -9 * 24 * 60 * 60_000)).toBe(true);
    expect(validStoredPause(0, null, Number.POSITIVE_INFINITY)).toBe(false);
    expect(validStoredPause(0, null, '300')).toBe(false);
  });
});
