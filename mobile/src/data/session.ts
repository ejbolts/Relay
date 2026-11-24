import * as SecureStore from 'expo-secure-store';

// The session token lives in the device's keychain or keystore, never in plain storage. Each is
// saved with the server it belongs to, so pointing the app at another server starts signed out.
const SESSION = 'relay.session';
// Sign-outs the server has not confirmed yet, one per session: a journal of numbered slots. The
// token is already gone from SESSION, so the app is signed out; these copies only let the app end
// each session on the server too, so its alerts stop. SecureStore can't list its keys, so the
// slots have fixed names that the app reads in turn: there is no index that could fail or be left
// behind. Earlier versions kept them all under LEGACY_PENDING.
const JOURNAL_SLOTS = 32;
const journalSlot = (slot: number) => `relay.sign-out-journal.${slot}`;
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

type Slot = { slot: number; item: Saved | null } | { slot: number; unreadable: true };

/** Every journal slot: what it holds, null when empty, or unreadable for now. */
async function readJournal(): Promise<Slot[]> {
  const slots: Slot[] = [];
  for (let slot = 0; slot < JOURNAL_SLOTS; slot += 1) {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(journalSlot(slot));
    } catch {
      slots.push({ slot, unreadable: true });
      continue;
    }
    let item: unknown = null;
    try {
      item = JSON.parse(raw ?? 'null');
    } catch {
      // Corrupt: nothing can be sent for it, so the slot counts as free.
    }
    slots.push({ slot, item: isSaved(item) ? item : null });
  }
  return slots;
}

/**
 * Saves a sign-out in a free slot, never over one that holds (or might hold) another. True once
 * it is saved: from then on the app can always find it.
 */
async function journal(item: Saved, slots: Slot[]): Promise<boolean> {
  if (slots.some((entry) => 'item' in entry && entry.item?.token === item.token)) return true;
  for (const entry of slots) {
    if (!('item' in entry) || entry.item) continue;
    try {
      await SecureStore.setItemAsync(journalSlot(entry.slot), JSON.stringify(item));
      return true;
    } catch {
      // Try the next free slot.
    }
  }
  return false;
}

/** Moves sign-outs an earlier version saved under one key into the journal. */
async function withLegacy(slots: Slot[]): Promise<Slot[]> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(LEGACY_PENDING);
  } catch {
    return slots; // Left where it is until it can be read.
  }
  if (!raw) return slots;
  let saved: unknown = null;
  try {
    saved = JSON.parse(raw);
  } catch {
    // Unreadable: there is nothing to keep.
  }
  let moved = true;
  for (const item of (Array.isArray(saved) ? saved : [saved]).filter(isSaved))
    moved = (await journal(item, slots)) && moved;
  // Removed only once every sign-out in it is safe in the journal.
  if (moved) await SecureStore.deleteItemAsync(LEGACY_PENDING).catch(() => undefined);
  return moved ? readJournal() : slots;
}

/**
 * Signs out on this device, keeping the token to end its server session later. The token is only
 * removed once its sign-out is saved where the app will find it; when it can't be saved, it is
 * kept and `journaled` is false, so the caller ends the session on the server first.
 */
export const startSignOut = (origin: string) =>
  inTurn(async () => {
    const token = await read(SESSION, origin);
    if (!token) {
      await SecureStore.deleteItemAsync(SESSION);
      return { token: null, journaled: true };
    }
    const journaled = await journal({ origin, token }, await withLegacy(await readJournal()));
    if (journaled) await SecureStore.deleteItemAsync(SESSION);
    return { token, journaled };
  });

/** The sessions on `origin` signed out here that the server has not ended yet, oldest first. */
export const pendingSignOuts = (origin: string) =>
  inTurn(async () => {
    const slots = await withLegacy(await readJournal());
    return slots.flatMap((entry) =>
      'item' in entry && entry.item?.origin === origin
        ? [{ id: String(entry.slot), token: entry.item.token }]
        : [],
    );
  });

/** The server has ended this session, or it had already ended. */
export const finishSignOut = (id: string) =>
  inTurn(() => SecureStore.deleteItemAsync(journalSlot(Number(id))));
