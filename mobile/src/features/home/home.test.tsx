import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { prettyDate } from '../../../../frontend/src/appShared';
import {
  DEFAULT_HOME_SECTION_SETTINGS,
  defaultHomeLayout,
  OPTIONAL_HOME_SECTIONS,
  type HomeLayout,
} from '../../../../frontend/src/homeLayout';
import {
  addDays,
  daysBetween,
  parseLocalDate,
  shortDate,
  weekStartFor,
} from '../../../../frontend/src/trainingSummary';
import type {
  DashboardData,
  HeatmapDay,
  PersonalRecord,
  TrackedWorkout,
  TrainingPreferences,
  TrainingSplit,
  User,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { ToastHost } from '../../ui/Toast';
import { useWorkout } from '../workout/WorkoutProvider';
import { HomeScreen } from './HomeScreen';

jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: jest.fn() }));
const mockRouter = { navigate: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useIsFocused: () => true }));
const mockUser = {
  id: 'u1',
  username: 'preview',
  display_name: 'Preview',
  sex: null,
  created_at: '2026-11-01T00:00:00Z',
  profile_photo_url: null,
} as unknown as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));

const today = localDate();
const monday = weekStartFor(today, 1);
// A calendar split that started today: Upper today, then Lower, then a rest day.
const split: TrainingSplit = {
  name: 'Upper / Lower',
  enabled: true,
  start_date: today,
  progression: 'calendar',
  steps: [{ workout_type_id: 'upper' }, { workout_type_id: 'lower' }, { workout_type_id: null }],
};
const exercise = (id: string, name: string) => ({
  id,
  name,
  muscle_group: 'Chest',
  category: 'strength',
  kind: 'strength',
});
const upperWorkout = {
  id: 'w1',
  name: 'Upper A',
  workout_date: addDays(today, -7),
  category: 'upper',
  workout_type_id: null,
  notes: null,
  duration_minutes: 60,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '',
  updated_at: '',
  movements: [
    {
      id: 'm1',
      order_index: 0,
      exercise: exercise('bench', 'Bench Press'),
      sets: [{ id: 's1', reps: 8, weight_kg: 80, completed: true, set_type: 'working' }],
    },
    {
      id: 'm2',
      order_index: 1,
      exercise: exercise('row', 'Barbell Row'),
      sets: [{ id: 's2', reps: 10, weight_kg: 60, completed: true, set_type: 'working' }],
    },
  ],
} as unknown as TrackedWorkout;
const trainedDay: HeatmapDay = {
  workout_date: monday,
  categories: ['lower'],
  workout_count: 1,
  set_count: 9,
  workouts: [
    {
      id: 'w2',
      name: 'Lower B',
      category: 'lower',
      workout_type_id: 'lower',
      duration_minutes: 71,
      exercises: [
        { exercise_name: 'Hack Squat', set_count: 3, bodyweight_kg: 83 },
        { exercise_name: 'Hip Thrust', set_count: 3, bodyweight_kg: 83 },
      ],
    },
  ],
};
const muscleWeek = (start: string, sets: Record<string, number>) => ({
  week_start: start,
  week_end: addDays(start, 6),
  raw_sets: 0,
  effective_sets: 0,
  unrated_sets: 0,
  low_rpe_sets: 0,
  rpe_logging_percent: 0,
  muscle_groups: Object.entries(sets).map(([muscle_group, raw_sets]) => ({
    muscle_group,
    raw_sets,
    effective_sets: raw_sets,
    contributions: [],
  })),
});
function dashboard(overrides: Partial<DashboardData> = {}) {
  return {
    current_streak: 8,
    total_cardio_sessions: 32,
    history: {
      total_workouts: 51,
      strength_workouts: 49,
      first_workout_date: addDays(today, -200),
      last_workout_date: today,
      has_sample_workouts: false,
    },
    heatmap: [trainedDay],
    recommendation: {
      category: 'upper',
      session_name: 'Upper body',
      split_name: 'Upper / Lower',
      reason: '',
      rotation_next: 'lower',
      muscle_frequency: [],
    },
    training_split: split,
    weekly_sets: muscleWeek(monday, {
      Glutes: 18,
      Quadriceps: 15,
      Lats: 12,
      Biceps: 9,
      Triceps: 8,
      Adductors: 7,
      Forearms: 6,
      Hamstrings: 5,
      Calves: 4,
    }),
    weekly_sets_history: [muscleWeek(addDays(monday, -7), { Glutes: 16, Lats: 12 })],
    zone2: {
      week_start: monday,
      week_end: addDays(monday, 6),
      goal_minutes: 150,
      completed_minutes: 60,
      remaining_minutes: 90,
      percentage: 40,
      complete: false,
    },
    ...overrides,
  } as unknown as DashboardData;
}
const record = {
  id: 'r1',
  exercise_id: 'bench',
  workout_id: 'w1',
  set_id: 's1',
  achieved_date: addDays(today, -1),
  record_type: 'weight',
  value: 85,
  unit: 'kg',
  normalized_weight: 85,
  weight_kg: 85,
  formula: null,
  exercise_name: 'Barbell Bench Press',
  bodyweight_kg: 83.5,
} as PersonalRecord;
const preferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
} as TrainingPreferences;

