// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { runningAsInstalledApp } from './homeScreenGuideState';

vi.mock('./api', () => ({
  api: {
    pushConfig: vi.fn(),
    savePushSubscription: vi.fn(),
    deletePushSubscription: vi.fn(),
  },
}));
vi.mock('./homeScreenGuideState', () => ({ runningAsInstalledApp: vi.fn() }));

const PREFERENCE_KEY = 'gym-logger-phone-notifications';

function fakeSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/phone') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

let current: PushSubscription | null;
let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let notification: {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
};

/** A fresh copy of push.ts, so its once-per-app-run state does not leak between tests. */
async function loadPush() {
  vi.resetModules();
  return import('./push');
}

beforeEach(() => {
  vi.mocked(api.pushConfig).mockResolvedValue({ enabled: true, public_key: 'AQID' });
  vi.mocked(api.savePushSubscription).mockResolvedValue(undefined);
  vi.mocked(api.deletePushSubscription).mockResolvedValue(undefined);
  vi.mocked(runningAsInstalledApp).mockReturnValue(true);
  window.localStorage.clear();
  current = null;
  pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      // Subscribing takes a moment, which is when duplicate requests would slip in.
      await new Promise((resolve) => setTimeout(resolve, 5));
      current = fakeSubscription();
      return current;
    }),
  };
  const registration = { pushManager } as unknown as ServiceWorkerRegistration;
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: {
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
  notification = { permission: 'granted', requestPermission: vi.fn() };
  vi.stubGlobal('Notification', notification);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('phone alerts are on by default', () => {
  it('subscribes a device that already allows notifications, once for simultaneous checks', async () => {
    const { existingPhonePushSubscription } = await loadPush();

    const results = await Promise.all([
      existingPhonePushSubscription(),
      existingPhonePushSubscription(),
      existingPhonePushSubscription(),
    ]);

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result?.endpoint === current?.endpoint)).toBe(true);
    expect(api.savePushSubscription).toHaveBeenCalledWith({
      endpoint: 'https://fcm.googleapis.com/fcm/send/phone',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    });
  });

  it('re-saves an existing subscription without subscribing again', async () => {
    current = fakeSubscription();
    const { existingPhonePushSubscription } = await loadPush();

    await expect(existingPhonePushSubscription()).resolves.toBe(current);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.savePushSubscription).toHaveBeenCalledTimes(1);
  });

  it('waits for permission before subscribing', async () => {
    notification.permission = 'default';
    const { existingPhonePushSubscription } = await loadPush();

    await expect(existingPhonePushSubscription()).resolves.toBeNull();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('keeps alerts off after the user turns them off', async () => {
    window.localStorage.setItem(PREFERENCE_KEY, 'disabled');
    const { existingPhonePushSubscription } = await loadPush();

    await expect(existingPhonePushSubscription()).resolves.toBeNull();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('does not resubscribe a device while it is signing out', async () => {
    current = fakeSubscription();
    const { existingPhonePushSubscription, releasePhonePushSubscription } = await loadPush();
    pushManager.getSubscription.mockImplementation(async () => current);
    vi.mocked(current.unsubscribe).mockImplementation(async () => {
      current = null;
      return true;
    });

    await releasePhonePushSubscription();
    await expect(existingPhonePushSubscription()).resolves.toBeNull();

    expect(api.deletePushSubscription).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send/phone',
    );
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('lets a subscription already in progress finish before signing out removes it', async () => {
    const { existingPhonePushSubscription, releasePhonePushSubscription } = await loadPush();

    const subscribing = existingPhonePushSubscription();
    await vi.waitFor(() => expect(pushManager.subscribe).toHaveBeenCalled());
    await releasePhonePushSubscription();
    await subscribing;

    expect(api.savePushSubscription).toHaveBeenCalledTimes(1);
    expect(api.deletePushSubscription).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send/phone',
    );
    expect(current?.unsubscribe).toHaveBeenCalled();
  });

  it('does not start subscribing once signing out has begun', async () => {
    const { existingPhonePushSubscription, releasePhonePushSubscription } = await loadPush();

    const checking = existingPhonePushSubscription();
    await releasePhonePushSubscription();

    await expect(checking).resolves.toBeNull();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe('asking for notification permission from the sign-in tap', () => {
  it('asks in the installed app and lets open screens subscribe once allowed', async () => {
    notification.permission = 'default';
    notification.requestPermission.mockResolvedValue('granted');
    const { requestPhonePushPermissionFromTap, PHONE_PUSH_PREFERENCE_EVENT } = await loadPush();
    const changed = vi.fn();
    window.addEventListener(PHONE_PUSH_PREFERENCE_EVENT, changed);

    requestPhonePushPermissionFromTap();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    window.removeEventListener(PHONE_PUSH_PREFERENCE_EVENT, changed);
  });

  it('does not re-check screens when permission is refused', async () => {
    notification.permission = 'default';
    notification.requestPermission.mockResolvedValue('denied');
    const { requestPhonePushPermissionFromTap, PHONE_PUSH_PREFERENCE_EVENT } = await loadPush();
    const changed = vi.fn();
    window.addEventListener(PHONE_PUSH_PREFERENCE_EVENT, changed);

    requestPhonePushPermissionFromTap();
    await Promise.resolve();
    await Promise.resolve();

    expect(changed).not.toHaveBeenCalled();
    window.removeEventListener(PHONE_PUSH_PREFERENCE_EVENT, changed);
  });

  it.each([
    ['in a browser tab', () => vi.mocked(runningAsInstalledApp).mockReturnValue(false)],
    ['once permission is already decided', () => (notification.permission = 'denied')],
    ['after alerts were turned off', () => window.localStorage.setItem(PREFERENCE_KEY, 'disabled')],
  ])('does not ask %s', async (_label, arrange) => {
    notification.permission = 'default';
    arrange();
    const { requestPhonePushPermissionFromTap } = await loadPush();

    requestPhonePushPermissionFromTap();

    expect(notification.requestPermission).not.toHaveBeenCalled();
  });
});
