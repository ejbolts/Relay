// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileIdentity } from './ProfileIdentity';
import type { User } from './types';

const user: User = {
  id: 'sample',
  username: 'sample',
  display_name: 'Sample Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-01T12:00:00Z',
  profile_photo_url: null,
};

let root: Root;
let container: HTMLDivElement;

async function show(account: User) {
  function Harness() {
    const [current, setCurrent] = useState(account);
    return <ProfileIdentity user={current} onSaved={setCurrent} />;
  }
  await act(async () => root.render(<Harness />));
}

const button = (text: string, within: ParentNode = document) =>
  [...within.querySelectorAll('button')].find((item) => item.textContent === text)!;
const press = (element: Element) =>
  act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const sexChoices = () => [
  ...container.querySelectorAll<HTMLButtonElement>('.profile-sex-field [role=radio]'),
];
const confirmation = () => document.querySelector<HTMLDialogElement>('dialog.profile-sex-confirm');

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sex on the profile', () => {
  it('saves a chosen sex only after confirming that only an admin can change it', async () => {
    const update = vi.spyOn(api, 'updateProfile').mockResolvedValue({ ...user, sex: 'female' });
    await show(user);
    expect(container.querySelector('.sex-mark')).toBeNull();

    await press(button('Edit profile'));
    expect(sexChoices().map((choice) => choice.textContent)).toEqual(['Male', 'Female']);
    expect(container.querySelector('.profile-sex-field .auth-hint')?.textContent).toBe(
      'Only an administrator can change this once saved.',
    );
    expect(button('Save profile').disabled).toBe(true);

    await press(sexChoices()[1]);
    expect(sexChoices()[1].getAttribute('aria-checked')).toBe('true');
    await press(button('Save profile'));
    expect(update).not.toHaveBeenCalled();
    expect(confirmation()?.querySelector('h2')?.textContent).toBe('Save your sex as Female?');

    await press(button('Cancel', confirmation()!));
    expect(confirmation()).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(sexChoices()[1].getAttribute('aria-checked')).toBe('true');

    await press(button('Save profile'));
    await press(button('Save', confirmation()!));
    expect(update).toHaveBeenCalledExactlyOnceWith({ sex: 'female' });
    expect(container.querySelector('.sex-mark')?.getAttribute('aria-label')).toBe('Female');
  });

  it('shows a saved sex as locked, with nothing left to choose', async () => {
    const update = vi.spyOn(api, 'updateProfile');
    await show({ ...user, sex: 'male' });
    expect(container.querySelector('.sex-mark')?.getAttribute('aria-label')).toBe('Male');

    await press(button('Edit profile'));
    expect(sexChoices()).toEqual([]);
    expect(container.querySelector('.profile-sex-field .profile-locked-value')?.textContent).toBe(
      'MaleLocked',
    );
    expect(button('Save profile').disabled).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});
