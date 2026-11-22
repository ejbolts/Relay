// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { AuthGate } from './AuthGate';
import { LAST_USER_KEY } from './sessionCleanup';
import { sessionConfirmation } from './sessionGate';
import type { User } from './types';
import { useUserSession } from './userContext';

const { clearCache } = vi.hoisted(() => ({ clearCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./workoutCache', async (original) => ({
  ...(await original<typeof import('./workoutCache')>()),
  clearWorkoutCache: clearCache,
}));
vi.mock('./AuthScreen', () => ({
  AuthBrand: () => null,
  AuthScreen: () => <p>Sign in</p>,
}));

const remembered = { id: 'sample', username: 'sample', display_name: 'Sample Lifter' } as User;
const confirmed = { ...remembered, display_name: 'Sample Lifter (renamed)' } as User;
const fetchMock = vi.fn<typeof fetch>();
let container: HTMLDivElement;
let root: Root;
let answer: (user: User) => void;
let fail: (reason: unknown) => void;

function Account() {
  return <p>Account of {useUserSession().user?.display_name}</p>;
}

/** A change the open app tries to send, and whether it has been sent or refused yet. */
function sendChange() {
  const outcome = { sent: false, refused: null as unknown };
  api.saveAppNotices({ weekly_review_seen: '2026-11-16' }).then(
    () => (outcome.sent = true),
    (reason: unknown) => (outcome.refused = reason),
  );
  return outcome;
}

const requested = (path: string) => fetchMock.mock.calls.some(([input]) => String(input) === path);

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', undefined);
  fetchMock.mockReset().mockImplementation(
    async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(api.auth, 'me').mockReturnValue(
    new Promise<User>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    }),
  );
  vi.spyOn(api.auth, 'config').mockResolvedValue({
    registration_open: false,
    invite_code_required: false,
  });
  localStorage.clear();
  sessionStorage.clear();
  clearCache.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  // The gate lets go of held changes once it is gone for good.
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
  expect(sessionConfirmation()).toBeNull();
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open() {
  await act(async () =>
    root.render(
      <AuthGate>
        <Account />
      </AuthGate>,
    ),
  );
}

it('waits for the server on a device that remembers no account', async () => {
  await open();
  expect(container.textContent).not.toContain('Account of');
  expect(container.querySelector('.today-loading-skeleton')).not.toBeNull();
  // Nothing is open yet, so there is nothing to hold.
  expect(sessionConfirmation()).toBeNull();

  await act(async () => answer(confirmed));
  expect(container.textContent).toContain('Account of Sample Lifter (renamed)');
});

it('opens a remembered account at once and holds its changes until the server confirms it', async () => {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(remembered));
  await open();
  // Open before the session check has answered.
  expect(container.textContent).toContain('Account of Sample Lifter');
  expect(container.querySelector('.today-loading-skeleton')).toBeNull();

  const change = sendChange();
  await act(async () => undefined);
  expect(requested('/api/app-notices')).toBe(false);
  expect(change).toEqual({ sent: false, refused: null });
  // Reading is not held.
  await act(async () => void (await api.getAppNotices().catch(() => undefined)));
  expect(requested('/api/app-notices')).toBe(true);
  fetchMock.mockClear();

  await act(async () => answer(confirmed));
  expect(container.textContent).toContain('Account of Sample Lifter (renamed)');
  expect(sessionConfirmation()).toBeNull();
  expect(requested('/api/app-notices')).toBe(true);
  expect(change.sent).toBe(true);
});

it('refuses held changes and shows sign-in when the session has ended', async () => {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(remembered));
  await open();
  const change = sendChange();

  await act(async () => fail(new ApiError('Not signed in', 'not_authenticated', 401)));
  expect(container.textContent).toContain('Sign in');
  expect(container.textContent).not.toContain('Account of');
  expect(requested('/api/app-notices')).toBe(false);
  expect(change.sent).toBe(false);
  expect(change.refused).toMatchObject({ status: 401, code: 'not_authenticated' });
  expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
});

it('refuses held changes when the session belongs to another account', async () => {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(remembered));
  await open();
  const change = sendChange();

  const other = { id: 'other', username: 'other', display_name: 'Other Lifter' } as User;
  await act(async () => answer(other));
  // The remembered account's saved data is wiped before the other account's app opens.
  expect(clearCache).toHaveBeenCalled();
  expect(container.textContent).toContain('Account of Other Lifter');
  expect(requested('/api/app-notices')).toBe(false);
  expect(change.sent).toBe(false);
  expect(change.refused).toBeInstanceOf(ApiError);
});

it('keeps working from this device when the server cannot be reached', async () => {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(remembered));
  await open();
  const change = sendChange();

  await act(async () => fail(new TypeError('Failed to fetch')));
  expect(container.textContent).toContain('Account of Sample Lifter');
  // Offline, changes are tried as they always were, so they can queue and sync later.
  expect(sessionConfirmation()).toBeNull();
  expect(requested('/api/app-notices')).toBe(true);
  expect(change.sent).toBe(true);
});

it('never holds signing in or out', async () => {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(remembered));
  await open();
  await act(async () => void (await api.auth.logoutSession().catch(() => undefined)));
  expect(requested('/api/auth/logout-session')).toBe(true);
  await act(async () => answer(confirmed));
});
