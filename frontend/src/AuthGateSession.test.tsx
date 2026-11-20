// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { emitAuthExpired } from './authEvents';
import { AuthGate } from './AuthGate';
import { LAST_USER_KEY, readSignedOutAccount } from './sessionCleanup';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
} from './workoutDraft';
import type { User } from './types';

const { clearCache } = vi.hoisted(() => ({ clearCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./workoutCache', async (original) => ({
  ...(await original<typeof import('./workoutCache')>()),
  clearWorkoutCache: clearCache,
}));
const { applyUpdateOnSignIn, signIn, signInProps } = vi.hoisted(() => ({
  applyUpdateOnSignIn: vi.fn<() => Promise<boolean>>(),
  signIn: { current: null as ((user: User) => Promise<void>) | null },
  signInProps: { current: {} as { notice?: string; initialUsername?: string } },
}));
vi.mock('./appUpdates', async (original) => ({
  ...(await original<typeof import('./appUpdates')>()),
  applyUpdateOnSignIn,
}));
vi.mock('./AuthScreen', () => ({
  AuthBrand: () => null,
  AuthScreen: ({
    onAuthenticated,
    notice,
    initialUsername,
  }: {
    onAuthenticated: (user: User) => Promise<void>;
    notice?: string;
    initialUsername?: string;
  }) => {
    signIn.current = onAuthenticated;
    signInProps.current = { notice, initialUsername };
    return <p>Sign in</p>;
  },
}));

const user = { id: 'sample', username: 'sample', display_name: 'Sample Lifter' } as User;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', undefined);
  vi.spyOn(api.auth, 'me').mockResolvedValue(user);
  vi.spyOn(api.auth, 'config').mockResolvedValue({
    registration_open: false,
    invite_code_required: false,
  });
  localStorage.clear();
  clearCache.mockClear();
  applyUpdateOnSignIn.mockReset().mockResolvedValue(false);
  signIn.current = null;
  signInProps.current = {};
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function writeLiveWorkout() {
  const startedAt = Date.now() - 20 * 60_000;
  writeActiveWorkoutDraft({
    version: 1,
    clientSessionId: '0d6c1f5e-3c35-4bb0-9d55-2f1c8d7a8e11',
    startedAt,
    updatedAt: startedAt,
    name: 'Sample upper session',
    workoutDate: '2026-11-19',
    category: 'upper',
    notes: '',
    movements: [],
  });
}

it('unmounts account content and keeps the live workout when a live session ends', async () => {
  await act(async () =>
    root.render(
      <AuthGate>
        <p>Account workout</p>
      </AuthGate>,
    ),
  );
  expect(container.textContent).toContain('Account workout');
  writeLiveWorkout();
  localStorage.setItem('relay.active-workout-sync', JSON.stringify({ userId: user.id, base: {} }));
  clearCache.mockClear();

  await act(async () => emitAuthExpired());

  expect(container.textContent).toContain('Sign in');
  expect(container.textContent).not.toContain('Account workout');
  expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  expect(clearCache).toHaveBeenCalledOnce();
  // The sets logged here wait for the same account to sign in again.
  expect(readActiveWorkoutDraft()?.name).toBe('Sample upper session');
  expect(localStorage.getItem('relay.active-workout-sync')).not.toBeNull();
  expect(readSignedOutAccount()).toEqual({ id: user.id, username: user.username });
  expect(signInProps.current).toEqual({
    notice: 'You were signed out. Your workout is saved.',
    initialUsername: user.username,
  });

  await act(async () => signIn.current!(user));
  expect(readActiveWorkoutDraft()?.name).toBe('Sample upper session');
  expect(readSignedOutAccount()).toBeNull();
});

it('discards the kept workout when a different account signs in after the session ended', async () => {
  await act(async () =>
    root.render(
      <AuthGate>
        <p>Account workout</p>
      </AuthGate>,
    ),
  );
  writeLiveWorkout();
  await act(async () => emitAuthExpired());

  await act(async () => signIn.current!({ ...user, id: 'someone-else', username: 'someone' }));

  expect(localStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
  expect(container.textContent).toContain('Account workout');
});

it('says the account was deleted when the app restarts after deleting it', async () => {
  sessionStorage.setItem('relay.account-deleted', '1');
  await showSignIn();
  expect(signInProps.current.notice).toBe('Your account was deleted.');
});

it('keeps only a finished workout that still has to sync when a live session ends', async () => {
  await act(async () =>
    root.render(
      <AuthGate>
        <p>Account workout</p>
      </AuthGate>,
    ),
  );
  const clientSessionId = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
  const startedAt = Date.now() - 45 * 60_000;
  writeActiveWorkoutDraft({
    version: 1,
    clientSessionId,
    startedAt,
    updatedAt: startedAt,
    name: 'Sample push session',
    workoutDate: '2026-10-30',
    category: 'push',
    notes: '',
    movements: [],
    pendingSave: {
      userId: user.id,
      finishedAt: Date.now(),
      workoutId: null,
      payload: {
        client_session_id: clientSessionId,
        name: 'Sample push session',
        workout_date: '2026-10-30',
        category: 'push',
        notes: null,
        duration_minutes: 45,
        start_time: null,
        end_time: null,
        movements: [
          {
            exercise_id: 'bench',
            notes: null,
            machine_photo_ids: [],
            sets: [{ reps: 8, weight_kg: 60, completed: true } as never],
          },
        ],
      },
    },
  });
  clearCache.mockClear();

  await act(async () => emitAuthExpired());

  expect(container.textContent).toContain('Sign in');
  expect(readActiveWorkoutDraft()?.pendingSave?.userId).toBe(user.id);
  expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  expect(clearCache).toHaveBeenCalledOnce();
});

it('ignores a startup response that arrives after the session ended', async () => {
  let finish: (value: User) => void = () => undefined;
  vi.mocked(api.auth.me).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () =>
    root.render(
      <AuthGate>
        <p>Account workout</p>
      </AuthGate>,
    ),
  );
  await act(async () => emitAuthExpired());
  await act(async () => finish(user));
  expect(container.textContent).toContain('Sign in');
  expect(container.textContent).not.toContain('Account workout');
  expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
});

async function showSignIn() {
  vi.mocked(api.auth.me).mockRejectedValue(new ApiError('Not signed in', 'not_authenticated', 401));
  await act(async () =>
    root.render(
      <AuthGate>
        <p>Account workout</p>
      </AuthGate>,
    ),
  );
  expect(container.textContent).toContain('Sign in');
  expect(signIn.current).not.toBeNull();
}

it('reloads into a ready update when signing in instead of opening this release', async () => {
  await showSignIn();
  applyUpdateOnSignIn.mockResolvedValue(true);

  let settled = false;
  await act(async () => {
    void signIn.current!(user).then(() => {
      settled = true;
    });
  });

  expect(applyUpdateOnSignIn).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain('Account workout');
  // The sign-in button keeps its busy state until the page reloads.
  expect(settled).toBe(false);
  expect(localStorage.getItem(LAST_USER_KEY)).toContain('sample');
});

it('opens the app as usual after signing in when no update is ready', async () => {
  await showSignIn();

  await act(async () => signIn.current!(user));

  expect(applyUpdateOnSignIn).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('Account workout');
});
