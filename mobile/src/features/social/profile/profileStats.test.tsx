import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { prettyDate } from '../../../../../frontend/src/appShared';
import { emptyBodySizeLog } from '../../../../../frontend/src/bodySizeEntries';
import { sharedFiltersOnDay } from '../../../../../frontend/src/sharedHistoryFilters';
import { addDays, dayMonth, shortDate } from '../../../../../frontend/src/trainingSummary';
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
import { OFFLINE_MESSAGE } from '../../../data/offline';
import { ToastHost } from '../../../ui/Toast';
import { ProfileScreen } from '../ProfileScreen';
import { socialKeys } from '../socialQueries';
import { ProfileStats } from './ProfileStats';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
  Stack: { Screen: () => null },
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
jest.mock('../../../ui/MenuButton', () => {
  const actual =
    jest.requireActual<typeof import('../../../ui/MenuButton')>('../../../ui/MenuButton');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    MenuButton: (props: {
      accessibilityLabel: string;
      items: { label: string; onPress: () => void }[];
    }) =>
      createElement(
        View,
        { accessibilityLabel: props.accessibilityLabel },
        props.items.map((item) =>
          createElement(
            Pressable,
            { key: item.label, accessibilityRole: 'button', onPress: item.onPress },
            createElement(Text, null, item.label),
          ),
        ),
      ),
  };
});

// Pick dates guaranteed to stay inside the current month, even on the 1st or 2nd of a month.
const today = localDate();
const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
const pad2 = (value: number) => String(value).padStart(2, '0');
const inCurrentMonth = (day: number) => `${todayYear}-${pad2(todayMonth)}-${pad2(day)}`;
const trainedInMonth = inCurrentMonth(todayDay >= 3 ? todayDay - 2 : todayDay);
const emptyInMonth = inCurrentMonth(todayDay === 1 ? 2 : todayDay - 1);
const tenDaysAgo = addDays(today, -10);
const thirtyDaysAgo = addDays(today, -30);

