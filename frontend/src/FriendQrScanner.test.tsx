// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { FriendQrScanner } from './FriendQrScanner';

vi.mock('jsqr', () => ({ default: vi.fn() }));

const ownId = 'viewer-1';
const friendId = 'd7131000-7937-40be-b8ee-8b02800f5a36';

let root: Root;
let host: HTMLDivElement;
const stopTrack = vi.fn();
const getUserMedia = vi.fn();
const onScanned = vi.fn();

function decodes(text: string | null) {
  vi.mocked(jsQR).mockReturnValue(
    text === null ? null : ({ data: text } as ReturnType<typeof jsQR>),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Each animation frame runs well after the last scan, so every frame is decoded.
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback((now += 1000)), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  } as unknown as CanvasRenderingContext2D);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(jsQR).mockReset();
  stopTrack.mockReset();
  getUserMedia.mockReset();
  onScanned.mockReset();
});

async function scan() {
  await act(async () => root.render(<FriendQrScanner userId={ownId} onScanned={onScanned} />));
  // Let the camera start and a few frames be decoded.
  for (let frame = 0; frame < 4; frame += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

it('opens a friend code scanned with the back camera, then releases the camera', async () => {
  decodes(`https://gym.example.com/#friend=${friendId}`);
  await scan();

  expect(getUserMedia).toHaveBeenCalledWith({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  expect(onScanned).toHaveBeenCalledOnce();
  expect(onScanned).toHaveBeenCalledWith(friendId);
  // Frames are scaled down before decoding.
  expect(vi.mocked(jsQR).mock.calls[0].slice(1, 3)).toEqual([640, 360]);

  await act(async () => root.unmount());
  expect(stopTrack).toHaveBeenCalled();
  root = createRoot(host);
});

it('keeps scanning past other codes and your own', async () => {
  decodes('WIFI:S:gym;T:WPA;P:secret;;');
  await scan();
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    'That isn’t a Relay friend code.',
  );

  decodes(`https://gym.example.com/#friend=${ownId}`);
  for (let frame = 0; frame < 2; frame += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  expect(host.querySelector('[role="status"]')?.textContent).toBe('That’s your own code.');
  expect(onScanned).not.toHaveBeenCalled();
});

it('asks for camera access when it is blocked, and can try again', async () => {
  decodes(null);
  getUserMedia.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
  await scan();

  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'Allow camera access to scan a code.',
  );
  const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
  await act(async () => retry.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('explains when there is no camera', async () => {
  vi.stubGlobal('navigator', {});
  await scan();

  expect(host.querySelector('[role="alert"]')?.textContent).toBe('No camera is available here.');
  expect(host.querySelector('button')).toBeNull();
});
