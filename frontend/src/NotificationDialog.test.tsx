// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotificationDialog } from './NotificationDialog';
import { TOAST_MS } from './Toast';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
it.each(['Workout CSV exported.', 'Could not export workout data.'])(
  'announces %s without a modal or moving focus',
  async (message) => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await act(async () => root.render(<NotificationDialog message={message} onClose={vi.fn()} />));
    expect(document.querySelector('[role="status"]')?.textContent).toContain(message);
    expect(document.querySelector('dialog, [aria-modal="true"], [inert]')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(document.body.style.overflow).not.toBe('hidden');
    input.remove();
  },
);
it('dismisses automatically and does not restart the timer on unrelated renders', async () => {
  const close = vi.fn();
  await act(async () => root.render(<NotificationDialog message="Saved." onClose={close} />));
  await act(async () => vi.advanceTimersByTime(TOAST_MS.status / 2));
  await act(async () =>
    root.render(<NotificationDialog message="Saved." onClose={() => close()} />),
  );
  await act(async () => vi.advanceTimersByTime(TOAST_MS.status / 2));
  expect(close).toHaveBeenCalledOnce();
});
it('offers dismissal and escapes message content', async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(<NotificationDialog message="Could not import <script>." onClose={close} />),
  );
  expect(document.querySelector('.toast script')).toBeNull();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close notification"]')!.click(),
  );
  expect(close).toHaveBeenCalledOnce();
});

it('shows inside an open modal dialog without a second dialog', async () => {
  await act(async () =>
    root.render(
      <dialog open aria-modal="true">
        <NotificationDialog message="Card downloaded" onClose={vi.fn()} portal={false} />
      </dialog>,
    ),
  );
  expect(host.querySelector('dialog [role="status"]')?.textContent).toContain('Card downloaded');
  expect(document.querySelectorAll('dialog')).toHaveLength(1);
});

it('offers an optional action without taking focus and lasts as long as an action toast', async () => {
  const close = vi.fn();
  const share = vi.fn();
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  await act(async () =>
    root.render(
      <NotificationDialog
        message="Workout saved"
        onClose={close}
        action={{ label: 'Share card', onClick: share }}
      />,
    ),
  );
  expect(document.activeElement).toBe(input);
  expect(document.querySelector('dialog, [aria-modal="true"], [inert]')).toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>('.toast-action')!.click());
  expect(share).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTime(TOAST_MS.action - 1));
  expect(close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(close).toHaveBeenCalledOnce();
  input.remove();
});

it('keeps one countdown bar in step with the timeout without restarting on rerender', async () => {
  const close = vi.fn();
  const render = () =>
    root.render(
      <NotificationDialog
        message="Workout saved"
        onClose={() => close()}
        durationMs={3000}
        countdown
      />,
    );
  await act(async () => render());
  const bar = document.querySelector<HTMLElement>('.toast-timer')!;
  expect(bar.getAttribute('aria-hidden')).toBe('true');
  expect(bar.closest<HTMLElement>('.toast')!.style.getPropertyValue('--toast-ms')).toBe(
    `${TOAST_MS.status}ms`,
  );
  await act(async () => vi.advanceTimersByTime(1500));
  await act(async () => render());
  expect(document.querySelector('.toast-timer')).toBe(bar);
  await act(async () => vi.advanceTimersByTime(TOAST_MS.status - 1501));
  expect(close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(close).toHaveBeenCalledOnce();
});
