import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToastProvider } from './Toast';

/** Wraps `node` in the shared toast slot, as `main.tsx` does, so `useToast().show()` shows. */
export function withToasts(node: ReactNode) {
  return <ToastProvider>{node}</ToastProvider>;
}

/** A React root that renders everything inside the shared toast slot. */
export function createToastRoot(container: Element): Root {
  const root = createRoot(container);
  return {
    render: (node) => root.render(withToasts(node)),
    unmount: () => root.unmount(),
  };
}

/** The toast on screen, if any. */
export function toastElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.toast');
}

/** The toast's text, or null when no toast is showing. */
export function toastText(): string | null {
  return toastElement()?.querySelector('.toast-text')?.textContent ?? null;
}

/** A button on the toast by its label or text, for example "Undo" or "Dismiss notification". */
export function toastButton(label: string): HTMLButtonElement | undefined {
  return [...(toastElement()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === label,
  );
}
