import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createContext, type ReactElement } from 'react';
import { AppState, Keyboard, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { tipStorageKey } from '../../../../frontend/src/tipsState';
import { OFFLINE_MESSAGE } from '../../data/offline';
import type { TrackedWorkout, User } from '../../../../frontend/src/types';
import { memoryKv } from '../../testing/memoryKvStore';
import { CoachTarget, coachHighlight, coachLayout, GuideCoach } from './GuideCoach';
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
  setupGuideTicket,
  startSetupGuide,
  useExitGuideOnLeave,
} from './setupGuides';
import { resetTipsForTests, tipsFor } from './tips';
import { launchPromptOpened, resetNoticeMemory } from '../review/noticeMemory';
import { appTourWaiting, closeAppTour, queueAppTour, startAppTour } from './tourProgress';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
// Each screen reads whether it is in front from the nearest FocusContext provider.
const mockFocusContext = createContext(true);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useIsFocused: () => jest.requireActual('react').useContext(mockFocusContext),
}));
const mockUser = { id: 'u1', username: 'sam', created_at: '2026-01-01T09:00:00Z' } as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));
const mockWorkouts: { current: TrackedWorkout[] } = { current: [] };
// What the history query says beyond its data, such as still loading or failed.
const mockHistory: { state: Record<string, unknown>; refetch: jest.Mock } = {
  state: {},
  refetch: jest.fn(),
};
jest.mock('../../data/queries', () => ({
  useWorkoutHistory: () => ({
    data: mockWorkouts.current,
    isPending: false,
    fetchStatus: 'idle',
    error: null,
    refetch: mockHistory.refetch,
    ...mockHistory.state,
  }),
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
  mockHistory.state = {};
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
  finishSetupGuide(setupGuideTicket('split'));
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
  await fireEvent.press(screen.getByRole('button', { name: 'Minimise guide' }));
  expect(screen.queryByText('Name this phase body')).toBeNull();
  expect(screen.getByText('Name this phase')).toBeVisible();
  const grabber = screen.getByRole('button', { name: 'Show guide' });
  await fireEvent(grabber, 'pressIn', { nativeEvent: { pageY: 500 } });
  await fireEvent(grabber, 'pressOut', { nativeEvent: { pageY: 460 } });
  await fireEvent.press(grabber);
  expect(screen.getByText('Name this phase body')).toBeVisible();
  const open = screen.getByRole('button', { name: 'Minimise guide' });
  // The 40 x 5 pt bar sits in a 44 pt touch band.
  expect(open).toHaveStyle({ height: 44 });
  await fireEvent(open, 'pressIn', { nativeEvent: { pageY: 500 } });
  await fireEvent(open, 'pressOut', { nativeEvent: { pageY: 540 } });
  await fireEvent.press(open);
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

test('the coach scrolls to a control that appears after it opened', async () => {
  const scrollTo = jest.fn();
  const scroll = { current: { scrollTo, getInnerViewRef: () => ({}) } };
  const boxes = {
    frame: { y: 0, height: 800 },
    content: { y: 0, height: 2000 },
    control: { y: 900, height: 40 },
    coach: { y: 600, height: 240 },
  };
  const measure = jest
    .spyOn(coachLayout, 'measure')
    .mockImplementation(async (_view, part) => boxes[part]);
  const step = {
    title: 'Give an exercise a rep range',
    body: 'Body',
    target: 'split.reps' as const,
  };
  const coach = (
    <GuideCoach step={step} index={1} total={3} scroll={scroll as never} onExit={jest.fn()} />
  );
  try {
    const view = await show(coach);
    // Both of the coach's own passes find no control yet.
    await act(() => new Promise<void>((done) => setTimeout(done, 1300)));
    expect(scrollTo).not.toHaveBeenCalled();
    // The control appears later, such as when another day is opened.
    await view.rerender(
      <>
        <CoachTarget id="split.reps">
          <Text>Reps</Text>
        </CoachTarget>
        {coach}
      </>,
    );
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 356, animated: true }));
    await view.unmount();
  } finally {
    measure.mockRestore();
  }
});

