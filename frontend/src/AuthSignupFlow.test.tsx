// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';
import { submitAuthForm } from './authForm';
import { appGuideWaiting } from './appGuideState';
import { captureFriendInvite, clearFriendInvite, pendingFriendInvite } from './friendInvite';

vi.mock('./authForm', async (original) => ({
  ...(await original<typeof import('./authForm')>()),
  submitAuthForm: vi.fn(),
}));

const user = {
  id: 'new-account',
  username: 'newlifter',
  display_name: 'New Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-18T00:00:00Z',
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(submitAuthForm).mockReset();
  clearFriendInvite();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearFriendInvite();
  vi.unstubAllGlobals();
});

async function fill(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('signup signs straight in', () => {
  it('pre-fills an editable QR invite code after a reload and preserves the friend through account creation', async () => {
    const history = { state: null, replaceState: vi.fn() };
    captureFriendInvite(
      { hash: '#friend=sample-friend&invite=sample%2Bcode', pathname: '/', search: '' },
      history,
    );
    const authenticated = vi.fn();
    const render = () =>
      root.render(
        <AuthScreen
          config={{ registration_open: true, invite_code_required: true }}
          onAuthenticated={authenticated}
        />,
      );
    await act(async () => render());
    // A real reload remounts the form with the invitation retained in session storage.
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => render());
    const createTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === 'Create account',
    )!;
    await act(async () => createTab.click());
    const input = container.querySelector<HTMLInputElement>('input[name="invite-code"]')!;
    expect(input.value).toBe('sample+code');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'updated-code',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(submitAuthForm).mockResolvedValue({ ok: true, user });
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(submitAuthForm).toHaveBeenCalledWith(
      'create-account',
      expect.objectContaining({ inviteCode: 'updated-code' }),
      expect.anything(),
    );
    expect(pendingFriendInvite()).toBe('sample-friend');
    expect(authenticated).toHaveBeenCalledExactlyOnceWith(user);
  });

  it('signs in to the new account and queues onboarding', async () => {
    const authenticated = vi.fn();
    vi.mocked(submitAuthForm).mockResolvedValue({ ok: true, user });
    await act(async () => {
      root.render(
        <AuthScreen
          config={{ registration_open: true, invite_code_required: false }}
          initialMode="create-account"
          onAuthenticated={authenticated}
        />,
      );
    });
    await fill('name', 'New Lifter');
    await fill('username', 'newlifter');
    await fill('password', 'sample signup password');
    await submit();

    expect(vi.mocked(submitAuthForm)).toHaveBeenCalledOnce();
    expect(authenticated).toHaveBeenCalledExactlyOnceWith(user);
    expect(appGuideWaiting(user.id)).toBe(true);
  });

  it('keeps the username and asks for the password when signing in after creating fails', async () => {
    const authenticated = vi.fn();
    vi.mocked(submitAuthForm).mockResolvedValue({ ok: true, user, needsSignIn: true });
    await act(async () => {
      root.render(
        <AuthScreen
          config={{ registration_open: true, invite_code_required: false }}
          initialMode="create-account"
          onAuthenticated={authenticated}
        />,
      );
    });
    await fill('name', 'New Lifter');
    await fill('username', 'newlifter');
    await fill('password', 'sample signup password');
    await submit();

    expect(authenticated).not.toHaveBeenCalled();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Sign in',
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Account created. Sign in',
    );
    expect(container.querySelector<HTMLInputElement>('input[name="username"]')?.value).toBe(
      'newlifter',
    );
    expect(container.querySelector<HTMLInputElement>('input[name="password"]')?.value).toBe('');
    expect(appGuideWaiting(user.id)).toBe(true);
  });
});

describe('sign-in form', () => {
  function press(name: string, key: string) {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.focus();
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
  }

  it('moves Return in the username field on to an empty password without errors', async () => {
    await act(async () =>
      root.render(
        <AuthScreen
          config={{ registration_open: false, invite_code_required: false }}
          onAuthenticated={vi.fn()}
        />,
      ),
    );
    await fill('username', 'lifter');

    let event!: KeyboardEvent;
    await act(async () => {
      event = press('username', 'Enter');
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('name')).toBe('password');
    expect(container.querySelector('[role="alert"], .auth-field-error')).toBeNull();
    expect(submitAuthForm).not.toHaveBeenCalled();
    expect(container.querySelector('input[name="username"]')?.getAttribute('enterkeyhint')).toBe(
      'next',
    );
    expect(container.querySelector('input[name="password"]')?.getAttribute('enterkeyhint')).toBe(
      'go',
    );

    // With the password filled, Return submits as usual.
    await fill('password', 'sample password');
    await act(async () => {
      event = press('username', 'Enter');
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it('starts with the username and the reason after a session ended elsewhere', async () => {
    await act(async () =>
      root.render(
        <AuthScreen
          config={{ registration_open: false, invite_code_required: false }}
          notice="You were signed out. Your workout is saved."
          initialUsername="lifter"
          onAuthenticated={vi.fn()}
        />,
      ),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'You were signed out. Your workout is saved.',
    );
    expect(container.querySelector<HTMLInputElement>('input[name="username"]')?.value).toBe(
      'lifter',
    );
  });

  it('says why account creation is unavailable only when its tab is tapped', async () => {
    await act(async () =>
      root.render(
        <AuthScreen
          config={{ registration_open: false, invite_code_required: false }}
          onAuthenticated={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).not.toContain('New accounts are closed');
    const createTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === 'Create account',
    )!;
    expect(createTab.getAttribute('aria-disabled')).toBe('true');

    await act(async () => createTab.click());

    expect(container.textContent).toContain('New accounts are closed on this server.');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Sign in',
    );
  });
});

describe('password visibility', () => {
  it('shows an open eye to reveal the password and a crossed-out eye to hide it again', async () => {
    await act(async () =>
      root.render(
        <AuthScreen
          config={{ registration_open: true, invite_code_required: false }}
          onAuthenticated={vi.fn()}
        />,
      ),
    );
    const toggle = container.querySelector<HTMLButtonElement>('.auth-reveal')!;
    const input = container.querySelector<HTMLInputElement>('input[name="password"]')!;
    const iconPath = () => toggle.querySelector('svg path')?.getAttribute('d');
    const eyePath = iconPath();

    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toBe('');
    expect(input.type).toBe('password');
    expect(eyePath).toMatch(/^M3 12s/);

    await act(async () => toggle.click());
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.title).toBe('Hide password');
    // The eye now has a line through it.
    expect(iconPath()).toMatch(/^M3 3l18 18/);

    await act(async () => toggle.click());
    expect(input.type).toBe('password');
    expect(iconPath()).toBe(eyePath);
  });
});
