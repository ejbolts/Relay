import { runningAsInstalledApp } from './homeScreenGuideState';
import { existingPhonePushSubscription, pushNotificationsSupported } from './push';
import { restTimerPreferenceEnabled } from './restTimerPreference';

const DISMISSED_KEY = 'relay-rest-alert-reminder';

export function restAlertReminderDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissRestAlertReminder(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, 'dismissed');
  } catch {
    // Without storage the reminder simply returns next workout.
  }
}

/**
 * Starting a workout reminds the installed app's user to turn on rest alerts while the rest
 * timer is on and this phone has no alert subscription, unless they asked not to be reminded.
 */
export async function shouldShowRestAlertReminder(): Promise<boolean> {
  if (
    !pushNotificationsSupported() ||
    !runningAsInstalledApp() ||
    !restTimerPreferenceEnabled() ||
    restAlertReminderDismissed()
  )
    return false;
  try {
    // A phone that already allows notifications is subscribed here, so it needs no reminder.
    return (await existingPhonePushSubscription()) === null;
  } catch {
    // Offline or a server hiccup: alerts may well be on, so do not nag.
    return false;
  }
}
