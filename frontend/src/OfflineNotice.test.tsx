// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BACK_ONLINE_MS,
  CONFIRM_OFFLINE_MS,
  MIN_OFFLINE_SHOWN_MS,
  OFFLINE_CHECK_MS,
  connectionState,
  reportConnectionFailure,
  reportSavedDataUsed,
  reportServerReached,
  resetConnectionStatus,
  setConnectionCheck,
  useConnectionState,
} from './connectionStatus';
import { OfflineNotice } from './OfflineNotice';
import { PageHeader } from './TodayScreen';
import { MINIMISE_AFTER_MS } from './useOfflineNotice';

let container: HTMLDivElement;
let root: Root;
let serverAnswers: boolean;
const check = vi.fn<() => Promise<boolean>>();
let online: boolean;

function Harness() {
  return (
    <>
      <OfflineNotice waiting={{ workouts: 1, checkIns: 2 }} />
      <PageHeader title="Home" />
    </>
  );
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 18, 14, 14));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  serverAnswers = false;
  check.mockReset();
  check.mockImplementation(async () => serverAnswers);
  setConnectionCheck(check);
  resetConnectionStatus();
  reportServerReached();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setConnectionCheck();
  resetConnectionStatus();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const notice = () => container.querySelector<HTMLElement>('.offline-notice');
const pill = () => container.querySelector<HTMLElement>('.offline-notice-pill');
const details = () => container.querySelector<HTMLElement>('.offline-notice-details');
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const fail = () => act(async () => reportConnectionFailure());
const reach = () => act(async () => reportServerReached());
const click = (element: Element | null) =>
  act(async () =>
    (element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );

async function goOffline() {
  await fail();
  await advance(CONFIRM_OFFLINE_MS);
  expect(connectionState().phase).toBe('offline');
}

it('says nothing when the server is only slow', async () => {
  serverAnswers = true;
  await act(async () => reportSavedDataUsed());
  await advance(60_000);

  expect(check).toHaveBeenCalledTimes(1);
  expect(connectionState().phase).toBe('online');
  expect(notice()).toBeNull();
});

it('ignores a drop that recovers within twenty seconds', async () => {
  await fail();
  await advance(CONFIRM_OFFLINE_MS - 1);
  expect(notice()).toBeNull();

  await reach();
  await advance(60_000);
  expect(notice()).toBeNull();
  expect(connectionState().phase).toBe('online');
});

it('stays quiet on a patchy signal that keeps coming back', async () => {
  for (let drop = 0; drop < 8; drop += 1) {
    await fail();
    await advance(9_000);
    await reach();
    await advance(3_000);
    expect(notice()).toBeNull();
  }
});

it('checks quietly with backoff, then names a lasting server outage after twenty seconds', async () => {
  await fail();
  await advance(CONFIRM_OFFLINE_MS - 1);
  // Checks ran 2 s, 6 s and 14 s after the first failure.
  expect(check).toHaveBeenCalledTimes(3);
  expect(notice()).toBeNull();

  await advance(1);
  expect(pill()?.textContent).toContain('Offline');
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Offline');
  expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(container.querySelector('.page-header')?.textContent).toBe('Home');
  expect(container.querySelector('.page-header .offline-notice')).toBeNull();
});

it('needs a second failed attempt before it is sure', async () => {
  check.mockImplementation(() => new Promise<boolean>(() => undefined));
  await fail();
  await advance(CONFIRM_OFFLINE_MS + 30_000);
  expect(notice()).toBeNull();
});

it('says there is no internet when the phone reports it, without asking the server', async () => {
  online = false;
  await act(async () => window.dispatchEvent(new Event('offline')));
  await advance(CONFIRM_OFFLINE_MS);

  expect(check).not.toHaveBeenCalled();
  expect(pill()?.textContent).toContain('No internet');
  await click(pill());
  expect(details()?.textContent).toContain('InternetNot connected');
});

it('notices a phone that opened without a connection', async () => {
  await act(async () => root.unmount());
  online = false;
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
  await advance(CONFIRM_OFFLINE_MS);

  expect(pill()?.textContent).toContain('No internet');
});

it('shrinks to an icon after saying it once, and opens the details from there', async () => {
  await goOffline();
  expect(notice()?.dataset.minimised).toBeUndefined();

  await advance(MINIMISE_AFTER_MS);
  expect(notice()?.dataset.minimised).toBe('true');
  expect(pill()?.getAttribute('aria-label')).toBe('Offline');
  expect(pill()?.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('[aria-label="Dismiss offline notice"]')).toBeNull();

  await click(pill());
  expect(pill()?.getAttribute('aria-expanded')).toBe('true');
  expect(pill()?.getAttribute('aria-controls')).toBe(details()?.id);
  const text = details()?.textContent;
  expect(text).toContain('InternetConnected');
  expect(text).toContain('Last connected');
  expect(text).toContain('Saved on this phone1 workout · 2 check-ins');
  expect(text).toMatch(/Next check in \d+ s/);

  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(details()).toBeNull();

  await click(pill());
  await act(async () =>
    container
      .querySelector('.page-header')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true })),
  );
  expect(details()).toBeNull();
});

it('keeps checking every ten seconds, and straight away when the phone reconnects', async () => {
  await goOffline();
  const before = check.mock.calls.length;
  await advance(OFFLINE_CHECK_MS * 3);
  expect(check.mock.calls.length - before).toBeGreaterThanOrEqual(2);

  const calls = check.mock.calls.length;
  await act(async () => window.dispatchEvent(new Event('online')));
  await advance(0);
  expect(check).toHaveBeenCalledTimes(calls + 1);
});

it('reconnects from Try now, stays long enough to read, then confirms it is back', async () => {
  await goOffline();
  await click(pill());
  serverAnswers = true;
  await click(container.querySelector('.offline-notice-details .pulse-button'));

  await advance(MIN_OFFLINE_SHOWN_MS - 1);
  expect(pill()?.textContent).toContain('Offline');

  await advance(1);
  expect(notice()?.dataset.phase).toBe('back');
  expect(pill()?.textContent).toContain('Back online');
  expect(pill()?.tagName).toBe('DIV');
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Back online');

  await advance(BACK_ONLINE_MS);
  expect(notice()).toBeNull();
});

it('keeps showing an outage that drops again while it waits to confirm recovery', async () => {
  await goOffline();
  await reach();
  await fail();
  await advance(MIN_OFFLINE_SHOWN_MS + BACK_ONLINE_MS);
  expect(notice()?.dataset.phase).toBe('offline');
});

it('runs no checks while nothing shows the status', async () => {
  await act(async () => root.unmount());
  await fail();
  await advance(CONFIRM_OFFLINE_MS * 2);

  expect(check).not.toHaveBeenCalled();
  expect(connectionState().phase).toBe('checking');
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

it('re-renders nothing while it checks quietly', async () => {
  let renders = 0;
  function Watcher() {
    renders += 1;
    useConnectionState();
    return null;
  }
  await act(async () => root.render(<Watcher />));
  const before = renders;
  await fail();
  await advance(CONFIRM_OFFLINE_MS - 1);

  expect(check).toHaveBeenCalledTimes(3);
  expect(renders).toBe(before);
});
