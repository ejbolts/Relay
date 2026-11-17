import { describe, expect, it, vi } from 'vitest';
import { cancelRestTimerPushSchedule, restSecondsLeft, restTimerProgress } from './restTimer';

describe('rest timer push cancellation', () => {
  it('cancels immediately and again after an in-flight schedule completes', async () => {
    let finishSchedule!: () => void;
    const pendingSchedule = new Promise<void>((resolve) => {
      finishSchedule = resolve;
    });
    const cancel = vi.fn(async () => undefined);

    const cancellation = cancelRestTimerPushSchedule(cancel, [pendingSchedule]);
    expect(cancel).toHaveBeenCalledTimes(1);

    finishSchedule();
    await cancellation;
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('retries even when the first cancellation request fails', async () => {
    const cancel = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);

    await cancelRestTimerPushSchedule(cancel, []);

    expect(cancel).toHaveBeenCalledTimes(2);
  });
});

describe('rest timer progress', () => {
  it('is the share of the rest still to go, kept between empty and full', () => {
    expect(restTimerProgress(90, 90)).toBe(1);
    expect(restTimerProgress(45, 180)).toBe(0.25);
    expect(restTimerProgress(0, 90)).toBe(0);
    expect(restTimerProgress(120, 90)).toBe(1);
    expect(restTimerProgress(10, 0)).toBe(0);
  });
});

describe('rest time left', () => {
  it('rounds partial seconds up and stops at zero', () => {
    expect(restSecondsLeft(10_000, 0)).toBe(10);
    expect(restSecondsLeft(10_000, 9_001)).toBe(1);
    expect(restSecondsLeft(10_000, 10_000)).toBe(0);
    expect(restSecondsLeft(10_000, 12_000)).toBe(0);
  });
});
