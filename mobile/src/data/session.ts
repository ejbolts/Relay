import * as SecureStore from 'expo-secure-store';

// The session token lives in the device's keychain or keystore, never in plain storage. Each is
// saved with the server it belongs to, so pointing the app at another server starts signed out.
const SESSION = 'relay.session';
// Sign-outs the server has not confirmed yet, one per session. The token is already gone from
// SESSION, so the app is signed out; these copies only let the app end each session on the
// server too, so its alerts stop. Each is kept under its own key (values have a size limit), with
// a small index of their ids. Earlier versions kept them all under LEGACY_PENDING.
const PENDING_INDEX = 'relay.pending-sign-outs';
const pendingEntry = (id: string) => `relay.pending-sign-out.${id}`;
const LEGACY_PENDING = 'relay.pending-sign-out';

type Saved = { origin: string; token: string };

async function read(key: string, origin: string) {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(key)) ?? 'null') as Saved | null;
    return saved?.origin === origin && saved.token ? saved.token : null;
  } catch {
    return null;
  }
}

const write = (key: string, origin: string, token: string) =>
  SecureStore.setItemAsync(key, JSON.stringify({ origin, token } satisfies Saved));

/**
 * Every change to the saved session runs in turn, so a read, compare and delete (or a sign-out's
 * read and delete) can't interleave with a sign-out or sign-in that changes the session between
 * its steps. A failed change doesn't hold up the ones after it.
 */
let changes: Promise<unknown> = Promise.resolve();
function inTurn<T>(change: () => Promise<T>): Promise<T> {
  const run = changes.then(change, change);
  changes = run.catch(() => undefined);
  return run;
}

export const sessionToken = (origin: string) => read(SESSION, origin);
export const saveSessionToken = (origin: string, token: string) =>
  inTurn(() => write(SESSION, origin, token));
export const forgetSessionToken = () => inTurn(() => SecureStore.deleteItemAsync(SESSION));

/**
 * Forgets the saved session only while it is still `token`. A request that was refused after
 * another account signed in carries the old token; it mustn't delete the new account's. A refusal
 * of the token still saved clears it.
 */
export const forgetSessionTokenIf = (origin: string, token: string) =>
  inTurn(async () => {
    if ((await read(SESSION, origin)) === token) await SecureStore.deleteItemAsync(SESSION);
  });

const isSaved = (item: unknown): item is Saved =>
  typeof (item as Saved | null)?.origin === 'string' && !!(item as Saved).token;

/** The pending ids. Throws when the store can't be read, so nothing is overwritten. */
async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(PENDING_INDEX);
  try {
    const ids = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const writeIndex = (ids: string[]) =>
  ids.length
    ? SecureStore.setItemAsync(PENDING_INDEX, JSON.stringify(ids))
    : SecureStore.deleteItemAsync(PENDING_INDEX);

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Moves sign-outs an earlier version saved under one key into their own keys. */
async function withLegacy(ids: string[]): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(LEGACY_PENDING);
  if (!raw) return ids;
  let saved: unknown = null;
  try {
    saved = JSON.parse(raw);
  } catch {
    // Unreadable: there is nothing to keep.
  }
  const items = (Array.isArray(saved) ? saved : [saved]).filter(isSaved);
  const next = [...ids];
  for (const item of items) {
    const id = newId();
    await SecureStore.setItemAsync(pendingEntry(id), JSON.stringify(item));
    next.push(id);
  }
  await writeIndex(next);
  await SecureStore.deleteItemAsync(LEGACY_PENDING);
  return next;
}

/** Signs out on this device at once, keeping the token to end its server session later. */
export const startSignOut = (origin: string) =>
  inTurn(async () => {
    const token = await read(SESSION, origin);
    if (token) {
      try {
        const ids = await withLegacy(await readIndex());
        const id = newId();
        // The entry first: an index never names an entry that wasn't saved.
        await SecureStore.setItemAsync(pendingEntry(id), JSON.stringify({ origin, token }));
        await writeIndex([...ids, id]);
      } catch {
        // The store couldn't be read: saved sign-outs are left as they are.
      }
    }
    await SecureStore.deleteItemAsync(SESSION);
    return token;
  });

/** The sessions on `origin` signed out here that the server has not ended yet, oldest first. */
export const pendingSignOuts = (origin: string) =>
  inTurn(async () => {
    const found: { id: string; token: string }[] = [];
    let ids: string[];
    try {
      ids = await withLegacy(await readIndex());
    } catch {
      return found;
    }
    const missing: string[] = [];
    for (const id of ids) {
      let raw: string | null;
      try {
        raw = await SecureStore.getItemAsync(pendingEntry(id));
      } catch {
        continue; // Unreadable for now: kept for the next try.
      }
      let item: unknown = null;
      try {
        item = JSON.parse(raw ?? 'null');
      } catch {
        // Corrupt: nothing can be sent for it.
      }
      if (!isSaved(item)) missing.push(id);
      else if (item.origin === origin) found.push({ id, token: item.token });
    }
    if (missing.length) await writeIndex(ids.filter((id) => !missing.includes(id)));
    return found;
  });

/** The server has ended this session, or it had already ended. */
export const finishSignOut = (id: string) =>
  inTurn(async () => {
    const ids = await readIndex();
    await SecureStore.deleteItemAsync(pendingEntry(id));
    await writeIndex(ids.filter((item) => item !== id));
  });
