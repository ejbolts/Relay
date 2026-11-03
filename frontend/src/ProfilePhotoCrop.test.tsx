// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfilePhotoCrop } from './ProfilePhotoCrop';
import { cropProfilePhoto } from './profilePhotoGeometry';

vi.mock('./profilePhotoGeometry', async (original) => ({
  ...(await original<typeof import('./profilePhotoGeometry')>()),
  cropProfilePhoto: vi.fn(async () => new File(['crop'], 'profile-photo.jpg')),
}));

let root: Root;
let host: HTMLDivElement;
const onUse = vi.fn();
const onClose = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  onUse.mockClear();
  onClose.mockClear();
  vi.mocked(cropProfilePhoto).mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount(loaded = true) {
  await act(async () =>
    root.render(<ProfilePhotoCrop source="/sample.png" onUse={onUse} onClose={onClose} />),
  );
  const image = document.querySelector<HTMLImageElement>('.profile-crop-preview img')!;
  const stage = document.querySelector<HTMLElement>('.profile-crop-stage')!;
  stage.setPointerCapture = vi.fn();
  vi.spyOn(
    document.querySelector<HTMLElement>('.profile-crop-preview')!,
    'getBoundingClientRect',
  ).mockReturnValue({ left: 0, top: 0, width: 200, height: 200 } as DOMRect);
  if (loaded) {
    Object.defineProperties(image, {
      naturalWidth: { value: 1200 },
      naturalHeight: { value: 800 },
    });
    await act(async () => image.dispatchEvent(new Event('load')));
  }
  return image;
}
const button = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === text)!;
async function pointer(type: string, id: number, x: number, y = 100) {
  await act(async () => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { pointerId: id, clientX: x, clientY: y, button: 0, isPrimary: id === 1 });
    document.querySelector('.profile-crop-stage')!.dispatchEvent(event);
  });
}
async function key(value: string) {
  await act(async () =>
    document
      .querySelector('.profile-crop-stage')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })),
  );
}
async function pinch() {
  await pointer('pointerdown', 1, 50);
  await pointer('pointerdown', 2, 150);
  await pointer('pointermove', 1, 0);
  await pointer('pointermove', 2, 200);
}

it('pinches around the midpoint without sliders and exports the same crop', async () => {
  const image = await mount();
  expect(document.querySelector('input[type=range]')).toBeNull();
  await pinch();
  expect(image.style.width).toBe('300%');
  expect(image.style.left).toBe('-100%');
  expect(image.style.top).toBe('-50%');
  await act(async () => button('Use crop').click());
  expect(cropProfilePhoto).toHaveBeenLastCalledWith(image, { zoom: 2, x: 0.5, y: 0.5 });
  expect(onUse).toHaveBeenCalledWith(expect.any(File), { zoom: 2, x: 0.5, y: 0.5 });
  await pointer('pointerup', 1, 0);
  await pointer('pointerup', 2, 200);
  await act(async () => button('Reset').click());
  expect(image.style.width).toBe('150%');
  expect(image.style.left).toBe('-25%');
});

it('keeps the dimmed image visible during movement, fades after one idle second and reveals it again', async () => {
  vi.useFakeTimers();
  await mount();
  const stage = document.querySelector('.profile-crop-stage')!;
  await act(async () => vi.advanceTimersByTime(1000));
  expect(stage.classList.contains('is-adjusting')).toBe(false);
  await pointer('pointerdown', 1, 100);
  await pointer('pointermove', 1, 90);
  expect(stage.classList.contains('is-adjusting')).toBe(true);
  await act(async () => vi.advanceTimersByTime(999));
  expect(stage.classList.contains('is-adjusting')).toBe(true);
  await pointer('pointermove', 1, 80);
  await act(async () => vi.advanceTimersByTime(999));
  expect(stage.classList.contains('is-adjusting')).toBe(true);
  await act(async () => vi.advanceTimersByTime(1));
  expect(stage.classList.contains('is-adjusting')).toBe(false);
  await pointer('pointermove', 1, 70);
  expect(stage.classList.contains('is-adjusting')).toBe(true);
});

it('supports keyboard zoom and movement without visible slider controls', async () => {
  const image = await mount();
  await key('+');
  const width = image.style.width;
  expect(parseFloat(width)).toBeGreaterThan(150);
  const left = image.style.left;
  await key('ArrowLeft');
  expect(parseFloat(image.style.left)).toBeLessThan(parseFloat(left));
  await key('-');
  expect(image.style.width).toBe('150%');
});

it('keeps Use crop disabled until loaded and explains an unreadable file', async () => {
  const image = await mount(false);
  expect(button('Use crop').disabled).toBe(true);
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Try a JPEG, PNG or WebP');
  expect(button('Use crop').disabled).toBe(true);
  await act(async () => button('Cancel').click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(onUse).not.toHaveBeenCalled();
});

it('keeps adjustments available after an export failure so the user can retry', async () => {
  await mount();
  await key('+');
  vi.mocked(cropProfilePhoto).mockRejectedValueOnce(
    new Error('Could not crop this photo. Please try again.'),
  );
  await act(async () => button('Use crop').click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Please try again');
  expect(button('Use crop').disabled).toBe(false);
  expect(
    document.querySelector<HTMLImageElement>('.profile-crop-preview img')!.style.width,
  ).toContain('165');
  await act(async () => button('Use crop').click());
  expect(onUse).toHaveBeenCalledOnce();
});

it('clamps dragging at the image edge and stops on cancellation', async () => {
  const image = await mount();
  await pointer('pointerdown', 1, 100);
  await pointer('pointermove', 1, -100);
  expect(image.style.left).toBe('-50%');
  await pointer('pointercancel', 1, -100);
  await pointer('pointermove', 1, 100);
  expect(image.style.left).toBe('-50%');
});

it('continues with one finger after a pinch without jumping', async () => {
  const image = await mount();
  await pinch();
  const left = image.style.left;
  await pointer('pointerup', 2, 200);
  await pointer('pointermove', 1, 0);
  expect(image.style.left).toBe(left);
  await pointer('pointermove', 1, -20);
  expect(parseFloat(image.style.left)).toBeLessThan(parseFloat(left));
});

it('preserves HEIC uploads with an explicit centre-crop fallback when the browser cannot decode them', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:heic'), revokeObjectURL: vi.fn() });
  const file = new File(['heic'], 'camera.HEIC', { type: 'image/heic' });
  await act(async () =>
    root.render(<ProfilePhotoCrop source={file} onUse={onUse} onClose={onClose} />),
  );
  const image = document.querySelector<HTMLImageElement>('.profile-crop-preview img')!;
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(document.querySelector('[role=alert]')?.textContent).toContain(
    'cannot preview this format',
  );
  await act(async () => button('Use centre crop').click());
  expect(onUse).toHaveBeenCalledWith(file, { zoom: 1, x: 0.5, y: 0.5 });
  expect(cropProfilePhoto).not.toHaveBeenCalled();
});
