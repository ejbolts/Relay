import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { prettyDate } from '../../../../../frontend/src/appShared';
import { emptyBodySizeLog } from '../../../../../frontend/src/bodySizeEntries';
import { addDays, dayMonth } from '../../../../../frontend/src/trainingSummary';
import type {
  LiftBest,
  LiftComparison,
  LiftComparisons,
  SharedProfile,
  TrackedWorkout,
  User,
} from '../../../../../frontend/src/types';
import { localDate } from '../../../../../frontend/src/utils';
import { DEFAULT_WORKOUT_TYPES } from '../../../../../frontend/src/workoutTypes';
import { ApiError, apiGet } from '../../../data/api';
import { ToastHost } from '../../../ui/Toast';
import { ProfileStats } from './ProfileStats';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  GestureDetector: ({ children }: { children: unknown }) => children,
  usePinchGesture: () => ({}),
}));
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => undefined),
  unlockAsync: jest.fn(async () => undefined),
  OrientationLock: { LANDSCAPE: 'landscape' },
}));
jest.mock('../../../data/api', () => ({
  ...jest.requireActual<typeof import('../../../data/api')>('../../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
const mockUser = {
  id: 'me',
  username: 'preview',
  display_name: 'Preview',
  profile_photo_url: null,
  created_at: '2026-11-01T00:00:00Z',
} as unknown as User;
jest.mock('../../../session/SessionProvider', () => ({
  useUser: () => mockUser,
  useOptionalSession: () => ({ status: { kind: 'signed-in', user: { id: 'me' } } }),
}));
let mockWeightUnit: 'kg' | 'lb' = 'kg';
jest.mock('../../../data/queries', () => ({
  ...jest.requireActual('../../../data/queries'),
  useWeightUnit: () => mockWeightUnit,
  useTrainingPreferences: () => ({
    data: {
      preferred_weight_unit: mockWeightUnit,
      week_start: 'monday',
      zone2_goal_minutes: 150,
      weekly_muscle_set_goal: 12,
    },
  }),
}));
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
            accessibilityRole: 'radio',
            accessibilityState: { selected: index === props.selectedIndex },
            onPress: () => props.onChange({ nativeEvent: { selectedSegmentIndex: index } }),
          },
          createElement(Text, null, value),
        ),
      ),
    );
  };
});

const today = localDate();
const twoDaysAgo = addDays(today, -2);
const tenDaysAgo = addDays(today, -10);
const thirtyDaysAgo = addDays(today, -30);

function liftBest(estimated_1rm: number, exercise_id = 'ex', normalised = false): LiftBest {
  return {
    exercise_id,
    weight_kg: 100,
    reps: 5,
    estimated_1rm,
    achieved_date: twoDaysAgo,
    normalised,
  };
}

function lift(
  name: string,
  yours: number | null,
  theirs: number | null,
  normalised = false,
): LiftComparison {
  return {
    exercise_id: `mine-${name}`,
    name,
    muscle_group: 'Chest',
    equipment: 'Barbell',
    yours: yours === null ? null : liftBest(yours, `mine-${name}`, false),
    theirs: theirs === null ? null : liftBest(theirs, `theirs-${name}`, normalised),
  };
}

const LIFTS: LiftComparison[] = [
  lift('Bench', 116.7, 121),
  lift('Curl', 40, null),
  lift('Deadlift', null, 200),
  lift('Row', 100, 100),
  lift('Squat', 154, 140),
  lift('Pulldown', 106.7, 80, true),
];

const sampleWorkout = {
  id: 'w-alex-1',
  name: 'Heavy Push Session',
  workout_date: twoDaysAgo,
  category: 'upper',
  workout_type_id: null,
  notes: null,
  duration_minutes: 55,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: `${twoDaysAgo}T08:00:00Z`,
  updated_at: '',
  photos: [],
  movements: [
    {
      id: 'm1',
      order_index: 0,
      exercise: {
        id: 'theirs-Bench',
        name: 'Bench',
        muscle_group: 'Chest',
        category: 'strength',
        kind: 'strength',
      },
      machine_photos: [],
      sets: [{ id: 's1', reps: 5, weight_kg: 100, completed: true, set_type: 'working' }],
    },
  ],
} as unknown as TrackedWorkout;

