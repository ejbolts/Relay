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

export const sessionToken = (origin: string) => read(SESSION, origin);
export const saveSessionToken = (origin: string, token: string) => write(SESSION, origin, token);
export const forgetSessionToken = () => SecureStore.deleteItemAsync(SESSION);

/** Signs out on this device at once, keeping the token to end its server session later. */
export async function startSignOut(origin: string) {
  const token = await sessionToken(origin);
  if (token) await write(PENDING_SIGN_OUT, origin, token);
  await forgetSessionToken();
  return token;
}

export const pendingSignOut = (origin: string) => read(PENDING_SIGN_OUT, origin);
export const finishSignOut = () => SecureStore.deleteItemAsync(PENDING_SIGN_OUT);
