// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { requestAdminAccountFocus, useAdminAccountFocus } from './adminAccountFocus';
import { publishAdminActivity, requestsFirst } from './adminActivity';
import { AdminScreen } from './AdminScreen';
import type { AdminUser, ServerStatus, User } from './types';
import { UserContext, type UserSession } from './userContext';

const admin: User = {
  id: 'owner',
  username: 'owner',
  display_name: 'Owner',
  is_admin: true,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
};

function account(id: string, extra: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    username: id,
    display_name: id[0].toUpperCase() + id.slice(1),
    is_admin: id === 'owner',
    disabled_at: null,
    must_change_password: false,
    created_at: '2026-10-01T10:00:00Z',
    last_active_at: null,
    signed_in_devices: 1,
    workouts: 0,
    photos: 0,
    photo_bytes: 0,
    video_sessions: 0,
    ...extra,
  };
}

const requestedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
const owner = account('owner');
const casey = account('casey');
const riley = account('riley', { password_reset_requested_at: requestedAt });

const status: ServerStatus = {
  disk: { total_bytes: 1, used_bytes: 0, free_bytes: 1 },
  database_bytes: 0,
  photos: 0,
  photo_bytes: 0,
  video_file_bytes: 0,
  video_queue: {},
  client_versions: [],
  minimum_write_version: null,
};

const session: UserSession = {
  user: admin,
  updateUser: vi.fn(),
  signOut: vi.fn(),
  accountDeleted: vi.fn(),
};

let root: Root;
let host: HTMLDivElement;
let scrolled: Element[];

function FocusProbe() {
  const focus = useAdminAccountFocus();
  return <output data-testid="focus">{focus?.userId ?? ''}</output>;
}

async function render(active: boolean) {
  await act(async () =>
    root.render(
      <UserContext.Provider value={session}>
        <AdminScreen active={active} />
        <FocusProbe />
      </UserContext.Provider>,
    ),
  );
}