const fullProfile: SharedProfile = {
  id: 'alex',
  display_name: 'Alex Morgan',
  profile_photo_url: null,
  sex: 'female',
  member_since: '2026-01-01T00:00:00Z',
  visibility: 'public',
  is_you: false,
  friend_status: 'friends',
  can_view: true,
  workout_count: 14,
  recent_workout_count: 6,
  last_workout_date: twoDaysAgo,
  shares: { notes: true, body_weight: true, body_sizes: true, goals: true, machine_photos: false },
  consistency: {
    current_streak: 3,
    training_days: 12,
    workout_types: DEFAULT_WORKOUT_TYPES,
    heatmap: [
      {
        workout_date: twoDaysAgo,
        workout_count: 1,
        set_count: 12,
        categories: ['upper'],
        workouts: [],
      },
      {
        workout_date: tenDaysAgo,
        workout_count: 1,
        set_count: 10,
        categories: ['lower'],
        workouts: [],
      },
    ],
    training_split: null,
  },
  training_time: {
    workout_minutes: 125,
    workout_count: 2,
    cardio_minutes: 45,
    cardio_count: 1,
    total_minutes: 150,
  },
  training_time_past_year: {
    workout_minutes: 60,
    workout_count: 1,
    cardio_minutes: 90,
    cardio_count: 3,
    total_minutes: 150,
  },
  body_weight: [
    { measurement_date: twoDaysAgo, weight_kg: 76.5, body_fat_pct: 18.2 },
    { measurement_date: tenDaysAgo, weight_kg: 77.5, body_fat_pct: null },
    { measurement_date: thirtyDaysAgo, weight_kg: 78.5, body_fat_pct: 19.0 },
  ],
  body_sizes: [
    { ...emptyBodySizeLog(twoDaysAgo), waist_cm: 76.2, hips_cm: 96.52 },
    { ...emptyBodySizeLog(tenDaysAgo), waist_cm: 78.74 },
  ],
  goals: {
    body_weight: {
      start_date: thirtyDaysAgo,
      target_date: addDays(today, 30),
      start_weight_kg: 78.5,
      target_weight_kg: 74,
    },
    zone2: {
      week_start: tenDaysAgo,
      week_end: twoDaysAgo,
      goal_minutes: 150,
      completed_minutes: 45,
      remaining_minutes: 105,
      percentage: 30,
      complete: false,
    },
  },
  cardio_sessions: null,
};

let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  mockWeightUnit = 'kg';
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/alex/lifts') {
      return { selected: ['mine-Row', 'mine-Bench'], lifts: LIFTS } satisfies LiftComparisons;
    }
    if (path.startsWith('/api/sharing/profiles/alex/workouts')) {
      return { total: 1, workouts: [sampleWorkout], personal_records: [], reactions: {} };
    }
    throw new Error(`Unexpected GET ${path}`);
  });
});

afterEach(() => {
  client?.clear();
});

async function show(children: ReactNode) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrap = (node: ReactNode) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        {node}
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
  const view = await render(wrap(children));
  return {
    rerender: (node: ReactNode) => view.rerender(wrap(node)),
    unmount: () => view.unmount(),
  };
}