function liftBest(estimated_1rm: number, exercise_id = 'ex', normalised = false): LiftBest {
  return {
    exercise_id,
    weight_kg: 100,
    reps: 5,
    estimated_1rm,
    achieved_date: trainedInMonth,
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
  workout_date: trainedInMonth,
  category: 'upper',
  workout_type_id: null,
  notes: 'Shared bench cues',
  duration_minutes: 55,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: `${trainedInMonth}T08:00:00Z`,
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
  last_workout_date: trainedInMonth,
  shares: { notes: true, body_weight: true, body_sizes: true, goals: true, machine_photos: false },
  consistency: {
    current_streak: 3,
    training_days: 12,
    workout_types: DEFAULT_WORKOUT_TYPES,
    heatmap: [
      {
        workout_date: trainedInMonth,
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
    { measurement_date: trainedInMonth, weight_kg: 76.5, body_fat_pct: 18.2 },
    { measurement_date: tenDaysAgo, weight_kg: 78, body_fat_pct: null },
    { measurement_date: thirtyDaysAgo, weight_kg: 78.5, body_fat_pct: 19.0 },
  ],
  body_sizes: [
    { ...emptyBodySizeLog(trainedInMonth), waist_cm: 76.2, hips_cm: 96.52 },
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
      week_end: trainedInMonth,
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
  onlineManager.setOnline(true);
  mockWeightUnit = 'kg';
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/alex') {
      return fullProfile;
    }
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
  onlineManager.setOnline(true);
  client?.clear();
});

async function show(children: ReactNode) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return show2(children);
}

/** Renders with the current client, as when a screen is opened again in the same session. */
async function show2(children: ReactNode) {
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

test('ProfileScreen gates stats on can_view, respects sharing choices, and exposes My splits for own profile', async () => {
  // Real ProfileScreen gate: a friends-only profile hides all five stats cards.
  const sharedGet = jest.mocked(apiGet).getMockImplementation()!;
  jest.mocked(apiGet).mockImplementation(async (path: string, ...rest) => {
    if (path === '/api/sharing/profiles/locked') {
      return { ...fullProfile, id: 'locked', can_view: false, friend_status: 'none' };
    }
    if (path.startsWith('/api/sharing/profiles/locked/')) {
      throw new Error(`A locked profile must not request ${path}`);
    }
    return sharedGet(path, ...rest);
  });
  const lockedView = await show(<ProfileScreen profileId="locked" />);
  expect(await screen.findByText('FRIENDS ONLY')).toBeVisible();
  expect(screen.queryByText('Head to head')).toBeNull();
  expect(screen.queryByText('Consistency')).toBeNull();
  expect(screen.queryByText('Time trained')).toBeNull();
  expect(screen.queryByText('Body weight')).toBeNull();
  expect(screen.queryByText('Body measurements')).toBeNull();
  await lockedView.unmount();

  // Viewable profile shows all five shared sections.
  const view = await show(<ProfileStats profile={fullProfile} />);
  expect(screen.getByText('Head to head')).toBeVisible();
  expect(screen.getByText('Consistency')).toBeVisible();
  expect(screen.getByText('3 days')).toBeVisible();
  expect(screen.getByText('Time trained')).toBeVisible();
  expect(screen.getByText('2h 5min')).toBeVisible();
  expect(screen.getByText('Body weight')).toBeVisible();
  expect(screen.getByText(dayMonth(trainedInMonth))).toBeVisible();
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

test('consistency calendar disables empty days, toggles legend, and opens/collapses a single-workout day sheet', async () => {
  const view = await show(<ProfileStats profile={fullProfile} />);
  const legendSwitch = screen.getByRole('switch', { name: 'Upper body' });
  expect(legendSwitch).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
  await fireEvent.press(legendSwitch);
  expect(legendSwitch).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  await fireEvent.press(legendSwitch);

  // Disabled empty day in the current month cannot open the workout sheet.
  const emptyDay = screen.getByLabelText(`No workouts for ${prettyDate(emptyInMonth)}`);
  expect(emptyDay).toBeDisabled();
  await fireEvent.press(emptyDay);
  expect(screen.queryByText('TRAINING DAY')).toBeNull();
  expect(apiGet).not.toHaveBeenCalledWith(
    expect.stringContaining(`start_date=${emptyInMonth}`),
    expect.anything(),
  );

  // Tapping a trained day opens the sheet with swipe dismissal enabled and single workout expanded.
  const trainedDay = screen.getByRole('button', {
    name: `View 1 workout for ${prettyDate(trainedInMonth)}`,
  });
  await fireEvent.press(trainedDay);
  expect(await screen.findByText('Heavy Push Session')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open workout' })).toBeVisible();
  const modals = screen.container.queryAll((node) => node.type === 'Modal');
  expect(modals.some((modal) => modal.props.visible && modal.props.allowSwipeDismissal)).toBe(true);

  // Tapping the single workout's expanded header collapses it; tapping again expands it.
  await fireEvent.press(screen.getByText('Heavy Push Session'));
  expect(screen.queryByRole('button', { name: 'Open workout' })).toBeNull();
  await fireEvent.press(screen.getByText('Heavy Push Session'));
  expect(screen.getByRole('button', { name: 'Open workout' })).toBeVisible();

  expect(apiGet).toHaveBeenCalledWith(
    expect.stringContaining(`start_date=${trainedInMonth}&end_date=${trainedInMonth}`),
    expect.anything(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Open workout' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/social/workout/[id]',
    params: { id: 'w-alex-1', member: 'alex', date: trainedInMonth },
  });
  await view.unmount();
});

test('revoked access (403 friend_required) evicts cached workouts, suppresses prior data, and revalidates ProfileScreen', async () => {
  let accessState: 'ok' | 'network-error' | 'revoked' = 'ok';
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/alex') {
      if (accessState === 'revoked') {
        return { ...fullProfile, can_view: false, friend_status: 'none' };
      }
      return fullProfile;
    }
    if (path === '/api/sharing/profiles/alex/lifts') {
      if (accessState === 'revoked') {
        throw new ApiError(403, 'Alex Morgan shares with friends only.', 'friend_required');
      }
      return { selected: [], lifts: LIFTS } satisfies LiftComparisons;
    }
    if (path.startsWith('/api/sharing/profiles/alex/workouts')) {
      if (accessState === 'network-error') {
        throw new Error('Could not reach Relay.');
      }
      if (accessState === 'revoked') {
        throw new ApiError(403, 'Alex Morgan shares with friends only.', 'friend_required');
      }
      // Return empty for the main profile history tab so only the day sheet has sampleWorkout.
      if (!path.includes('start_date=')) {
        return { total: 0, workouts: [], personal_records: [], reactions: {} };
      }
      return { total: 1, workouts: [sampleWorkout], personal_records: [], reactions: {} };
    }
    throw new Error(`Unexpected GET ${path}`);
  });

  const view = await show(<ProfileScreen profileId="alex" />);
  const trainedDay = await screen.findByRole('button', {
    name: `View 1 workout for ${prettyDate(trainedInMonth)}`,
  });

  // 1. Load a trained day so its workout is cached.
  await fireEvent.press(trainedDay);
  expect(await screen.findByText('Heavy Push Session')).toBeVisible();
  expect(screen.getByText('Shared bench cues')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  // 2. Transient network error on refetch preserves the cached workout with an alert underneath.
  accessState = 'network-error';
  await fireEvent.press(trainedDay);
  expect(await screen.findByText('Could not reach Relay.')).toBeVisible();
  expect(screen.getByText('Heavy Push Session')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  // 3. Access revoked (403 friend_required): cached workout and lifts are evicted and parent
  //    ProfileScreen revalidates into the FRIENDS ONLY locked state.
  accessState = 'revoked';
  await fireEvent.press(trainedDay);
  expect(await screen.findByText('FRIENDS ONLY')).toBeVisible();
  expect(screen.queryByText('Heavy Push Session')).toBeNull();
  expect(screen.queryByText('Shared bench cues')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open workout' })).toBeNull();
  expect(screen.queryByText('Head to head')).toBeNull();
  await waitFor(() => {
    expect(client.getQueryData(socialKeys.lifts('alex'))).toBeUndefined();
    expect(
      client.getQueryData(
        socialKeys.workouts('alex', undefined, sharedFiltersOnDay(trainedInMonth)),
      ),
    ).toBeUndefined();
  });
  await view.unmount();
});

test('a refused refetch hides the cached day in the open sheet, a failing Try again keeps it hidden, and it is evicted once closed', async () => {
  let refused = false;
  let unreachable = false;
  const sharedGet = jest.mocked(apiGet).getMockImplementation()!;
  jest.mocked(apiGet).mockImplementation(async (path: string, ...rest) => {
    if (unreachable) throw new Error('Could not reach Relay.');
    if (refused && path.startsWith('/api/sharing/profiles/alex/workouts')) {
      throw new ApiError(403, 'Alex Morgan shares with friends only.', 'friend_required');
    }
    return sharedGet(path, ...rest);
  });
  const view = await show(<ProfileStats profile={fullProfile} />);
  const day = screen.getByRole('button', {
    name: `View 1 workout for ${prettyDate(trainedInMonth)}`,
  });
  await fireEvent.press(day);
  expect(await screen.findByText('Shared bench cues')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  refused = true;
  await fireEvent.press(day);
  expect(await screen.findByText('Alex Morgan shares with friends only.')).toBeVisible();
  expect(screen.queryByText('Heavy Push Session')).toBeNull();
  expect(screen.queryByText('Shared bench cues')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open workout' })).toBeNull();

  // Try again while the connection fails: the network error replaces the refusal on the query,
  // but the recorded refusal still hides everything from before.
  unreachable = true;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Could not reach Relay.')).toBeVisible();
  expect(screen.queryByText('Heavy Push Session')).toBeNull();
  expect(screen.queryByText('Shared bench cues')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(
      client.getQueryData(
        socialKeys.workouts('alex', undefined, sharedFiltersOnDay(trainedInMonth)),
      ),
    ).toBeUndefined(),
  );
  await view.unmount();
});

/** Alex's API with switches for a refused workouts request and an unreachable server. */
function refusableAlex() {
  const state = { refused: false, unreachable: false, profileUnreachable: false };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (state.unreachable) throw new Error('Could not reach Relay.');
    if (path === '/api/sharing/profiles/alex') {
      if (state.profileUnreachable) throw new Error('Could not reach Relay.');
      return fullProfile;
    }
    if (path === '/api/sharing/profiles/alex/lifts') {
      return { selected: [], lifts: LIFTS } satisfies LiftComparisons;
    }
    if (path.startsWith('/api/sharing/profiles/alex/workouts')) {
      if (state.refused) {
        throw new ApiError(403, 'Alex Morgan shares with friends only.', 'friend_required');
      }
      if (!path.includes('start_date=')) {
        return { total: 0, workouts: [], personal_records: [], reactions: {} };
      }
      return { total: 1, workouts: [sampleWorkout], personal_records: [], reactions: {} };
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  return state;
}

test('a refusal outlives a failed profile refresh and leaving the profile, until the profile confirms access', async () => {
  const alex = refusableAlex();
  const view = await show(<ProfileScreen profileId="alex" />);
  const day = await screen.findByRole('button', {
    name: `View 1 workout for ${prettyDate(trainedInMonth)}`,
  });
  await waitFor(() => expect(client.getQueryData(socialKeys.lifts('alex'))).toBeDefined());
  await fireEvent.press(day);
  expect(await screen.findByText('Shared bench cues')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  // The day is refused, and the profile refresh that follows fails on the network.
  alex.refused = true;
  alex.profileUnreachable = true;
  await fireEvent.press(day);
  expect(await screen.findByText('FRIENDS ONLY')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Choose lifts' })).toBeNull();
  expect(screen.queryByText('Head to head')).toBeNull();
  expect(screen.queryByText('Shared bench cues')).toBeNull();
  await waitFor(() => {
    expect(client.getQueryData(socialKeys.lifts('alex'))).toBeUndefined();
    expect(
      client.getQueryData(
        socialKeys.workouts('alex', undefined, sharedFiltersOnDay(trainedInMonth)),
      ),
    ).toBeUndefined();
  });

  // Leave and come back while the profile still can't be refreshed: still locked, and the cached
  // lifts are gone rather than offered again.
  await view.unmount();
  const again = await show2(<ProfileScreen profileId="alex" />);
  expect(await screen.findByText('FRIENDS ONLY')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Choose lifts' })).toBeNull();
  expect(jest.mocked(apiGet)).not.toHaveBeenLastCalledWith(
    '/api/sharing/profiles/alex/lifts',
    expect.anything(),
  );

  // A freshly fetched, viewable profile lifts the refusal.
  alex.refused = false;
  alex.profileUnreachable = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: socialKeys.profile('alex'), exact: true });
  });
  expect(await screen.findByRole('button', { name: 'Choose lifts' })).toBeVisible();
  expect(screen.queryByText('FRIENDS ONLY')).toBeNull();
  await again.unmount();
});

test('after a refusal, a refresh that fails on the network brings none of the earlier workouts back', async () => {
  const alex = refusableAlex();
  const view = await show(<ProfileScreen profileId="alex" />);
  const day = await screen.findByRole('button', {
    name: `View 1 workout for ${prettyDate(trainedInMonth)}`,
  });
  await fireEvent.press(day);
  expect(await screen.findByText('Shared bench cues')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

  alex.refused = true;
  alex.profileUnreachable = true;
  await fireEvent.press(day);
  expect(await screen.findByText('FRIENDS ONLY')).toBeVisible();

  // Every Social query is retried while the server can't be reached.
  alex.unreachable = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['social'] });
  });
  await waitFor(() =>
    expect(client.getQueryState(socialKeys.profile('alex'))?.fetchStatus).toBe('idle'),
  );
  expect(screen.getByText('FRIENDS ONLY')).toBeVisible();
  expect(screen.queryByText('Heavy Push Session')).toBeNull();
  expect(screen.queryByText('Shared bench cues')).toBeNull();
  expect(screen.queryByText('Head to head')).toBeNull();
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

test('body weight chart formats readings without trailing .0, supports selection, respects hidden goals, and body sizes step dates', async () => {
  const view = await show(<ProfileStats profile={fullProfile} />);
  const chart = screen.getByLabelText('Body weight over the last 90 days');
  const drawn = { includeHiddenElements: true };
  // Once laid out, the chart draws the shared goal's line and label.
  await fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 320, height: 170 } } });
  expect(screen.getByLabelText('Goal 74 kg', drawn)).toBeOnTheScreen();

  // Stepping back selects the whole-number 78 kg weigh-in, read without a trailing .0.
  await fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(chart).toHaveAccessibilityValue({ text: `${shortDate(tenDaysAgo)}, 78 kg` });
  expect(screen.getByText('78 kg', drawn)).toBeOnTheScreen();
  expect(screen.queryByText('78.0 kg', drawn)).toBeNull();

  // A goal the member doesn't share draws no goal line or label.
  await view.rerender(<ProfileStats profile={{ ...fullProfile, goals: null }} />);
  await fireEvent(screen.getByLabelText('Body weight over the last 90 days'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 170 } },
  });
  expect(screen.queryByLabelText('Goal 74 kg', drawn)).toBeNull();

  // Body measurements show only measured parts in inches when lb is active, and step between dates.
  mockWeightUnit = 'lb';
  await view.rerender(<ProfileStats profile={fullProfile} />);
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
        body_sizes: [{ ...emptyBodySizeLog(trainedInMonth), neck_cm: 38.1 }],
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Earlier measurements' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Later measurements' })).toBeNull();
  await view.unmount();
});

