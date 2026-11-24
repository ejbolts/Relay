import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, I18nManager } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { prettyDate } from '../../../../frontend/src/appShared';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { apiGet } from '../../data/api';
import { showMenu } from '../../ui/prompts';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import { SessionDetailScreen } from './SessionDetailScreen';
import { TrainingTabScreen } from './TrainingTabScreen';
import {
  bench,
  benchProgress,
  cardio,
  dashboard,
  library,
  oldPush,
  olderCalendar,
  preferences,
  recentWorkouts,
  records,
  running,
  squat,
  TODAY,
  upper,
} from './trainingFixtures';

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockWorkout = {
  live: null as null | { name: string; startedAt: number },
  start: jest.fn(),
  open: jest.fn(),
  openStartMenu: jest.fn(),
  discard: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));
// The account buttons have their own tests; Training only has to show them.
jest.mock('./TrainingHeaderActions', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { TrainingHeaderActions: () => createElement(Text, null, 'Header actions') };
});
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => undefined),
  unlockAsync: jest.fn(async () => undefined),
  OrientationLock: { LANDSCAPE: 'landscape' },
}));
jest.mock('../../ui/prompts', () => ({
  ...jest.requireActual<typeof import('../../ui/prompts')>('../../ui/prompts'),
  showMenu: jest.fn(),
}));
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: () => mockWorkout }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
}));
// The native control has no test renderer; this stand-in has a tab per segment.
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return function SegmentedControl(props: {
    values: string[];
    selectedIndex: number;
    accessibilityLabel: string;
    onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
  }) {
    return createElement(
      View,
      { accessibilityLabel: props.accessibilityLabel },
      props.values.map((value, index) =>
        createElement(
          Pressable,
          {
            key: value,
            accessibilityRole: 'tab',
            accessibilityState: { selected: index === props.selectedIndex },
            onPress: () => props.onChange({ nativeEvent: { selectedSegmentIndex: index } }),
          },
          createElement(Text, null, value),
        ),
      ),
    );
  };
});

const responses: Record<string, unknown> = {
  '/api/workouts/snapshot?start=2026-08-01': { revision: '1', workouts: recentWorkouts },
  '/api/workouts/snapshot?start=2026-02-01&end=2026-07-31': { revision: '1', workouts: [oldPush] },
  '/api/calendar?start=2026-02-01&end=2026-07-31': olderCalendar,
  '/api/dashboard?on_date=2026-11-22': dashboard,
  '/api/workout-types': DEFAULT_WORKOUT_TYPES,
  '/api/training-preferences': preferences,
  '/api/personal-records?include_blocks=true&include_fresh_start=true': records,
  '/api/body-measurements': [],
  '/api/exercises': [bench, squat, running],
  '/api/progress': library,
  '/api/progress/bench': benchProgress,
  '/api/training-blocks': { blocks: [] },
  '/api/exercises/bench/weight-mapping': {
    enabled: false,
    reference_machine_id: null,
    machines: [],
  },
  '/api/sharing/lifts/bench': { entries: [] },
  '/api/cardio': cardio,
  '/api/workouts/w-upper': upper,
};

let client: QueryClient;
function open(children: ReactNode) {
  // No garbage-collection timers, so Jest can exit when the tests finish.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(withProviders(children));
}

/** The screen inside the app's providers, sharing the client `open` made. */
function withProviders(children: ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeAll(() => {
  // Only the date is fixed; timers stay real for React Query.
  jest.useFakeTimers({
    now: TODAY,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
      'performance',
    ],
  });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  mockWorkout.live = null;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return responses[path] as never;
  });
});
afterEach(() => client.clear());

test('Sessions shows the log by week, and a card opens to its sets and repeats the workout', async () => {
  await open(<TrainingTabScreen />);
  expect(await screen.findByText('5 workouts logged')).toBeVisible();
  expect(screen.getByRole('header', { name: 'Training' })).toBeVisible();
  expect(screen.getByText('Header actions')).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Sessions', selected: true })).toBeVisible();

  expect(await screen.findByText('This week')).toBeVisible();
  expect(screen.getByText('2 workouts · 1 cardio · 3 sets · 1.8 t')).toBeVisible();
  expect(screen.getByText('Last week')).toBeVisible();

  const card = screen.getByRole('button', { name: /^Sample upper session/ });
  expect(within(card).getByText('SAMPLE')).toBeVisible();
  expect(within(card).getByText('1 PR')).toBeVisible();
  await fireEvent.press(card);
  expect(screen.getByText('Bench Press')).toBeVisible();
  expect(screen.getByText('Top 100 kg × 5')).toBeVisible();
  expect(screen.getByLabelText('Warm-up')).toBeVisible();
  expect(screen.getByLabelText('All-time Weight PR')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Repeat Sample upper session' }));
  expect(mockWorkout.start).toHaveBeenCalledWith({
    kind: 'template',
    name: 'Sample upper session',
    template: expect.objectContaining({
      category: 'upper',
      exercises: [expect.objectContaining({ summary: '100 kg × 5' })],
    }),
  });

  await fireEvent.press(screen.getByText('Bench Press'));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/training/exercise/[id]',
    params: { id: 'bench' },
  });
});

