// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminScreenView } from './AdminScreen';
import type { AdminUser } from './types';

const member: AdminUser = {
  id: 'member',
  username: 'member',
  display_name: 'Member',
  is_admin: false,
  disabled_at: null,
  must_change_password: false,
  created_at: '2026-10-01T10:00:00Z',
  last_active_at: '2026-10-10T10:00:00Z',
  signed_in_devices: 1,
  workouts: 0,
  photos: 0,
  photo_bytes: 0,
  video_sessions: 0,
  sex: 'female',
};

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('lets an admin change or clear an account sex', async () => {
  const onUserSexChange = vi.fn();
  await act(async () =>
    root.render(
      <AdminScreenView
        currentUserId="owner"
        users={[member]}
        settings={null}
        status={null}
        limits={null}
        loading={false}
        error={null}
        notice={null}
        savingSetting={false}
        savingLimits={false}
        busyUserId={null}
        temporaryPassword={null}
        onVideoUploadsChange={vi.fn()}
        onSaveLimits={vi.fn()}
        onRegistrationChange={vi.fn()}
        onUserDisabledChange={vi.fn()}
        onResetPassword={vi.fn()}
        onUserSexChange={onUserSexChange}
        onTemporaryPasswordDismiss={vi.fn()}
        onRefresh={vi.fn()}
      />,
    ),
  );
  const select = container.querySelector<HTMLSelectElement>('#admin-sex-member')!;
  expect(container.querySelector('label[for="admin-sex-member"]')?.textContent).toBe('Sex');
  expect(select.value).toBe('female');
  expect([...select.options].map((option) => option.textContent)).toEqual([
    'Not set',
    'Male',
    'Female',
  ]);
  for (const value of ['male', '']) {
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  expect(onUserSexChange.mock.calls).toEqual([
    [member, 'male'],
    [member, null],
  ]);
});
