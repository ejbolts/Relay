// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { PasswordChangeRequired } from './PasswordChangeRequired';
import type { User } from './types';
import { UserContext, type UserSession } from './userContext';

const flagged: User = {
  id: 'lifter',
  username: 'lifter',
  display_name: 'Lifter',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
  must_change_password: true,
};
const cleared: User = { ...flagged, must_change_password: false };

let container: HTMLDivElement;
let root: Root;
let session: UserSession;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  session = {
    user: flagged,
    updateUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    accountDeleted: vi.fn(),
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open() {
  await act(async () => {
    root.render(
      <UserContext.Provider value={session}>
        <PasswordChangeRequired />
      </UserContext.Provider>,
    );
  });
}

async function type(label: string, value: string) {
  const input = Array.from(container.querySelectorAll('label')).find(
    (element) => element.textContent === label,
  )?.control as HTMLInputElement;
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

describe('PasswordChangeRequired', () => {
  it('replaces the temporary password and unlocks the app with the refreshed account', async () => {
    const change = vi.spyOn(api, 'changePassword').mockResolvedValue(undefined);
    vi.spyOn(api.auth, 'me').mockResolvedValue(cleared);
    await open();

    await type('Temporary password', 'abcde-fghjk-mnpqr');
    await type('New password', 'my own passphrase');
    await type('Confirm new password', 'my own passphrase');
    await submit();

    expect(change).toHaveBeenCalledWith({
      current_password: 'abcde-fghjk-mnpqr',
      new_password: 'my own passphrase',
    });
    expect(session.updateUser).toHaveBeenCalledWith(cleared);
  });

  it('keeps the account locked when the new passwords differ or are too short', async () => {
    const change = vi.spyOn(api, 'changePassword').mockResolvedValue(undefined);
    await open();
    await type('Temporary password', 'abcde-fghjk-mnpqr');

    await type('New password', 'short');
    await type('Confirm new password', 'short');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('at least 10');

    await type('New password', 'my own passphrase');
    await type('Confirm new password', 'something else entirely');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('do not match');

    expect(change).not.toHaveBeenCalled();
    expect(session.updateUser).not.toHaveBeenCalled();
  });

  it('shows the server refusal and stays on the screen', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(
      new ApiError('Choose a different password.', 'password_unchanged', 400),
    );
    await open();
    await type('Temporary password', 'abcde-fghjk-mnpqr');
    await type('New password', 'abcde-fghjk-mnpqr');
    await type('Confirm new password', 'abcde-fghjk-mnpqr');

    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'different password from the temporary one',
    );
    expect(session.updateUser).not.toHaveBeenCalled();
  });

  it('lets the person sign out instead', async () => {
    await open();
    const signOut = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Sign out',
    )!;

    await act(async () => signOut.click());

    expect(session.signOut).toHaveBeenCalled();
  });
});
