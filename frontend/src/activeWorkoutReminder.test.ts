import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { existingPhonePushSubscription } from './push';
import { synchronizeActiveWorkoutReminder } from './activeWorkoutReminder';

vi.mock('./api', () => ({
  api: {
    scheduleActiveWorkoutReminder: vi.fn(),
    cancelActiveWorkoutReminder: vi.fn(),
  },
}));
vi.mock('./push', () => ({
  existingPhonePushSubscription: vi.fn(),
  PHONE_PUSH_PREFERENCE_EVENT: 'phone-push-preference-change',
}));

beforeEach(() => {
  vi.resetAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  vi.mocked(existingPhonePushSubscription).mockResolvedValue({
    endpoint: 'phone',
  } as PushSubscription);
});
afterEach(() => vi.unstubAllGlobals());

describe('active workout push lifecycle', () => {
  it('uses the original start time and cancels when the workout is finished', async () => {
    await synchronizeActiveWorkoutReminder(1_000_000);
    expect(api.scheduleActiveWorkoutReminder).toHaveBeenCalledWith({
      endpoint: 'phone',
      timer_id: '1000000',
      started_at: 1000,
    });
    await synchronizeActiveWorkoutReminder(null);
    expect(api.cancelActiveWorkoutReminder).toHaveBeenCalledWith({
      endpoint: 'phone',
      timer_id: '1000000',
    });
  });

  it('cancels even when scheduling had a lost response', async () => {
    vi.mocked(api.scheduleActiveWorkoutReminder).mockRejectedValueOnce(new Error('offline'));
    await expect(synchronizeActiveWorkoutReminder(1_000_000)).rejects.toThrow('offline');
    await synchronizeActiveWorkoutReminder(null);
    expect(api.cancelActiveWorkoutReminder).toHaveBeenCalledOnce();
  });

  it('retries an offline cancellation before registering a replacement workout', async () => {
    await synchronizeActiveWorkoutReminder(1_000_000);
    vi.mocked(api.cancelActiveWorkoutReminder).mockRejectedValueOnce(new Error('offline'));
    await expect(synchronizeActiveWorkoutReminder(2_000_000)).rejects.toThrow('offline');
    expect(api.scheduleActiveWorkoutReminder).toHaveBeenCalledTimes(1);
    await synchronizeActiveWorkoutReminder(2_000_000);
    expect(api.cancelActiveWorkoutReminder).toHaveBeenCalledTimes(2);
    expect(api.scheduleActiveWorkoutReminder).toHaveBeenLastCalledWith({
      endpoint: 'phone',
      timer_id: '2000000',
      started_at: 2000,
    });
  });

  it('cancels the reminder when phone alerts are disabled', async () => {
    await synchronizeActiveWorkoutReminder(1_000_000);
    vi.mocked(existingPhonePushSubscription).mockResolvedValue(null);
    await synchronizeActiveWorkoutReminder(1_000_000);
    expect(api.cancelActiveWorkoutReminder).toHaveBeenCalledOnce();
  });
});
