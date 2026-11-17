/**
 * Account data kept on this device so Relay opens and keeps working without a connection.
 *
 * Each value is gzip-compressed and then AES-GCM encrypted with a non-extractable key held in the
 * same IndexedDB database. This does not protect an unlocked browser or against same-origin
 * script. Unsynced workout drafts use separate localStorage recovery records.
 * Every record is bound to the account that saved it, and clearing the store (sign-out or an
 * account change) also discards the key.
 */

const DATABASE_NAME = 'gym-video-logger-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const DEVICE_KEY = 'device-key-v1';
const RECORD_FORMAT = 2;

export interface OfflineBackend {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(keys: string[]): Promise<void>;
  clear(): Promise<void>;
  keepDeviceKey?(created: CryptoKey): Promise<unknown>;
}

interface StoredRecord {
  format: typeof RECORD_FORMAT;
  owner: string;
  savedAt: number;
  compressed: boolean;
  /** Legacy records without encryption metadata are refused on read. */
  iv?: Uint8Array;
  bytes: ArrayBuffer;
}

export interface SavedCopy<T> {
  value: T;
  savedAt: number;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const database = await openDatabase();
  if (!database) return undefined;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => {
      database.close();
      resolve(request ? request.result : undefined);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export const indexedDbBackend: OfflineBackend = {
  keepDeviceKey: async (created) => {
    const database = await openDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DEVICE_KEY);
      let kept: unknown;
      request.onsuccess = () => {
        kept = isCryptoKey(request.result) ? request.result : created;
        if (kept === created) store.put(created, DEVICE_KEY);
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(kept);
      };
      transaction.onerror = transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    });
  },
  get: (key) => transact('readonly', (store) => store.get(key)),
  put: async (key, value) => {
    await transact('readwrite', (store) => store.put(value, key));
  },
  delete: async (keys) => {
    await transact('readwrite', (store) => {
      for (const key of keys) store.delete(key);
    });
  },
  clear: async () => {
    await transact('readwrite', (store) => store.clear());
  },
};

let backend: OfflineBackend = indexedDbBackend;
let deviceKey: Promise<CryptoKey | null> | null = null;
let generation = 0;
let clearing: Promise<void> = Promise.resolve();
export const offlineGeneration = () => generation;

// Another tab can sign out and sign back into the same account while a request is pending.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const ownerOf = (value: string | null) => {
      try {
        return value ? (JSON.parse(value) as { id?: string }).id : null;
      } catch {
        return null;
      }
    };
    if (
      event.key === null ||
      (event.key === 'gym-logger-last-user' && ownerOf(event.oldValue) !== ownerOf(event.newValue))
    ) {
      ++generation;
      deviceKey = null;
    }
  });
}

/** Tests swap in an in-memory backend; the app always uses IndexedDB. */
export function replaceOfflineBackend(next: OfflineBackend): void {
  backend = next;
  ++generation;
  deviceKey = null;
}

function subtleCrypto(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey;
}

async function loadDeviceKey(): Promise<CryptoKey | null> {
  const started = generation;
  const subtle = subtleCrypto();
  if (!subtle) return null;
  const stored = await backend.get(DEVICE_KEY);
  if (isCryptoKey(stored)) return stored;
  const created = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  if (started !== generation) return null;
  if (backend.keepDeviceKey) {
    const kept = await backend.keepDeviceKey(created);
    return isCryptoKey(kept) ? kept : null;
  }
  await backend.put(DEVICE_KEY, created);
  // Another tab may have stored its key first; always use the one that was kept.
  const kept = await backend.get(DEVICE_KEY);
  return isCryptoKey(kept) ? kept : null;
}

function currentDeviceKey(): Promise<CryptoKey | null> {
  deviceKey ??= loadDeviceKey().catch(() => {
    deviceKey = null;
    return null;
  });
  return deviceKey;
}

async function pipeBytes(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<ArrayBuffer> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(source.pipeThrough(transform)).arrayBuffer();
}

const canCompress = () =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function associatedData(owner: string, key: string): Uint8Array {
  return new TextEncoder().encode(`${owner}\n${key}`);
}

export async function writeOffline(
  key: string,
  value: unknown,
  owner: string,
  isCurrent = () => true,
  required = false,
): Promise<void> {
  const started = generation;
  try {
    await clearing;
    if (started !== generation || !isCurrent()) throw new Error('The signed-in account changed.');
    const json = new TextEncoder().encode(JSON.stringify(value));
    const compressed = canCompress();
    const plain = compressed
      ? await pipeBytes(json, new CompressionStream('gzip'))
      : new Uint8Array(json).buffer;
    const cryptoKey = await currentDeviceKey();
    // Saved server copies are refetchable. Never silently persist plaintext if encryption fails.
    if (!cryptoKey || started !== generation || !isCurrent())
      throw new Error('Could not save on this device. Free some storage and try again.');
    const record: StoredRecord = {
      format: RECORD_FORMAT,
      owner,
      savedAt: Date.now(),
      compressed,
      bytes: plain,
    };
    if (cryptoKey) {
      record.iv = crypto.getRandomValues(new Uint8Array(12));
      record.bytes = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: record.iv, additionalData: associatedData(owner, key) },
        cryptoKey,
        new Uint8Array(plain),
      );
    }
    if (started !== generation || !isCurrent()) throw new Error('The signed-in account changed.');
    await backend.put(key, record);
  } catch (reason) {
    if (required) throw reason;
    // IndexedDB can be unavailable or full. The server remains the source of truth.
  }
}

// Compare by tag: buffers from Web Crypto or IndexedDB can come from another realm.
const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

function isStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<StoredRecord>;
  return (
    record.format === RECORD_FORMAT &&
    typeof record.owner === 'string' &&
    typeof record.savedAt === 'number' &&
    typeof record.compressed === 'boolean' &&
    isArrayBuffer(record.bytes)
  );
}

/** The saved copy for `owner`, or null when missing, from another account, or unreadable. */
export async function readOffline<T>(key: string, owner: string): Promise<SavedCopy<T> | null> {
  const started = generation;
  try {
    await clearing;
    const record = await backend.get(key);
    if (!isStoredRecord(record) || !record.iv || record.owner !== owner) return null;
    let plain = record.bytes;
    if (record.iv) {
      const cryptoKey = await currentDeviceKey();
      if (!cryptoKey) return null;
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: record.iv, additionalData: associatedData(owner, key) },
        cryptoKey,
        new Uint8Array(plain),
      );
    }
    if (record.compressed) {
      if (!canCompress()) return null;
      plain = await pipeBytes(new Uint8Array(plain), new DecompressionStream('gzip'));
    }
    if (started !== generation) return null;
    return { value: JSON.parse(new TextDecoder().decode(plain)) as T, savedAt: record.savedAt };
  } catch {
    return null;
  }
}

export async function deleteOffline(keys: string[]): Promise<void> {
  try {
    await backend.delete(keys);
  } catch {
    // Nothing to remove when IndexedDB is unavailable.
  }
}

/** Removes every saved record and the device key, so earlier ciphertext can never be read. */
export async function clearOffline(): Promise<void> {
  ++generation;
  deviceKey = null;
  clearing = clearing.then(() => backend.clear()).catch(() => undefined);
  await clearing;
}
