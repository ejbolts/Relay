// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileIdentity } from './ProfileIdentity';
import { cropProfilePhoto } from './profilePhotoGeometry';
import type { User } from './types';

vi.mock('./photoOptimise', () => ({ optimisePhoto: async (file: File) => file }));
vi.mock('./profilePhotoGeometry', async (original) => ({
  ...(await original<typeof import('./profilePhotoGeometry')>()),
  cropProfilePhoto: vi.fn(
    async () => new File(['cropped'], 'profile-photo.jpg', { type: 'image/jpeg' }),
  ),
}));

const user: User = {
  id: 'sample',
  username: 'sample',
  display_name: 'Sample Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-01T12:00:00Z',
  profile_photo_url: '/sample-photo.png',
};
let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
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
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:draft-photo'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(api, 'updateProfile').mockResolvedValue({ ...user, display_name: 'New name' });
  vi.spyOn(api, 'uploadProfilePhoto').mockResolvedValue({
    ...user,
    display_name: 'New name',
    profile_photo_url: '/saved-photo.png',
  });
  vi.spyOn(api, 'removeProfilePhoto').mockResolvedValue({ ...user, profile_photo_url: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  function Harness() {
    const [current, setCurrent] = useState(user);
    return <ProfileIdentity user={current} onSaved={setCurrent} />;
  }
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function button(text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
}
async function changeName() {
  const input = container.querySelector<HTMLInputElement>('input[type=text]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'New name',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function choosePhoto(apply = true) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['sample'], 'sample.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (apply) await applyCrop();
}
async function applyCrop() {
  const image = document.querySelector<HTMLImageElement>('.profile-crop-preview img')!;
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
  await act(async () => image.dispatchEvent(new Event('load')));
  const use = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Use crop')!;
  await act(async () => use.click());
}
async function save() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

/** Cards measure 120px closed and 300px open; a running resize reports its halfway height, like a browser. */
function stubCardHeights() {
  const resizes: { playState: string; height: number; cancel: () => void }[] = [];
  const animate = vi.fn((frames: { height: string }[]) => {
    const resize = {
      playState: 'running',
      height: (parseFloat(frames[0].height) + parseFloat(frames[1].height)) / 2,
      onfinish: null,
      oncancel: null,
      cancel: () => (resize.playState = 'idle'),
    };
    resizes.push(resize);
    return resize;
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const running = resizes.find((resize) => resize.playState === 'running');
    const natural = this.classList.contains('is-editing') ? 300 : 120;
    return { height: running ? running.height : natural } as DOMRect;
  });
  const finish = () => resizes.forEach((resize) => (resize.playState = 'finished'));
  return { animate, finish };
}

describe('profile viewing and editing', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    document.documentElement.removeAttribute('data-reduce-motion');
  });

  it('grows the card into the editor and shrinks it back on Cancel', async () => {
    const { animate, finish } = stubCardHeights();
    await act(async () => button('Edit profile').click());
    expect(animate).toHaveBeenCalledOnce();
    finish();
    await act(async () => button('Cancel').click());
    expect(animate).toHaveBeenLastCalledWith(
      [{ height: '300px' }, { height: '120px' }],
      expect.objectContaining({ duration: 280 }),
    );
    expect(container.querySelector<HTMLElement>('.profile-identity')!.style.overflow).toBe(
      'hidden',
    );
  });

  it('reverses from the on-screen height when the editor is reopened mid-close', async () => {
    const { animate, finish } = stubCardHeights();
    await act(async () => button('Edit profile').click());
    finish();
    await act(async () => button('Cancel').click());
    await act(async () => button('Edit profile').click());
    expect(animate).toHaveBeenLastCalledWith(
      [{ height: '210px' }, { height: '300px' }],
      expect.objectContaining({ duration: 280 }),
    );
  });

  it('opens the editor without animating when motion is reduced', async () => {
    const { animate } = stubCardHeights();
    document.documentElement.setAttribute('data-reduce-motion', '');
    await act(async () => button('Edit profile').click());
    await act(async () => button('Cancel').click());
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelector('.profile-identity')!.getAttribute('style')).toBeNull();
  });

  it('opens explicit editing and cancels name/photo drafts without saving', async () => {
    expect(container.textContent).toContain('Joined October 2026');
    expect(container.querySelector('.profile-photo-edit')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
    await act(async () => button('Edit profile').click());
    expect(container.querySelector('.profile-photo-edit')).not.toBeNull();
    await changeName();
    await choosePhoto();
    expect(container.querySelector('img')?.src).toContain('blob:draft-photo');
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
    await act(async () => button('Cancel').click());
    expect(container.textContent).toContain('Sample Lifter');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/sample-photo.png');
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft-photo');
  });
  it('saves text and photo together, then returns to viewing', async () => {
    await act(async () => button('Edit profile').click());
    await changeName();
    await choosePhoto();
    await save();
    expect(api.updateProfile).toHaveBeenCalledExactlyOnceWith({ display_name: 'New name' });
    expect(api.uploadProfilePhoto).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/saved-photo.png');
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Profile saved.',
    );
  });
  it('keeps a failed photo draft available to retry and explains partially saved details', async () => {
    vi.mocked(api.uploadProfilePhoto).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => button('Edit profile').click());
    await changeName();
    await choosePhoto();
    await save();
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      'Your name and username were saved.',
    );
    expect(container.querySelector('.profile-photo-edit')).not.toBeNull();
    await save();
    expect(api.updateProfile).toHaveBeenCalledTimes(1);
    expect(api.uploadProfilePhoto).toHaveBeenCalledTimes(2);
    expect(container.querySelector('input')).toBeNull();
  });
  it('stages photo removal until Save and allows cancelling it', async () => {
    await act(async () => button('Edit profile').click());
    await act(async () => button('Remove photo').click());
    expect(api.removeProfilePhoto).not.toHaveBeenCalled();
    await act(async () => button('Cancel').click());
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/sample-photo.png');
    await act(async () => button('Edit profile').click());
    await act(async () => button('Remove photo').click());
    await save();
    expect(api.removeProfilePhoto).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img')).toBeNull();
  });

  it('cancels a selected crop without changing or uploading the current photo', async () => {
    await act(async () => button('Edit profile').click());
    await choosePhoto(false);
    expect(document.querySelector('dialog[open]')).not.toBeNull();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Close Adjust profile photo"]')!
        .click(),
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/sample-photo.png');
    expect(button('Save profile').disabled).toBe(true);
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
  });

  it('re-crops the current photo, stages the square and uploads only on Save', async () => {
    await act(async () => button('Edit profile').click());
    await act(async () => button('Adjust crop').click());
    expect(document.querySelector('dialog img')?.getAttribute('src')).toBe('/sample-photo.png');
    await applyCrop();
    expect(cropProfilePhoto).toHaveBeenCalled();
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
    await save();
    expect(api.uploadProfilePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'profile-photo.jpg', type: 'image/jpeg' }),
    );
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(document.querySelector('.app-notification-toast')?.textContent).toContain(
      'Profile saved.',
    );
  });
});