const checkIn = (id: string, days: number, weight_kg: number, body_fat_pct: number | null) => ({
  id,
  measurement_date: addDays(today, -days),
  weight_kg,
  body_fat_pct,
  notes: null,
  is_sample: false,
  created_at: '',
});
const measurements = [checkIn('b1', 1, 84.6, 18.4), checkIn('b2', 30, 86.1, 19)];

let responses: Record<string, unknown>;
const workout = {
  live: null,
  start: jest.fn(),
  open: jest.fn(),
  openStartMenu: jest.fn(),
  discard: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  responses = {
    '/api/dashboard': dashboard(),
    '/api/workouts/snapshot': { revision: '1', workouts: [upperWorkout] },
    '/api/workout-types': undefined,
    '/api/workout-type-exercises': [],
    '/api/training-preferences': preferences,
    '/api/personal-records': [record],
    '/api/body-measurements': measurements,
    '/api/sharing': { visibility: 'followers', pending_requests: 2 },
    '/api/sharing/feed': { items: [], friends: 0, with_sessions: 0 },
    '/api/home-layout': defaultHomeLayout(),
    '/api/training-blocks': { blocks: [] },
    '/api/sharing/notifications': {
      requests: [
        { id: 'r1', display_name: 'Jordan Lee', profile_photo_url: null, since: '2026-11-20' },
        { id: 'r2', display_name: 'Sam Patel', profile_photo_url: null, since: '2026-11-19' },
      ],
      accepted: [
        {
          id: 'a1',
          display_name: 'Alex Morgan',
          profile_photo_url: null,
          since: '2026-11-18',
          is_read: false,
        },
      ],
      reactions: [],
      comments: [],
    },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const key = Object.keys(responses).find((prefix) => path.split('?')[0] === prefix);
    if (!key) throw new Error(`Unexpected ${path}`);
    const value = responses[key];
    if (value instanceof Error) throw value;
    if (key === '/api/workout-types') {
      const { DEFAULT_WORKOUT_TYPES } = jest.requireActual<
        typeof import('../../../../frontend/src/workoutTypes')
      >('../../../../frontend/src/workoutTypes');
      return DEFAULT_WORKOUT_TYPES;
    }
    return value;
  });
  jest.mocked(apiSend).mockResolvedValue(split);
  jest.mocked(useWorkout).mockReturnValue(workout as unknown as ReturnType<typeof useWorkout>);
});

let client: QueryClient;
afterEach(() => client.clear());

async function renderHome() {
  // No garbage-collection timers (queries or Skip's mutation), so Jest can exit when the tests
  // finish.
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <HomeScreen />
        {/* In the app the toast host lives with the workout provider at the root. */}
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function open() {
  await renderHome();
  await screen.findByText('Upper body day');
}

test('Up next shows the split day and its exercises, and starts it', async () => {
  await open();
  const card = screen.getByLabelText('Up next');
  expect(within(card).getByText('Up next')).toBeVisible();
  expect(within(card).getByText('Edit split')).toBeVisible();
  expect(within(card).getByText('Bench Press')).toBeVisible();
  expect(within(card).getByText('80×8')).toBeVisible();
  expect(within(card).getByText('Barbell Row')).toBeVisible();
  expect(within(card).getByText(`Last: ${shortDate(upperWorkout.workout_date)}`)).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Start upper body workout' }));
  expect(workout.start).toHaveBeenLastCalledWith({ kind: 'up-next' });
  await fireEvent.press(screen.getByRole('button', { name: 'Start empty workout' }));
  expect(workout.start).toHaveBeenLastCalledWith({ kind: 'empty' });
});

test('the header has the notifications bell, your profile and Settings', async () => {
  await open();
  // The bell counts waiting friend requests and unread notices, as on the web.
  const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' });
  expect(within(bell).getByText('3')).toBeVisible();
  const profile = screen.getByRole('button', { name: 'Profile: Preview' });
  await fireEvent.press(profile);
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/social/profile/[id]',
    params: { id: 'u1' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/settings');
  // The profile card's photo opens the same profile.
  mockRouter.push.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Open profile' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/social/profile/[id]',
    params: { id: 'u1' },
  });
});

