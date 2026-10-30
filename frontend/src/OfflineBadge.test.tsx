// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reportSavedDataUsed, reportServerReached } from './connectionStatus';
import { PageHeader } from './TodayScreen';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reportServerReached();
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

const badge = () => container.querySelector('[role="status"].offline-badge');

it('shows Offline beside the title while saved data is in use, until the server answers', async () => {
  await act(async () => root.render(<PageHeader title="Home" />));
  expect(badge()).toBeNull();

  await act(async () => reportSavedDataUsed());
  expect(container.querySelector('h1')?.textContent).toBe('Home');
  expect(badge()?.textContent).toBe('Offline');

  await act(async () => reportServerReached());
  expect(badge()).toBeNull();
});

it('follows the device connection as well', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => root.render(<PageHeader title="Training" />));
  expect(badge()).not.toBeNull();

  online.mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(badge()).toBeNull();
});
