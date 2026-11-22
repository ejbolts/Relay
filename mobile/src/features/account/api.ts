import type {
  DashboardData,
  ExerciseHistoryBaseline,
  TrainingPreferences,
  User,
  WorkoutSnapshot,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
import { accountRoutine } from '../training/accountRoutine';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  // React Native's fetch has no timeout of its own, so a dropped connection would wait forever.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const caller = init?.signal;
  if (caller?.aborted) cancel();
  caller?.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(origin.origin + path, {
      ...init,
      credentials: 'include',
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
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'Relay could not complete this request.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const currentUser = (signal: AbortSignal) => request<User>('/api/auth/me', { signal });
export const signIn = (username: string, password: string) =>
  request<User>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
export const signOut = () => request<void>('/api/auth/logout-session', { method: 'POST' });

function isoDate(year: number, monthIndex: number, day: number) {
  const date = new Date(year, monthIndex, day);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Long histories load in a window, as on the web (frontend/src/historyWindow.ts): this month
 * and the two before it in full, with one condensed row per exercise for everything older.
 */
export async function loadRoutine(signal: AbortSignal, now = new Date()) {
  const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
  const start = isoDate(now.getFullYear(), now.getMonth() - 2, 1);
  const [dashboard, saved, recent, older, prefs] = await Promise.all([
    request<DashboardData>(`/api/dashboard?on_date=${today}`, { signal }),
    request<WorkoutTypeExercises[]>('/api/workout-type-exercises', { signal }),
    request<WorkoutSnapshot>(`/api/workouts/snapshot?start=${start}&end=${today}`, { signal }),
    request<ExerciseHistoryBaseline[]>(`/api/exercise-history-baselines?before=${start}`, {
      signal,
    }),
    request<TrainingPreferences>('/api/training-preferences', { signal }),
  ]);
  return accountRoutine(
    dashboard.recommendation,
    saved,
    recent.workouts,
    older,
    prefs.preferred_weight_unit,
  );
}