test('the header leads with Edit and the Video logger, as on the web', async () => {
  await open();
  const labels = screen
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel)
    .filter((label) =>
      ['Edit Home layout', 'Video logger', 'Profile: Preview', 'Settings'].includes(label),
    );
  expect(labels).toEqual(['Edit Home layout', 'Video logger', 'Profile: Preview', 'Settings']);
  await fireEvent.press(screen.getByRole('button', { name: 'Video logger' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/videos');
});

test('the Video logger is left out for an account that cannot upload', async () => {
  (mockUser as { can_upload_videos?: boolean }).can_upload_videos = false;
  try {
    await open();
    expect(screen.queryByRole('button', { name: 'Video logger' })).toBeNull();
  } finally {
    delete (mockUser as { can_upload_videos?: boolean }).can_upload_videos;
  }
});

test('the date line reads as the web, without a comma after the weekday', async () => {
  await open();
  const today = parseLocalDate(localDate());
  const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = today.toLocaleDateString('en-GB', { month: 'long' });
  expect(screen.getByText(`${weekday} ${today.getDate()} ${month}`)).toBeVisible();
});

test('Edit split opens the split screen', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit split' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/split');
});

test('a running training block shows its card on Home and opens the blocks', async () => {
  responses['/api/training-blocks'] = {
    blocks: [
      {
        id: 'b1',
        name: 'Strength block',
        start_date: addDays(today, -7),
        end_date: null,
        planned_end_date: addDays(today, 48),
      },
    ],
  };
  await open();
  const card = await screen.findByRole('button', { name: /^Strength block, Week 2/ });
  await fireEvent.press(card);
  expect(mockRouter.push).toHaveBeenCalled();
});

test('Recent Friends Activity follows Recent records', async () => {
  await open();
  expect(await screen.findByText('Add friends to see their latest workouts here.')).toBeVisible();
  expect(screen.getByText('Recent Friends Activity')).toBeVisible();
});

test('Skip moves the split to the next workout day, with an Undo toast', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Skip upper body day' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith(`/api/training-split/position?on_date=${today}`, 'PUT', {
      step: 1,
      rest_saved: false,
    }),
  );
  expect(await screen.findByText('Skipped Upper body · Lower body is up next')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenLastCalledWith(
      `/api/training-split/position?on_date=${today}`,
      'PUT',
      { step: 0, rest_saved: false },
    ),
  );
});

test('a failed skip says why in an error toast', async () => {
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('That day has already passed.'));
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Skip upper body day' }));
  expect(await screen.findByText('That day has already passed.')).toBeOnTheScreen();
});

test('without a suggestion, Up next invites a first session; a rest day starts empty', async () => {
  responses['/api/dashboard'] = dashboard({
    recommendation: null as unknown as DashboardData['recommendation'],
    training_split: null,
  });
  responses['/api/workouts/snapshot'] = { revision: '1', workouts: [] };
  await renderHome();
  expect(await screen.findByText('Ready when you are')).toBeVisible();
  expect(screen.getByText('Start a workout')).toBeVisible();
  expect(screen.getByText('Log your first session to get a suggested next workout.')).toBeVisible();
  expect(screen.getByText('Set up split')).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Skip/ })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  expect(workout.start).toHaveBeenLastCalledWith({ kind: 'empty' });
});

