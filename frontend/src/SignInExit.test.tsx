// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGateView, type AuthGateViewProps } from './AuthGate';
import { AUTH_EXIT_MS } from './AuthScreen';
import type { User } from './types';
import type { UserSession } from './userContext';

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

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render(props: Partial<AuthGateViewProps>) {
  act(() =>
    root.render(
      <AuthGateView
        state={{ status: 'signed-out' }}
        authConfig={{ registration_open: false, invite_code_required: false }}
        session={session}
        onAuthenticated={vi.fn()}
        onRetry={vi.fn()}
        {...props}
      >
        <p id="app">App</p>
      </AuthGateView>,
    ),
  );
}

describe('sign-in exit', () => {
  it('mounts the app under the same sign-in screen while it animates away', () => {
    render({});
    const username = container.querySelector<HTMLInputElement>('input[name="username"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        username,
        'lifter',
      );
      username.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const onSignInExited = vi.fn();
    render({
      state: { status: 'authenticated', user, offline: false },
      signInExiting: true,
      onSignInExited,
    });

    // The app is already loading underneath; the typed form is kept rather than remounted.
    expect(container.querySelector('#app')).not.toBeNull();
    const screen = container.querySelector('.auth-screen')!;
    expect(screen.classList.contains('auth-exiting')).toBe(true);
    expect(screen.hasAttribute('inert')).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe(
      'lifter',
    );
    expect(screen.querySelector('.auth-submit')!.textContent).toContain('Signing in');

    act(() => vi.advanceTimersByTime(AUTH_EXIT_MS - 1));
    expect(onSignInExited).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSignInExited).toHaveBeenCalledOnce();

    render({ state: { status: 'authenticated', user, offline: false }, signInExiting: false });
    expect(container.querySelector('.auth-screen')).toBeNull();
    expect(container.querySelector('#app')).not.toBeNull();
  });

  it('opens a remembered session straight into the app without the exit', () => {
    render({ state: { status: 'authenticated', user, offline: false } });

    expect(container.querySelector('#app')).not.toBeNull();
    expect(container.querySelector('.auth-screen')).toBeNull();
  });
});
