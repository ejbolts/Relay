// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { hasAdminActivitySubscribers, publishAdminActivity, useAdminUsers } from './adminActivity';
import type { AdminUser, FriendPresence } from './types';

const user: AdminUser = {
  id: 'sample',
  username: 'sample',
  display_name: 'Sample member',
  is_admin: false,
  disabled_at: null,
  must_change_password: false,
  created_at: '2026-10-01T10:00:00Z',
  last_active_at: null,
  signed_in_devices: 1,
  workouts: 2,
  photos: 0,
  photo_bytes: 0,
  video_sessions: 0,
};
const live: FriendPresence = {
  online: true,
  last_active_at: '2026-11-01T01:00:00Z',
  workout: { name: 'Push day', kind: 'strength', started_at: '2026-11-01T00:40:00Z' },
};
let root: Root;
let host: HTMLDivElement;
let state: ReturnType<typeof useAdminUsers>;
function Harness({ active = true }: { active?: boolean }) {
  state = useAdminUsers(active);
  return <output>{JSON.stringify(state.users)}</output>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api.admin, 'users').mockResolvedValue([user]);
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
async function mount() {
  await act(async () => root.render(<Harness />));
  await act(async () => state.loadUsers());
}

it('applies activity without reloading unrelated data and refreshes the snapshot after reconnect', async () => {
  await mount();
  await act(async () => publishAdminActivity({ userId: user.id, presence: live }));
  expect(state.users?.[0]).toMatchObject({
    presence: live,
    last_active_at: live.last_active_at,
    workouts: 2,
  });
  expect(api.admin.users).toHaveBeenCalledOnce();
  const offline = { ...live, online: false, workout: null };
  vi.mocked(api.admin.users).mockResolvedValue([{ ...user, presence: offline }]);
  await act(async () => publishAdminActivity(null));
  expect(state.users?.[0].presence).toEqual(offline);
  expect(api.admin.users).toHaveBeenCalledTimes(2);
});

it('does not let a delayed snapshot overwrite a newer socket update', async () => {
  await mount();
  let resolve!: (users: AdminUser[]) => void;
  vi.mocked(api.admin.users).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let request!: Promise<void>;
  await act(async () => {
    request = state.loadUsers();
  });
  await act(async () => publishAdminActivity({ userId: user.id, presence: live }));
  await act(async () => {
    resolve([user]);
    await request;
  });
  expect(state.users?.[0].presence).toEqual(live);
});

it('unsubscribes when hidden and ignores a snapshot that returns after leaving', async () => {
  await mount();
  let resolve!: (users: AdminUser[]) => void;
  vi.mocked(api.admin.users).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let request!: Promise<void>;
  await act(async () => {
    request = state.loadUsers();
  });
  await act(async () => root.render(<Harness active={false} />));
  expect(hasAdminActivitySubscribers()).toBe(false);
  await act(async () => {
    publishAdminActivity({ userId: user.id, presence: live });
    resolve([]);
    await request;
  });
  expect(state.users).toEqual([user]);
});

it('keeps a newer refresh when an older request finishes last', async () => {
  await mount();
  let resolve!: (users: AdminUser[]) => void;
  vi.mocked(api.admin.users).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let first!: Promise<void>;
  await act(async () => {
    first = state.loadUsers();
  });
  vi.mocked(api.admin.users).mockResolvedValue([{ ...user, workouts: 3 }]);
  await act(async () => state.loadUsers());
  await act(async () => {
    resolve([user]);
    await first;
  });
  expect(state.users?.[0].workouts).toBe(3);
});

it('keeps the last snapshot after a reconnect failure and retries when focused', async () => {
  await mount();
  vi.mocked(api.admin.users).mockRejectedValueOnce(new Error('Temporary outage'));
  await act(async () => publishAdminActivity(null));
  expect(state.users).toEqual([user]);
  vi.mocked(api.admin.users).mockResolvedValue([{ ...user, presence: live }]);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(state.users?.[0].presence).toEqual(live);
});