const cards = () => [...host.querySelectorAll<HTMLLIElement>('li.admin-user')];
const buttonNamed = (name: string) =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === name);
const accountsHeader = () =>
  host.querySelector('[aria-labelledby="admin-users-title"] > header')!.textContent;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  scrolled = [];
  Element.prototype.scrollIntoView = function () {
    scrolled.push(this);
  };
  vi.spyOn(api.admin, 'users').mockResolvedValue([owner, casey, riley]);
  vi.spyOn(api.admin, 'settings').mockResolvedValue({
    video_uploads: 'off',
    allow_registration: false,
    invite_code_required: false,
  });
  vi.spyOn(api.admin, 'status').mockResolvedValue(status);
  vi.spyOn(api.admin, 'limits').mockRejectedValue(new Error('not needed'));
  vi.spyOn(api.admin, 'feedback').mockResolvedValue([]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('password reset requests in the admin console', () => {
  it('sorts waiting accounts first and otherwise keeps the server order', () => {
    expect(requestsFirst([owner, casey, riley]).map((user) => user.id)).toEqual([
      'riley',
      'owner',
      'casey',
    ]);
  });

  it('highlights the account, makes the reset its main action, and dismisses in place', async () => {
    const dismiss = vi.spyOn(api.admin, 'dismissPasswordResetRequest').mockResolvedValue();
    await render(true);

    const [first] = cards();
    expect(first.id).toBe('admin-user-riley');
    expect(first.classList.contains('has-request')).toBe(true);
    expect(first.textContent).toContain('Reset requested');
    expect(first.querySelector('.admin-user-request')?.textContent).toBe(
      'Asked for a reset2 h ago',
    );
    expect(first.querySelector('.admin-user-actions .profile-primary')?.textContent).toBe(
      'Reset password',
    );
    expect(accountsHeader()).toContain('1 reset request');
    expect(cards()[1].textContent).not.toContain('Reset requested');

    await act(async () => buttonNamed('Dismiss request')!.click());

    expect(dismiss).toHaveBeenCalledWith('riley');
    expect(cards()[0].id).toBe('admin-user-riley');
    expect(cards()[0].classList.contains('has-request')).toBe(false);
    expect(cards()[0].textContent).not.toContain('Reset requested');
    expect(buttonNamed('Dismiss request')).toBeUndefined();
    expect(accountsHeader()).not.toContain('reset request');
  });

  it('clears the request when the password is reset', async () => {
    vi.spyOn(api.admin, 'resetUserPassword').mockResolvedValue({
      temporary_password: 'abcde-fghjk-mnpqr',
    });
    await render(true);

    await act(async () => buttonNamed('Reset password')!.click());
    await act(async () => buttonNamed('Reset and sign out')!.click());

    expect(cards()[0].textContent).toContain('Temporary password');
    expect(cards()[0].textContent).not.toContain('Reset requested');
    expect(accountsHeader()).not.toContain('reset request');
  });

  it('opens a notified account only after the console has reloaded', async () => {
    // An earlier visit loaded the list before Riley asked.
    vi.mocked(api.admin.users).mockResolvedValueOnce([owner, casey, account('riley')]);
    await render(true);
    await render(false);
    let finish!: (users: AdminUser[]) => void;
    vi.mocked(api.admin.users).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    requestAdminAccountFocus('riley');
    await render(true);

    expect(scrolled).toEqual([]);
    expect(host.querySelector('[data-testid="focus"]')?.textContent).toBe('riley');

    await act(async () => finish([owner, casey, riley]));

    const card = host.querySelector('#admin-user-riley');
    expect(scrolled).toEqual([card]);
    expect(document.activeElement).toBe(card);
    expect(cards()[0]).toBe(card);
    expect(host.querySelector('[data-testid="focus"]')?.textContent).toBe('');
  });

  it('waits for the list that is shown when an earlier load is overtaken', async () => {
    const pending: ((users: AdminUser[]) => void)[] = [];
    vi.mocked(api.admin.users).mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    requestAdminAccountFocus('riley');
    await render(true);
    // The live activity socket reconnects and reloads the list while the first load is waiting.
    await act(async () => publishAdminActivity(null));
    expect(pending).toHaveLength(2);

    await act(async () => pending[0]([owner, casey, riley]));

    expect(cards()).toHaveLength(0);
    expect(scrolled).toEqual([]);
    expect(host.querySelector('[data-testid="focus"]')?.textContent).toBe('riley');

    await act(async () => pending[1]([owner, casey, riley]));

    const card = host.querySelector('#admin-user-riley');
    expect(scrolled).toEqual([card]);
    expect(document.activeElement).toBe(card);
    expect(host.querySelector('[data-testid="focus"]')?.textContent).toBe('');
  });

  it('scrolls only once the panels above the accounts have loaded', async () => {
    let finishStatus!: (value: ServerStatus) => void;
    let failLimits!: (reason: Error) => void;
    vi.mocked(api.admin.status).mockReturnValue(
      new Promise((resolve) => {
        finishStatus = resolve;
      }),
    );
    vi.mocked(api.admin.limits).mockReturnValue(
      new Promise((_, reject) => {
        failLimits = reject;
      }),
    );
    requestAdminAccountFocus('riley');
    await render(true);

    expect(cards()).toHaveLength(3);
    expect(scrolled).toEqual([]);

    await act(async () => {
      finishStatus(status);
      failLimits(new Error('not needed'));
    });

    expect(scrolled).toEqual([host.querySelector('#admin-user-riley')]);
  });
});

describe('changing a username in the admin console', () => {
  it('saves through the admin API and updates the card in place', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    const save = vi
      .spyOn(api.admin, 'setUserUsername')
      .mockResolvedValue({ ...casey, username: 'casey.s' });
    await render(true);

    const card = host.querySelector('#admin-user-casey')!;
    const change = [...card.querySelectorAll('button')].find(
      (button) => button.textContent === 'Change username',
    )!;
    await act(async () => change.click());
    const input = document.querySelector<HTMLInputElement>(
      'dialog.admin-username-dialog input[name="username"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Casey.S',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Save username')!
        .click(),
    );

    expect(save).toHaveBeenCalledWith('casey', 'casey.s');
    expect(document.querySelector('dialog.admin-username-dialog')).toBeNull();
    expect(card.querySelector('.admin-user-heading')?.textContent).toContain('casey.s');
    expect(document.body.textContent).toContain('Casey’s username is now @casey.s.');
  });
});

