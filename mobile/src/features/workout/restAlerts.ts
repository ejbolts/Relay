import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { readJson, writeJson } from '../../data/deviceStorage';
import type { RestState } from './restTimer';

// "Rest complete" when a rest ends while Relay is in the background, as a local notification the
// phone delivers by itself, so it arrives even after the app is suspended. In the app the rest
// bar and a buzz say it instead, so the notification stays hidden while Relay is open.

const ID = 'relay-rest-timer';
const CHANNEL = 'rest-timer';
const ASKED_KEY = 'relay.mobile.rest-alert-asked.v1';

let allowed: boolean | null = null;
let channelReady: boolean | null = null;
let handlerReady = false;

/** While Relay is open its own rest bar says the rest is over, so the alert stays hidden. */
function setUpHandler() {
  if (handlerReady) return;
  handlerReady = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const rest = notification.request.content.data?.kind === 'rest';
      return {
        shouldShowBanner: !rest,
        shouldShowList: !rest,
        shouldPlaySound: !rest,
        shouldSetBadge: false,
      };
    },
  });
}

async function permitted(): Promise<boolean> {
  // A refusal is checked again: it can be changed in the phone's Settings meanwhile.
  if (allowed) return true;
  try {
    const current = await Notifications.getPermissionsAsync();
    allowed = current.granted;
  } catch {
    allowed = false;
  }
  return allowed;
}

/**
 * Asks once, at the first rest, whether Relay may alert when a rest ends. Later rests only check
 * the answer; the phone's Settings change it.
 */
export async function askForRestAlerts(): Promise<void> {
  if (readJson<boolean>(ASKED_KEY)) return;
  writeJson(ASKED_KEY, true);
  try {
    const current = await Notifications.getPermissionsAsync();
    allowed =
      current.granted || !current.canAskAgain
        ? current.granted
        : (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    allowed = false;
  }
  // The rest that asked was not scheduled while the question was open.
  applied = { endsAt: null };
  queue = queue.then(apply).catch(() => undefined);
  await queue;
}

/**
 * A high-importance channel on Android, so the alert pops up like a timer's. Where it can't be
 * made (Expo Go refuses some channels), the app's default channel delivers the alert instead.
 */
async function channel(): Promise<string | undefined> {
  if (Platform.OS !== 'android') return undefined;
  if (channelReady === null) {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Rest timer',
        // The enum is exported; the import plugin misreads the comment the build puts before it.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
      });
      channelReady = true;
    } catch {
      channelReady = false;
    }
  }
  return channelReady ? CHANNEL : undefined;
}

interface Wanted {
  /** When the running rest ends, or null with no rest counting down. */
  endsAt: number | null;
  /** Whether any rest, running or finished, is still showing. */
  showing: boolean;
  body: string;
}

let wanted: Wanted = { endsAt: null, showing: false, body: '' };
let applied: { endsAt: number | null } = { endsAt: null };
let queue: Promise<void> = Promise.resolve();

async function apply() {
  setUpHandler();
  const target = wanted;
  if (target.endsAt === applied.endsAt && target.endsAt !== null) return;
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => undefined);
  applied = { endsAt: null };
  if (!target.showing) await Notifications.dismissNotificationAsync(ID).catch(() => undefined);
  if (target.endsAt === null || target.endsAt <= Date.now() || !(await permitted())) return;
  const channelId = await channel();
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: {
      title: 'Rest complete',
      body: target.body,
      data: { kind: 'rest' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target.endsAt,
      ...(channelId && { channelId }),
    },
  });
  applied = { endsAt: target.endsAt };
}

/**
 * Keeps the scheduled alert in step with the rest: scheduled for when a running rest ends,
 * moved by ±30 s, and cancelled when the rest is skipped, paused, finished or discarded. Changes
 * apply in order; a burst of them settles on the latest.
 */
export function syncRestAlert(rest: RestState, nextSet: string | null): Promise<void> {
  const timer = rest.timer;
  wanted = {
    endsAt: timer && timer.pausedLeft === null ? timer.endsAt : null,
    showing: Boolean(timer || rest.done),
    body: nextSet ?? 'Time for your next set.',
  };
  queue = queue.then(apply).catch(() => undefined);
  return queue;
}

/** For tests: forget what was asked and scheduled. */
export function resetRestAlertsForTests() {
  allowed = null;
  channelReady = null;
  handlerReady = false;
  wanted = { endsAt: null, showing: false, body: '' };
  applied = { endsAt: null };
  queue = Promise.resolve();
}
