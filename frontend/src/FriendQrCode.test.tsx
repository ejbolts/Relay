// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FriendInviteButton } from './FriendQrCode';
import type { SharingSettings, User } from './types';

const user: User = {
  id: 'd7131000-7937-40be-b8ee-8b02800f5a36',
  username: 'sam_lifts',
  display_name: 'Sam Rivera',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
};

let root: Root;
let host: HTMLDivElement;
const writeText = vi.fn();
const chooseSharing = vi.fn();

function sharing(visibility: SharingSettings['visibility']) {
  vi.spyOn(api.sharing, 'choices').mockResolvedValue({ visibility } as SharingSettings);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  writeText.mockReset();
  chooseSharing.mockReset();
});

async function open(labelled = false) {
  await act(async () =>
    root.render(
      <FriendInviteButton user={user} onChooseSharing={chooseSharing} labelled={labelled} />,
    ),
  );
  const button = host.querySelector<HTMLButtonElement>(
    labelled ? '.friend-invite-chip' : '[aria-label="Show my QR code"]',
  )!;
  await act(async () => button.click());
  return document.querySelector<HTMLDialogElement>('.friend-invite-dialog')!;
}

it('shows a scannable invite and copies its link', async () => {
  sharing('followers');
  const dialog = await open();

  expect(dialog.open).toBe(true);
  const code = dialog.querySelector('svg.qr-code')!;
  expect(code.getAttribute('aria-label')).toBe('QR code to add Sam Rivera as a friend');
  expect(code.querySelector('path')!.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
  expect(dialog.textContent).toContain('Sam Rivera');
  expect(dialog.textContent).toContain('sam_lifts');

  const copy = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Copy link')!;
  await act(async () => copy.click());
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#friend=${user.id}`);
  expect(copy.textContent).toBe('Link copied');
});

it('opens from the labelled shortcut beside people search', async () => {
  sharing('public');
  const dialog = await open(true);
  expect(dialog.querySelector('svg.qr-code')).not.toBeNull();
});

it('uses the share sheet when the device has one', async () => {
  sharing('public');
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText }, share });
  const dialog = await open();
  const button = [...dialog.querySelectorAll('button')].find(
    (b) => b.textContent === 'Share link',
  )!;
  await act(async () => button.click());
  expect(share).toHaveBeenCalledWith({
    title: 'Add Sam Rivera on Relay',
    url: `${window.location.origin}/#friend=${user.id}`,
  });
  expect(writeText).not.toHaveBeenCalled();
});

it('asks a private account to share its profile instead of showing a code that cannot work', async () => {
  sharing('private');
  const dialog = await open();

  expect(dialog.querySelector('svg.qr-code')).toBeNull();
  expect(dialog.textContent).toContain('Share your profile to use your QR code');
  const choose = [...dialog.querySelectorAll('button')].find(
    (b) => b.textContent === 'Choose who can see your profile',
  )!;
  await act(async () => choose.click());
  expect(chooseSharing).toHaveBeenCalledOnce();
  expect(document.querySelector('.friend-invite-dialog')).toBeNull();
});
