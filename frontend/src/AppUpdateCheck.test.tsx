// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateCheck } from './AppUpdateCheck';
import { TOAST_MS } from './Toast';
import { toastButton, toastElement, toastText, withToasts } from './toastTestUtils';
import type { UpdateCheckStatus } from './useAppUpdates';

let root: Root;
let container: HTMLDivElement;
let status: UpdateCheckStatus;
let available: boolean;
let inSettings: boolean;

const onCheck = vi.fn(() => {
  status = 'checking';
  render();
});

function render() {
  root.render(
    withToasts(
      inSettings && <AppUpdateCheck available={available} status={status} onCheck={onCheck} />,
    ),
  );
}

async function check() {
  await act(async () => container.querySelector('button')!.click());
}

async function finish(result: UpdateCheckStatus) {
  status = result;
  available = result === 'available';
  await act(async () => render());
}

const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onCheck.mockClear();
  status = 'idle';
  available = false;
  inSettings = true;
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
  it('confirms the result in the shared toast, which clears itself', async () => {
    await check();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(toastElement()).toBeNull();

    await finish('current');
    expect(toastText()).toBe('Up to date');
    expect(toastElement()!.dataset.variant).toBe('status');
    expect(container.contains(toastElement())).toBe(false);
    expect(container.querySelector('[role="status"], p, time')).toBeNull();

    await advance(TOAST_MS.status - 1);
    expect(toastElement()).not.toBeNull();
    await advance(1);
    expect(toastElement()).toBeNull();
    expect(container.textContent).toBe('Check for updates');
  });

  it('gives a repeated check a fresh toast and its full duration', async () => {
    await check();
    await finish('current');
    await advance(2000);
    await check();
    await finish('current');
    await advance(TOAST_MS.status - 1);
    expect(toastText()).toBe('Up to date');
    await advance(1);
    expect(toastElement()).toBeNull();
  });

  it.each([
    ['available', 'Update available. Use the refresh arrow above', 'status'],
    ['error', 'Could not check for updates. Check your connection and try again.', 'warning'],
  ] as const)('shows %s feedback as a dismissible %s toast', async (result, message, variant) => {
    await check();
    await finish(result);
    expect(toastText()).toContain(message);
    expect(toastElement()!.dataset.variant).toBe(variant);
    expect(toastElement()!.getAttribute('role')).toBe(variant === 'warning' ? 'alert' : 'status');
    await act(async () => toastButton('Dismiss notification')!.click());
    expect(toastElement()).toBeNull();
  });

  it('does not replay an old result when Settings opens', async () => {
    await finish('current');
    expect(toastElement()).toBeNull();
  });

  it('keeps the result on screen after leaving Settings until it times out', async () => {
    await check();
    await finish('current');
    inSettings = false;
    await act(async () => render());
    expect(container.querySelector('button')).toBeNull();
    expect(toastText()).toBe('Up to date');
    await advance(TOAST_MS.status);
    expect(toastElement()).toBeNull();
  });
});
