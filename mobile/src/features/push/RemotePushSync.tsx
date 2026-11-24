import { onlineManager } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { setUpHandler } from '../workout/restAlerts';
import {
  flushLocalReminderReport,
  remoteAlertRoute,
  retryLocalReminderReport,
  setRemotePushAccount,
  syncRemotePush,
} from './remotePush';

let launchTaken = false;

/**
 * Keeps this phone registered for Phone alerts while an account is signed in, and opens the
 * screen a tapped server alert is about. Renders nothing; mounted only while signed in.
 */
export function RemotePushSync({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    setRemotePushAccount(userId);
    void syncRemotePush(true);
    const app = AppState.addEventListener('change', (state) => {
      // Before the phone suspends Relay, so the server knows about the reminder it scheduled.
      if (state === 'background' || state === 'inactive') {
        void flushLocalReminderReport();
        return;
      }
      if (state !== 'active') return;
      void syncRemotePush();
      retryLocalReminderReport();
    });
    // Back online: registers, sends turn-offs and reports that couldn't go out offline.
    const net = onlineManager.subscribe((online) => {
      if (!online) return;
      void syncRemotePush();
      retryLocalReminderReport();
    });
    return () => {
      app?.remove();
      net();
      setRemotePushAccount(null);
    };
  }, [userId]);

  useEffect(() => {
    // Server alerts that arrive while Relay is open show as banners, as the local ones do.
    setUpHandler();
    const open = (response: Notifications.NotificationResponse | null) => {
      const route = remoteAlertRoute(response?.notification.request.content.data);
      if (route) router.push(route as never);
      return route;
    };
    let subscription: { remove?: () => void } | undefined;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(open);
    } catch {
      subscription = undefined;
    }
    // An alert that cold-launched Relay was tapped before this listener existed.
    if (!launchTaken) {
      launchTaken = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (open(response))
            return Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        })
        .catch(() => undefined);
    }
    return () => subscription?.remove?.();
  }, [router]);

  return null;
}

/** For tests. */
export function resetRemotePushSyncForTests() {
  launchTaken = false;
}
