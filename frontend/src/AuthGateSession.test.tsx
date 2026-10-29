// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { emitAuthExpired } from './authEvents';
import { AuthGate } from './AuthGate';
import { LAST_USER_KEY } from './sessionCleanup';
import { ACTIVE_WORKOUT_DRAFT_KEY } from './workoutDraft';
import type { User } from './types';

const { clearCache } = vi.hoisted(() => ({ clearCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./workoutCache', async (original) => ({
  ...(await original<typeof import('./workoutCache')>()),
  clearWorkoutCache: clearCache,
}));
vi.mock('./AuthScreen', () => ({
  AuthBrand: () => null,
  AuthScreen: () => <p>Sign in</p>,
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

it('unmounts account content and clears offline data when a live session ends', async () => {
  await act(async () =>
    root.render(
      <AuthGate>
        <p>Account workout</p>
      </AuthGate>,
    ),
  );
  expect(container.textContent).toContain('Account workout');
  localStorage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, 'sample unfinished workout');
  clearCache.mockClear();

  await act(async () => emitAuthExpired());

  expect(container.textContent).toContain('Sign in');
  expect(container.textContent).not.toContain('Account workout');
  expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  expect(localStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)).toBeNull();
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
