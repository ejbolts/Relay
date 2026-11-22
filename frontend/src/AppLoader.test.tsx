// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadApp, loadedApp, preloadApp, resetAppLoad, type AppModule } from './appLoad';
import { AppLoader } from './AppLoader';

vi.mock('./AuthScreen', () => ({ AuthBrand: () => null, AuthScreen: () => null }));

const app = { App: () => <p>Signed-in app</p> } as unknown as AppModule;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  resetAppLoad();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  resetAppLoad();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows Home’s outline until the signed-in app has downloaded', async () => {
  let arrive!: (module: AppModule) => void;
  const load = vi.fn(() => new Promise<AppModule>((resolve) => (arrive = resolve)));
  await act(async () => root.render(<AppLoader load={load} />));
  expect(container.querySelector('.today-loading-skeleton')).not.toBeNull();
  expect(container.textContent).not.toContain('Signed-in app');

  await act(async () => arrive(app));
  expect(container.textContent).toContain('Signed-in app');
  expect(container.querySelector('.today-loading-skeleton')).toBeNull();
});

it('downloads the app once, however early the download was started', async () => {
  const load = vi.fn(async () => app);
  // The page starts the download before anyone is signed in.
  preloadApp(load);
  await act(async () => root.render(<AppLoader load={load} />));
  expect(container.textContent).toContain('Signed-in app');
  expect(load).toHaveBeenCalledOnce();
  await expect(loadApp(load)).resolves.toBe(app);
  expect(load).toHaveBeenCalledOnce();
});

it('shows the app with no outline first when its file had already arrived', async () => {
  const load = vi.fn(async () => app);
  await preloadApp(load);
  expect(loadedApp()).toBe(app);
  const outlines: boolean[] = [];
  const watch = new MutationObserver(() =>
    outlines.push(container.querySelector('.today-loading-skeleton') !== null),
  );
  watch.observe(container, { childList: true, subtree: true });
  await act(async () => root.render(<AppLoader load={load} />));
  watch.disconnect();
  expect(container.textContent).toContain('Signed-in app');
  expect(outlines).not.toContain(true);
});

it('offers to try again when the app cannot be downloaded', async () => {
  const retry = vi.fn();
  const load = vi.fn(async (): Promise<AppModule> => {
    throw new TypeError('Failed to fetch dynamically imported module');
  });
  // Starting it early settles quietly either way, so the page can carry on.
  await expect(preloadApp(load)).resolves.toBeUndefined();
  expect(loadedApp()).toBeNull();
  await act(async () => root.render(<AppLoader load={load} onRetry={retry} />));

  expect(container.textContent).not.toContain('Signed-in app');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Relay could not finish loading',
  );
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Try again',
  )!;
  await act(async () => button.click());
  expect(retry).toHaveBeenCalledOnce();
});
