// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reportSavedDataUsed, reportServerReached } from './connectionStatus';
import { OfflineNotice } from './OfflineNotice';
import {
  OFFLINE_NOTICE_DELAY_MS,
  OFFLINE_NOTICE_RESET_MS,
  useOfflineNotice,
} from './useOfflineNotice';

let container: HTMLDivElement;
let root: Root;

function Harness() {
  const notice = useOfflineNotice();
  return notice.visible ? <OfflineNotice onDismiss={notice.dismiss} /> : null;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reportServerReached();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const notice = () => container.querySelector('.offline-notice');
const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
const goOffline = () => act(async () => reportSavedDataUsed());
const goOnline = () => act(async () => reportServerReached());

it('appears once the app has stayed offline briefly, and leaves as soon as it reconnects', async () => {
  await goOffline();
  expect(notice()).toBeNull();

  await advance(OFFLINE_NOTICE_DELAY_MS);
  expect(notice()?.getAttribute('role')).toBe('status');
  expect(notice()?.textContent).toContain("You're offline");

  await goOnline();
  expect(notice()).toBeNull();
});

it('ignores a blip shorter than the delay', async () => {
  await goOffline();
  await advance(OFFLINE_NOTICE_DELAY_MS - 1);
  await goOnline();
  await advance(OFFLINE_NOTICE_DELAY_MS);
  expect(notice()).toBeNull();
});

it('stays closed through a short reconnection, and returns after a lasting one', async () => {
  await goOffline();
  await advance(OFFLINE_NOTICE_DELAY_MS);
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Dismiss offline notice"]')!.click(),
  );
  expect(notice()).toBeNull();

  await goOnline();
  await advance(OFFLINE_NOTICE_RESET_MS - 1);
  await goOffline();
  await advance(OFFLINE_NOTICE_DELAY_MS);
  expect(notice()).toBeNull();

  await goOnline();
  await advance(OFFLINE_NOTICE_RESET_MS);
  await goOffline();
  await advance(OFFLINE_NOTICE_DELAY_MS);
  expect(notice()).not.toBeNull();
});
