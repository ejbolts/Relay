// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from './api';
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

async function renderWithUsernameChange(
  onUsernameChange: (user: AdminUser, username: string) => Promise<void>,
) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
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
        onUsernameChange={onUsernameChange}
        onTemporaryPasswordDismiss={vi.fn()}
        onRefresh={vi.fn()}
      />,
    ),
  );
}

const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name);
const usernameDialog = () =>
  document.querySelector<HTMLDialogElement>('dialog.admin-username-dialog');
const usernameInput = () =>
  usernameDialog()!.querySelector<HTMLInputElement>('input[name="username"]')!;
async function typeUsername(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      usernameInput(),
      value,
    );
    usernameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('lets an admin change a username, explaining an invalid or taken one', async () => {
  const onUsernameChange = vi
    .fn<(user: AdminUser, username: string) => Promise<void>>()
    .mockRejectedValueOnce(new ApiError('taken', 'username_taken', 409))
    .mockResolvedValueOnce(undefined);
  await renderWithUsernameChange(onUsernameChange);

  await act(async () => buttonNamed('Change username')!.click());
  expect(usernameDialog()?.open).toBe(true);
  expect(usernameDialog()!.textContent).toContain('Change Member’s username');
  expect(usernameInput().value).toBe('member');

  await typeUsername('no spaces allowed');
  await act(async () => buttonNamed('Save username')!.click());
  expect(onUsernameChange).not.toHaveBeenCalled();
  expect(usernameInput().getAttribute('aria-invalid')).toBe('true');

  await typeUsername(' Taken.Name ');
  await act(async () => buttonNamed('Save username')!.click());
  expect(onUsernameChange).toHaveBeenLastCalledWith(member, 'taken.name');
  expect(usernameDialog()!.textContent).toContain('This username is already registered.');

  await typeUsername('member.new');
  await act(async () => buttonNamed('Save username')!.click());
  expect(onUsernameChange).toHaveBeenLastCalledWith(member, 'member.new');
  expect(usernameDialog()).toBeNull();
});

it('closes without saving when the username is unchanged', async () => {
  const onUsernameChange = vi.fn<(user: AdminUser, username: string) => Promise<void>>();
  await renderWithUsernameChange(onUsernameChange);

  await act(async () => buttonNamed('Change username')!.click());
  await act(async () => buttonNamed('Save username')!.click());

  expect(onUsernameChange).not.toHaveBeenCalled();
  expect(usernameDialog()).toBeNull();
});