test('shows all five shared sections, respects sharing choices, and opens own splits', async () => {
  const view = await show(<ProfileStats profile={fullProfile} />);
  expect(screen.getByText('Head to head')).toBeVisible();
  expect(screen.getByText('Consistency')).toBeVisible();
  expect(screen.getByText('3 days')).toBeVisible();
  expect(screen.getByText('Time trained')).toBeVisible();
  expect(screen.getByText('2h 5min')).toBeVisible();
  expect(screen.getByText('Body weight')).toBeVisible();
  expect(screen.getByText(dayMonth(twoDaysAgo))).toBeVisible();
  expect(screen.getByText('76.5 kg')).toBeVisible();
  expect(screen.getByText('−2 kg')).toBeVisible();
  expect(screen.getByText('18.2%')).toBeVisible();
  expect(screen.getByLabelText('Body weight over the last 90 days')).toBeVisible();
  expect(screen.getByText('Body measurements')).toBeVisible();

  // Hidden sections stay hidden when the member does not share them.
  const privateExtras: SharedProfile = {
    ...fullProfile,
    id: 'sam',
    is_you: true,
    body_weight: null,
    body_sizes: null,
    training_time: null,
    training_time_past_year: null,
  };
  await view.rerender(<ProfileStats profile={privateExtras} />);
  expect(screen.queryByText('Head to head')).toBeNull();
  expect(screen.queryByText('Time trained')).toBeNull();
  expect(screen.queryByText('Body weight')).toBeNull();
  expect(screen.queryByText('Body measurements')).toBeNull();
  // Own profile exposes My splits from Consistency.
  await fireEvent.press(screen.getByRole('button', { name: 'My splits' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/split');
  await view.unmount();
});

test('consistency calendar disables empty days, toggles legend, and opens a trained day’s workouts', async () => {
  const view = await show(<ProfileStats profile={fullProfile} />);
  const legendSwitch = screen.getByRole('switch', { name: 'Upper body' });
  expect(legendSwitch).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
  await fireEvent.press(legendSwitch);
  expect(legendSwitch).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  await fireEvent.press(legendSwitch);

  const trainedDay = screen.getByRole('button', {
    name: `View 1 workout for ${prettyDate(twoDaysAgo)}`,
  });
  await fireEvent.press(trainedDay);
  expect(await screen.findByText('Heavy Push Session')).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(
    expect.stringContaining(`start_date=${twoDaysAgo}&end_date=${twoDaysAgo}`),
    expect.anything(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Open workout' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/social/workout/[id]',
    params: { id: 'w-alex-1', member: 'alex', date: twoDaysAgo },
  });
  await view.unmount();
});

test('training time toggles between All time and Past year, explains Combined, and tolerates older servers', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = await show(<ProfileStats profile={fullProfile} />);
  expect(screen.getByText('2h 5min')).toBeVisible();
  expect(screen.getByText('2 workouts')).toBeVisible();
  await fireEvent.press(screen.getByRole('radio', { name: 'Past year' }));
  expect(screen.getByText('1h')).toBeVisible();
  expect(screen.getByText('1 workout')).toBeVisible();
  expect(screen.getByText('3 sessions')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'About time trained' }));
  expect(alertSpy).toHaveBeenCalledWith(
    'Time trained',
    expect.stringContaining('Cardio done during a workout counts once in Combined.'),
  );

  // Older server without past-year totals hides the segmented control.
  await view.rerender(
    <ProfileStats profile={{ ...fullProfile, training_time_past_year: undefined }} />,
  );
  expect(screen.queryByLabelText('Time trained range')).toBeNull();
  alertSpy.mockRestore();
  await view.unmount();
});

test('body weight and body sizes handle empty states, units and stepping through dates', async () => {
  mockWeightUnit = 'lb';
  const view = await show(<ProfileStats profile={fullProfile} />);
  // Body measurements show only measured parts in inches, read-only, and step between dates.
  expect(screen.getByLabelText('Measurements on the body: Waist 30 in, Hips 38 in')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Earlier measurements' }));
  expect(screen.getByLabelText('Measurements on the body: Waist 31 in')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Earlier measurements' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Later measurements' }));
  expect(screen.getByLabelText('Measurements on the body: Waist 30 in, Hips 38 in')).toBeVisible();

  // Empty arrays (shared, but no entries yet) show the web's empty messages.
  await view.rerender(
    <ProfileStats profile={{ ...fullProfile, body_weight: [], body_sizes: [] }} />,
  );
  expect(screen.getByText('No weigh-ins yet.')).toBeVisible();
  expect(screen.getByText('No body measurements yet.')).toBeVisible();
  expect(screen.queryByLabelText('Body weight over the last 90 days')).toBeNull();

  // Single body size entry hides stepper buttons.
  await view.rerender(
    <ProfileStats
      profile={{
        ...fullProfile,
        sex: null,
        body_sizes: [{ ...emptyBodySizeLog(twoDaysAgo), neck_cm: 38.1 }],
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Earlier measurements' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Later measurements' })).toBeNull();
  await view.unmount();
});

