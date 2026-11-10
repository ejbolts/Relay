// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runningAsInstalledApp } from './homeScreenGuideState';
import {
  enablePhonePushNotifications,
  existingPhonePushSubscription,
  pushNotificationsSupported,
} from './push';
import { RestAlertReminder } from './RestAlertReminder';
import { restAlertReminderDismissed, shouldShowRestAlertReminder } from './restAlertReminderState';

vi.mock('./push', () => ({
  enablePhonePushNotifications: vi.fn(),
  existingPhonePushSubscription: vi.fn(),
  pushNotificationsSupported: vi.fn(),
}));
vi.mock('./homeScreenGuideState', () => ({ runningAsInstalledApp: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(pushNotificationsSupported).mockReturnValue(true);
  vi.mocked(runningAsInstalledApp).mockReturnValue(true);
  vi.mocked(existingPhonePushSubscription).mockResolvedValue(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderReminder() {
  await act(async () => root.render(<RestAlertReminder onClose={onClose} />));
}

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  );
  if (!match) throw new Error(`No ${name} button`);
  return match;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

describe('when to remind about rest alerts', () => {
  it('reminds when the rest timer is on and this phone has no alerts', async () => {
    await expect(shouldShowRestAlertReminder()).resolves.toBe(true);
  });

  it('stays quiet once this phone is subscribed', async () => {
    vi.mocked(existingPhonePushSubscription).mockResolvedValue({
      endpoint: 'phone',
    } as PushSubscription);
    await expect(shouldShowRestAlertReminder()).resolves.toBe(false);
  });

  it.each([
    [
      'the rest timer is off',
      () => window.localStorage.setItem('gym-logger-rest-timer', 'disabled'),
    ],
    [
      'the user chose not to be reminded',
      () => window.localStorage.setItem('relay-rest-alert-reminder', 'dismissed'),
    ],
    ['outside the installed app', () => vi.mocked(runningAsInstalledApp).mockReturnValue(false)],
    ['push is unsupported', () => vi.mocked(pushNotificationsSupported).mockReturnValue(false)],
    [
      'the alert check fails',
      () => vi.mocked(existingPhonePushSubscription).mockRejectedValue(new Error('offline')),
    ],
  ])('stays quiet when %s', async (_label, arrange) => {
    arrange();
    await expect(shouldShowRestAlertReminder()).resolves.toBe(false);
  });
});

describe('rest alert reminder popup', () => {
  it('comes back next workout after Not now', async () => {
    await renderReminder();

    await click(button('Not now'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(restAlertReminderDismissed()).toBe(false);
  });

  it("stops reminding once Don't show again is ticked", async () => {
    await renderReminder();
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.labels?.[0]?.textContent).toBe("Don't show again");

    await click(checkbox);
    await click(document.querySelector<HTMLButtonElement>('.popup-dialog-close')!);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(restAlertReminderDismissed()).toBe(true);
  });

  it('turns alerts on and confirms with a brief notice', async () => {
    vi.useFakeTimers();
    vi.mocked(enablePhonePushNotifications).mockResolvedValue({
      endpoint: 'phone',
    } as PushSubscription);
    await renderReminder();

    await click(button('Turn on'));

    expect(enablePhonePushNotifications).toHaveBeenCalledTimes(1);
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Rest alerts on');
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(3000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the popup open with the reason when alerts cannot be turned on', async () => {
    vi.mocked(enablePhonePushNotifications).mockRejectedValue(
      new Error('Notifications are blocked. Allow them in your phone settings, then try again.'),
    );
    await renderReminder();

    await click(button('Turn on'));

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Notifications are blocked. Allow them in your phone settings, then try again.',
    );
    expect(document.querySelector('dialog')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
