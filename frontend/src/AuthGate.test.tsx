import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { isAppUpdateRequired } from './appUpdates';
import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from './clientVersion';
import { AUTH_EXPIRED_EVENT } from './authEvents';
import { AuthGateView } from './AuthGate';
import type { User } from './types';
import { useUserSession, type UserSession } from './userContext';

afterEach(() => {
  vi.unstubAllGlobals();
});

const user: User = {
  id: 'user-1',
  username: 'lifter',
  display_name: 'Lifter',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
};

const session: UserSession = {
  user,
  updateUser: vi.fn(),
  signOut: vi.fn(),
  accountDeleted: vi.fn(),
};

function WhoAmI() {
  return <p id="app">App for {useUserSession().user?.display_name}</p>;
}

function view(state: Parameters<typeof AuthGateView>[0]['state']) {
  return renderToStaticMarkup(
    <AuthGateView
      state={state}
      authConfig={{ registration_open: true, invite_code_required: false }}
      session={session}
      onAuthenticated={vi.fn()}
      onRetry={vi.fn()}
    >
      <WhoAmI />
    </AuthGateView>,
  ).toLowerCase();
}

describe('AuthGateView', () => {
  it('shows the startup skeleton and no app while the session is being checked', () => {
    const markup = view({ status: 'loading' });

    expect(markup).toContain('today-loading-skeleton');
    expect(markup).toContain('loading your training summary');
    expect(markup).not.toContain('id="app"');
  });

  it('shows the sign-in screen, not the app, when signed out', () => {
    const markup = view({ status: 'signed-out' });

    expect(markup).toContain('auth-screen');
    expect(markup).toContain('autocomplete="current-password"');
    expect(markup).not.toContain('id="app"');
  });

  it('renders the app with the user in context once authenticated', () => {
    const markup = view({ status: 'authenticated', user, offline: false });

    expect(markup).toContain('id="app"');
    expect(markup).toContain('lifter');
    expect(markup).not.toContain('auth-screen');
  });

  it('offers a retry instead of the sign-in screen when the server is unreachable', () => {
    const markup = view({ status: 'unreachable', message: 'Cannot reach the server.' });

    expect(markup).toContain('cannot reach the server.');
    expect(markup).toContain('try again');
    expect(markup).not.toContain('autocomplete="current-password"');
  });
});

describe('api session handling', () => {
  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const expired = vi.fn();
    target.addEventListener(AUTH_EXPIRED_EVENT, expired);
    return { fetchMock, expired };
  }

  const unauthenticated = { error: { code: 'not_authenticated', message: 'Sign in required.' } };

  it('asks for the app update when the server turns away a save from this release', async () => {
    const message =
      'Relay needs to update before it can save this. Refresh the app, then try again.';
    const { fetchMock } = stubFetch(426, { error: { code: 'client_outdated', message } });
    expect(isAppUpdateRequired()).toBe(false);

    const saving = api.saveBodySizes({ date: '2026-11-08' } as never);

    await expect(saving).rejects.toEqual(new ApiError(message, 'client_outdated', 426));
    await expect(saving).rejects.toMatchObject({ status: 426, code: 'client_outdated' });
    expect(isAppUpdateRequired()).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get(CLIENT_VERSION_HEADER)).toBe(CLIENT_VERSION);
  });

  it('signals an ended session when an authenticated request returns 401', async () => {
    const { fetchMock, expired } = stubFetch(401, unauthenticated);

    await expect(api.listExercises()).rejects.toMatchObject({
      code: 'not_authenticated',
      status: 401,
    });

    expect(expired).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/exercises',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get(CLIENT_VERSION_HEADER)).toBe(CLIENT_VERSION);
  });

  it('does not treat the startup /me check or a wrong password as an ended session', async () => {
    const { expired } = stubFetch(401, unauthenticated);

    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    await expect(api.auth.login({ username: 'aaa', password: 'x' })).rejects.toMatchObject({
      status: 401,
    });

    expect(expired).not.toHaveBeenCalled();
  });

  it('sends the session cookie to the same origin and never omits credentials', async () => {
    const { fetchMock } = stubFetch(200, user);

    await api.auth.login({ username: 'aaa', password: 'correct horse' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });
});