test('head to head starts empty, picks lifts, scores, searches, unselects with Undo, and opens sessions', async () => {
  const view = await show(<ProfileStats profile={fullProfile} />);
  // Starts empty even though the server returned selected lifts.
  expect(screen.getByRole('button', { name: 'Choose lifts' })).toBeVisible();
  expect(screen.queryByText('All-time est. 1RM')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Choose lifts' }));
  expect(await screen.findByText('Lifts to compare')).toBeVisible();
  expect(screen.getByText('0 of 20 chosen')).toBeVisible();

  // Tick Squat, Bench, Row, Curl, Pulldown.
  await fireEvent.press(screen.getByText('Squat'));
  await fireEvent.press(screen.getByText('Bench'));
  await fireEvent.press(screen.getByText('Row'));
  await fireEvent.press(screen.getByText('Curl'));
  await fireEvent.press(screen.getByText('Pulldown'));
  expect(screen.getByText('5 of 20 chosen')).toBeVisible();

  // Unselect all offers Undo inside the sheet, which puts the 5 lifts back.
  await fireEvent.press(screen.getByRole('button', { name: 'Unselect all' }));
  expect(screen.getByText('0 of 20 chosen')).toBeVisible();
  expect(screen.getByText('Lifts cleared')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('5 of 20 chosen')).toBeVisible();
  expect(screen.queryByText('Lifts cleared')).toBeNull();

  // Search filters exercises and shows empty message when none match.
  await fireEvent.changeText(screen.getByLabelText('Search your exercises'), 'zzz');
  expect(screen.getByText('No exercises match “zzz”.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));

  // Close sheet -> card commits chosen lifts, scores leaders and marks normalised weights.
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByText('All-time est. 1RM')).toBeVisible();
  expect(
    screen.getByLabelText('You lead 2 lifts, Alex Morgan leads 1 lift, 1 lift level'),
  ).toBeVisible();
  expect(screen.getByText('≈ 80 kg')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit lifts' })).toBeVisible();

  // Tapping a lift Alex logged opens their sessions for that exercise.
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Bench: you 116.7 kg, Alex Morgan 121 kg. Show Alex Morgan’s sessions',
    }),
  );
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringContaining('exercise_id=theirs-Bench'),
      expect.anything(),
    ),
  );
  expect(await screen.findByText('Heavy Push Session')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  // Switching to another member starts empty again (no cross-profile state leak).
  await view.rerender(
    <ProfileStats profile={{ ...fullProfile, id: 'sam', display_name: 'Sam' }} />,
  );
  expect(screen.queryByText('All-time est. 1RM')).toBeNull();
  await view.unmount();
});

test('head to head hides cleanly when the lifts endpoint fails and opens early taps once loaded', async () => {
  let resolveLifts: ((value: LiftComparisons) => void) | null = null;
  jest.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/api/sharing/profiles/alex/lifts') {
      return new Promise<LiftComparisons>((resolve) => {
        resolveLifts = resolve;
      });
    }
    return Promise.reject(new ApiError(404, 'Not found'));
  });
  const view = await show(<ProfileStats profile={fullProfile} />);
  // Tap Choose lifts before lifts arrive -> opens as soon as they do.
  await fireEvent.press(screen.getByRole('button', { name: 'Choose lifts' }));
  expect(screen.queryByText('Lifts to compare')).toBeNull();
  await act(async () => resolveLifts!({ selected: [], lifts: LIFTS }));
  expect(await screen.findByText('Lifts to compare')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  // Failed lifts endpoint on another profile hides the card.
  await view.rerender(
    <ProfileStats profile={{ ...fullProfile, id: 'unavailable', display_name: 'Other' }} />,
  );
  await waitFor(() => expect(screen.queryByText('Head to head')).toBeNull());
  await view.unmount();
});
