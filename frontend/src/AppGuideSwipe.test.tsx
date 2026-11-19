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
const dialog = () => document.querySelector<HTMLDialogElement>('dialog.app-guide')!;
const card = () => document.querySelector<HTMLElement>('.app-guide .guide-card')!;
const handle = () => document.querySelector<HTMLButtonElement>('.app-guide .guide-card-handle');
const fold = () => document.querySelector('.app-guide .swipe-fold')!;
// Tour steps have the guide card's Next; the install page keeps the dialog footer's.
const next = () =>
  document.querySelector<HTMLButtonElement>(
    '.app-guide .guide-card-next, .app-guide .popup-dialog-actions .popup-primary-action',
  )!;
const kicker = () => document.querySelector('.app-guide .guide-card-kicker')?.textContent;
const cancel = () =>
  act(async () => {
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
  });
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

it('folds a tour step away with a swipe or tap on its grabber, keeping the title and Next', async () => {
  await act(async () =>
    root.render(<AppGuide videosAllowed={false} onNavigate={vi.fn()} onClose={vi.fn()} />),
  );
  // At the bottom of the screen, the grabber sits above the kicker and a swipe down folds it.
  expect(card().classList.contains('is-bottom')).toBe(true);
  expect(card().firstElementChild).toBe(handle());
  expect(handle()!.getAttribute('aria-label')).toBe('Minimise guide');
  expect(handle()!.querySelector('.sheet-grabber')).toBeTruthy();
  expect(card().style.getPropertyValue('--full')).toBe('160px');
  expect(kicker()).toBe(`Quick tour · 1 of ${appGuideSteps(false).length}`);

  await act(async () => handle()!.click());
  expect(handle()!.getAttribute('aria-expanded')).toBe('false');
  expect(handle()!.getAttribute('aria-label')).toBe('Show guide');
  expect(fold().getAttribute('aria-hidden')).toBe('true');
  expect(card().style.getPropertyValue('--open')).toBe('0');
  // The kicker, title, Next, progress and Skip stay, so the tour can carry on while folded.
  expect(card().classList.contains('is-folded')).toBe(true);
  expect(document.querySelector('.app-guide .guide-card-title')!.textContent).toBe(
    appGuideSteps(false)[0].title,
  );
  expect(next()).toBeTruthy();
  expect(document.querySelector('.app-guide .guide-card-progress')).toBeTruthy();
  expect(document.querySelector('.app-guide .guide-card-leave')!.textContent).toBe('Skip guide');
  await act(async () => handle()!.click());
  expect(handle()!.getAttribute('aria-expanded')).toBe('true');

  await pointer('pointerdown', 100);
  await pointer('pointermove', 160);
  expect(card().classList.contains('sheet-dragging')).toBe(true);
  expect(card().style.getPropertyValue('--open')).toBe('0.625');
  await pointer('pointermove', 230);
  await pointer('pointerup', 230);
  expect(handle()!.getAttribute('aria-expanded')).toBe('false');
  // The next step opens again.
  await act(async () => next().click());
  expect(handle()!.getAttribute('aria-expanded')).toBe('true');
  expect(fold().getAttribute('aria-hidden')).toBe('false');
});

it('ignores backdrop taps, and Escape or phone Back go to the previous step', async () => {
  const onClose = vi.fn();
  await act(async () =>
    root.render(<AppGuide videosAllowed={false} onNavigate={vi.fn()} onClose={onClose} />),
  );
  vi.spyOn(dialog(), 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 400, 350, 300));
  await act(async () => {
    dialog().dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 50 }),
    );
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 50 }));
  });
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => next().click());
  await act(async () => next().click());
  expect(kicker()).toContain('3 of');
  await cancel();
  expect(kicker()).toContain('2 of');
  await cancel();
  expect(kicker()).toContain('1 of');
  expect(onClose).not.toHaveBeenCalled();
  // On the first step there is nowhere to go back to, so it closes.
  await cancel();
  expect(onClose).toHaveBeenCalledOnce();
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
