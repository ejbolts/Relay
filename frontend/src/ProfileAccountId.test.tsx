// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createToastRoot, toastButton, toastElement, toastText } from './toastTestUtils';
import { TOAST_MS } from './Toast';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfileAccountId } from './ProfileAccountId';
const id = 'd7131000-7937-40be-b8ee-8b02800f5a36';
let root: Root;
let container: HTMLDivElement;
const writeText = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createToastRoot(container);
  await act(async () => root.render(<ProfileAccountId accountId={id} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  writeText.mockReset();
  window.getSelection()?.removeAllRanges();
});
it('shows and copies the full account UUID', async () => {
  expect(container.querySelector('code')?.textContent).toBe(id);
  await act(async () => container.querySelector('button')!.click());
  expect(writeText).toHaveBeenCalledWith(id);
  expect(container.textContent).not.toContain('UUID copied.');
  expect(toastText()).toBe('UUID copied.');
  await act(async () => vi.advanceTimersByTime(TOAST_MS));
  expect(toastElement()).toBeNull();
});
it('selects the UUID for manual copying when clipboard access fails', async () => {
  writeText.mockRejectedValueOnce(new Error('denied'));
  await act(async () => container.querySelector('button')!.click());
  expect(window.getSelection()?.toString()).toBe(id);
  expect(toastText()).toContain('UUID selected.');
});

it('restarts the timeout when copied again and can be dismissed early', async () => {
  await act(async () => container.querySelector('button')!.click());
  await act(async () => vi.advanceTimersByTime(TOAST_MS - 1000));
  await act(async () => container.querySelector('button')!.click());
  await act(async () => vi.advanceTimersByTime(TOAST_MS - 1000));
  expect(toastElement()).not.toBeNull();
  await act(async () => toastButton('Dismiss notification')!.click());
  expect(toastElement()).toBeNull();
});
