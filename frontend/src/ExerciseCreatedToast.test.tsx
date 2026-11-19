// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EXERCISE_CREATED_TOAST_MS, ExerciseCreatedToast } from './ExerciseCreatedToast';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('clears itself after a few seconds', async () => {
  const onDismiss = vi.fn();
  await act(async () =>
    root.render(<ExerciseCreatedToast name="Floor Press" onOpen={vi.fn()} onDismiss={onDismiss} />),
  );
  expect(document.querySelector('.toast')?.textContent).toContain('Floor Press added');
  await act(async () => vi.advanceTimersByTime(EXERCISE_CREATED_TOAST_MS - 1));
  expect(onDismiss).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(onDismiss).toHaveBeenCalledOnce();
});

it('opens the new exercise and closes', async () => {
  const onDismiss = vi.fn();
  const onOpen = vi.fn();
  await act(async () =>
    root.render(<ExerciseCreatedToast name="Floor Press" onOpen={onOpen} onDismiss={onDismiss} />),
  );
  await act(async () => document.querySelector<HTMLButtonElement>('.toast-action')!.click());
  expect(onOpen).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();
});
