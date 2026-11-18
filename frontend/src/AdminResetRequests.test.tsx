// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { requestAdminAccountFocus, useAdminAccountFocus } from './adminAccountFocus';
import { publishAdminActivity, resetRequestsFirst } from './adminActivity';
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
    expect(resetRequestsFirst([owner, casey, riley]).map((user) => user.id)).toEqual([
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
    expect(first.classList.contains('has-reset-request')).toBe(true);
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
    expect(cards()[0].classList.contains('has-reset-request')).toBe(false);
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
});