test('on a rest day Start workout starts empty and there is no second Empty button', async () => {
  responses['/api/dashboard'] = dashboard({
    recommendation: {
      ...dashboard().recommendation,
      is_rest_day: true,
    },
  });
  await renderHome();
  expect(await screen.findByText('Rest day')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Start empty workout' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  expect(workout.start).toHaveBeenLastCalledWith({ kind: 'empty' });
});

test('a live workout replaces Up next with Resume', async () => {
  jest.mocked(useWorkout).mockReturnValue({
    ...workout,
    live: { name: 'Push day', startedAt: Date.now() },
  } as unknown as ReturnType<typeof useWorkout>);
  await renderHome();
  expect(await screen.findByText('Push day')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
  expect(workout.open).toHaveBeenCalled();
});

test('Profile, This week, Consistency and records show the account data', async () => {
  await open();
  const profile = screen.getByLabelText('Profile');
  expect(within(profile).getByText('Preview')).toBeVisible();
  expect(within(profile).getByLabelText('Workouts: 49')).toBeVisible();
  expect(within(profile).getByLabelText('Cardio: 32')).toBeVisible();
  expect(within(profile).getByLabelText('PRs: 1')).toBeVisible();

  expect(screen.getByText('Lower')).toBeVisible();
  expect(screen.getByLabelText('Streak: 8 days')).toBeVisible();
  expect(screen.getByText('Last 12 weeks')).toBeVisible();

  expect(screen.getByText('Barbell Bench Press')).toBeVisible();
  expect(screen.getByText(`Weight PR · ${shortDate(record.achieved_date)}`)).toBeVisible();
  expect(screen.getByText('at 83.5 kg BW')).toBeVisible();
  expect(screen.getByText('85 kg')).toBeVisible();
});

test('a logged day opens its workouts in a sheet', async () => {
  await open();
  const [tile] = screen.getAllByRole('button', { name: /^View 1 workout for/ });
  await fireEvent.press(tile);
  expect(await screen.findByText('TRAINING DAY')).toBeVisible();
  expect(screen.getByText('Lower B')).toBeVisible();
  expect(screen.getByText('Hack Squat')).toBeVisible();
  expect(screen.getByText('Lower body · 1h 11min · at 83 kg BW')).toBeVisible();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
  await waitFor(() => expect(screen.queryByText('TRAINING DAY')).toBeNull());
});

test('Sets per muscle compares weeks, steps back and shows more', async () => {
  await open();
  expect(screen.getByLabelText('Glutes: 18 of 10 sets, up 2 on the week before')).toBeVisible();
  expect(screen.getByText('Goal 10')).toBeVisible();
  // Eight of nine trained muscles show until Show more.
  expect(screen.queryByText('Calves')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getByText('Calves')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
  // The week shown and the nav both name it.
  expect(screen.getAllByText('Last week')).toHaveLength(2);
  expect(screen.getByLabelText('Glutes: 16 of 10 sets')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
});

test('a failed load shows each card’s error with a retry, never a blank screen', async () => {
  responses['/api/dashboard'] = new Error('Could not reach Relay.');
  responses['/api/personal-records'] = new Error('Could not reach Relay.');
  await renderHome();
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(5));
  expect(screen.getByText('Home')).toBeVisible();
  expect(screen.getByText('Preview')).toBeVisible();

  responses['/api/dashboard'] = dashboard();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Try again' })[0]);
  expect(await screen.findByText('Upper body day')).toBeVisible();
});

test('the stat cards count this week and open Training’s sessions or cardio, or Body', async () => {
  await open();
  const workouts = screen.getByRole('button', { name: /^Workouts: / });
  // One workout in the window, a week ago: none this week, an 8-week average of 0.1.
  expect(workouts).toHaveAccessibleName('Workouts: 0, 8-wk avg 0.1');
  await fireEvent.press(workouts);
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({
    pathname: '/training',
    params: { section: 'sessions', request: expect.any(String) },
  });
  await fireEvent.press(screen.getByRole('button', { name: /^Cardio sessions: 0/ }));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({
    pathname: '/training',
    params: { section: 'cardio', request: expect.any(String) },
  });
  const body = screen.getByRole('button', { name: 'Body weight: 84.6 kg, −1.5 kg / 4 wk' });
  await fireEvent.press(body);
  expect(mockRouter.navigate).toHaveBeenLastCalledWith('/body');
});

test('Zone 2, which opens Training’s cardio, sits beside the bodyweight trend', async () => {
  await open();
  const left = daysBetween(today, addDays(monday, 6)) + 1;
  const zone2 = screen.getByRole('button', {
    name: `Zone 2 cardio. 90 min to go · ${left} ${left === 1 ? 'day' : 'days'} left`,
  });
  expect(zone2).toBeVisible();
  expect(screen.getByText('60 / 150 min')).toBeVisible();
  await fireEvent.press(zone2);
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({
    pathname: '/training',
    params: { section: 'cardio', request: expect.any(String) },
  });
  expect(
    screen.getByRole('button', { name: 'Bodyweight: 84.6 kg. −1.5 kg in 30 days' }),
  ).toBeVisible();
});

test('the check-in logs today’s weight and body fat, with Undo', async () => {
  jest
    .mocked(apiSend)
    .mockImplementation(async (path: string, method: string, body?: unknown) =>
      path === '/api/body-measurements' && method === 'POST'
        ? { ...checkIn('today', 0, 0, null), ...(body as object) }
        : path.startsWith('/api/body-measurements/')
          ? undefined
          : split,
    );
  await open();
  const card = screen.getByLabelText('Body weight check-in');
  expect(within(card).getByLabelText('Prior: 84.6 kg; Not logged today')).toBeVisible();
  await fireEvent.press(within(card).getByRole('button', { name: 'Increase by 0.1 kg' }));
  await fireEvent.press(within(card).getByRole('button', { name: 'Decrease body fat by 0.1%' }));
  await fireEvent.press(within(card).getByRole('button', { name: 'Log check-in' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-measurements', 'POST', {
      measurement_date: today,
      weight_kg: 84.7,
      body_fat_pct: 18.3,
      notes: null,
    }),
  );
  expect(await screen.findByText('Check-in saved')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  // Today had no check-in, so Undo removes the new one.
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-measurements/today', 'DELETE'),
  );
});

test('the check-in asks for a weight before saving', async () => {
  responses['/api/body-measurements'] = [];
  await open();
  const card = screen.getByLabelText('Body weight check-in');
  await fireEvent.press(within(card).getByRole('button', { name: 'Log check-in' }));
  expect(within(card).getByText('Enter a bodyweight above 0 and up to 500 kg.')).toBeVisible();
  expect(apiSend).not.toHaveBeenCalled();
});

// Saved layouts, card settings and the optional cards.

function savedLayout(change: Partial<HomeLayout> = {}): HomeLayout {
  return { ...defaultHomeLayout(), ...change };
}

/** The sheets' next steps run at once on Android; iOS waits for the sheet to leave. */
const onAndroid = () => jest.replaceProperty(Platform, 'OS', 'android');

/** Presses the given button of the last native alert. */
function answerAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  const button = buttons.find((item) => item.text === label);
  if (!button?.onPress) throw new Error(`No ${label} button`);
  button.onPress();
}

test("a saved layout orders and hides Home's cards and applies their settings", async () => {
  responses['/api/home-layout'] = savedLayout({
    order: [
      'records',
      'workouts',
      'next-workout',
      'zone2',
      'consistency',
      'weekly-review' as never,
    ],
    hidden: ['consistency'],
    settings: {
      ...DEFAULT_HOME_SECTION_SETTINGS,
      workouts: { weeks: 4 },
      zone2: { zone: null, style: 'list' },
    },
  });
  await open();
  // Records leads, then Workouts, then Up next; Consistency is hidden and the rest follow.
  await waitFor(() => expect(screen.queryByText('Last 12 weeks')).toBeNull());
  const order = screen
    .getAllByText(/^(Recent records|Upper body day|Workouts)$/)
    .map((node) => node.props.children);
  expect(order).toEqual(['Recent records', 'Workouts', 'Upper body day']);
  expect(screen.getByRole('button', { name: /^Workouts: 0, 4-wk avg/ })).toBeVisible();
  // The List design draws no progress bars.
  expect(screen.getByText('60 / 150 min', { exact: false })).toBeVisible();
  expect(screen.queryByRole('progressbar', { name: 'Zone 2 minutes this week' })).toBeNull();
});

test('a layout with every card hidden says how to bring them back', async () => {
  responses['/api/home-layout'] = savedLayout({ hidden: [...defaultHomeLayout().order] });
  await renderHome();
  expect(
    await screen.findByText('Your Home Screen is clear. Use the edit button to add sections.'),
  ).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Edit Home layout' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Home layout' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/home-layout');
});

test('the optional cards show once added to Home', async () => {
  responses['/api/home-layout'] = savedLayout({
    order: [...OPTIONAL_HOME_SECTIONS],
    hidden: [],
  });
  responses['/api/dashboard'] = dashboard({
    weekly_sets: {
      ...dashboard().weekly_sets,
      muscle_groups: [
        {
          muscle_group: 'Glutes',
          raw_sets: 3,
          effective_sets: 3,
          contributions: [
            {
              workout_id: 'w2',
              workout_name: 'Lower B',
              workout_date: addDays(today, -4),
              movement_id: 'm9',
              exercise_id: 'hip',
              exercise_name: 'Hip Thrust',
              working_sets: 3,
              credit_per_set: 1,
              set_credits: 3,
            },
          ],
        },
      ],
    } as DashboardData['weekly_sets'],
  });
  responses['/api/body-weight-goals'] = [
    {
      id: 'g1',
      created_at: '',
      start_date: addDays(today, -30),
      target_date: addDays(today, 70),
      start_weight_kg: 88,
      target_weight_kg: 80,
      active: true,
    },
  ];
  responses['/api/progress'] = [
    {
      exercise_id: 'bench',
      session_count: 6,
      last_date: addDays(today, -7),
      latest_estimated_1rm: 100,
      change_kg: 2.5,
      change_percent: 2.5,
      trend: [
        { date: addDays(today, -14), estimated_1rm: 97.5 },
        { date: addDays(today, -7), estimated_1rm: 100 },
      ],
    },
  ];
  responses['/api/exercises'] = [];
  responses['/api/cardio'] = {
    sessions: [
      { id: 'c1', session_date: today, activity_type: 'Running', distance_km: 5.2 },
      { id: 'c2', session_date: today, activity_type: 'Cycling', distance_km: 21 },
    ],
  };
  responses['/api/sharing/friends'] = {
    friends: [
      {
        id: 'f1',
        display_name: 'Sam',
        username: 'sam',
        profile_photo_url: null,
        training_dates: [today],
        recent_workout_count: 9,
        latest: null,
      },
    ],
    requests: [],
    sent: [],
    blocked: [],
  };
  await renderHome();
  expect(await screen.findByText('Body goal')).toBeVisible();
  expect(await screen.findByText('Est. 1RM')).toBeVisible();
  expect(screen.getByText('+2.5 kg')).toBeVisible();
  expect(screen.getByLabelText('Glutes, 4 days')).toBeVisible();
  expect(await screen.findByLabelText('Cycling: 21 km, 1 session')).toBeVisible();
  expect(await screen.findByText('Friends this week')).toBeVisible();
  expect(await screen.findByLabelText('1. Sam, 1 day')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '1. Sam, 1 day' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/social/profile/[id]',
    params: { id: 'f1' },
  });
});

test("today's planned split day opens its plan and starts it", async () => {
  onAndroid();
  responses['/api/dashboard'] = dashboard({ heatmap: [] });
  await open();
  await fireEvent.press(screen.getByRole('button', { name: `${prettyDate(today)}, no workouts` }));
  expect(await screen.findByText('Today')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Start Upper body' }));
  expect(workout.start).toHaveBeenLastCalledWith({
    kind: 'template',
    template: expect.objectContaining({
      exercises: expect.arrayContaining([
        expect.objectContaining({ exercise: expect.objectContaining({ id: 'bench' }) }),
      ]),
    }),
    name: 'Upper body workout',
    category: 'upper',
    type: expect.objectContaining({ id: 'upper' }),
  });
});

test('a day with nothing planned asks before starting a workout dated that day', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  responses['/api/dashboard'] = dashboard({ heatmap: [], training_split: null });
  await renderHome();
  await fireEvent.press(
    await screen.findByRole('button', { name: `${prettyDate(today)}, no workouts` }),
  );
  expect(alert).toHaveBeenLastCalledWith(
    'Create a new workout?',
    `Start a workout for ${prettyDate(today)}?`,
    expect.any(Array),
  );
  answerAlert('Create workout');
  expect(workout.start).toHaveBeenLastCalledWith({ kind: 'empty' }, { date: today });
});

test("a logged day's sheet opens, edits and adds workouts, replacing a live one", async () => {
  onAndroid();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await open();
  const tile = () => screen.getAllByRole('button', { name: /^View 1 workout for/ })[0];
  await fireEvent.press(tile());
  await fireEvent.press(await screen.findByRole('button', { name: 'Open Lower B' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/training/session/[id]',
    params: { id: 'w2' },
  });
  await fireEvent.press(tile());
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Lower B' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/edit-workout/[id]',
    params: { id: 'w2' },
  });

  // With a workout in progress (started on another day), Add asks to replace it.
  jest.mocked(useWorkout).mockReturnValue({
    ...workout,
    live: { name: 'Push day', startedAt: Date.now() - 30 * 86_400_000 },
  } as unknown as ReturnType<typeof useWorkout>);
  await fireEvent.press(tile());
  await fireEvent.press(await screen.findByRole('button', { name: 'Add another workout' }));
  expect(alert).toHaveBeenLastCalledWith(
    'Cancel your current workout?',
    `Creating a workout for ${prettyDate(monday)} will discard your current unsaved workout.`,
    expect.any(Array),
  );
  answerAlert('Cancel & create new');
  expect(workout.discard).toHaveBeenCalled();
  expect(workout.start).toHaveBeenLastCalledWith({ kind: 'empty' }, { date: monday });
});

