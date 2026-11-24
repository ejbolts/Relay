import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AppState, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { tipStorageKey } from '../../../../frontend/src/tipsState';
import type { TrackedWorkout, User } from '../../../../frontend/src/types';
import { memoryKv } from '../../testing/memoryKvStore';
import { CoachTarget, coachHighlight, GuideCoach } from './GuideCoach';
import { GuidesScreen } from './GuidesScreen';
import { HelpSettings } from './HelpSettings';
import { AppTourHost } from './AppTourHost';
import { HomeGuides } from './HomeGuides';
import { ShareReminderAction } from './ShareReminderAction';
import {
  activeSetupGuide,
  exitSetupGuide,
  finishSetupGuide,
  resetSetupGuideForTests,
} from './setupGuides';
import { resetTipsForTests, tipsFor } from './tips';
import { launchPromptOpened, resetNoticeMemory } from '../review/noticeMemory';
import { appTourWaiting, closeAppTour, queueAppTour, startAppTour } from './tourProgress';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
const mockUser = { id: 'u1', username: 'sam', created_at: '2026-01-01T09:00:00Z' } as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));
const mockWorkouts: { current: TrackedWorkout[] } = { current: [] };
jest.mock('../../data/queries', () => ({
  useWorkoutHistory: () => ({ data: mockWorkouts.current }),
  useDashboard: () => ({ data: undefined }),
  useWeightUnit: () => 'kg',
}));
jest.mock('../body/bodyQueries', () => ({
  useBodyGoals: () => ({ data: [] }),
  useBodyMeasurements: () => ({ data: [] }),
}));
jest.mock('../blocks', () => ({ useTrainingBlocks: () => ({ data: { blocks: [] } }) }));
jest.mock('../training/trainingQueries', () => ({
  useSavedWorkout: () => ({ data: { id: 'w1', workout_date: '2026-03-01' } }),
}));
jest.mock('../social/ShareWorkoutSheet', () => ({ ShareWorkoutSheet: () => null }));

const show = (element: ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {element}
    </SafeAreaProvider>,
  );

const workout = (date: string) =>
  ({
    id: date,
    name: 'Push',
    workout_date: date,
    movements: [
      {
        exercise: { id: 'bench', name: 'Bench press', kind: 'strength' },
        sets: [{ weight_kg: 80, reps: 8, warmup: false }],
      },
    ],
  }) as unknown as TrackedWorkout;

const stored = () => JSON.parse(memoryKv.get(tipStorageKey('u1')) ?? '{}');

beforeEach(() => {
  memoryKv.clear();
  resetTipsForTests();
  resetSetupGuideForTests();
  resetNoticeMemory();
  mockUser.id = 'u1';
  closeAppTour();
  mockWorkouts.current = [];
  jest.clearAllMocks();
});

