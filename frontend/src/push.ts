import { api } from './api';
import { runningAsInstalledApp } from './homeScreenGuideState';

export const PHONE_PUSH_PREFERENCE_EVENT = 'phone-push-preference-change';
const PHONE_PUSH_PREFERENCE_KEY = 'gym-logger-phone-notifications';

export function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function pushNotificationsSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function phonePushPreferenceEnabled(): boolean {
  return window.localStorage.getItem(PHONE_PUSH_PREFERENCE_KEY) !== 'disabled';
}

function setPhonePushPreference(enabled: boolean): void {
  window.localStorage.setItem(PHONE_PUSH_PREFERENCE_KEY, enabled ? 'enabled' : 'disabled');
  window.dispatchEvent(new CustomEvent(PHONE_PUSH_PREFERENCE_EVENT, { detail: { enabled } }));
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) {
    throw new Error('The browser returned an incomplete push subscription.');
  }
  await api.savePushSubscription({
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

// Signing out detaches this device; nothing may subscribe it again before the app restarts.
let automaticSubscribeBlocked = false;
let automaticSubscription: Promise<PushSubscription> | null = null;

async function subscribeAndSave(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription> {
  const config = await api.pushConfig();
  if (!config.enabled || !config.public_key) {
    throw new Error('Phone notifications are not ready on the server. Restart it after updating.');
  }
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.public_key),
    }));
  await saveSubscription(subscription);
  return subscription;
}

/**
 * This device's subscription, saved to the signed-in account. Phone alerts are on by default:
 * once notification permission is granted, a device without a subscription is subscribed here
 * unless its user turned alerts off.
 */
export async function existingPhonePushSubscription(): Promise<PushSubscription | null> {
  if (!pushNotificationsSupported() || !phonePushPreferenceEnabled()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await saveSubscription(subscription);
    return subscription;
  }
  if (automaticSubscribeBlocked || Notification.permission !== 'granted') return null;
  // The workout screen, settings and reminders all ask at once; subscribe a single time.
  automaticSubscription ??= subscribeAndSave(registration).finally(() => {
    automaticSubscription = null;
  });
  return automaticSubscription;
}

/**
 * Asks for notification permission from a sign-in or sign-up tap, since browsers only show the
 * prompt in response to one. Granting it turns phone alerts on for the account. Runs only in the
 * installed app, only while the choice is undecided, and must be called before any `await`.
 */
export function requestPhonePushPermissionFromTap(): void {
  if (
    !pushNotificationsSupported() ||
    !runningAsInstalledApp() ||
    !phonePushPreferenceEnabled() ||
    Notification.permission !== 'default'
  )
    return;
  let request: Promise<NotificationPermission>;
  try {
    request = Promise.resolve(Notification.requestPermission());
  } catch {
    return;
  }
  void request
    .then((permission) => {
      // Screens already showing re-check, which subscribes this device.
      if (permission === 'granted') {
        window.dispatchEvent(
          new CustomEvent(PHONE_PUSH_PREFERENCE_EVENT, { detail: { enabled: true } }),
        );
      }
    })
    .catch(() => undefined);
}

export async function enablePhonePushNotifications(): Promise<PushSubscription> {
  if (!pushNotificationsSupported()) {
    throw new Error('Push notifications require the installed PWA.');
  }

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') {
    throw new Error(
      'Notifications are blocked. Allow them in your phone settings, then try again.',
    );
  }

  const subscription = await subscribeAndSave(await navigator.serviceWorker.ready);
  setPhonePushPreference(true);
  return subscription;
}

export async function disablePhonePushNotifications(): Promise<void> {
  setPhonePushPreference(false);
  if (!pushNotificationsSupported()) return;
  await automaticSubscription?.catch(() => undefined);
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await Promise.allSettled([
    api.deletePushSubscription(subscription.endpoint),
    subscription.unsubscribe(),
  ]);
}

/**
 * Detaches this device from the signed-in account: the server stops sending it alerts and the
 * browser drops the subscription. Must run while the session is still valid.
 */
export async function releasePhonePushSubscription(): Promise<void> {
  automaticSubscribeBlocked = true;
  try {
    await automaticSubscription?.catch(() => undefined);
    if (pushNotificationsSupported()) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await Promise.allSettled([
          api.deletePushSubscription(subscription.endpoint),
          subscription.unsubscribe(),
        ]);
      }
    }
  } finally {
    // Back to the default so the next account starts from a clean slate.
    window.localStorage.removeItem(PHONE_PUSH_PREFERENCE_KEY);
  }
}

export async function showRestTimerNotification(): Promise<void> {
  if (
    !pushNotificationsSupported() ||
    !phonePushPreferenceEnabled() ||
    Notification.permission !== 'granted'
  )
    return;
  const registration = await navigator.serviceWorker.ready;
  const options: NotificationOptions & { renotify: boolean } = {
    body: 'Time for your next set.',
    icon: '/icon-192.png',
    badge: '/badge.png',
    tag: 'rest-timer',
    renotify: true,
    data: { url: '/#log' },
  };
  await registration.showNotification('Rest complete', options);
}

export async function dismissRestTimerNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const notifications = await registration?.getNotifications({ tag: 'rest-timer' });
  notifications?.forEach((notification) => notification.close());
}
