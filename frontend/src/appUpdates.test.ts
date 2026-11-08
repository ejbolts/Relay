import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class Worker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();

  setState(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock('./workoutDraft');
});

async function flushPromises() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

async function setup({ online = true, readyState = 'complete', firstInstall = false } = {}) {
  vi.stubEnv('PROD', true);
  const active = firstInstall ? null : new Worker();
  if (active) active.state = 'activated';
  const update = vi.fn().mockResolvedValue(undefined);
  const registration = Object.assign(new EventTarget(), {
    active,
    waiting: null as Worker | null,
    installing: null as Worker | null,
    update,
  });
  const register = vi.fn().mockResolvedValue(registration);
  const serviceWorker = Object.assign(new EventTarget(), { register, controller: active });
  const navigator = { serviceWorker, onLine: online };
  const document = Object.assign(new EventTarget(), {
    readyState,
    visibilityState: 'visible',
  });
  const window = Object.assign(new EventTarget(), {
    setInterval: vi.fn(),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    location: { reload: vi.fn() },
  });
  vi.stubGlobal('navigator', navigator);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const app = await import('./appUpdates');
  return { app, update, register, registration, serviceWorker, navigator, document, window };
}

function finishInstallation(registration: { installing: Worker | null; waiting: Worker | null }) {
  const worker = registration.installing!;
  registration.installing = null;
  registration.waiting = worker;
  worker.setState('installed');
  return worker;
}

