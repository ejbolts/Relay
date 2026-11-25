import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { nextSessionEpoch } from '../session/sessionEpoch';
import { pendingActions } from './pendingActions';
import { ToastHost, isToastAccountCurrent, showToast, toastAccount } from './Toast';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));

// The session the root toast host sees; tests switch accounts by changing it and re-rendering.
let mockStatus: { kind: string; user?: { id: string } } = { kind: 'signed-in', user: { id: 'a' } };
jest.mock('../session/SessionProvider', () => ({
  useOptionalSession: () => ({ status: mockStatus }),
}));

const host = () => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <ToastHost />
  </SafeAreaProvider>
);

const os = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  mockStatus = { kind: 'signed-in', user: { id: 'a' } };
});
afterEach(() => {
  Platform.OS = os;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const undo = () => screen.queryByRole('button', { name: 'Undo' });

it('settles an action toast once: on expiry, not after Undo', async () => {
  await render(host());
  const first = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', first));
  await act(async () => jest.advanceTimersByTime(8100));
  expect(undo()).toBeNull();
  expect(first.onDismiss).toHaveBeenCalledTimes(1);
  expect(first.run).not.toHaveBeenCalled();

  const second = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', second));
  await act(async () => jest.advanceTimersByTime(2000));
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await act(async () => jest.advanceTimersByTime(10000));
  expect(second.run).toHaveBeenCalledTimes(1);
  expect(second.onDismiss).not.toHaveBeenCalled();
});

it('settles a toast that a newer one replaces, and one that is dismissed', async () => {
  await render(host());
  const replaced = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Friend removed', replaced));
  await act(async () => showToast('Saved'));
  expect(replaced.onDismiss).toHaveBeenCalledTimes(1);

  const dismissed = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', dismissed));
  await fireEvent.press(screen.getByRole('button', { name: 'Goal removed. Dismiss' }));
  expect(dismissed.onDismiss).toHaveBeenCalledTimes(1);
  expect(dismissed.run).not.toHaveBeenCalled();
});

it('drops a pending action when the account changes, running neither callback', async () => {
  const { rerender } = await render(host());
  const pending = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Check-in deleted', pending));
  expect(undo()).not.toBeNull();
  mockStatus = { kind: 'signed-in', user: { id: 'b' } };
  await rerender(host());
  expect(undo()).toBeNull();
  await act(async () => jest.advanceTimersByTime(20000));
  expect(pending.run).not.toHaveBeenCalled();
  expect(pending.onDismiss).not.toHaveBeenCalled();
});

it('applies Android’s longer timeout only while the same toast still shows', async () => {
  Platform.OS = 'android';
  const answers: ((ms: number) => void)[] = [];
  jest
    .spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis')
    .mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
  await render(host());

  // Answered after Undo was used: the toast must not come back.
  const used = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', used));
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await act(async () => answers[0](30000));
  expect(undo()).toBeNull();

  // Answered out of order: the older toast's answer leaves the newer one alone.
  await act(async () => showToast('First', { label: 'Undo', run: jest.fn() }));
  await act(async () => showToast('Second', { label: 'Undo', run: jest.fn() }));
  await act(async () => answers[1](60000));
  expect(screen.queryByText('First')).toBeNull();
  await act(async () => jest.advanceTimersByTime(8100));
  expect(screen.queryByText('Second')).toBeNull();

  // Answered while it still shows: it stays for the longer time.
  await act(async () => showToast('Third', { label: 'Undo', run: jest.fn() }));
  await act(async () => answers[3](20000));
  await act(async () => jest.advanceTimersByTime(15000));
  expect(screen.getByText('Third')).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(5100));
  expect(screen.queryByText('Third')).toBeNull();
});

it('holds while focused even after a press is cancelled, then resumes', async () => {
  await render(host());
  await act(async () => showToast('Goal removed', { label: 'Undo', run: jest.fn() }));
  const button = screen.getByRole('button', { name: 'Undo' });
  await fireEvent(button, 'focus');
  await fireEvent(button, 'pressIn');
  await fireEvent(button, 'pressOut');
  await act(async () => jest.advanceTimersByTime(30000));
  expect(undo()).not.toBeNull();
  await fireEvent(button, 'blur');
  await act(async () => jest.advanceTimersByTime(8100));
  expect(undo()).toBeNull();
});

it('drops a toast from work that started under another account', async () => {
  const { rerender } = await render(host());
  const account = toastAccount();
  expect(isToastAccountCurrent(account)).toBe(true);
  mockStatus = { kind: 'signed-in', user: { id: 'b' } };
  await rerender(host());
  expect(isToastAccountCurrent(account)).toBe(false);
  const late = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Friend request sent', late, { account }));
  expect(screen.queryByText('Friend request sent')).toBeNull();
  expect(late.onDismiss).not.toHaveBeenCalled();
});

it('never lets an old timer or Undo finish the toast that replaced it', async () => {
  await render(host());
  const first = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  const second = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('First', first));
  await act(async () => jest.advanceTimersByTime(2900));
  // The first toast's timer comes due in the same batch that replaces it.
  await act(async () => {
    showToast('Second', second);
    jest.advanceTimersByTime(200);
  });
  expect(first.onDismiss).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Second')).toBeOnTheScreen();
  expect(second.onDismiss).not.toHaveBeenCalled();

  // A tap on the old Undo arriving with a newer toast doesn't undo the newer one.
  const third = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  const oldUndo = screen.getByRole('button', { name: 'Undo' });
  let pressed: Promise<unknown> = Promise.resolve();
  await act(async () => {
    showToast('Third', third);
    // The press handler runs at once, before React swaps the controls.
    pressed = fireEvent.press(oldUndo);
  });
  await pressed;
  expect(third.run).not.toHaveBeenCalled();
  expect(screen.getByText('Third')).toBeOnTheScreen();
  expect(second.run).not.toHaveBeenCalled();
  expect(second.onDismiss).toHaveBeenCalledTimes(1);
});

