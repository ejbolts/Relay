// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateCheck } from './AppUpdateCheck';
import type { UpdateCheckStatus } from './useAppUpdates';

let root: Root;
let container: HTMLDivElement;
let status: UpdateCheckStatus;
let available: boolean;

const onCheck = vi.fn(() => {
  status = 'checking';
  render();
});

function render() {
  root.render(<AppUpdateCheck available={available} status={status} onCheck={onCheck} />);
}

async function check() {
  await act(async () => container.querySelector('button')!.click());
}

async function finish(result: UpdateCheckStatus) {
  status = result;
  available = result === 'available';
  await act(async () => render());
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onCheck.mockClear();
  status = 'idle';
  available = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => render());
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('update check notification', () => {
  it('shows a timestamp after completion, then disappears without inline status space', async () => {
    expect(document.querySelector('[role="status"]')).toBeNull();
    await check();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(document.querySelector('[role="status"]')).toBeNull();

    await finish('current');
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Up to date');
    expect(document.querySelector('time')!.dateTime).toBe('2026-10-15T12:00:00.000Z');
    expect(document.querySelector('time')!.textContent).toContain('Checked at');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('p')).toBeNull();

    await act(async () => vi.advanceTimersByTime(2999));
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('Check for updates');
  });

  it('gives each repeated check a fresh timestamp and full notification duration', async () => {
    await check();
    await finish('current');
    await act(async () => vi.advanceTimersByTime(2000));
    await check();
    expect(document.querySelector('[role="status"]')).toBeNull();
    await finish('current');
    expect(document.querySelector('time')!.dateTime).toBe('2026-10-15T12:00:02.000Z');
    await act(async () => vi.advanceTimersByTime(1000));
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it.each([
    ['available', 'Update available. Use the refresh arrow above'],
    ['error', 'Could not check for updates. Check your connection and try again.'],
  ] as const)('preserves %s feedback in a dismissible popup', async (result, message) => {
    await check();
    await finish(result);
    const notification = document.querySelector('[role="status"]')!;
    expect(notification.textContent).toContain(message);
    expect(notification.textContent).toContain(result === 'error' ? 'Attempted at' : 'Checked at');
    expect(notification.classList.contains('has-update')).toBe(result === 'available');
    await act(async () => (notification.querySelector('button') as HTMLButtonElement).click());
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not replay an old result when Settings opens', async () => {
    await finish('current');
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('cleans up its popup and timer when leaving Settings', async () => {
    await check();
    await finish('current');
    await act(async () => root.render(null));
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
