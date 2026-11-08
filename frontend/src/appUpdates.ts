import { readActiveWorkoutDraft } from './workoutDraft';

export const BEFORE_APP_REFRESH_EVENT = 'gym-logger-before-app-refresh';
/** Returning after this long counts as opening the app again. */
export const REOPEN_AFTER_HIDDEN_MS = 5 * 60 * 1000;
/** An update found within this long of opening, before any touch, applies by itself. */
export const AUTO_UPDATE_WINDOW_MS = 60 * 1000;
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

const WORKER_TIMEOUT_MS = 30_000;
const listeners = new Set<() => void>();
const watchedWorkers = new WeakSet<ServiceWorker>();
let registration: ServiceWorkerRegistration | undefined;
let registering: Promise<ServiceWorkerRegistration | undefined> | undefined;
let checking: Promise<void> | undefined;
let refreshing: Promise<void> | undefined;
let started = false;
let watching = false;
let hadInstalledWorker = false;
let controlledWorker: ServiceWorker | null | undefined;
let updateActivatedElsewhere = false;
let updateAvailable = false;
let updateRequired = false;
let pendingWrites = 0;
// When the app was last opened; cleared by the first touch, which ends automatic updates.
let openedAt: number | null = null;
let hiddenAt: number | null = null;
let applyingAutomatically = false;
let idleRetry: ReturnType<typeof setTimeout> | undefined;
/** How often a blocked automatic update is checked again while the app has just been opened. */
const IDLE_RETRY_MS = 1000;

function supportsWorkers(): boolean {
  return import.meta.env.PROD && 'serviceWorker' in navigator;
}

export function subscribeAppUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isAppUpdateAvailable(): boolean {
  return updateAvailable;
}

/** The server turned away a save from this release; it needs the update to save again. */
export function isAppUpdateRequired(): boolean {
  return updateRequired;
}

function updateReady(): boolean {
  return updateActivatedElsewhere || Boolean(hadInstalledWorker && registration?.waiting);
}

function syncUpdateAvailability() {
  const next = updateRequired || updateReady();
  if (next !== updateAvailable) {
    updateAvailable = next;
    listeners.forEach((listener) => listener());
  }
  applyUpdateIfIdle();
}

export function reportClientOutdated() {
  if (!updateRequired) {
    updateRequired = true;
    updateAvailable = true;
    listeners.forEach((listener) => listener());
  }
  void checkForAppUpdate().catch(() => {
    // The refresh action retries the download.
  });
}

/** Marks a save or upload in flight, so an automatic update never interrupts it. */
export function beginWrite(): () => void {
  pendingWrites += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    pendingWrites -= 1;
    try {
      applyUpdateIfIdle();
    } catch {
      // An update check must never change the outcome of the save that just finished.
    }
  };
}

export function trackWrite<T>(write: Promise<T>): Promise<T> {
  return write.finally(beginWrite());
}

function hasWorkInProgress(): boolean {
  // A finished workout waiting to sync is durable; an unfinished one is still being logged.
  const draft = readActiveWorkoutDraft();
  if (draft && !draft.pendingSave) return true;
  const focused = document.activeElement as HTMLElement | null;
  if (focused && (focused.isContentEditable || focused.matches?.('input, textarea, select')))
    return true;
  return document.querySelector('dialog[open], [aria-modal="true"]') !== null;
}

function refreshAllowed(automatic: boolean): boolean {
  return window.dispatchEvent(
    new CustomEvent(BEFORE_APP_REFRESH_EVENT, { cancelable: true, detail: { automatic } }),
  );
}

function justOpened(): boolean {
  return openedAt !== null && Date.now() - openedAt <= AUTO_UPDATE_WINDOW_MS;
}

/**
 * Apply a downloaded update by itself when the app has just been opened, nothing has been
 * touched since, and nothing is being logged, edited, saved or uploaded. Otherwise the refresh
 * arrow stays available and the update applies the next time the app is opened.
 */
function applyUpdateIfIdle() {
  clearTimeout(idleRetry);
  if (applyingAutomatically || refreshing || !justOpened() || !updateReady()) return;
  if (
    document.visibilityState !== 'visible' ||
    pendingWrites > 0 ||
    hasWorkInProgress() ||
    !refreshAllowed(true)
  ) {
    // Startup screens, dialogs and saves come and go; check again until the window closes.
    idleRetry = setTimeout(applyUpdateIfIdle, IDLE_RETRY_MS);
    return;
  }
  applyingAutomatically = true;
  void (async () => {
    const waiting = registration?.waiting;
    if (waiting) await activateWaitingWorker(waiting);
    // The person may have started something while the new worker activated.
    if (!justOpened() || pendingWrites > 0 || hasWorkInProgress() || !refreshAllowed(true)) return;
    window.location.reload();
  })()
    .catch(() => {
      // Keep the current app; the refresh arrow stays available.
    })
    .finally(() => {
      applyingAutomatically = false;
    });
}

