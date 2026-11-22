import type {
  DashboardData,
  TrainingPreferences,
  User,
  WorkoutSnapshot,
  WorkoutType,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
import { accountRoutine } from '../training/accountRoutine';
import {
  finishSignOut,
  forgetSessionToken,
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
  ) {
    super(message);
  }
}

function serverOrigin() {
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

/**
 * Sends the saved session as a bearer header. Cookies are never sent or kept, so the session is
 * exactly the token in secure storage. `token` overrides it: null for none, or a given token.
 */
async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
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
    if (response.status === 401 && token === undefined && bearer) await forgetSessionToken();
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'Relay could not complete this request.',
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

function isoDate(year: number, monthIndex: number, day: number) {
  const date = new Date(year, monthIndex, day);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Loads what Home's Up next reads on the web: the recommendation, the account's workout types and
 * the exercises saved to them, and the history window the web opens with (this month and the two
 * before it, frontend/src/historyWindow.ts).
 */
export async function loadRoutine(signal: AbortSignal, now = new Date()) {
  const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
  const start = isoDate(now.getFullYear(), now.getMonth() - 2, 1);
  const [dashboard, types, saved, history, prefs] = await Promise.all([
    request<DashboardData>(`/api/dashboard?on_date=${today}`, { signal }),
    request<WorkoutType[]>('/api/workout-types', { signal }),
    request<WorkoutTypeExercises[]>('/api/workout-type-exercises', { signal }),
    request<WorkoutSnapshot>(`/api/workouts/snapshot?start=${start}&end=${today}`, { signal }),
    request<TrainingPreferences>('/api/training-preferences', { signal }),
  ]);
  return accountRoutine({
    recommendation: dashboard.recommendation,
    types,
    saved,
    workouts: history.workouts,
    unit: prefs.preferred_weight_unit,
    today,
  });
}