test('head to head picks lifts, uses sheet ToastHost Undo with invalidation, commits on iOS swipe dismissal, and opens sessions', async () => {
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

  // Unselect all shows the sheet-local ToastHost Undo, which restores the 5 lifts.
  await fireEvent.press(screen.getByRole('button', { name: 'Unselect all' }));
  expect(screen.getByText('0 of 20 chosen')).toBeVisible();
  expect(await screen.findByText('Lifts cleared')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('5 of 20 chosen')).toBeVisible();
  expect(screen.queryByText('Lifts cleared')).toBeNull();

  // Selecting a new lift invalidates the Undo offer so an old Undo cannot overwrite newer choices.
  await fireEvent.press(screen.getByRole('button', { name: 'Unselect all' }));
  expect(await screen.findByText('Lifts cleared')).toBeOnTheScreen();
  const staleUndo = screen.getByRole('button', { name: 'Undo' });
  await fireEvent.press(screen.getByText('Deadlift'));
  expect(screen.queryByText('Lifts cleared')).toBeNull();
  // Even if the old offer were still reachable, it could not overwrite the newer choice.
  await fireEvent.press(staleUndo);
  expect(screen.getByText('1 of 20 chosen')).toBeVisible();
  // Put Squat, Bench, Row, Curl, Pulldown back (removing Deadlift) for scoring checks.
  await fireEvent.press(screen.getByText('Deadlift'));
  await fireEvent.press(screen.getByText('Squat'));
  await fireEvent.press(screen.getByText('Bench'));
  await fireEvent.press(screen.getByText('Row'));
  await fireEvent.press(screen.getByText('Curl'));
  await fireEvent.press(screen.getByText('Pulldown'));

  // Search filters exercises and shows empty message when none match.
  await fireEvent.changeText(screen.getByLabelText('Search your exercises'), 'zzz');
  expect(screen.getByText('No exercises match “zzz”.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));

  // iOS swipe dismissal (Modal allowSwipeDismissal + onRequestClose) commits chosen lifts.
  const pickerModal = screen.container
    .queryAll((node) => node.type === 'Modal')
    .find((modal) => modal.props.visible && modal.props.allowSwipeDismissal);
  expect(pickerModal).toBeDefined();
  await fireEvent(pickerModal!, 'requestClose');

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

test('head to head handles offline paused lifts, early taps on live loads, and cached 404 revocation', async () => {
  // 1. Offline paused query: tapping Choose lifts shows offline feedback with retry.
  onlineManager.setOnline(false);
  const offlineView = await show(<ProfileStats profile={fullProfile} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose lifts' }));
  expect(await screen.findByText(OFFLINE_MESSAGE)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await offlineView.unmount();
  onlineManager.setOnline(true);

  // 2. Live request early tap opens as soon as lifts arrive.
  let resolveLifts: ((value: LiftComparisons) => void) | null = null;
  let liftError: ApiError | null = null;
  jest.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/api/sharing/profiles/alex/lifts') {
      if (liftError) return Promise.reject(liftError);
      return new Promise<LiftComparisons>((resolve) => {
        resolveLifts = resolve;
      });
    }
    return Promise.reject(new ApiError(404, 'Not found'));
  });
  const view = await show(<ProfileStats profile={fullProfile} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose lifts' }));
  expect(screen.queryByText('Lifts to compare')).toBeNull();
  await act(async () => resolveLifts!({ selected: [], lifts: LIFTS }));
  expect(await screen.findByText('Lifts to compare')).toBeVisible();

  // 3. Cached lifts refetch fails with 404 profile_not_found -> hides card & picker immediately.
  liftError = new ApiError(404, 'That profile is not shared.', 'profile_not_found');
  await act(async () => {
    await client.invalidateQueries({ queryKey: socialKeys.lifts('alex') });
  });
  await waitFor(() => {
    expect(screen.queryByText('Lifts to compare')).toBeNull();
    expect(screen.queryByText('Head to head')).toBeNull();
  });
  await view.unmount();
});
