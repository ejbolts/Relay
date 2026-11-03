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
});
async function mount(loaded = true) {
  await act(async () =>
    root.render(<ProfilePhotoCrop source="/sample.png" onUse={onUse} onClose={onClose} />),
  );
  const image = document.querySelector<HTMLImageElement>('.profile-crop-preview img')!;
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
const sliders = () => [...document.querySelectorAll<HTMLInputElement>('input[type=range]')];
async function range(index: number, value: string) {
  await act(async () => {
    const input = sliders()[index];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('matches zoom and position controls to the exported crop and resets to centre', async () => {
  const image = await mount();
  expect(sliders()[2].disabled).toBe(true);
  await range(0, '2');
  await range(1, '0.25');
  await range(2, '1');
  expect(image.style.width).toBe('300%');
  expect(image.style.left).toBe('-50%');
  expect(image.style.top).toBe('-100%');
  await act(async () => button('Use crop').click());
  expect(cropProfilePhoto).toHaveBeenLastCalledWith(image, { zoom: 2, x: 0.25, y: 1 });
  expect(onUse).toHaveBeenCalledWith(expect.any(File), { zoom: 2, x: 0.25, y: 1 });
  await act(async () => button('Reset').click());
  expect(sliders().map((input) => input.value)).toEqual(['1', '0.5', '0.5']);
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
  await range(0, '2');
  vi.mocked(cropProfilePhoto).mockRejectedValueOnce(
    new Error('Could not crop this photo. Please try again.'),
  );
  await act(async () => button('Use crop').click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Please try again');
  expect(button('Use crop').disabled).toBe(false);
  expect(sliders()[0].value).toBe('2');
  await act(async () => button('Use crop').click());
  expect(onUse).toHaveBeenCalledOnce();
});

it('moves the crop with pointer dragging, clamps at the edge and stops on cancellation', async () => {
  await mount();
  const preview = document.querySelector<HTMLElement>('.profile-crop-preview')!;
  preview.setPointerCapture = vi.fn();
  vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect);
  async function pointer(type: string, x: number) {
    await act(async () => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerId: 1, clientX: x, clientY: 100, button: 0, isPrimary: true });
      preview.dispatchEvent(event);
    });
  }
  await pointer('pointerdown', 100);
  await pointer('pointermove', 50);
  expect(sliders()[1].value).toBe('1');
  await pointer('pointercancel', 50);
  await pointer('pointermove', 100);
  expect(sliders()[1].value).toBe('1');
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