test("Home's bulb counts new tips, opens their feature and puts them away", async () => {
  await show(<HomeGuides />);
  await fireEvent.press(screen.getByRole('button', { name: 'Tips, 3 new' }));
  expect(screen.getByText('Make Home your own')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
  expect(stored().homeDone).toEqual(['home']);

  await fireEvent.press(screen.getByRole('button', { name: 'Tips, 2 new' }));
  expect(screen.getByText('Train alongside a friend')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Make Relay look your way')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Appearance' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/settings/appearance');
  expect(stored().seen).toEqual({ appearance: 'seen' });
  expect(stored().homeRead).toEqual(['home', 'friends', 'appearance']);
  expect(screen.getByRole('button', { name: 'Tips' })).toBeVisible();
});

test('hides the bulb while tips are off on this device', async () => {
  tipsFor('u1').enable(false);
  await show(<HomeGuides />);
  expect(screen.queryByRole('button', { name: /^Tips/ })).toBeNull();
});

test('a split tip starts its setup guide with your own training and opens Splits to coach it', async () => {
  mockWorkouts.current = [workout('2026-02-01'), workout('2026-02-03'), workout('2026-02-05')];
  jest.useFakeTimers();
  try {
    await show(<HomeGuides />);
    await fireEvent.press(screen.getByRole('button', { name: /^Tips, \d new$/ }));
    expect(screen.getByText('Have a regular rotation?')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Show me how' }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
  } finally {
    jest.useRealTimers();
  }
  expect(mockRouter.push).toHaveBeenCalledWith('/split');
  expect(activeSetupGuide()).toMatchObject({
    id: 'split',
    facts: { rotation: ['Push', 'Push', 'Push'], lift: { name: 'Bench press', latestTopKg: 80 } },
  });
  // Opening the guide engages its tip; only saving the split teaches it.
  expect(stored().seen).toEqual({ split: 'seen' });
  finishSetupGuide('split');
  expect(stored().seen).toMatchObject({ split: 'learned', repRange: 'learned' });
});

test('the coach highlights its control, folds from its grabber and opens again on the next step', async () => {
  const step = (title: string, disabled = false) => ({
    title,
    body: `${title} body`,
    target: 'blocks.name' as const,
    next: { disabled },
  });
  const onNext = jest.fn();
  const onExit = jest.fn();
  const view = await show(
    <>
      <CoachTarget id="blocks.name">
        <Text>Block name</Text>
      </CoachTarget>
      <GuideCoach
        step={step('Name this phase', true)}
        index={0}
        total={4}
        onNext={onNext}
        onExit={onExit}
      />
    </>,
  );
  expect(coachHighlight()).toBe('blocks.name');
  expect(screen.getByLabelText('Setup guide')).toBeVisible();
  expect(screen.getByText('Setup guide · 1 of 4')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  // A tap (or a screen reader's activation) folds it; swiping down folds and up opens it.
  await fireEvent(screen.getByRole('button', { name: 'Minimise guide' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
  expect(screen.queryByText('Name this phase body')).toBeNull();
  expect(screen.getByText('Name this phase')).toBeVisible();
  const grabber = screen.getByRole('button', { name: 'Show guide' });
  await fireEvent(grabber, 'touchStart', { nativeEvent: { pageY: 500 } });
  await fireEvent(grabber, 'touchEnd', { nativeEvent: { pageY: 460 } });
  expect(screen.getByText('Name this phase body')).toBeVisible();
  const open = screen.getByRole('button', { name: 'Minimise guide' });
  await fireEvent(open, 'touchStart', { nativeEvent: { pageY: 500 } });
  await fireEvent(open, 'touchEnd', { nativeEvent: { pageY: 540 } });
  expect(screen.queryByText('Name this phase body')).toBeNull();
  await view.rerender(
    <GuideCoach
      step={step('Pick a start')}
      index={1}
      total={4}
      onNext={onNext}
      onBack={jest.fn()}
      onExit={onExit}
    />,
  );
  expect(screen.getByText('Pick a start body')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(onNext).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Skip guide' }));
  expect(onExit).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(coachHighlight()).toBeNull();
});

test('Settings starts each setup guide in its feature', async () => {
  mockWorkouts.current = [workout('2026-02-01')];
  await show(<GuidesScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Training blocks' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/blocks/edit');
  expect(activeSetupGuide()?.id).toBe('blocks');
  // Leaving part way marks nothing.
  exitSetupGuide();
  expect(stored().seen).toEqual({ blocks: 'seen' });
});

test('Settings lists the guides, says why Compare machines must wait, and replays the tour', async () => {
  await show(<GuidesScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Compare machines' }));
  expect(screen.getByText(/one exercise logged on two saved machines/)).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Replay guide' }));
  expect(mockRouter.navigate).toHaveBeenCalledWith('/');
});

/** Home's header and the root's tour host, as the app mounts them; `home` false is another tab. */
function Root({ home = true }: { home?: boolean }) {
  return (
    <>
      {home && <HomeGuides />}
      <AppTourHost />
    </>
  );
}

test('a new account takes the quick tour, which opens each tab it explains', async () => {
  queueAppTour('u1');
  await show(<Root />);
  // The tour is this visit's one launch prompt, so What's new and the weekly review wait.
  expect(launchPromptOpened('u1')).toBe('onboarding');
  expect(await screen.findByText('Quick tour · 1 of 8')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Your training in one place')).toBeVisible();
  expect(mockRouter.navigate).toHaveBeenLastCalledWith('/training');
  await fireEvent.press(screen.getByRole('button', { name: 'Skip guide' }));
  expect(screen.queryByText(/Quick tour/)).toBeNull();
  expect(appTourWaiting('u1')).toBe(false);
});

test('an open tour belongs to its account, and a session ending closes it', async () => {
  // Fresh accounts: tour progress is also remembered in memory for the session.
  mockUser.id = 'a1';
  queueAppTour('a1');
  const first = await show(<Root />);
  expect(await screen.findByText('Quick tour · 1 of 8')).toBeVisible();
  await first.unmount();
  // Another account signs in on this phone while a1's tour was open.
  mockUser.id = 'a2';
  const second = await show(<Root />);
  expect(screen.queryByText(/Quick tour/)).toBeNull();
  await second.unmount();
  // a1's guide was neither finished nor lost.
  expect(appTourWaiting('a1')).toBe(true);
  expect(appTourWaiting('a2')).toBe(false);
  // The sign-in screen closes any open tour when a session ends.
  mockUser.id = 'a1';
  startAppTour('a1');
  await act(async () => closeAppTour());
  await show(<Root />);
  expect(await screen.findByText('Quick tour · 1 of 8')).toBeVisible();
});

test('the tour stays open and moves on while it shows other tabs', async () => {
  mockUser.id = 'a3';
  queueAppTour('a3');
  const view = await show(<Root />);
  expect(await screen.findByText('Quick tour · 1 of 8')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith('/training');
  // Training is showing: Home's header is no longer mounted, and the tour carries on.
  await view.rerender(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <Root home={false} />
    </SafeAreaProvider>,
  );
  expect(screen.queryByRole('button', { name: /^Tips/ })).toBeNull();
  expect(screen.getByText('Your training in one place')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Train alongside friends')).toBeVisible();
  expect(mockRouter.navigate).toHaveBeenLastCalledWith('/social');
  for (let step = 6; step <= 8; step++)
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Quick tour · 8 of 8')).toBeVisible();
  expect(mockRouter.push).toHaveBeenLastCalledWith('/settings');
  await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
  expect(screen.getByText('Thanks for trying Relay!')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'End guide' }));
  expect(screen.queryByText(/Quick tour|Thanks for trying/)).toBeNull();
  expect(appTourWaiting('a3')).toBe(false);
});

test('a tip put away comes back when its reminder is due, once the app returns', async () => {
  let foreground: ((state: string) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
    foreground = handler as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  await show(<HomeGuides />);
  // The split tip has a reminder. Put away while no split is set up, it is due in a week.
  tipsFor('u1').doneHome('split');
  const due: number = stored().reminders.split.at;
  expect(due).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  const now = jest.spyOn(Date, 'now').mockReturnValue(due + 1);
  try {
    await act(async () => foreground!('active'));
    expect(stored().homeDone).not.toContain('split');
    expect(stored().reminders.split.count).toBe(1);
  } finally {
    now.mockRestore();
  }
});

test('the share reminder is on by default, offers Share, and turns off from Settings', async () => {
  await show(
    <>
      <HelpSettings />
      <ShareReminderAction workoutId="w1" />
    </>,
  );
  expect(screen.getByRole('button', { name: 'Share' })).toBeVisible();
  await fireEvent(
    screen.getByRole('switch', { name: 'Share workout reminder' }),
    'valueChange',
    false,
  );
  expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  expect(memoryKv.get('relay-workout-share-reminder:u1')).toBe('off');
});
