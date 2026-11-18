import { useSyncExternalStore } from 'react';
import { runningAsInstalledApp } from './homeScreenGuideState';

/** Chromium's install prompt event, which is not in the standard DOM types. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * - `install`: the browser offers its own install prompt (Chrome, Edge, Samsung Internet).
 * - `share`: open the system share sheet, which holds Add to Home Screen (Safari and other iOS browsers).
 * - `steps`: neither is available, so show the written steps.
 * - `installed`: already opened from the Home Screen.
 */
export type InstallMethod = 'install' | 'share' | 'steps' | 'installed';

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Starts listening before the first render, because the browser fires the event early and once. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's mini-infobar away; Relay offers its own button instead.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function installMethod(): InstallMethod {
  if (runningAsInstalledApp()) return 'installed';
  if (deferredPrompt) return 'install';
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') return 'share';
  return 'steps';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallMethod(): InstallMethod {
  return useSyncExternalStore(subscribe, installMethod, () => 'steps' as const);
}

/**
 * Brings up the browser's own way to add Relay to the Home Screen.
 * Returns `false` when there is nothing to open, so the caller can show the written steps.
 */
export async function openInstallOption(): Promise<boolean> {
  const method = installMethod();
  if (method === 'install' && deferredPrompt) {
    const prompt = deferredPrompt;
    // A prompt event can only be used once.
    deferredPrompt = null;
    notify();
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      return false;
    }
    return true;
  }
  if (method === 'share') {
    try {
      await navigator.share({ title: 'Relay', url: `${window.location.origin}/` });
    } catch (error) {
      // Closing the share sheet is a normal choice, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return true;
      return false;
    }
    return true;
  }
  return false;
}