describe('username requests in the admin console', () => {
  const jordan = account('jordan', { username_reminder_requested_at: requestedAt });

  it('sorts accounts waiting for their username first too', () => {
    expect(requestsFirst([owner, casey, jordan]).map((user) => user.id)).toEqual([
      'jordan',
      'owner',
      'casey',
    ]);
  });

  it('highlights the account with its username and dismisses the request in place', async () => {
    vi.mocked(api.admin.users).mockResolvedValue([owner, casey, jordan]);
    const dismissReset = vi.spyOn(api.admin, 'dismissPasswordResetRequest').mockResolvedValue();
    const dismiss = vi.spyOn(api.admin, 'dismissUsernameReminderRequest').mockResolvedValue();
    await render(true);

    const [first] = cards();
    expect(first.id).toBe('admin-user-jordan');
    expect(first.classList.contains('has-request')).toBe(true);
    expect(first.textContent).toContain('Username requested');
    expect(first.textContent).not.toContain('Reset requested');
    expect(first.querySelector('.admin-user-heading')?.textContent).toContain('jordan');
    expect(first.querySelector('.admin-user-request')?.textContent).toBe(
      'Asked for username2 h ago',
    );
    // Telling them their username needs no reset, so it is not the main action.
    expect(first.querySelector('.admin-user-actions .profile-primary')).toBeNull();
    expect(accountsHeader()).toContain('1 username request');

    await act(async () => buttonNamed('Dismiss request')!.click());

    expect(dismiss).toHaveBeenCalledWith('jordan');
    expect(dismissReset).not.toHaveBeenCalled();
    expect(cards()[0].classList.contains('has-request')).toBe(false);
    expect(cards()[0].textContent).not.toContain('Username requested');
    expect(accountsHeader()).not.toContain('request');
  });

  it('dismisses both requests when an account has asked for each', async () => {
    const both = account('riley', {
      password_reset_requested_at: requestedAt,
      username_reminder_requested_at: requestedAt,
    });
    vi.mocked(api.admin.users).mockResolvedValue([owner, both, jordan]);
    const dismissReset = vi.spyOn(api.admin, 'dismissPasswordResetRequest').mockResolvedValue();
    const dismissUsername = vi
      .spyOn(api.admin, 'dismissUsernameReminderRequest')
      .mockResolvedValue();
    await render(true);

    expect(accountsHeader()).toContain('3 requests');
    const riley = host.querySelector('#admin-user-riley')!;
    expect(riley.textContent).toContain('Reset requested');
    expect(riley.textContent).toContain('Username requested');

    await act(async () => buttonNamed('Dismiss requests')!.click());

    expect(dismissReset).toHaveBeenCalledWith('riley');
    expect(dismissUsername).toHaveBeenCalledWith('riley');
    expect(riley.classList.contains('has-request')).toBe(false);
    expect(accountsHeader()).toContain('1 username request');
  });

  it('filters to accounts waiting for their username', async () => {
    vi.mocked(api.admin.users).mockResolvedValue([owner, casey, riley, jordan]);
    await render(true);

    await act(async () => buttonNamed('Username requested')!.click());

    expect(cards().map((card) => card.id)).toEqual(['admin-user-jordan']);
  });
});
