import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOffline,
  readOffline,
  replaceOfflineBackend,
  writeOffline,
  type OfflineBackend,
} from './offlineStore';

class MemoryBackend implements OfflineBackend {
  values = new Map<string, unknown>();
  async get(key: string) {
    return this.values.get(key);
  }
  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }
  async delete(keys: string[]) {
    for (const key of keys) this.values.delete(key);
  }
  async clear() {
    this.values.clear();
  }
}

const workouts = Array.from({ length: 60 }, (_, index) => ({
  id: `sample-${index}`,
  name: 'Sample push session',
  movements: [{ exercise: { name: 'Barbell Bench Press', muscle_group: 'Chest' }, sets: [] }],
}));
let backend: MemoryBackend;

function storedRecord(key: string) {
  return backend.values.get(key) as { iv?: Uint8Array; bytes: ArrayBuffer; compressed: boolean };
}

beforeEach(() => {
  backend = new MemoryBackend();
  replaceOfflineBackend(backend);
});

afterEach(() => vi.unstubAllGlobals());

describe('offline store', () => {
  it('round-trips values as compressed ciphertext under a non-extractable device key', async () => {
    await writeOffline('workouts', workouts, 'sample-account');

    const record = storedRecord('workouts');
    const json = JSON.stringify(workouts);
    expect(record.iv).toHaveLength(12);
    expect(record.compressed).toBe(true);
    expect(record.bytes.byteLength).toBeLessThan(json.length / 5);
    expect(new TextDecoder().decode(record.bytes)).not.toContain('Sample push session');
    expect((backend.values.get('device-key-v1') as CryptoKey).extractable).toBe(false);
    expect((await readOffline('workouts', 'sample-account'))?.value).toEqual(workouts);
  });

  it('keeps saved nulls distinct from a missing copy', async () => {
    await writeOffline('response:/api/training-split', null, 'sample-account');

    expect(await readOffline('response:/api/training-split', 'sample-account')).toEqual({
      value: null,
      savedAt: expect.any(Number),
    });
    expect(await readOffline('response:/api/missing', 'sample-account')).toBeNull();
  });

  it('never shows one account’s copy to another, even if its owner label is rewritten', async () => {
    await writeOffline('workouts', workouts, 'sample-account');
    expect(await readOffline('workouts', 'other-account')).toBeNull();

    backend.values.set('workouts', { ...storedRecord('workouts'), owner: 'other-account' });
    expect(await readOffline('workouts', 'other-account')).toBeNull();
  });

  it('binds each record to its key, so records cannot be swapped', async () => {
    await writeOffline('response:/api/exercises', ['bench'], 'sample-account');
    backend.values.set('response:/api/workout-types', storedRecord('response:/api/exercises'));

    expect(await readOffline('response:/api/workout-types', 'sample-account')).toBeNull();
  });

  it('discards the device key on clear, so a retained copy of a record cannot be read', async () => {
    await writeOffline('workouts', workouts, 'sample-account');
    const retained = storedRecord('workouts');

    await clearOffline();
    expect(backend.values.size).toBe(0);
    await writeOffline('other', ['new key'], 'sample-account');
    backend.values.set('workouts', retained);
    expect(await readOffline('workouts', 'sample-account')).toBeNull();
  });

  it('still works offline where Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

    await writeOffline('workouts', workouts, 'sample-account');

    expect(storedRecord('workouts').iv).toBeUndefined();
    expect((await readOffline('workouts', 'sample-account'))?.value).toEqual(workouts);
  });
});
