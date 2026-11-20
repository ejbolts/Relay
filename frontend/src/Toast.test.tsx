// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOAST_MS,
  Toast,
  ToastProvider,
  useToast,
  useToastPlacement,
  type ToastApi,
  type ToastProps,
} from './Toast';

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
  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const render = async (node: ReactNode) => act(async () => root.render(node));
const advance = async (ms: number) => act(async () => vi.advanceTimersByTime(ms));
const toasts = () => [...document.querySelectorAll<HTMLElement>('.toast')];
const toast = () => document.querySelector<HTMLElement>('.toast');
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.toast button')].find(
    (item) => (item.getAttribute('aria-label') ?? item.textContent) === label,
  )!;
const pointer = (target: Element, type: string, pointerType: string) =>
  target.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true }), { pointerType, pointerId: 1 }),
  );

function base(props: Partial<ToastProps> = {}): ToastProps {
  return { message: 'Saved', onDismiss: vi.fn(), ...props };
}

describe('variants and timing', () => {
  it.each([
    ['status', undefined, 'status', TOAST_MS.status],
    ['action', { label: 'Undo', run: () => undefined }, 'status', TOAST_MS.action],
    ['error', undefined, 'alert', TOAST_MS.error],
  ] as const)('a %s toast has its role and duration', async (variant, action, role, ms) => {
    const onDismiss = vi.fn();
    await render(
      <Toast
        message="Saved"
        variant={variant === 'action' ? undefined : variant}
        action={action}
        onDismiss={onDismiss}
      />,
    );
    expect(toast()!.dataset.variant).toBe(variant);
    expect(toast()!.getAttribute('role')).toBe(role);
    expect(toast()!.style.getPropertyValue('--toast-ms')).toBe(`${ms}ms`);
    await advance(ms - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('gives a long message the error tier, and the close button a 44px target label', async () => {
    await render(<Toast {...base({ message: 'x'.repeat(91) })} />);
    expect(toast()!.style.getPropertyValue('--toast-ms')).toBe(`${TOAST_MS.error}ms`);
    expect(button('Dismiss notification')).toBeTruthy();
  });

  it('shows up to three celebrate lines, then how many more', async () => {
    const lines = ['A', 'B', 'C', 'D'].map((title) => ({ title, detail: `${title} detail` }));
    await render(<Toast {...base({ variant: 'celebrate', lines })} />);
    expect([...toast()!.querySelectorAll('.toast-line strong')].map((n) => n.textContent)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(toast()!.querySelector('.toast-more')?.textContent).toBe('+1 more');
    expect(toast()!.querySelector('.toast-icon')).not.toBeNull();
  });
});

describe('without a provider', () => {
  it('shows on its own at the top of the page, and useToast does nothing', async () => {
    let api!: ToastApi;
    function Probe() {
      api = useToast();
      return null;
    }
    await render(
      <>
        <Probe />
        <Toast {...base()} />
      </>,
    );
    expect(toast()!.closest('.toast-viewport')?.parentElement).toBe(document.body);
    expect(toast()!.closest('.toast-viewport')?.classList.contains('is-top')).toBe(true);
    expect(api.active).toBe(false);
    expect(() => api.show('Ignored')).not.toThrow();
    expect(toasts()).toHaveLength(1);
  });
});

describe('one slot', () => {
  it('replaces the toast on screen and settles it through onTimeout', async () => {
    const first = { onTimeout: vi.fn(), onDismiss: vi.fn() };
    await render(
      <ToastProvider>
        <Toast message="Set deleted" action={{ label: 'Undo', run: vi.fn() }} {...first} />
      </ToastProvider>,
    );
    expect(toast()?.textContent).toContain('Set deleted');
    await render(
      <ToastProvider>
        <Toast message="Set deleted" action={{ label: 'Undo', run: vi.fn() }} {...first} />
        <Toast {...base({ message: 'Swapped to Row' })} />
      </ToastProvider>,
    );
    expect(first.onTimeout).toHaveBeenCalledOnce();
    expect(first.onDismiss).not.toHaveBeenCalled();
    // The replaced toast stays hidden even though its owner still renders it.
    expect(toasts().map((item) => item.textContent)).toEqual([
      expect.stringContaining('Swapped to Row'),
    ]);
    await advance(TOAST_MS.action * 2);
    expect(first.onTimeout).toHaveBeenCalledOnce();
  });

  it('counts a shown toast as active in the same render, before it takes the slot', async () => {
    const seen: { asked: boolean; active: boolean }[] = [];
    function Probe() {
      const toast = useToast();
      const [asked, setAsked] = useState(false);
      seen.push({ asked, active: toast.active });
      return (
        <button
          type="button"
          className="ask"
          onClick={() => {
            toast.show('Workout discarded.');
            setAsked(true);
          }}
        />
      );
    }
    await render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    await act(async () => host.querySelector<HTMLButtonElement>('.ask')!.click());
    expect(toast()?.textContent).toContain('Workout discarded.');
    // A launch prompt checking `active` never sees the request without the toast.
    expect(seen.filter((render) => render.asked).every((render) => render.active)).toBe(true);
  });

  it('shows toasts from useToast, replacing and dismissing them', async () => {
    let api!: ToastApi;
    function Probe() {
      api = useToast();
      return null;
    }
    const firstTimeout = vi.fn();
    await render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    expect(api.active).toBe(false);
    await act(async () => api.show({ message: 'Profile saved.', onTimeout: firstTimeout }));
    expect(api.active).toBe(true);
    expect(toast()?.textContent).toContain('Profile saved.');
    await act(async () => api.show('Split saved.'));
    expect(firstTimeout).toHaveBeenCalledOnce();
    expect(toasts()).toHaveLength(1);
    expect(toast()?.textContent).toContain('Split saved.');
    await act(async () => api.dismiss());
    expect(toast()).toBeNull();
    expect(api.active).toBe(false);
    await act(async () => api.show('Copied'));
    await advance(TOAST_MS.status);
    expect(toast()).toBeNull();
  });
});

describe('countdown', () => {
  it('never takes focus or opens a modal, and shows its message as text', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await render(<Toast {...base({ message: 'Could not import <script>.' })} />);
    expect(toast()?.textContent).toContain('Could not import <script>.');
    expect(document.querySelector('.toast script')).toBeNull();
    expect(document.querySelector('dialog, [aria-modal="true"], [inert]')).toBeNull();
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('keeps its countdown and bar through a re-render with the same id', async () => {
    const onDismiss = vi.fn();
    const draw = () => render(<Toast {...base({ onDismiss: () => onDismiss() })} />);
    await draw();
    const bar = document.querySelector('.toast-timer');
    await advance(TOAST_MS.status / 2);
    await draw();
    expect(document.querySelector('.toast-timer')).toBe(bar);
    await advance(TOAST_MS.status / 2 - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('pauses while pressed or focused and keeps the time left', async () => {
    const onDismiss = vi.fn();
    await render(
      <ToastProvider>
        <Toast {...base({ onDismiss, action: { label: 'Undo', run: vi.fn() } })} />
      </ToastProvider>,
    );
    await advance(TOAST_MS.action - 1000);
    pointer(toast()!, 'pointerdown', 'touch');
    await advance(0);
    expect(toast()!.hasAttribute('data-paused')).toBe(true);
    await advance(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => pointer(window.document.body, 'pointerup', 'touch'));
    expect(toast()!.hasAttribute('data-paused')).toBe(false);

    await act(async () => button('Undo').focus());
    expect(toast()!.hasAttribute('data-paused')).toBe(true);
    await advance(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => button('Undo').blur());
    await advance(999);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('pauses while busy and disables its buttons', async () => {
    const onDismiss = vi.fn();
    const action = { label: 'Undo', run: vi.fn() };
    await render(<Toast {...base({ onDismiss, action, busy: true })} />);
    expect(button('Undo').disabled).toBe(true);
    expect(button('Dismiss notification').disabled).toBe(true);
    await advance(TOAST_MS.action * 2);
    expect(onDismiss).not.toHaveBeenCalled();
    await render(<Toast {...base({ onDismiss, action })} />);
    await advance(TOAST_MS.action);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('restarts the countdown and the bar when the id changes', async () => {
    const onDismiss = vi.fn();
    await render(<Toast {...base({ id: 1, onDismiss })} />);
    const bar = document.querySelector('.toast-timer');
    await advance(TOAST_MS.status - 500);
    await render(<Toast {...base({ id: 2, onDismiss })} />);
    expect(document.querySelector('.toast-timer')).not.toBe(bar);
    await advance(TOAST_MS.status - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('settles an offer such as Undo when the app is hidden', async () => {
    const onTimeout = vi.fn();
    await render(<Toast {...base({ onTimeout, action: { label: 'Undo', run: vi.fn() } })} />);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    await advance(TOAST_MS.action);
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});

describe('placement', () => {
  function OpenDialog({ label }: { label: string }) {
    return (
      <dialog open aria-modal="true" aria-label={label}>
        {label}
      </dialog>
    );
  }

  it('moves into the newest open modal dialog and back, keeping its place in the countdown', async () => {
    const view = (dialogs: string[]) =>
      render(
        <ToastProvider>
          {dialogs.map((label) => (
            <OpenDialog key={label} label={label} />
          ))}
          <Toast {...base()} />
        </ToastProvider>,
      );
    await view([]);
    expect(toast()!.closest('.toast-viewport')?.parentElement).toBe(document.body);
    await advance(1000);
    await view(['Weekly review']);
    expect(toast()!.closest('dialog')?.getAttribute('aria-label')).toBe('Weekly review');
    expect(toast()!.style.getPropertyValue('--toast-offset')).toBe('-1000ms');
    expect(toast()!.hasAttribute('data-resumed')).toBe(true);
    await view(['Weekly review', 'Share workout']);
    expect(toast()!.closest('dialog')?.getAttribute('aria-label')).toBe('Share workout');
    await view([]);
    expect(toast()!.closest('.toast-viewport')?.parentElement).toBe(document.body);
    expect(toasts()).toHaveLength(1);
  });

  it('docks at the bottom for a screen that asks, but never inside a dialog', async () => {
    function Logger() {
      useToastPlacement('bottom', '6rem');
      return null;
    }
    const view = (logger: boolean, dialog: boolean) =>
      render(
        <ToastProvider>
          {logger && <Logger />}
          {dialog && <OpenDialog label="Note" />}
          <Toast {...base()} />
        </ToastProvider>,
      );
    const viewport = () => toast()!.closest<HTMLElement>('.toast-viewport')!;
    await view(true, false);
    expect(viewport().classList.contains('is-bottom')).toBe(true);
    expect(viewport().style.getPropertyValue('--toast-bottom')).toBe('6rem');
    await view(true, true);
    expect(viewport().classList.contains('is-top')).toBe(true);
    await view(false, false);
    expect(viewport().classList.contains('is-top')).toBe(true);
  });
});