test('a muscle opens its contributions, and its goal can be changed there', async () => {
  onAndroid();
  responses['/api/dashboard'] = dashboard({
    weekly_sets: {
      ...dashboard().weekly_sets,
      muscle_groups: [
        {
          muscle_group: 'Glutes',
          raw_sets: 3,
          effective_sets: 3,
          contributions: [
            {
              workout_id: 'w2',
              workout_name: 'Lower B',
              workout_date: monday,
              movement_id: 'm9',
              exercise_id: 'hip',
              exercise_name: 'Hip Thrust',
              working_sets: 3,
              credit_per_set: 1,
              set_credits: 3,
            },
          ],
        },
      ],
    } as DashboardData['weekly_sets'],
  });
  jest
    .mocked(apiSend)
    .mockImplementation(async (path: string, _method: string, body?: unknown) =>
      path === '/api/training-preferences' ? body : split,
    );
  await open();
  await fireEvent.press(screen.getByRole('button', { name: /^Glutes: 3 of 10 sets/ }));
  expect(await screen.findByText('Hip Thrust')).toBeVisible();
  expect(screen.getByText('3 working sets × 1 · Direct')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Edit goal for Glutes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'One set more' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/training-preferences', 'PUT', {
      ...preferences,
      weekly_muscle_set_goals: { Glutes: 11 },
    }),
  );
  expect(await screen.findByText('Glutes goal set to 11 sets')).toBeOnTheScreen();

  await fireEvent.press(
    screen.getByRole('button', {
      name: `View Hip Thrust in Lower B, ${shortDate(monday)}`,
    }),
  );
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/training/session/[id]',
    params: { id: 'w2' },
  });
});