test('the coach leaves a growing list in place once part of it is in view', async () => {
  const scrollTo = jest.fn();
  const scroll = { current: { scrollTo, getInnerViewRef: () => ({}) } };
  // The day list fills the view above the coach, starting above the screen's top.
  const boxes = {
    frame: { y: 0, height: 800 },
    content: { y: -700, height: 3000 },
    control: { y: -600, height: 1400 },
    coach: { y: 600, height: 240 },
  };
  const measure = jest
    .spyOn(coachLayout, 'measure')
    .mockImplementation(async (_view, part) => boxes[part]);
  const coach = (
    <GuideCoach
      step={{ title: 'Plan your days', body: 'Body', target: 'split.days' }}
      index={1}
      total={6}
      scroll={scroll as never}
      onExit={jest.fn()}
    />
  );
  try {
    const view = await show(
      <>
        <CoachTarget id="split.days">
          <Text>Days</Text>
        </CoachTarget>
        {coach}
      </>,
    );
    // The step's first pass brings the list's top into view, as the web's does.
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 92, animated: true }));
    await act(() => new Promise<void>((done) => setTimeout(done, 1000)));
    scrollTo.mockClear();
    // Lower down, a day is opened and the list grows: no jump back to its top.
    boxes.control = { y: -1200, height: 2400 };
    await fireEvent(screen.getByText('Days'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 2400 } },
    });
    await act(() => new Promise<void>((done) => setTimeout(done, 400)));
    expect(scrollTo).not.toHaveBeenCalled();
    await view.unmount();
  } finally {
    measure.mockRestore();
  }
});

test('the coach brings a control clear of the card when the card lays out late or covers it', async () => {
  const scrollTo = jest.fn();
  const scroll = { current: { scrollTo, getInnerViewRef: () => ({}) } };
  // On first measurement the card is not laid out yet (height 0); once it lays out, the target
  // sits partly under the coach card's top edge (y 570..610 vs bottom 584).
  const boxes = {
    frame: { y: 0, height: 800 },
    content: { y: 0, height: 2000 },
    control: { y: 570, height: 40 },
    coach: { y: 0, height: 0 },
  };
  const measure = jest
    .spyOn(coachLayout, 'measure')
    .mockImplementation(async (_view, part) => boxes[part]);
  const coach = (
    <GuideCoach
      step={{ title: 'Give an exercise a rep range', body: 'Body', target: 'split.reps' }}
      index={1}
      total={3}
      scroll={scroll as never}
      onExit={jest.fn()}
    />
  );
  try {
    const view = await show(
      <>
        <CoachTarget id="split.reps">
          <Text>Reps</Text>
        </CoachTarget>
        {coach}
      </>,
    );
    // Card has not laid out yet: first pass does not scroll with bogus 0-height coach box.
    await act(() => new Promise<void>((done) => setTimeout(done, 450)));
    expect(scrollTo).not.toHaveBeenCalled();

    // Card lays out at y=600, height=240 (bottom=584); target ends at 610 (covered by 26 pt).
    boxes.coach = { y: 600, height: 240 };
    await fireEvent(screen.getByLabelText('Setup guide'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 600, width: 366, height: 240 } },
    });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 26, animated: true }));

    // A later gentle pass (target layout) still scrolls when the coach covers the control.
    scrollTo.mockClear();
    boxes.control = { y: 576, height: 40 };
    await fireEvent(screen.getByText('Reps'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 40 } },
    });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 32, animated: true }));
    await view.unmount();
  } finally {
    measure.mockRestore();
  }
});

test('the coach folds while the keyboard is up and unfolds when it closes or the step changes', async () => {
  const listeners: Record<string, ((event?: unknown) => void) | undefined> = {};
  const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, fn) => {
    listeners[name] = fn as (event?: unknown) => void;
    return { remove: () => (listeners[name] = undefined) } as never;
  });
  const step = (title: string) => ({
    title,
    body: `${title} body`,
    target: 'normalise.match' as const,
  });
  try {
    const view = await show(
      <GuideCoach step={step('Match the weights')} index={2} total={4} onExit={jest.fn()} />,
    );
    expect(screen.getByText('Match the weights body')).toBeVisible();

    await act(async () =>
      listeners.keyboardDidShow?.({ endCoordinates: { screenY: 500, height: 344 } }),
    );
    expect(screen.queryByText('Match the weights body')).toBeNull();
    expect(screen.getByText('Match the weights')).toBeVisible();

    // Closing the keyboard unfolds the card again.
    await act(async () => listeners.keyboardDidHide?.());
    expect(screen.getByText('Match the weights body')).toBeVisible();

    // Moving to the next step while the keyboard is still up unfolds the new step.
    await act(async () =>
      listeners.keyboardDidShow?.({ endCoordinates: { screenY: 500, height: 344 } }),
    );
    expect(screen.queryByText('Match the weights body')).toBeNull();
    await view.rerender(
      <GuideCoach step={step('Save your weights')} index={3} total={4} onExit={jest.fn()} />,
    );
    expect(screen.getByText('Save your weights body')).toBeVisible();
    await view.unmount();
  } finally {
    spy.mockRestore();
  }
});