it('settles an action toast when the app goes to the background', async () => {
  let onChange: (state: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onChange = listener as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  await render(host());
  const removal = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', removal));
  await act(async () => onChange('inactive'));
  expect(removal.onDismiss).not.toHaveBeenCalled();
  await act(async () => onChange('background'));
  expect(removal.onDismiss).toHaveBeenCalledTimes(1);
  expect(undo()).toBeNull();
});

it('drops an old toast and its callbacks when the same account signs in again', async () => {
  const { rerender } = await render(host());
  const account = toastAccount();
  const removal = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', removal, { account }));
  expect(undo()).not.toBeNull();
  // A signs out and back in: a new session of the same account.
  nextSessionEpoch();
  mockStatus = { kind: 'signed-out' };
  await rerender(host());
  nextSessionEpoch();
  mockStatus = { kind: 'signed-in', user: { id: 'a' } };
  await rerender(host());
  expect(undo()).toBeNull();
  expect(isToastAccountCurrent(account)).toBe(false);
  await act(async () => jest.advanceTimersByTime(20000));
  expect(removal.run).not.toHaveBeenCalled();
  expect(removal.onDismiss).not.toHaveBeenCalled();
  // Late work from the old session shows nothing in the new one.
  await act(async () => showToast('Friend request sent', removal, { account }));
  expect(screen.queryByText('Friend request sent')).toBeNull();
});

it('stays as long as the web’s toast: by what it is for, or the time its caller picks', async () => {
  await render(host());
  const undoAction = () => ({ label: 'Undo', run: jest.fn() });
  /** Shows a toast and checks it is there just before `ms`, and gone at `ms`. */
  const lasts = async (ms: number, ...toast: Parameters<typeof showToast>) => {
    await act(async () => showToast(...toast));
    await act(async () => jest.advanceTimersByTime(ms - 1));
    expect(screen.getByText(toast[0])).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText(toast[0])).toBeNull();
  };
  // A confirmation and an everyday Undo: standard.
  await lasts(3000, 'Split saved.');
  await lasts(3000, 'Check-in saved', undoAction());
  // Frequent small undos mid-workout: quick. What is hard to redo: important.
  await lasts(2500, 'Set deleted', undoAction(), { duration: 'quick' });
  await lasts(5000, 'Goal removed', undoAction(), { duration: 'important' });
  // Warnings and records get longer, and errors longest.
  await lasts(5000, 'This workout is waiting to sync.', undefined, { variant: 'warning' });
  await lasts(5000, 'All-time weight PR', undefined, { variant: 'celebrate' });
  await lasts(7000, 'Could not reach Relay.', undefined, { variant: 'error' });
  // A long message always gets time to be read, and a longer time is never shortened.
  const long = 'Imported 42 workouts. '.repeat(5);
  expect(long.length).toBeGreaterThan(90);
  await lasts(5000, long);
  await lasts(5000, long, undoAction(), { duration: 'quick' });
  await lasts(7000, long, undefined, { variant: 'error' });
});

it('lets only its own token clear a pending removal', () => {
  const account = toastAccount();
  const first = pendingActions.add('friend', 'casey', account);
  expect(first).not.toBeNull();
  expect(pendingActions.add('friend', 'casey', account)).toBeNull();
  pendingActions.remove(first!);
  const second = pendingActions.add('friend', 'casey', account);
  expect(second).not.toBeNull();
  // The first removal's late completion arrives: the newer one stays pending.
  pendingActions.remove(first!);
  expect(pendingActions.add('friend', 'casey', account)).toBeNull();
  pendingActions.remove(second!);
  expect(pendingActions.add('friend', 'casey', account)).not.toBeNull();
  pendingActions.clear();
});