describe('app updates', () => {
  it('keeps the first install quiet and never reloads when it takes control', async () => {
    const { app, registration, serviceWorker, window } = await setup({ firstInstall: true });
    registration.installing = new Worker();
    const notify = vi.fn();
    app.subscribeAppUpdates(notify);
    await app.checkForAppUpdate();
    const worker = finishInstallation(registration);
    expect(app.isAppUpdateAvailable()).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    registration.waiting = null;
    registration.active = worker;
    serviceWorker.controller = worker;
    worker.setState('activated');
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('announces a downloaded replacement while leaving the current cached app running', async () => {
    const { app, register, registration, window } = await setup();
    await app.checkForAppUpdate();
    const notify = vi.fn();
    const unsubscribe = app.subscribeAppUpdates(notify);
    registration.installing = new Worker();
    registration.dispatchEvent(new Event('updatefound'));
    expect(app.isAppUpdateAvailable()).toBe(false);
    const worker = finishInstallation(registration);
    expect(app.isAppUpdateAvailable()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('finds a worker already waiting at startup and never reloads for another tab activation', async () => {
    const { app, registration, serviceWorker, window } = await setup();
    const worker = new Worker();
    worker.state = 'installed';
    registration.waiting = worker;
    await app.checkForAppUpdate();
    expect(app.isAppUpdateAvailable()).toBe(true);
    registration.waiting = null;
    registration.active = worker;
    serviceWorker.controller = worker;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(app.isAppUpdateAvailable()).toBe(true);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('allows a manual refresh after another tab already activated the new worker', async () => {
    const { app, registration, serviceWorker, window } = await setup();
    await app.checkForAppUpdate();
    const worker = new Worker();
    worker.state = 'activated';
    registration.active = worker;
    serviceWorker.controller = worker;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(app.isAppUpdateAvailable()).toBe(true);
    expect(window.location.reload).not.toHaveBeenCalled();
    await app.refreshApp();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('activates a waiting worker only on manual refresh and waits for it to take control', async () => {
    const { app, registration, serviceWorker, window } = await setup();
    const worker = new Worker();
    worker.state = 'installed';
    registration.waiting = worker;
    await app.checkForAppUpdate();
    const save = vi.fn();
    window.addEventListener(app.BEFORE_APP_REFRESH_EVENT, save);
    const refreshing = app.refreshApp();
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(window.location.reload).not.toHaveBeenCalled();
    registration.waiting = null;
    serviceWorker.controller = worker;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    await refreshing;
    expect(save).toHaveBeenCalledTimes(2);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('waits for a pending download before requesting activation or reloading', async () => {
    const { app, registration, serviceWorker, window } = await setup();
    registration.installing = new Worker();
    await app.checkForAppUpdate();
    const worker = registration.installing;
    const refreshing = app.refreshApp();
    await flushPromises();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
    finishInstallation(registration);
    await flushPromises();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    registration.waiting = null;
    serviceWorker.controller = worker;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    await refreshing;
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('cancels activation and reload if current work cannot be saved', async () => {
    const { app, registration, window } = await setup();
    const worker = new Worker();
    worker.state = 'installed';
    registration.waiting = worker;
    window.addEventListener(app.BEFORE_APP_REFRESH_EVENT, (event) => event.preventDefault());
    await expect(app.refreshApp()).rejects.toThrow('Your current work could not be saved');
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does not reload if the download fails or the waiting worker cannot activate', async () => {
    const { app, registration, window } = await setup();
    registration.installing = new Worker();
    const installing = registration.installing;
    const refreshing = app.refreshApp();
    const failedDownload = expect(refreshing).rejects.toThrow('could not be downloaded');
    await flushPromises();
    installing.setState('redundant');
    await failedDownload;
    registration.installing = null;
    const waiting = new Worker();
    waiting.state = 'installed';
    registration.waiting = waiting;
    const retry = app.refreshApp();
    const failedActivation = expect(retry).rejects.toThrow('did not finish activating');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(30_000);
    await failedActivation;
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('reports offline and update failures without reloading, then allows a later successful check', async () => {
    const { app, update, navigator, window } = await setup({ online: false });
    await expect(app.checkForAppUpdate()).rejects.toThrow('offline');
    await expect(app.refreshApp()).rejects.toThrow('offline');
    navigator.onLine = true;
    update.mockRejectedValueOnce(new Error('download interrupted'));
    await expect(app.refreshApp()).rejects.toThrow('download interrupted');
    expect(window.location.reload).not.toHaveBeenCalled();
    await app.checkForAppUpdate();
  });

  it('registers once, defers automatic startup to load, and skips hidden/offline background checks', async () => {
    const { app, register, update, document, navigator, window } = await setup({
      readyState: 'loading',
    });
    app.registerAppUpdates();
    app.registerAppUpdates();
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    await flushPromises();
    expect(register).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(update).toHaveBeenCalledTimes(1);
    document.visibilityState = 'visible';
    navigator.onLine = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(update).toHaveBeenCalledTimes(1);
    navigator.onLine = true;
    window.dispatchEvent(new Event('online'));
    await flushPromises();
    expect(update).toHaveBeenCalledTimes(2);
    expect(window.setInterval).toHaveBeenCalledTimes(1);
  });

  it('keeps failed background checks quiet and retries registration for a manual check', async () => {
    const { app, register, update, window } = await setup();
    register.mockRejectedValueOnce(new Error('workers disabled'));
    app.registerAppUpdates();
    await flushPromises();
    await app.checkForAppUpdate();
    update.mockRejectedValueOnce(new Error('interrupted'));
    window.dispatchEvent(new Event('online'));
    await flushPromises();
    expect(register).toHaveBeenCalledTimes(2);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('checks gracefully and refreshes directly when no production worker is available', async () => {
    const { app, register, window } = await setup();
    vi.stubEnv('PROD', false);
    app.registerAppUpdates();
    await app.checkForAppUpdate();
    await app.refreshApp();
    expect(register).not.toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  describe('automatic updates', () => {
    let draft: { pendingSave?: object } | null;

    async function opened() {
      draft = null;
      vi.doMock('./workoutDraft', () => ({ readActiveWorkoutDraft: () => draft }));
      const context = await setup();
      const document = Object.assign(context.document, {
        activeElement: null as Element | null,
        querySelector: vi.fn().mockReturnValue(null),
      });
      return { ...context, document };
    }

    function waitingWorker(registration: { waiting: Worker | null }) {
      const worker = new Worker();
      worker.state = 'installed';
      registration.waiting = worker;
      return worker;
    }

    async function takeControl(context: Awaited<ReturnType<typeof opened>>, worker: Worker) {
      await flushPromises();
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      context.registration.waiting = null;
      context.serviceWorker.controller = worker;
      context.serviceWorker.dispatchEvent(new Event('controllerchange'));
      await flushPromises();
    }

    it('applies an update found right after opening when nothing is in progress', async () => {
      const context = await opened();
      const worker = waitingWorker(context.registration);
      context.app.registerAppUpdates();
      await takeControl(context, worker);
      expect(context.window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('also applies a release that finishes downloading shortly after opening', async () => {
      const context = await opened();
      context.app.registerAppUpdates();
      await flushPromises();
      context.registration.installing = new Worker();
      context.registration.dispatchEvent(new Event('updatefound'));
      const worker = finishInstallation(context.registration);
      await takeControl(context, worker);
      expect(context.window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('never interrupts an unfinished workout, a form, a dialog or a save', async () => {
      const context = await opened();
      context.app.registerAppUpdates();
      await flushPromises();
      const worker = waitingWorker(context.registration);
      const blockers: Array<[() => void, () => void]> = [
        [() => (draft = {}), () => (draft = null)],
        [
          () =>
            (context.document.activeElement = {
              matches: (selector: string) => selector.includes('input'),
            } as unknown as Element),
          () => (context.document.activeElement = null),
        ],
        [
          () => context.document.querySelector.mockReturnValue({}),
          () => context.document.querySelector.mockReturnValue(null),
        ],
      ];
      for (const [block, unblock] of blockers) {
        block();
        await context.app.checkForAppUpdate();
        await flushPromises();
        expect(worker.postMessage).not.toHaveBeenCalled();
        unblock();
      }
      const endSave = context.app.beginWrite();
      await context.app.checkForAppUpdate();
      await flushPromises();
      expect(worker.postMessage).not.toHaveBeenCalled();
      const cancel = (event: Event) => {
        if ((event as CustomEvent<{ automatic: boolean }>).detail?.automatic)
          event.preventDefault();
      };
      context.window.addEventListener(context.app.BEFORE_APP_REFRESH_EVENT, cancel);
      endSave();
      await flushPromises();
      expect(worker.postMessage).not.toHaveBeenCalled();
      context.window.removeEventListener(context.app.BEFORE_APP_REFRESH_EVENT, cancel);
      // A finished workout waiting to sync is already stored, so it does not hold the update.
      draft = { pendingSave: {} };
      endSave();
      await context.app.checkForAppUpdate();
      await takeControl(context, worker);
      expect(context.window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('checks again shortly after a startup screen or dialog closes', async () => {
      const context = await opened();
      context.document.querySelector.mockReturnValue({});
      const worker = waitingWorker(context.registration);
      context.app.registerAppUpdates();
      await flushPromises();
      expect(worker.postMessage).not.toHaveBeenCalled();
      context.document.querySelector.mockReturnValue(null);
      await vi.advanceTimersByTimeAsync(1000);
      await takeControl(context, worker);
      expect(context.window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('waits after the first touch or a minute of use until the app is opened again', async () => {
      const context = await opened();
      context.app.registerAppUpdates();
      await flushPromises();
      context.window.dispatchEvent(new Event('pointerdown'));
      const worker = waitingWorker(context.registration);
      await context.app.checkForAppUpdate();
      await flushPromises();
      expect(worker.postMessage).not.toHaveBeenCalled();
      expect(context.app.isAppUpdateAvailable()).toBe(true);

      const reopen = async (awayMs: number) => {
        context.document.visibilityState = 'hidden';
        context.document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(awayMs);
        context.document.visibilityState = 'visible';
        context.document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();
      };
      await reopen(context.app.REOPEN_AFTER_HIDDEN_MS - 1000);
      expect(worker.postMessage).not.toHaveBeenCalled();
      await reopen(context.app.REOPEN_AFTER_HIDDEN_MS);
      await takeControl(context, worker);
      expect(context.window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('does not apply an update found more than a minute after opening', async () => {
      const context = await opened();
      context.app.registerAppUpdates();
      await flushPromises();
      vi.advanceTimersByTime(context.app.AUTO_UPDATE_WINDOW_MS + 1);
      const worker = waitingWorker(context.registration);
      await context.app.checkForAppUpdate();
      await flushPromises();
      expect(worker.postMessage).not.toHaveBeenCalled();
    });
  });

  it('marks an update as required when the server turns away a save', async () => {
    const { app, update, window } = await setup();
    const notify = vi.fn();
    app.subscribeAppUpdates(notify);
    app.reportClientOutdated();
    await flushPromises();
    expect(app.isAppUpdateRequired()).toBe(true);
    expect(app.isAppUpdateAvailable()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
