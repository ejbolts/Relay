import { describe, expect, it } from 'vitest';
import {
  accountActivityLabel,
  accountFilterOptions,
  accountsTitle,
  accountVersionsLabel,
  afterPasswordReset,
  diskUsedPercent,
  dismissRequestsLabel,
  filterAccounts,
  nativeClientLabel,
  registrationSummary,
  settingsSavedNotice,
  waitingRequestsLabel,
  withAdminActivity,
} from './adminAccounts';
import type { AdminUser, FriendPresence } from './types';

function account(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: 'a',
    username: 'casey',
    display_name: 'Casey',
    is_admin: false,
    disabled_at: null,
    must_change_password: false,
    created_at: '2026-01-01T00:00:00Z',
    last_active_at: null,
    signed_in_devices: 1,
    workouts: 0,
    photos: 0,
    photo_bytes: 0,
    video_sessions: 0,
    ...overrides,
  };
}

const casey = account({ id: 'casey' });
const riley = account({
  id: 'riley',
  username: 'riley',
  display_name: 'Riley',
  password_reset_requested_at: '2026-01-02T00:00:00Z',
});
const jordan = account({
  id: 'jordan',
  username: 'jordan',
  display_name: 'Jordan',
  disabled_at: '2026-01-02T00:00:00Z',
  username_reminder_requested_at: '2026-01-02T00:00:00Z',
});

describe('admin accounts', () => {
  it('searches names and usernames within a filter', () => {
    expect(filterAccounts([casey, riley, jordan], 'RIL', null)?.map((u) => u.id)).toEqual([
      'riley',
    ]);
    expect(filterAccounts([casey, riley, jordan], '', 'disabled')?.map((u) => u.id)).toEqual([
      'jordan',
    ]);
    expect(filterAccounts(null, 'x', null)).toBeNull();
  });

  it('offers only filters that would find someone, keeping the chosen one', () => {
    expect(accountFilterOptions([casey, riley], null).map((o) => o.id)).toEqual(['reset']);
    expect(accountFilterOptions([casey], 'temporary').map((o) => o.id)).toEqual(['temporary']);
  });

  it('counts accounts and the requests still waiting', () => {
    expect(accountsTitle([casey, riley, jordan])).toBe('3 accounts · 1 disabled');
    expect(accountsTitle(null)).toBe('Accounts');
    expect(waitingRequestsLabel([casey])).toBeNull();
    expect(waitingRequestsLabel([riley])).toBe('1 reset request');
    expect(waitingRequestsLabel([jordan])).toBe('1 username request');
    expect(waitingRequestsLabel([riley, jordan])).toBe('2 requests');
    expect(dismissRequestsLabel({ ...riley, username_reminder_requested_at: 'x' })).toBe(
      'Dismiss requests',
    );
  });

  it('describes live activity, but never for a disabled account', () => {
    const presence: FriendPresence = {
      online: true,
      last_active_at: '2026-01-03T00:00:00Z',
      workout: { name: 'Legs', started_at: '2026-01-03T00:00:00Z' },
    } as FriendPresence;
    const live = withAdminActivity(casey, presence);
    expect(live.last_active_at).toBe(presence.last_active_at);
    expect(accountActivityLabel(live, Date.now())).toBe('Live · Legs');
    expect(accountActivityLabel(withAdminActivity(jordan, presence), Date.now())).not.toMatch(
      /Live|Active now/,
    );
  });

  it('labels app versions and native builds', () => {
    expect(accountVersionsLabel(casey)).toBe('Not reported');
    expect(accountVersionsLabel({ ...casey, signed_in_devices: 0 })).toBe('No signed-in devices');
    expect(
      accountVersionsLabel({
        ...casey,
        client_versions: [
          { version: '1.4.0', devices: 2 },
          { version: null, devices: 1 },
        ],
      }),
    ).toBe('v1.4.0 (2 devices), Not reported (1 device)');
    expect(nativeClientLabel('ios/1.0.3')).toBe('iOS 1.0.3');
    expect(nativeClientLabel('android/2')).toBe('Android 2');
  });

  it('summarises server settings and storage', () => {
    expect(diskUsedPercent({ total_bytes: 200, used_bytes: 50, free_bytes: 150 })).toBe(25);
    expect(diskUsedPercent({ total_bytes: 0, used_bytes: 0, free_bytes: 0 })).toBe(0);
    const settings = { video_uploads: 'admin' as const, allow_registration: true };
    expect(registrationSummary({ ...settings, invite_code_required: true })).toMatch(/invite/);
    expect(
      settingsSavedNotice(
        { video_uploads: 'everyone' },
        { ...settings, video_uploads: 'everyone', invite_code_required: false },
      ),
    ).toBe('Video uploads: Everyone.');
    expect(
      settingsSavedNotice(
        { allow_registration: false },
        { ...settings, allow_registration: false, invite_code_required: false },
      ),
    ).toBe('Sign-ups are closed.');
  });

  it('marks a reset account as signed out on a temporary password', () => {
    expect(afterPasswordReset(riley)).toMatchObject({
      must_change_password: true,
      password_reset_requested_at: null,
      signed_in_devices: 0,
    });
  });
});
