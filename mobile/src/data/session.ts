import * as SecureStore from 'expo-secure-store';

// The session token lives in the device's keychain or keystore, never in plain storage. Each is
// saved with the server it belongs to, so pointing the app at another server starts signed out.
const SESSION = 'relay.session';
// A sign-out the server has not confirmed yet. The token is already gone from SESSION, so the
// app is signed out; this copy only lets the next launch end the session on the server too.
const PENDING_SIGN_OUT = 'relay.pending-sign-out';

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

/** Signs out on this device at once, keeping the token to end its server session later. */
export const startSignOut = (origin: string) =>
  inTurn(async () => {
    const token = await read(SESSION, origin);
    if (token) await write(PENDING_SIGN_OUT, origin, token);
    await SecureStore.deleteItemAsync(SESSION);
    return token;
  });

export const pendingSignOut = (origin: string) => read(PENDING_SIGN_OUT, origin);
export const finishSignOut = () => SecureStore.deleteItemAsync(PENDING_SIGN_OUT);
