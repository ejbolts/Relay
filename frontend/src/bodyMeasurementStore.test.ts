// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  BODY_MEASUREMENT_QUEUE_KEY,
  bodyMeasurementSyncStatus,
  deleteLocalBodyMeasurement,
  listLocalBodyMeasurements,
  localBodyMeasurements,
  refreshBodyMeasurements,
  resetBodyMeasurementSyncBackoff,
  saveLocalBodyMeasurement,
  syncBodyMeasurements,
  type BodyMeasurementTransport,
} from './bodyMeasurementStore';
import {
  clearOffline,
  replaceOfflineBackend,
  writeOffline,
  type OfflineBackend,
} from './offlineStore';
import { LAST_USER_KEY } from './deviceAccount';
import { clearUserDeviceData, reconcileSignedInUser } from './sessionCleanup';
import { ApiError } from './api';
import { saveBodyFatCheckIn, saveBodyweightCheckIn } from './bodyweightCheckIn';
import type { BodyMeasurement, User } from './types';

const owner = { id: 'sample-a', display_name: 'Sample A' } as User;
const input = { measurement_date: '2026-11-04', weight_kg: 84, body_fat_pct: 18, notes: 'Morning' };
const row: BodyMeasurement = {
  ...input,
  id: 'server-id',
  created_at: '2026-11-04T00:00:00Z',
  is_sample: false,
};
class MemoryBackend implements OfflineBackend {
  values = new Map<string, unknown>();
  async get(key: string) {
    return this.values.get(key);
  }
  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }
  async delete(keys: string[]) {
    keys.forEach((key) => this.values.delete(key));
  }
  async clear() {
    this.values.clear();
  }
}
let backend: MemoryBackend;
let transport: BodyMeasurementTransport;
beforeEach(() => {
  localStorage.clear();
  resetBodyMeasurementSyncBackoff();
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(owner));
  backend = new MemoryBackend();
  replaceOfflineBackend(backend);
  transport = {
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(row),
    remove: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => vi.restoreAllMocks());

describe('durable local body check-ins', () => {
  it('shows cached history immediately while refreshing it in the background', async () => {
    await writeOffline('response:/api/body-measurements', [row], owner.id);
    let resolve!: (rows: BodyMeasurement[]) => void;
    vi.mocked(transport.list).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    expect(await listLocalBodyMeasurements(transport)).toEqual([row]);
    resolve([{ ...row, weight_kg: 85 }]);
    await vi.waitFor(async () => expect((await localBodyMeasurements())[0].weight_kg).toBe(85));
  });

  it('accepts weight and fat without waiting for a server, and restores them from device storage', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const saved = await saveLocalBodyMeasurement(input);
    expect(saved.weight_kg).toBe(84);
    expect(saved.body_fat_pct).toBe(18);
    expect(await listLocalBodyMeasurements(transport)).toEqual([saved]);
    expect(transport.list).not.toHaveBeenCalled();
    expect(bodyMeasurementSyncStatus().pending).toBe(1);
    expect(
      JSON.parse(localStorage.getItem(BODY_MEASUREMENT_QUEUE_KEY)!).changes[0].payload,
    ).toEqual(input);
  });

  it('coalesces repeated edits on a date and syncs only the latest values', async () => {
    await saveLocalBodyMeasurement(input);
    await saveLocalBodyMeasurement({ ...input, weight_kg: 85, body_fat_pct: 19 });
    vi.mocked(transport.save).mockResolvedValue({ ...row, weight_kg: 85, body_fat_pct: 19 });
    await syncBodyMeasurements(transport);
    expect(transport.save).toHaveBeenCalledExactlyOnceWith(
      { ...input, weight_kg: 85, body_fat_pct: 19 },
      expect.any(AbortSignal),
    );
    expect(bodyMeasurementSyncStatus().pending).toBe(0);
    expect(await localBodyMeasurements()).toEqual([{ ...row, weight_kg: 85, body_fat_pct: 19 }]);
  });

  it('preserves an edit made while an earlier version is in flight', async () => {
    await saveLocalBodyMeasurement(input);
    let resolve!: (value: BodyMeasurement) => void;
    vi.mocked(transport.save).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const syncing = syncBodyMeasurements(transport);
    await vi.waitFor(() => expect(transport.save).toHaveBeenCalledOnce());
    await saveLocalBodyMeasurement({ ...input, body_fat_pct: 20 });
    vi.mocked(transport.save).mockResolvedValue({ ...row, body_fat_pct: 20 });
    resolve(row);
    await syncing;
    expect(transport.save).toHaveBeenCalledTimes(2);
    expect((await localBodyMeasurements())[0].body_fat_pct).toBe(20);
  });

  it('keeps a failed/uncertain request durable and retries the same date', async () => {
    await saveLocalBodyMeasurement(input);
    vi.mocked(transport.save).mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(syncBodyMeasurements(transport)).rejects.toThrow('Connection lost');
    expect(bodyMeasurementSyncStatus().pending).toBe(1);
    await syncBodyMeasurements(transport);
    expect(bodyMeasurementSyncStatus().pending).toBe(0);
    expect((await localBodyMeasurements())[0]).toEqual(row);
  });

  it('asks what the server holds before sending again after an attempt with no answer', async () => {
    await saveLocalBodyMeasurement(input);
    // The server saved it, but the answer never arrived: the phone gave up waiting.
    vi.mocked(transport.save).mockRejectedValueOnce(new DOMException('Timed out', 'AbortError'));
    await expect(syncBodyMeasurements(transport)).rejects.toThrow('Timed out');
    expect(transport.list).not.toHaveBeenCalled();
    vi.mocked(transport.list).mockResolvedValue([row]);
    await syncBodyMeasurements(transport);
    // Sending it again would only make the server repeat its work.
    expect(transport.save).toHaveBeenCalledOnce();
    expect(bodyMeasurementSyncStatus()).toEqual({ pending: 0, error: null });
    expect(await localBodyMeasurements()).toEqual([row]);
  });

  it('sends again after an attempt with no answer when the server does not hold it', async () => {
    await saveLocalBodyMeasurement(input);
    vi.mocked(transport.save).mockRejectedValueOnce(
      new ApiError('Server error', 'http_error', 500),
    );
    await expect(syncBodyMeasurements(transport)).rejects.toThrow('Server error');
    vi.mocked(transport.list).mockResolvedValue([{ ...row, weight_kg: 80 }]);
    await syncBodyMeasurements(transport);
    expect(transport.save).toHaveBeenCalledTimes(2);
    expect(bodyMeasurementSyncStatus().pending).toBe(0);
  });

  it('stops waiting to send a check-in the server history already shows', async () => {
    await saveLocalBodyMeasurement(input);
    await saveLocalBodyMeasurement({ ...input, measurement_date: '2026-11-05', weight_kg: 85 });
    vi.mocked(transport.list).mockResolvedValue([row]);
    expect(await refreshBodyMeasurements(transport)).toEqual([
      expect.objectContaining({ measurement_date: '2026-11-05', weight_kg: 85 }),
      row,
    ]);
    // Only the check-in the server lacks is still waiting.
    expect(bodyMeasurementSyncStatus().pending).toBe(1);
    await syncBodyMeasurements(transport);
    expect(transport.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ measurement_date: '2026-11-05' }),
      expect.any(AbortSignal),
    );
  });

  it('waits longer between automatic attempts the server keeps leaving unanswered', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await saveLocalBodyMeasurement(input);
    vi.mocked(transport.save).mockRejectedValue(new TypeError('Connection lost'));
    const attempt = (retry = false, immediate = false) =>
      syncBodyMeasurements(transport, retry, immediate).catch(() => undefined);
    await attempt();
    // The first retry comes with the next check; a second unanswered attempt starts a pause.
    await attempt();
    expect(transport.save).toHaveBeenCalledTimes(2);
    await attempt();
    now.mockReturnValue(1_000_000 + 14_000);
    await attempt();
    expect(transport.save).toHaveBeenCalledTimes(2);
    now.mockReturnValue(1_000_000 + 15_000);
    await attempt();
    expect(transport.save).toHaveBeenCalledTimes(3);
    // Thirty seconds this time. Coming back to the app, or asking again, does not wait.
    now.mockReturnValue(1_000_000 + 15_000 + 29_000);
    await attempt();
    expect(transport.save).toHaveBeenCalledTimes(3);
    await attempt(false, true);
    expect(transport.save).toHaveBeenCalledTimes(4);
    await attempt(true);
    expect(transport.save).toHaveBeenCalledTimes(5);
    // Nor does a change just made on this device.
    await saveLocalBodyMeasurement({ ...input, weight_kg: 85 });
    await attempt();
    expect(transport.save).toHaveBeenCalledTimes(6);
    // An answer ends the pause, and the next save is sent without asking first.
    vi.mocked(transport.save).mockResolvedValue({ ...row, weight_kg: 85 });
    await attempt(true);
    const asked = vi.mocked(transport.list).mock.calls.length;
    await saveLocalBodyMeasurement({ ...input, weight_kg: 86 });
    vi.mocked(transport.save).mockResolvedValue({ ...row, weight_kg: 86 });
    await attempt();
    expect(bodyMeasurementSyncStatus().pending).toBe(0);
    expect(transport.list).toHaveBeenCalledTimes(asked);
  });

  it('retains a rejected check-in with an actionable error, avoiding automatic replays', async () => {
    await saveLocalBodyMeasurement(input);
    vi.mocked(transport.save).mockRejectedValueOnce(
      new ApiError('Check this entry.', 'invalid', 422),
    );
    await expect(syncBodyMeasurements(transport)).rejects.toThrow('Check this entry.');
    expect(bodyMeasurementSyncStatus().error).toBe('Check this entry.');
    await syncBodyMeasurements(transport);
    expect(transport.save).toHaveBeenCalledOnce();
    await syncBodyMeasurements(transport, true);
    expect(bodyMeasurementSyncStatus()).toEqual({ pending: 0, error: null });
  });

  it('keeps a check-in pending without an error while this release is too old to save', async () => {
    await saveLocalBodyMeasurement(input);
    vi.mocked(transport.save).mockRejectedValueOnce(
      new ApiError('Relay needs to update before it can save this.', 'client_outdated', 426),
    );
    await expect(syncBodyMeasurements(transport)).rejects.toThrow('needs to update');
    expect(bodyMeasurementSyncStatus()).toEqual({ pending: 1, error: null });
    await syncBodyMeasurements(transport);
    expect(bodyMeasurementSyncStatus()).toEqual({ pending: 0, error: null });
  });

  it('removes a new check-in offline without sending its stale values', async () => {
    const saved = await saveLocalBodyMeasurement(input);
    await deleteLocalBodyMeasurement(saved.id);
    expect(await localBodyMeasurements()).toEqual([]);
    await syncBodyMeasurements(transport);
    expect(transport.save).not.toHaveBeenCalled();
    expect(transport.remove).not.toHaveBeenCalled();
    expect(bodyMeasurementSyncStatus().pending).toBe(0);
  });

  it('can undo a new check-in using its local ID after it has acquired a server ID', async () => {
    const saved = await saveLocalBodyMeasurement(input);
    await syncBodyMeasurements(transport);
    await deleteLocalBodyMeasurement(saved.id);
    vi.mocked(transport.list).mockResolvedValue([row]);
    await syncBodyMeasurements(transport);
    expect(transport.remove).toHaveBeenCalledWith('server-id', expect.any(AbortSignal));
    expect(await localBodyMeasurements()).toEqual([]);
  });

  it('sends a deletion after an in-flight save, so the entry cannot reappear', async () => {
    const saved = await saveLocalBodyMeasurement(input);
    let resolve!: (value: BodyMeasurement) => void;
    vi.mocked(transport.save).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const syncing = syncBodyMeasurements(transport);
    await vi.waitFor(() => expect(transport.save).toHaveBeenCalledOnce());
    await deleteLocalBodyMeasurement(saved.id);
    vi.mocked(transport.list).mockResolvedValue([row]);
    resolve(row);
    await syncing;
    expect(transport.remove).toHaveBeenCalledOnce();
    expect(await localBodyMeasurements()).toEqual([]);
  });

  it('ignores an old history response that arrives after an acknowledged edit', async () => {
    await writeOffline('response:/api/body-measurements', [row], owner.id);
    let resolve!: (rows: BodyMeasurement[]) => void;
    vi.mocked(transport.list).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const refreshing = refreshBodyMeasurements(transport);
    await saveLocalBodyMeasurement({ ...input, weight_kg: 86 });
    vi.mocked(transport.save).mockResolvedValue({ ...row, weight_kg: 86 });
    await syncBodyMeasurements(transport);
    resolve([row]);
    expect((await refreshing)[0].weight_kg).toBe(86);
    expect((await localBodyMeasurements())[0].weight_kg).toBe(86);
  });

  it('refuses a local save if storage is full, leaving the previous entry intact', async () => {
    await saveLocalBodyMeasurement(input);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    await expect(saveLocalBodyMeasurement({ ...input, weight_kg: 90 })).rejects.toThrow(
      'Free some storage',
    );
    expect((await localBodyMeasurements())[0].weight_kg).toBe(84);
  });

  it('keeps queued work until its acknowledged server copy is durably cached', async () => {
    await saveLocalBodyMeasurement(input);
    vi.spyOn(backend, 'put').mockRejectedValue(new Error('Disk full'));
    await expect(syncBodyMeasurements(transport)).rejects.toThrow();
    expect(bodyMeasurementSyncStatus().pending).toBe(1);
  });

  it('retains pending check-ins on session expiry, restores the same account, and clears on sign-out', async () => {
    await saveLocalBodyMeasurement(input);
    await clearUserDeviceData(undefined, { keepUnsyncedWorkout: true });
    expect(localStorage.getItem(BODY_MEASUREMENT_QUEUE_KEY)).not.toBeNull();
    await reconcileSignedInUser(owner);
    expect((await localBodyMeasurements())[0].weight_kg).toBe(84);
    await clearUserDeviceData();
    expect(localStorage.getItem(BODY_MEASUREMENT_QUEUE_KEY)).toBeNull();
  });

  it('never displays or syncs another account’s entries and discards them on account change', async () => {
    await saveLocalBodyMeasurement(input);
    const other = { ...owner, id: 'sample-b' };
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(other));
    expect(await localBodyMeasurements()).toEqual([]);
    await syncBodyMeasurements(transport);
    expect(transport.save).not.toHaveBeenCalled();
    await reconcileSignedInUser(other);
    expect(localStorage.getItem(BODY_MEASUREMENT_QUEUE_KEY)).toBeNull();
  });

  it('does not send or acknowledge another account’s in-flight completion', async () => {
    await saveLocalBodyMeasurement(input);
    let resolve!: (value: BodyMeasurement) => void;
    vi.mocked(transport.save).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const syncing = syncBodyMeasurements(transport);
    await vi.waitFor(() => expect(transport.save).toHaveBeenCalledOnce());
    await clearOffline();
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ ...owner, id: 'sample-b' }));
    resolve(row);
    await expect(syncing).rejects.toThrow('account changed');
    expect(await localBodyMeasurements()).toEqual([]);
  });

  it('supports real weight/fat Undo after sync has replaced a temporary ID', async () => {
    // Exercise the public API paths used by Home, with only the transport mocked.
    await saveBodyweightCheckIn(null, input.measurement_date, 84);
    const previous = (await localBodyMeasurements())[0];
    const undoFat = await saveBodyFatCheckIn(previous, input.measurement_date, 19);
    vi.mocked(transport.save).mockResolvedValue({ ...row, body_fat_pct: 19 });
    await syncBodyMeasurements(transport);
    await undoFat();
    expect((await localBodyMeasurements())[0].body_fat_pct).toBeNull();
  });

  it.each([
    { weight_kg: 0 },
    { weight_kg: 501 },
    { weight_kg: NaN },
    { body_fat_pct: 0 },
    { body_fat_pct: 71 },
    { body_fat_pct: NaN },
    { measurement_date: '2026-02-30' },
    { notes: 'x'.repeat(2001) },
  ])('validates before accepting a check-in: %j', async (invalid) => {
    await expect(saveLocalBodyMeasurement({ ...input, ...invalid })).rejects.toThrow(
      'Enter a valid',
    );
    expect(bodyMeasurementSyncStatus().pending).toBe(0);
  });
});
