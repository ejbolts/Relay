import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { User } from '../../../frontend/src/types';
import {
  finishSignOut,
  forgetSessionTokenIf,
  pendingSignOut,
  saveSessionToken,
  sessionToken,
  startSignOut,
} from './session';

export const apiOrigin = process.env.EXPO_PUBLIC_RELAY_API_ORIGIN?.trim();

const TIMEOUT_MS = 15_000;
const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The server's error code, such as `invalid_password` or `sharing_required`, when it sent one. */
    readonly code?: string,
  ) {
    super(message);
  }
}

export function serverOrigin() {
  const origin = new URL(apiOrigin!);
  const loopback = __DEV__ && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    (origin.protocol !== 'https:' && !(loopback && origin.protocol === 'http:')) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('Set a valid HTTPS preview origin for Relay.');
  }
  return origin.origin;
}

export function clientVersionHeaders(): Record<string, string> {
  const config = Constants.expoConfig;
  const version = config?.version;
  const compatibility: unknown = config?.extra?.relayCompatibilityVersion;
  return {
    // Set by app.config.js from the Relay release at bundle time.
    ...(typeof compatibility === 'string' && { 'X-Relay-Version': compatibility }),
    ...((Platform.OS === 'ios' || Platform.OS === 'android') &&
      version && { 'X-Relay-Client': `${Platform.OS}/${version}` }),
  };
}

/**
 * Sends the saved session as a bearer header. Cookies are never sent or kept, so the session is
 * exactly the token in secure storage. `token` overrides it: null for none, or a given token.
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const origin = serverOrigin();
  const bearer = token === undefined ? await sessionToken(origin) : token;
  // React Native's fetch has no timeout of its own, so a dropped connection would wait forever.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const caller = init.signal;
  if (caller?.aborted) cancel();
  caller?.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(origin + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...clientVersionHeaders(),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch (error) {
    if (caller?.aborted) throw error;
    throw new Error(UNREACHABLE);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', cancel);
  }
  if (!response.ok) {
    // The session ended on the server (signed out elsewhere, password changed or expired).
    // Only while it is still the saved one: a late refusal of a previous account's token mustn't
    // delete the account that signed in since.
    if (response.status === 401 && token === undefined && bearer)
      await forgetSessionTokenIf(origin, bearer);
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'Relay could not complete this request.',
      typeof body?.error?.code === 'string' ? body.error.code : undefined,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

async function sendPendingSignOut(origin: string) {
  try {
    const token = await pendingSignOut(origin);
    if (!token) return;
    try {
      await request<void>('/api/auth/logout-session', { method: 'POST' }, token);
    } catch (error) {
      // A server error or no connection leaves it for next time; a 401 means it already ended.
      if (!(error instanceof ApiError) || error.status >= 500) return;
    }
    await finishSignOut();
  } catch {
    // Secure storage was unavailable; the next launch tries again.
  }
}

let ending: Promise<void> | undefined;

/**
 * Ends a sign-out the server has not confirmed yet. Never throws: it retries next launch. The
 * screen checks the session on opening and on becoming active, so one attempt runs at a time.
 */
function endPendingSignOut(origin: string) {
  ending ??= sendPendingSignOut(origin).finally(() => (ending = undefined));
  return ending;
}

export async function currentUser(signal: AbortSignal) {
  const origin = serverOrigin();
  void endPendingSignOut(origin);
  if (!(await sessionToken(origin))) throw new ApiError(401, 'Sign in to continue.');
  return request<User>('/api/auth/me', { signal });
}

export async function signIn(username: string, password: string) {
  const origin = serverOrigin();
  const user = await request<User & { session_token?: string | null }>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, session: 'token' }),
    },
    null,
  );
  if (!user.session_token) throw new Error('Update Relay on the server to sign in from the app.');
  await saveSessionToken(origin, user.session_token);
  return user;
}

/** Signs out on this phone at once, even offline; the server session ends now or next launch. */
export async function signOut() {
  const origin = serverOrigin();
  if (await startSignOut(origin)) await endPendingSignOut(origin);
}

/** A signed-in GET, for queries. */
export const apiGet = <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal });

/** A signed-in JSON write. */
export const apiSend = <T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  signal?: AbortSignal,
) =>
  request<T>(path, {
    method,
    signal,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
