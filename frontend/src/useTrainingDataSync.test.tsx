// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TRAINING_SYNC_INTERVAL_MS, useTrainingDataSync } from './useTrainingDataSync';

let root: Root;
let host: HTMLDivElement;
function Harness({ check, enabled = true }: { check: () => Promise<void>; enabled?: boolean }) {
  useTrainingDataSync(check, enabled);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('checks every five seconds and on return/reconnect, without overlapping requests', async () => {
  let finish!: () => void;
  const check = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  await act(async () => root.render(<Harness check={check} />));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(TRAINING_SYNC_INTERVAL_MS);
  });
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  for (const event of ['focus', 'online', 'visibilitychange']) {
    await act(async () =>
      (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)),
    );
  }
  await act(async () => vi.advanceTimersByTime(TRAINING_SYNC_INTERVAL_MS));
  expect(check).toHaveBeenCalledTimes(5);
});
it('pauses in the background or offline and retries failures quietly', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const online = vi.spyOn(navigator, 'onLine', 'get');
  const check = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await act(async () => root.render(<Harness check={check} />));
  await act(async () => vi.advanceTimersByTime(TRAINING_SYNC_INTERVAL_MS));
  expect(check).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  online.mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(check).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  await act(async () => vi.advanceTimersByTime(TRAINING_SYNC_INTERVAL_MS));
  expect(check).toHaveBeenCalledTimes(2);
});
it('uses the latest callback and removes timers and listeners when disabled', async () => {
  const first = vi.fn().mockResolvedValue(undefined);
  const second = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<Harness check={first} />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => root.render(<Harness check={second} />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  await act(async () => root.render(<Harness check={second} enabled={false} />));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(20000);
  });
  expect(second).toHaveBeenCalledOnce();
});