test('Sets per muscle opens the muscle goals; Recent records opens Progress', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Muscle goals' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/muscle-goals');
  await fireEvent.press(screen.getByRole('button', { name: 'Progress' }));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({
    pathname: '/training',
    params: { section: 'exercises', request: expect.any(String) },
  });
  await fireEvent.press(screen.getByRole('button', { name: /^Barbell Bench Press, Weight PR/ }));
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/training/exercise/[id]',
    params: { id: 'bench' },
  });
});

test('the check-in follows its saved mode: Weight only saves just the weight', async () => {
  responses['/api/home-layout'] = savedLayout({
    settings: { ...DEFAULT_HOME_SECTION_SETTINGS, check_in: { mode: 'weight' } },
  });
  jest
    .mocked(apiSend)
    .mockImplementation(async (path: string, method: string, body?: unknown) =>
      path === '/api/body-measurements' && method === 'POST'
        ? { ...checkIn('today', 0, 0, null), ...(body as object) }
        : split,
    );
  await open();
  const card = screen.getByLabelText('Body weight check-in');
  await waitFor(() =>
    expect(within(card).queryByRole('button', { name: 'Decrease body fat by 0.1%' })).toBeNull(),
  );
  await fireEvent.press(within(card).getByRole('button', { name: 'Log weight' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-measurements', 'POST', {
      measurement_date: today,
      weight_kg: 84.6,
      body_fat_pct: null,
      notes: null,
    }),
  );
  expect(await screen.findByText('Body weight saved')).toBeOnTheScreen();
});
