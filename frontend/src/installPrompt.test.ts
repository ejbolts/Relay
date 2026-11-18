import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: Event) => void;

let handlers: Record<string, Handler>;
let standalone: boolean;

function stubBrowser(share?: (data: ShareData) => Promise<void>) {
  handlers = {};
  vi.stubGlobal('window', {
    location: { origin: 'https://gym.example.com' },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    matchMedia: () => ({ matches: standalone }),
  });
  vi.stubGlobal('navigator', share ? { share } : {});
}

async function loadModule() {
  vi.resetModules();
  const installPrompt = await import('./installPrompt');
  installPrompt.captureInstallPrompt();
  return installPrompt;
}

function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  };
}

beforeEach(() => {
  standalone = false;
});
afterEach(() => vi.unstubAllGlobals());

describe('install shortcut', () => {
  it('uses the browser install prompt once it is offered, and only once', async () => {
    stubBrowser(vi.fn());
    const { installMethod, openInstallOption } = await loadModule();
    expect(installMethod()).toBe('share');

    const event = installEvent();
    handlers.beforeinstallprompt(event as unknown as Event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(installMethod()).toBe('install');

    await expect(openInstallOption()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(installMethod()).toBe('share');
  });

  it('opens the share sheet for this address when there is no install prompt', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubBrowser(share);
    const { openInstallOption } = await loadModule();

    await expect(openInstallOption()).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ title: 'Relay', url: 'https://gym.example.com/' });
  });

  it('treats closing the share sheet as normal but reports a share failure', async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException('Closed', 'AbortError'));
    stubBrowser(share);
    const { openInstallOption } = await loadModule();
    await expect(openInstallOption()).resolves.toBe(true);

    share.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    await expect(openInstallOption()).resolves.toBe(false);
  });

  it('falls back to the steps without either option, and hides once installed', async () => {
    stubBrowser();
    const { installMethod, openInstallOption } = await loadModule();
    expect(installMethod()).toBe('steps');
    await expect(openInstallOption()).resolves.toBe(false);

    standalone = true;
    expect(installMethod()).toBe('installed');
  });

  it('drops a pending prompt after the app is installed', async () => {
    stubBrowser();
    const { installMethod } = await loadModule();
    handlers.beforeinstallprompt(installEvent() as unknown as Event);
    expect(installMethod()).toBe('install');
    handlers.appinstalled(new Event('appinstalled'));
    expect(installMethod()).toBe('steps');
  });
});