test('a calendar day lists its workouts, and the legend hides a type from the log', async () => {
  await open(<TrainingTabScreen />);
  const day = await screen.findByRole('button', {
    name: `View 2 workouts for ${prettyDate('2026-11-21')}`,
  });
  await fireEvent.press(day);
  expect(screen.getByText('TRAINING DAY')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Sample upper session' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/training/session/[id]',
    params: { id: 'w-upper' },
  });
  expect(screen.queryByText('TRAINING DAY')).toBeNull();

  expect(screen.getByRole('button', { name: /^Sample conditioning/ })).toBeVisible();
  await fireEvent.press(screen.getByRole('switch', { name: 'Cardio' }));
  expect(screen.getByRole('switch', { name: 'Cardio', checked: false })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Sample conditioning/ })).toBeNull();
  expect(screen.getByText('2 workouts · 3 sets · 1.8 t')).toBeVisible();
});

test('an empty day ahead opens its plan, and an empty past day offers a workout dated then', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  try {
    await open(<TrainingTabScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: prettyDate('2026-11-25') }));
    // The plan reads the split from the dashboard, which loads on its own.
    expect(await screen.findByText('Nothing planned', {}, { timeout: 5000 })).toBeVisible();
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: prettyDate('2026-11-12') }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toMatch(prettyDate('2026-11-12'));
  } finally {
    alert.mockRestore();
  }
});

