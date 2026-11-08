// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotificationDialog } from './NotificationDialog';

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
  await act(async () => vi.advanceTimersByTime(4000));
  await act(async () =>
    root.render(<NotificationDialog message="Saved." onClose={() => close()} />),
  );
  await act(async () => vi.advanceTimersByTime(4000));
  expect(close).toHaveBeenCalledOnce();
});
it('offers dismissal and escapes message content', async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(<NotificationDialog message="Could not import <script>." onClose={close} />),
  );
  expect(document.querySelector('.app-notification-toast script')).toBeNull();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close notification"]')!.click(),
  );
  expect(close).toHaveBeenCalledOnce();
});

it('can keep a toast inside the modal top layer without a second dialog', async () => {
  await act(async () =>
    root.render(
      <dialog open>
        <NotificationDialog message="Card downloaded" onClose={vi.fn()} portal={false} />
      </dialog>,
    ),
  );
  expect(host.querySelector('dialog [role="status"]')?.textContent).toContain('Card downloaded');
  expect(document.querySelectorAll('dialog')).toHaveLength(1);
});