function watchOpening() {
  openedAt = Date.now();
  const touched = () => {
    openedAt = null;
  };
  INTERACTION_EVENTS.forEach((name) =>
    window.addEventListener(name, touched, { capture: true, passive: true }),
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= REOPEN_AFTER_HIDDEN_MS) {
      openedAt = Date.now();
    }
    hiddenAt = null;
    applyUpdateIfIdle();
  });
}

function watchInstallingWorker() {
  const worker = registration?.installing;
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  worker.addEventListener('statechange', () => {
    // The first install activates normally. Only a replacement worker produces
    // an update prompt; it leaves the current worker and its assets available.
    syncUpdateAvailability();
    queueMicrotask(syncUpdateAvailability);
  });
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!supportsWorkers()) return;
  if (registration) return registration;
  if (registering) return registering;
  registering = (async () => {
    const next = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    });
    registration = next;
    controlledWorker = navigator.serviceWorker.controller;
    hadInstalledWorker = Boolean(controlledWorker || next.active);
    next.addEventListener('updatefound', watchInstallingWorker);
    watchInstallingWorker();
    syncUpdateAvailability();
    if (!watching) {
      watching = true;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const controller = navigator.serviceWorker.controller;
        if (controlledWorker && controller && controller !== controlledWorker) {
          // Another tab can activate the worker while this tab still runs its
          // old bundle. Keep offering refresh even for a same-version rebuild.
          updateActivatedElsewhere = true;
        }
        controlledWorker ||= controller;
        hadInstalledWorker ||= Boolean(controller);
        syncUpdateAvailability();
        // Activation in another tab must never reload a form in this tab.
      });
      const checkInBackground = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void checkForAppUpdate().catch(() => {
            // Interrupted checks leave the installed app usable.
          });
        }
      };
      document.addEventListener('visibilitychange', checkInBackground);
      window.addEventListener('online', checkInBackground);
      window.setInterval(checkInBackground, 60 * 60 * 1000);
    }
    return next;
  })();
  try {
    return await registering;
  } finally {
    registering = undefined;
  }
}

// Manual checks report failures to the caller. Automatic checks swallow them.
export async function checkForAppUpdate(): Promise<void> {
  if (!supportsWorkers()) return;
  if (!navigator.onLine) {
    throw new Error('You are offline. Connect to check for updates.');
  }
  const current = await ensureRegistration();
  if (!current) return;
  if (!checking) {
    checking = current.update().then(() => {
      watchInstallingWorker();
      syncUpdateAvailability();
    });
  }
  try {
    await checking;
  } finally {
    checking = undefined;
  }
}

function waitForInstallation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (worker.state === 'redundant') {
        finish(new Error('The update could not be downloaded. Please try again.'));
      } else if (['installed', 'activating', 'activated'].includes(worker.state)) {
        finish();
      }
    };
    const timeout = window.setTimeout(
      () => finish(new Error('The update is still downloading. Please try again.')),
      WORKER_TIMEOUT_MS,
    );
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}

function activateWaitingWorker(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const container = navigator.serviceWorker;
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      container.removeEventListener('controllerchange', inspect);
      worker.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (container.controller === worker) finish();
      else if (worker.state === 'redundant') {
        finish(new Error('The update could not be activated. Please try again.'));
      }
    };
    const timeout = window.setTimeout(
      () => finish(new Error('The update did not finish activating. Please try again.')),
      WORKER_TIMEOUT_MS,
    );
    container.addEventListener('controllerchange', inspect);
    worker.addEventListener('statechange', inspect);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
      inspect();
    } catch (error) {
      finish(error instanceof Error ? error : new Error('The update could not be activated.'));
    }
  });
}

function assertRefreshAllowed() {
  if (!refreshAllowed(false)) {
    throw new Error('Your current work could not be saved. Save it before refreshing.');
  }
}

// A refresh is always the user's choice. Wait for downloaded assets and the new
// controller before reloading; failures keep the current app and work available.
export async function refreshApp(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const current = await ensureRegistration();
    if (current && !current.waiting) {
      await checkForAppUpdate();
      if (current.installing) await waitForInstallation(current.installing);
    }
    assertRefreshAllowed();
    if (current?.waiting) {
      await activateWaitingWorker(current.waiting);
      // Save changes made while activation was in progress as well.
      assertRefreshAllowed();
    }
    window.location.reload();
  })();
  try {
    await refreshing;
  } finally {
    refreshing = undefined;
  }
}

export function registerAppUpdates() {
  if (!supportsWorkers() || started) return;
  started = true;
  watchOpening();
  const register = () => {
    void ensureRegistration()
      .then(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          return checkForAppUpdate();
        }
      })
      .catch(() => {
        // The app still runs when workers are unavailable or checks fail.
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
