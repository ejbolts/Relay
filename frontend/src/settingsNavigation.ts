import { createContext, useContext, useEffect, useRef } from 'react';
import type { SettingsDestination, SettingsPage } from './settingsSearchIndex';

export * from './settingsSearchIndex';

export interface SettingsJump {
  destination: SettingsDestination;
  serial: number;
}
export const SettingsNavigationContext = createContext<{
  request: SettingsJump | null;
  navigate: (destination: SettingsDestination) => void;
} | null>(null);

/** Open folded sections without invoking any setting's action. */
export function useSettingsReveal(title: string, reveal: () => void) {
  const navigation = useContext(SettingsNavigationContext);
  const callback = useRef(reveal);
  callback.current = reveal;
  useEffect(() => {
    if (navigation?.request?.destination.reveal?.includes(title)) callback.current();
  }, [navigation?.request, title]);
}

/** Runs after page navigation and destination controls have been revealed. */
export function useSettingsPageJump(page: SettingsPage, active: boolean) {
  const navigation = useContext(SettingsNavigationContext);
  const handled = useRef(0);
  useEffect(() => {
    const request = navigation?.request;
    if (
      !active ||
      !request ||
      request.destination.page !== page ||
      handled.current === request.serial
    )
      return;
    const { destination, serial } = request;
    let first = 0;
    let second = 0;
    let queued = false;
    const observer = new MutationObserver(queueFocus);
    const expiry = setTimeout(() => observer.disconnect(), 15000);
    function queueFocus() {
      if (queued || handled.current === serial) return;
      queued = true;
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          queued = false;
          // Screens other than Settings and Profile are found by the control itself.
          const root = document.querySelector(`[data-settings-page="${page}"]`) ?? document;
          const target = Array.from(root.querySelectorAll<HTMLElement>(destination.selector)).find(
            (element) => !element.closest('.is-collapsed, [hidden]'),
          );
          if (!target) return;
          handled.current = serial;
          observer.disconnect();
          clearTimeout(expiry);
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          if (!target.matches('input,button,select,textarea,a')) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        });
      });
    }
    // Optional shared fields may arrive after a server request on the first profile visit.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
    queueFocus();
    return () => {
      observer.disconnect();
      clearTimeout(expiry);
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [active, navigation?.request, page]);
}
