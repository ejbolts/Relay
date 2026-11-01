import { describe, expect, it } from 'vitest';
import {
  RUNNING,
  activeElapsedSeconds,
  draftPause,
  pauseWorkout,
  pausedMsAt,
  resumeWorkout,
  validStoredPause,
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
