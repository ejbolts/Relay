// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTabBar, type StartMenuActions } from './AppTabBar';

let root: Root;
let container: HTMLDivElement;
let startMenu: StartMenuActions;
const onStart = vi.fn();

function render(workoutStartedAt: number | null = null) {
  root.render(
    <AppTabBar
      active="dashboard"
      workoutStartedAt={workoutStartedAt}
      onSelect={vi.fn()}
      onStart={onStart}
      startMenu={startMenu}
    />,
  );
}

const start = () => container.querySelector<HTMLButtonElement>('.app-tab-start')!;
const menu = () => container.querySelector<HTMLElement>('#start-menu')!;
const option = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('.start-menu-option')].find((button) =>
    (button.getAttribute('aria-label') ?? button.textContent)?.startsWith(label),
  )!;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onStart.mockClear();
  startMenu = {
    upNextLabel: 'Pull day',
    onCardio: vi.fn(),
    onUpNext: vi.fn(),
    onEmpty: vi.fn(),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => render());
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Start menu', () => {
  it('opens the choices instead of starting a workout straight away', async () => {
    expect(start().getAttribute('aria-expanded')).toBe('false');
    expect(menu().getAttribute('aria-hidden')).toBe('true');

    await act(async () => start().click());

    expect(onStart).not.toHaveBeenCalled();
    expect(start().getAttribute('aria-expanded')).toBe('true');
    expect(menu().getAttribute('aria-hidden')).toBe('false');
    expect(option('Up next').getAttribute('aria-label')).toBe('Up next: Pull day');
    expect(menu().textContent).toContain('Pull day');
  });

  it.each([
    ['Cardio', 'onCardio'],
    ['Up next', 'onUpNext'],
    ['Empty', 'onEmpty'],
  ] as const)('starts %s and closes the menu', async (label, action) => {
    await act(async () => start().click());
    await act(async () => option(label).click());

    expect(startMenu[action]).toHaveBeenCalledOnce();
    expect(start().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and when the backdrop is tapped', async () => {
    await act(async () => start().click());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(start().getAttribute('aria-expanded')).toBe('false');

    await act(async () => start().click());
    await act(async () => container.querySelector<HTMLElement>('.start-menu-scrim')!.click());
    expect(start().getAttribute('aria-expanded')).toBe('false');
  });

  it('resumes a live workout without opening the menu', async () => {
    await act(async () => render(Date.now()));
    await act(async () => start().click());

    expect(onStart).toHaveBeenCalledOnce();
    expect(start().hasAttribute('aria-expanded')).toBe(false);
    expect(menu().getAttribute('aria-hidden')).toBe('true');
  });

  it('omits the workout name when nothing is recommended yet', async () => {
    startMenu = { ...startMenu, upNextLabel: null };
    await act(async () => render());
    await act(async () => start().click());

    expect(option('Up next').getAttribute('aria-label')).toBe('Up next');
    expect(container.querySelector('.start-menu-detail')).toBeNull();
  });
});
