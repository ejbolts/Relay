// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfileAvatar } from './ProfileAvatar';

const user = {
  display_name: 'Sample Lifter',
  username: 'sample',
  profile_photo_url: '/api/profile/photo?v=sample',
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(photo: string | null = user.profile_photo_url, viewable = true) {
  await act(async () =>
    root.render(
      <ProfileAvatar
        className="profile-avatar"
        user={{ ...user, profile_photo_url: photo }}
        viewable={viewable}
      />,
    ),
  );
}

async function open() {
  await act(async () => container.querySelector('button')!.click());
  return document.querySelector<HTMLDialogElement>('dialog')!;
}

it('opens the entire stored square and closes using the close button or Escape', async () => {
  await render();
  expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
    "View Sample Lifter's profile photo",
  );
  let dialog = await open();
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('img')?.getAttribute('src')).toBe(user.profile_photo_url);
  expect(dialog.querySelector('img')?.alt).toBe("Sample Lifter's profile photo");
  await act(async () => dialog.querySelector('button')!.click());
  expect(document.querySelector('dialog')).toBeNull();
  dialog = await open();
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(document.querySelector('dialog')).toBeNull();
});

it('does not add a viewer for initials, failed photos, or avatars used inside other controls', async () => {
  await render(null);
  expect(container.querySelector('button')).toBeNull();
  await render(user.profile_photo_url, false);
  expect(container.querySelector('button')).toBeNull();
  await render();
  await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('button')).toBeNull();
  expect(container.textContent).toBe('S');
});

it('hides an open viewer when the profile photo is replaced or removed', async () => {
  await render();
  await open();
  await render('/api/profile/photo?v=replacement');
  expect(document.querySelector('dialog')).toBeNull();
  const dialog = await open();
  expect(dialog.querySelector('img')?.getAttribute('src')).toContain('replacement');
  await render(null);
  expect(document.querySelector('dialog')).toBeNull();
});

it('keeps an unavailable photo dismissible and retries when reopened', async () => {
  await render();
  let dialog = await open();
  await act(async () => dialog.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  await act(async () => dialog.querySelector('button')!.click());
  dialog = await open();
  expect(dialog.querySelector('[role="alert"]')).toBeNull();
  expect(dialog.querySelector('img')).not.toBeNull();
});