test('moving from the splits page to its editor and back keeps the guide; leaving both ends it', async () => {
  const pause = (ms: number) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
  function SplitScreen() {
    useExitGuideOnLeave('split');
    return null;
  }
  const at = (page: boolean, editor: 'none' | 'front') => (
    <>
      <mockFocusContext.Provider value={page}>
        <SplitScreen />
      </mockFocusContext.Provider>
      {editor === 'front' && (
        <mockFocusContext.Provider value>
          <SplitScreen />
        </mockFocusContext.Provider>
      )}
    </>
  );
  startSetupGuide('split', 'u1', []);
  const view = await render(at(true, 'none'));
  // The editor opens over the page, which stays mounted out of sight.
  await view.rerender(at(false, 'front'));
  await pause(800);
  expect(activeSetupGuide()?.id).toBe('split');
  // Back to the page.
  await view.rerender(at(true, 'none'));
  await pause(800);
  expect(activeSetupGuide()?.id).toBe('split');
  // Another screen covers the page: the guide ends, marking nothing.
  await view.rerender(at(false, 'none'));
  await pause(800);
  expect(activeSetupGuide()).toBeNull();
  expect(stored().seen ?? {}).not.toHaveProperty('split');
  await view.unmount();
});

test('Compare machines waits for unknown history instead of saying what it needs', async () => {
  await show(<GuidesScreen />);
  // Still loading: a spinner, not the two-machines message.
  mockWorkouts.current = undefined as never;
  mockHistory.state = { isPending: true, fetchStatus: 'fetching' };
  await fireEvent.press(screen.getByRole('button', { name: 'Compare machines' }));
  expect(screen.getByLabelText('Loading your workouts')).toBeTruthy();
  expect(screen.queryByText(/one exercise logged on two saved machines/)).toBeNull();
  expect(mockRouter.push).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: /close/i }));

  // Failed: says so, with Try again.
  mockHistory.state = { isPending: false, error: new Error('Server unavailable') };
  await fireEvent.press(screen.getByRole('button', { name: 'Compare machines' }));
  expect(screen.getByText('Server unavailable')).toBeTruthy();
  expect(screen.queryByText(/one exercise logged on two saved machines/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(mockHistory.refetch).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: /close/i }));

  // Offline with nothing saved: the offline message.
  mockHistory.state = { isPending: true, fetchStatus: 'paused' };
  await fireEvent.press(screen.getByRole('button', { name: 'Compare machines' }));
  expect(screen.getByText(OFFLINE_MESSAGE)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /close/i }));

  // Training blocks starts at once, without waiting for the history.
  mockHistory.state = { isPending: true, fetchStatus: 'fetching' };
  await fireEvent.press(screen.getByRole('button', { name: 'Training blocks' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/blocks/edit');
});

test('Settings starts each setup guide in its feature', async () => {
  mockWorkouts.current = [
    {
      ...workout('2026-02-01'),
      movements: [
        {
          exercise: { id: 'leg-press', name: 'Leg Press', kind: 'strength' },
          sets: [{ weight_kg: 120, reps: 8, warmup: false }],
          machine_photos: [{ id: 'm1' }],
        },
      ],
    } as unknown as TrackedWorkout,
    {
      ...workout('2026-02-03'),
      movements: [
        {
          exercise: { id: 'leg-press', name: 'Leg Press', kind: 'strength' },
          sets: [{ weight_kg: 140, reps: 8, warmup: false }],
          machine_photos: [{ id: 'm2' }],
        },
      ],
    } as unknown as TrackedWorkout,
  ];
  const view = await show(<GuidesScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Training blocks' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/blocks/edit');
  expect(activeSetupGuide()?.id).toBe('blocks');
  // Leaving part way marks nothing.
  exitSetupGuide();
  expect(stored().seen).toEqual({ blocks: 'seen' });

  // Compare machines opens Machine weights with Training's index anchored underneath.
  await fireEvent.press(screen.getByRole('button', { name: 'Compare machines' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith(
    { pathname: '/training/machine-weights/[id]', params: { id: 'leg-press' } },
    { withAnchor: true },
  );
  expect(activeSetupGuide()?.id).toBe('normalise');
  exitSetupGuide();
  await view.unmount();
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