test('going back past the loaded months reads older history', async () => {
  await open(<TrainingTabScreen />);
  await screen.findByText('This week');
  for (let month = 0; month < 8; month += 1)
    await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText(/March 2026/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  expect(
    await screen.findByRole('button', {
      name: `View 1 workout for ${prettyDate('2026-03-02')}`,
    }),
  ).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(
    '/api/workouts/snapshot?start=2026-02-01&end=2026-07-31',
    expect.anything(),
  );
});

/** A swipe of the measured month pager settling on a page (`x` is the raw scroll offset). */
async function settleCalendar(x: number) {
  const list = screen.getByTestId('calendar-months');
  await fireEvent(list, 'momentumScrollEnd', {
    nativeEvent: {
      contentOffset: { x, y: 0 },
      contentSize: { width: 9 * 300, height: 300 },
      layoutMeasurement: { width: 300, height: 300 },
    },
  });
}

test('the calendar swipes between months, landing on the month it settles on', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  await open(<TrainingTabScreen />);
  await screen.findByText('This week');
  await fireEvent(screen.getByTestId('calendar-pager'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 300 } },
  });
  expect(screen.getByTestId('calendar-months')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'November 2026' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

  // Nine months, March to November: the first page is the oldest.
  await settleCalendar(0);
  expect(screen.getByRole('header', { name: 'March 2026' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
  expect(announce).toHaveBeenLastCalledWith('March 2026');
  expect(
    await screen.findByRole('button', { name: `View 1 workout for ${prettyDate('2026-03-02')}` }),
  ).toBeVisible();
  // Reaching months before the loaded window reads older history.
  expect(apiGet).toHaveBeenCalledWith(
    '/api/workouts/snapshot?start=2026-02-01&end=2026-07-31',
    expect.anything(),
  );

  // A day chosen on a page stays chosen after swiping away and back.
  const day = screen.getByRole('button', {
    name: `View 1 workout for ${prettyDate('2026-03-02')}`,
  });
  await fireEvent.press(day);
  await settleCalendar(8 * 300);
  expect(screen.getByRole('header', { name: 'November 2026' })).toBeVisible();
  await settleCalendar(0);
  expect(
    screen.getByRole('button', { name: `View 1 workout for ${prettyDate('2026-03-02')}` }),
  ).toBeSelected();
  announce.mockRestore();
});

test('a right-to-left calendar maps its pages from the right', async () => {
  jest.replaceProperty(I18nManager, 'isRTL', true);
  await open(<TrainingTabScreen />);
  await screen.findByText('This week');
  await fireEvent(screen.getByTestId('calendar-pager'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 300 } },
  });
  // In RTL the oldest month is the rightmost page.
  await settleCalendar(8 * 300);
  expect(screen.getByRole('header', { name: 'March 2026' })).toBeVisible();
  await settleCalendar(0);
  expect(screen.getByRole('header', { name: 'November 2026' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
});

test('Show earlier weeks skips empty weeks, reading older months to reach the next workout', async () => {
  await open(<TrainingTabScreen />);
  await screen.findByText('This week');
  expect(screen.queryByRole('button', { name: /^Old push/ })).toBeNull();
  // Nothing older is loaded yet, so the first press reads the next older months.
  await fireEvent.press(screen.getByRole('button', { name: 'Show earlier weeks' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Show earlier weeks' }));
  expect(await screen.findByRole('button', { name: /^Old push/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Show earlier weeks' })).toBeNull();
});

test('another screen can open Training at its Cardio section, again after leaving it', async () => {
  await open(<TrainingTabScreen requestedSection="cardio" requestId="1" />);
  expect(await screen.findByRole('tab', { name: 'Cardio', selected: true })).toBeVisible();

  await fireEvent.press(screen.getByRole('tab', { name: 'Sessions' }));
  expect(screen.getByRole('tab', { name: 'Sessions', selected: true })).toBeVisible();
  // The same section asked for again is a new request.
  await screen.rerender(
    withProviders(<TrainingTabScreen requestedSection="cardio" requestId="2" />),
  );
  expect(screen.getByRole('tab', { name: 'Cardio', selected: true })).toBeVisible();
});

test('Exercises searches the library and opens an exercise', async () => {
  await open(<TrainingTabScreen />);
  await fireEvent.press(await screen.findByRole('tab', { name: 'Exercises' }));
  expect(
    await screen.findByRole('button', { name: /^Bench Press, Chest · Barbell/ }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: /^Back Squat/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Running/ })).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'squat');
  expect(screen.queryByRole('button', { name: /^Bench Press/ })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /^Back Squat/ }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/training/exercise/[id]',
    params: { id: 'squat' },
  });

  await fireEvent.changeText(screen.getByLabelText('Search exercises'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Quads' }));
  expect(screen.queryByRole('button', { name: /^Bench Press/ })).toBeNull();
});

test('Cardio shows the week, its sessions and zone goals, and opens its editors', async () => {
  await open(<TrainingTabScreen />);
  await fireEvent.press(await screen.findByRole('tab', { name: 'Cardio' }));
  expect(await screen.findByText('Weekly zone goals')).toBeVisible();
  expect(screen.getByText('32 / 150 min')).toBeVisible();
  expect(screen.getByText('118 min to go')).toBeVisible();
  expect(screen.getByText('120–140 bpm')).toBeVisible();

  const row = screen.getByRole('button', { name: /^Running, / });
  await fireEvent.press(row);
  expect(screen.getByText('385 kcal · ≈ 50 g fat burnt')).toBeVisible();
  expect(screen.getByText('142 bpm avg · 4.8 km')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit metrics' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/cardio/metrics/[id]',
    params: { id: cardio.sessions[0].id },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Open workout' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/training/session/[id]',
    params: { id: 'w-run' },
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Log session' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/cardio/log');
  await fireEvent.press(screen.getByRole('button', { name: 'Import screenshot' }));
  const [, choices] = jest.mocked(showMenu).mock.calls[0];
  choices.find(({ label }) => label === 'Take photo')?.onPress();
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/cardio/log',
    params: { import: 'camera' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Edit zones' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/cardio/zones');
});

test('an exercise shows its progress, personal bests and sessions', async () => {
  await open(<ExerciseDetailScreen exerciseId="bench" />);
  expect(await screen.findByLabelText('Personal bests')).toBeVisible();
  // The chart opens full screen in landscape, and turning back is released on Exit.
  await fireEvent.press(
    screen.getByRole('button', { name: 'View Bench Press Est. 1RM full screen in landscape' }),
  );
  const exit = await screen.findByRole('button', { name: 'Exit full-screen Bench Press Est. 1RM' });
  expect(jest.requireMock('expo-screen-orientation').lockAsync).toHaveBeenCalledWith('landscape');
  await fireEvent.press(exit);
  await waitFor(() =>
    expect(jest.requireMock('expo-screen-orientation').unlockAsync).toHaveBeenCalled(),
  );
  expect(
    screen.queryByRole('button', { name: 'Exit full-screen Bench Press Est. 1RM' }),
  ).not.toBeOnTheScreen();
  // Dates follow the device's locale ("21 Nov" or "Nov 21"), as on the web.
  const lastDone = formatLastDone('2026-11-21', '2026-11-22');
  expect(screen.getByText(`Chest · Barbell · 2 sessions · Last done ${lastDone}`)).toBeVisible();
  const bests = within(screen.getByLabelText('Personal bests'));
  expect(bests.getByText('100 kg × 5')).toBeVisible();
  expect(bests.getByText('116.7 kg')).toBeVisible();
  expect(bests.getByText('1.25× BW')).toBeVisible();

  await fireEvent.press(screen.getByRole('tab', { name: 'Top set' }));
  expect(screen.getByText('Best set · Top set')).toBeVisible();

  await fireEvent.press(
    screen.getByRole('button', {
      name: `View Bench Press in workout from ${prettyDate('2026-11-21')}`,
    }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/training/session/[id]',
    params: { id: 'w-upper', exercise: 'bench' },
  });
});

test('a session opens in full and can be repeated', async () => {
  await open(<SessionDetailScreen workoutId="w-upper" exerciseId="bench" />);
  expect(await screen.findByText('Bench Press')).toBeVisible();
  expect(screen.getByText('Upper body')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Repeat Sample upper session' }));
  expect(mockWorkout.start).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'template', name: 'Sample upper session' }),
  );
});

test('while a workout is live, repeating reopens it instead', async () => {
  mockWorkout.live = { name: 'Push', startedAt: 0 };
  await open(<SessionDetailScreen workoutId="w-upper" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Open current workout' }));
  expect(mockWorkout.open).toHaveBeenCalled();
  expect(mockWorkout.start).not.toHaveBeenCalled();
});
