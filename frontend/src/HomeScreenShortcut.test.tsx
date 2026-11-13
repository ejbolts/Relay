// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppGuide } from './AppGuide';
import { appGuideSteps } from './appGuideSteps';
import { HomeScreenGuideContent } from './HomeScreenGuide';
import { openInstallOption, useInstallMethod } from './installPrompt';

vi.mock('./installPrompt', () => ({
  useInstallMethod: vi.fn(),
  openInstallOption: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
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
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollTo = vi.fn();
  vi.mocked(useInstallMethod).mockReturnValue('share');
  vi.mocked(openInstallOption).mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('makes the real share button the first guide step and keeps manual Safari steps available', async () => {
  await act(async () => root.render(<HomeScreenGuideContent />));
  const firstStep = host.querySelector('ol > li')!;
  const button = firstStep.querySelector('button')!;
  expect(button.textContent).toBe('Open Share menu');
  expect(host.querySelector('details')!.open).toBe(false);
  expect(host.querySelector('details')!.textContent).toContain('In Safari, tap the menu button');
  expect(host.querySelector('.home-guide-shortcut-steps')!.textContent).toContain('then tap Add');
  await act(async () => button.click());
  expect(openInstallOption).toHaveBeenCalledOnce();
  expect(host.querySelector('details')!.open).toBe(false);
});

it('opens the manual fallback if the browser refuses the shortcut', async () => {
  vi.mocked(openInstallOption).mockResolvedValue(false);
  await act(async () => root.render(<HomeScreenGuideContent />));
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('details')!.open).toBe(true);
});

it('shows the install prompt path without telling Chromium users to use the share sheet', async () => {
  vi.mocked(useInstallMethod).mockReturnValue('install');
  await act(async () => root.render(<HomeScreenGuideContent />));
  const shortcut = host.querySelector('.home-guide-shortcut-steps')!;
  expect(shortcut.querySelector('button')!.textContent).toBe('Install Relay');
  expect(shortcut.textContent).toContain('then confirm in your browser');
  expect(shortcut.querySelectorAll('li')).toHaveLength(1);
  await act(async () => shortcut.querySelector('button')!.click());
  expect(openInstallOption).toHaveBeenCalledOnce();
});

it.each(['steps', 'installed'] as const)(
  'keeps the full illustrated fallback for %s',
  async (method) => {
    vi.mocked(useInstallMethod).mockReturnValue(method);
    await act(async () => root.render(<HomeScreenGuideContent />));
    expect(host.querySelector('.home-guide-shortcut')).toBeNull();
    expect(host.querySelector('details')).toBeNull();
    expect(host.querySelectorAll('ol > li')).toHaveLength(5);
  },
);

it('shows the shortcut on the startup tour’s installation page and preserves Back navigation', async () => {
  await act(async () =>
    root.render(<AppGuide videosAllowed={false} onNavigate={vi.fn()} onClose={vi.fn()} />),
  );
  const next = () => document.querySelector<HTMLButtonElement>('.app-guide .popup-primary-action')!;
  for (let index = 0; index < appGuideSteps(false).length; index++) {
    await act(async () => next().click());
  }
  expect(document.querySelector('.app-guide h2')!.textContent).toBe('Add to Home Screen');
  const shareButton = document.querySelector<HTMLButtonElement>('.app-guide .home-guide-shortcut')!;
  expect(shareButton.textContent).toBe('Open Share menu');
  await act(async () => shareButton.click());
  expect(openInstallOption).toHaveBeenCalledOnce();
  const back = [...document.querySelectorAll<HTMLButtonElement>('.app-guide button')].find(
    (button) => button.textContent === 'Back',
  )!;
  await act(async () => back.click());
  expect(document.querySelector('.app-guide h2')!.textContent).toBe('App guide');
  await act(async () => next().click());
  expect(document.querySelector('.app-guide .home-guide-shortcut')).not.toBeNull();
});
