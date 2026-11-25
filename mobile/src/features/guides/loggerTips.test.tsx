import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { parseTips, tipStorageKey } from '../../../../frontend/src/tipsState';
import { deviceStorage } from '../../data/deviceStorage';
import { memoryKv } from '../../testing/memoryKvStore';
import { LoggerTipSlot, LoggerTipsProvider, tipAnchorLayout, useLoggerTips } from './LoggerTips';
import { resetTipsForTests } from './tips';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('../../session/SessionProvider', () => ({ useUser: () => ({ id: 'u1' }) }));
jest.mock('../../ui/Toast', () => ({ toastShowing: () => false }));

/** Where the machine row sits in the window; the test renderer has no layout of its own. */
let row = { y: 400, width: 300, height: 52 };

beforeEach(() => {
  memoryKv.clear();
  resetTipsForTests();
  row = { y: 400, width: 300, height: 52 };
  // The control's row measures as the row; any larger view (one holding the open tip) measures
  // taller, reaching past the bottom margin when the row sits low.
  jest
    .spyOn(tipAnchorLayout, 'measure')
    .mockImplementation((view, done) =>
      done(
        (view as unknown as { props?: { testID?: string } }).props?.testID === 'logger-tip-anchor'
          ? row
          : { ...row, height: row.height + 170 },
      ),
    );
});
afterEach(() => jest.restoreAllMocks());

function Logger() {
  const { configure } = useLoggerTips();
  useEffect(() => {
    configure({ ready: true, resting: false, workoutCount: 5, bottom: 24 });
  }, [configure]);
  return null;
}

function Harness({
  machineRow = true,
  eligible = true,
}: {
  machineRow?: boolean;
  eligible?: boolean;
}) {
  return (
    <LoggerTipsProvider>
      <Logger />
      {machineRow && (
        <LoggerTipSlot id="machine" eligible={eligible}>
          <Text>Choose machine</Text>
        </LoggerTipSlot>
      )}
    </LoggerTipsProvider>
  );
}

const DOT = 'Tip: Remember your machine';
const WAIT = { timeout: 6000 };
const pause = (ms: number) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
const stored = () => parseTips(deviceStorage.getItem(tipStorageKey('u1')));

test('the machine tip opened low on the screen stays until Got it', async () => {
  // The row sits just above the bottom margin; the open tip below it reaches past the margin.
  row = { y: 1150, width: 300, height: 52 };
  await render(<Harness />);
  await fireEvent.press(await screen.findByRole('button', { name: DOT }, WAIT));
  expect(screen.getByText('Got it')).toBeVisible();
  await pause(2500);
  expect(screen.getByText('Got it')).toBeVisible();
  await fireEvent.press(screen.getByText('Got it'));
  expect(screen.queryByRole('button', { name: DOT })).toBeNull();
  expect(stored().seen.machine).toBe('dismissed');
}, 20000);

test('scrolling the machine row away puts its tip away', async () => {
  await render(<Harness />);
  expect(await screen.findByRole('button', { name: DOT }, WAIT)).toBeVisible();
  row = { y: -200, width: 300, height: 52 };
  await waitFor(() => expect(screen.queryByRole('button', { name: DOT })).toBeNull(), WAIT);
}, 20000);

test('folding or removing the exercise puts its tip away, so it can show afresh later', async () => {
  const view = await render(<Harness />);
  expect(await screen.findByRole('button', { name: DOT }, WAIT)).toBeVisible();
  expect(stored().shows?.machine).toBe(1);
  // The card folds: the machine row and its slot go.
  await view.rerender(<Harness machineRow={false} />);
  expect(screen.queryByRole('button', { name: DOT })).toBeNull();
  // The tip didn't linger out of sight: when the row returns it is picked again.
  await view.rerender(<Harness />);
  expect(await screen.findByRole('button', { name: DOT }, WAIT)).toBeVisible();
  expect(stored().shows?.machine).toBe(2);
}, 20000);
