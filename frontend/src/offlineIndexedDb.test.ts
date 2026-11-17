import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { indexedDbBackend, readOffline, replaceOfflineBackend, writeOffline } from './offlineStore';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  replaceOfflineBackend(indexedDbBackend);
});
afterEach(() => vi.unstubAllGlobals());

it('atomically keeps one non-extractable key when two tabs initialize together', async () => {
  const create = () =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const [a, b] = await Promise.all([create(), create()]);
  const [first, second] = (await Promise.all([
    indexedDbBackend.keepDeviceKey!(a),
    indexedDbBackend.keepDeviceKey!(b),
  ])) as CryptoKey[];
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    first,
    new Uint8Array([1, 2, 3]),
  );
  expect(
    new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, second, encrypted)),
  ).toEqual(new Uint8Array([1, 2, 3]));
  expect(first.extractable).toBe(false);
  expect(second.extractable).toBe(false);
});

it('round trips encrypted account records through IndexedDB transactions', async () => {
  await writeOffline('history', { notes: 'Sample data' }, 'sample-owner');
  expect((await readOffline('history', 'sample-owner'))?.value).toEqual({ notes: 'Sample data' });
  expect(await readOffline('history', 'other-owner')).toBeNull();
});
