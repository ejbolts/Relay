// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppGuide } from './AppGuide';
import { appGuideSteps } from './appGuideSteps';
import { useInstallMethod } from './installPrompt';

vi.mock('./installPrompt', () => ({
  useInstallMethod: vi.fn(),
  openInstallOption: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;
const dialog = () => document.querySelector<HTMLElement>('.app-guide')!;
const handle = () => document.querySelector<HTMLButtonElement>('.app-guide-handle');
const fold = () => document.querySelector('.app-guide-fold')!;
const next = () => document.querySelector<HTMLButtonElement>('.app-guide .popup-primary-action')!;
const pointer = (type: string, clientY: number) =>
  act(async () => {
    handle()!.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY }));
  });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  // jsdom lays nothing out, so give the step a height to drag against.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(160);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollTo = vi.fn();
  vi.mocked(useInstallMethod).mockReturnValue('share');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('folds a tour step away with a swipe or tap on its grabber, keeping the buttons', async () => {
  await act(async () =>
    root.render(<AppGuide videosAllowed={false} onNavigate={vi.fn()} onClose={vi.fn()} />),
  );
  // At the bottom of the screen, the grabber sits above the header and a swipe down folds it.
  expect(handle()!.classList.contains('is-bottom')).toBe(true);
  expect(handle()!.getAttribute('aria-label')).toBe('Minimise guide');
  expect(dialog().style.getPropertyValue('--full')).toBe('160px');

  await act(async () => handle()!.click());
  expect(handle()!.getAttribute('aria-expanded')).toBe('false');
  expect(handle()!.getAttribute('aria-label')).toBe('Show guide');
  expect(fold().getAttribute('aria-hidden')).toBe('true');
  expect(dialog().style.getPropertyValue('--open')).toBe('0');
  // Next and Skip stay, so the tour can carry on while folded.
  expect(next()).toBeTruthy();
  expect(document.querySelector('.app-guide .guide-skip')).toBeTruthy();
  await act(async () => handle()!.click());
  expect(handle()!.getAttribute('aria-expanded')).toBe('true');

  await pointer('pointerdown', 100);
  await pointer('pointermove', 160);
  expect(dialog().classList.contains('is-dragging')).toBe(true);
  expect(dialog().style.getPropertyValue('--open')).toBe('0.625');
  await pointer('pointermove', 230);
  await pointer('pointerup', 230);
  expect(handle()!.getAttribute('aria-expanded')).toBe('false');
  // The next step opens again.
  await act(async () => next().click());
  expect(handle()!.getAttribute('aria-expanded')).toBe('true');
  expect(fold().getAttribute('aria-hidden')).toBe('false');
});

it('has no grabber on the install and finishing pages', async () => {
  await act(async () =>
    root.render(<AppGuide videosAllowed={false} onNavigate={vi.fn()} onClose={vi.fn()} />),
  );
  for (let index = 0; index < appGuideSteps(false).length; index++) {
    await act(async () => next().click());
  }
  expect(document.querySelector('.app-guide h2')!.textContent).toBe('Add to Home Screen');
  expect(handle()).toBeNull();
  await act(async () => next().click());
  expect(handle()).toBeNull();
  expect(dialog().style.getPropertyValue('--open')).toBe('');
});
