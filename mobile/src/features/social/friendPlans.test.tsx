import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  LINKED_WORKOUT_MISSING,
  SHARED_FILTER_DATES_ERROR,
} from '../../../../frontend/src/sharedHistoryFilters';
import type {
  Routine,
  SharedProfile,
  SharedWorkoutPage,
  TrackedWorkout,
} from '../../../../frontend/src/types';
import { addDays } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { showMenu } from '../../ui/prompts';
import { ToastHost } from '../../ui/Toast';
import { ProfileScreen } from './ProfileScreen';
import { SharedWorkoutScreen } from './SharedWorkoutScreen';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn(), promptText: jest.fn() }));
// The native date pickers have no test renderer: each field offers one date to pick.
jest.mock('../../ui/DateField', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DateField: (props: { label: string; value: string; onChange: (date: string) => void }) =>
      createElement(
        Pressable,
        {
          accessibilityRole: 'button',
          accessibilityLabel: `${props.label}, ${props.value || 'not set'}`,
          onPress: () => props.onChange(mockPickedDate.value),
        },
        createElement(Text, null, props.label),
      ),
  };
});
const mockPickedDate = { value: '' };
const mockUser = { id: 'me', username: 'preview', display_name: 'Preview' };
const mockSession = {
  status: { kind: 'signed-in', user: { id: 'me' } } as { kind: string; user?: { id: string } },
  listeners: new Set<() => void>(),
};
function switchAccount(id: string) {
  mockSession.status = { kind: 'signed-in', user: { id } };
  mockSession.listeners.forEach((listener) => listener());
}
jest.mock('../../session/SessionProvider', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useUser: () => mockUser,
    useOptionalSession: () => ({
      status: useSyncExternalStore(
        (listener) => {
          mockSession.listeners.add(listener);
          return () => void mockSession.listeners.delete(listener);
        },
        () => mockSession.status,
      ),
    }),
  };
});
jest.mock('../../data/queries', () => ({
  ...jest.requireActual('../../data/queries'),
  useWeightUnit: () => 'kg',
}));

const today = localDate();
const alex: SharedProfile = {
  id: 'alex',
  display_name: 'Alex Morgan',
  profile_photo_url: null,
  member_since: '2026-09-01T10:00:00Z',
  visibility: 'followers',
  is_you: false,
  friend_status: 'friends',
  can_view: true,
  workout_count: 3,
  recent_workout_count: 3,
  last_workout_date: today,
  shares: null,
  body_weight: null,
  goals: null,
  cardio_sessions: null,
};
const workout = (id: string, date: string, name = 'Upper body') =>
  ({
    id,
    name,
    workout_date: date,
    category: 'upper',
    workout_type_id: null,
    notes: null,
    duration_minutes: 50,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T08:00:00Z`,
    updated_at: '',
    photos: [],
    movements: [],
  }) as unknown as TrackedWorkout;
const page = (workouts: TrackedWorkout[], total = workouts.length): SharedWorkoutPage => ({
  workouts,
  personal_records: [],
  total,
});
const exercise = (id: string, name: string, kind = 'strength') =>
  ({ id, name, kind, muscle_group: 'Back', category: 'pull', muscle_contributions: [] }) as never;
const set = { reps: 8, weight_kg: 60, duration_seconds: null, distance_km: null };
const upperLower: Routine = {
  id: 'source',
  name: 'Upper Lower',
  shared: true,
  days: [
    {
      workout_type_id: 'upper',
      workout_type: { id: 'upper', name: 'Upper', color: '#3366ff' } as never,
      movements: [
        { exercise_id: 'row', exercise: exercise('row', 'Cable row'), sets: [set, set, set] },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
} as unknown as Routine;
const copy = { ...upperLower, id: 'copy', shared: false };
const filterOptions = {
  exercises: [
    { id: 'row', name: 'Cable row' },
    { id: 'squat', name: 'Back squat' },
  ],
  machines: [],
};

/** Each request the profile made for workouts, as its query parameters. */
const workoutReads = () =>
  jest
    .mocked(apiGet)
    .mock.calls.map(([path]) => path as string)
    .filter((path) => path.startsWith('/api/sharing/profiles/alex/workouts?'))
    .map((path) => Object.fromEntries(new URLSearchParams(path.split('?')[1])));

let workouts: (params: Record<string, string>) => SharedWorkoutPage;
let splits: Routine[];
let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  splits = [upperLower];
  workouts = () => page([workout('w1', today)]);
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/alex') return alex;
    if (path.startsWith('/api/sharing/profiles/alex/workouts?'))
      return workouts(Object.fromEntries(new URLSearchParams(path.split('?')[1])));
    if (path === '/api/sharing/profiles/alex/workout-filters') return filterOptions;
    if (path === '/api/routines/profile/alex') return splits;
    if (path === '/api/routines') return [];
    if (path === '/api/training-split?on_date=' + today) return null;
    if (path === '/api/workout-types') return [];
    if (path.includes('/comments?')) return { total: 0, next_offset: null, items: [] };
    if (path.startsWith('/api/')) return [];
    throw new Error(`Unexpected GET ${path}`);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  client.clear();
  if (mockSession.status.user?.id !== 'me') switchAccount('me');
});

async function show(children: ReactNode) {
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
        {children}
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function openSplit(name = 'Upper Lower') {
  await fireEvent.press(await screen.findByRole('button', { name: `${name}, 2 days` }));
}

describe("a friend's splits", () => {
  test('lists their shared splits, each opening to its cycle with set blocks and muscles', async () => {
    await show(<ProfileScreen profileId="alex" />);
    expect(await screen.findByText('Splits')).toBeVisible();
    await openSplit();
    expect(screen.getByText('Cable row')).toBeVisible();
    expect(screen.getByLabelText('3 sets')).toBeVisible();
    expect(screen.getByText('Rest day')).toBeVisible();
    await fireEvent.press(screen.getByRole('switch', { name: 'Muscles' }));
    expect(screen.getByRole('switch', { name: 'Muscles' })).toBeChecked();
  });

  test('says when a friend shares no splits', async () => {
    splits = [];
    await show(<ProfileScreen profileId="alex" />);
    expect(await screen.findByText('No shared splits.')).toBeVisible();
  });

  test('your own profile has no Splits card', async () => {
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/api/sharing/profiles/me') return { ...alex, id: 'me', is_you: true };
      if (path.includes('/workouts?')) return page([workout('w1', today)]);
      if (path.startsWith('/api/')) return [];
      throw new Error(`Unexpected GET ${path}`);
    });
    await show(<ProfileScreen profileId="me" />);
    expect(await screen.findByRole('button', { name: /^Upper body,/ })).toBeVisible();
    expect(screen.queryByText('Splits')).toBeNull();
    expect(apiGet).not.toHaveBeenCalledWith('/api/routines/profile/me', expect.anything());
  });

  test('Save split keeps a private copy in your library, says so, and can open it', async () => {
    jest.mocked(apiSend).mockResolvedValue(copy);
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    // Your library, as a split screen opened earlier left it.
    client.setQueryData(['routines'], [{ ...upperLower, id: 'mine', name: 'Push Pull' }]);
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    expect(apiSend).toHaveBeenCalledWith('/api/routines/profile/alex/source/copy', 'POST');
    expect(await screen.findByText('Split saved')).toBeOnTheScreen();
    // Saved once on this visit, as the web's button.
    expect(screen.getByRole('button', { name: 'Upper Lower saved' })).toBeDisabled();
    // The copy is in your library at once, and the library and workout types are read again
    // (the copy can add workout types).
    expect(client.getQueryData<Routine[]>(['routines'])?.map((item) => item.id)).toEqual([
      'copy',
      'mine',
    ]);
    expect(client.getQueryState(['routines'])?.isInvalidated).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/split/edit',
      params: { id: 'copy' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'View my splits' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/split',
      params: { open: 'copy' },
    });
  });

  test('a failed save says why, keeps Save split and shows no toast', async () => {
    jest.mocked(apiSend).mockRejectedValueOnce(new Error('You can save up to 20 splits.'));
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    expect(await screen.findByText('You can save up to 20 splits.')).toBeVisible();
    expect(screen.queryByText('Split saved')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Upper Lower' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'View my splits' })).toBeNull();
  });

  test('a save that answers after an account switch writes and says nothing there', async () => {
    let answer!: (routine: Routine) => void;
    jest.mocked(apiSend).mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    client.setQueryData(['routines'], []);
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    await act(async () => switchAccount('sam'));
    await act(async () => answer(copy));
    expect(screen.queryByText('Split saved')).toBeNull();
    expect(client.getQueryData(['routines'])).toEqual([]);
    expect(screen.queryByRole('button', { name: 'View my splits' })).toBeNull();
  });
});

describe('history filters', () => {
  test('filter by exercise from the sheet, counted on the button, then reset', async () => {
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Exercise, All exercises' }));
    const [title, choices] = jest.mocked(showMenu).mock.calls.at(-1)!;
    expect(title).toBe('Exercise');
    expect(choices.map((choice) => choice.label)).toEqual([
      'All exercises',
      'Cable row',
      'Back squat',
    ]);
    await act(async () => choices[2].onPress());
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ exercise_id: 'squat' }));
    expect(screen.getByRole('button', { name: 'Exercise, Back squat' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filter workouts, 1 set' })).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByRole('button', { name: 'Filter workouts' })).toBeVisible();
    expect(workoutReads().at(-1)).not.toHaveProperty('exercise_id');
  });

  test('a custom workout type replaces the category, as on the web', async () => {
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/api/sharing/profiles/alex') return alex;
      if (path.endsWith('/workout-filters'))
        return {
          ...filterOptions,
          workout_types: [{ id: 't1', name: 'Arms', is_custom: true }],
        };
      if (path.includes('/workouts?')) return page([]);
      return [];
    });
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Workout type, All types' }));
    const choices = jest.mocked(showMenu).mock.calls.at(-1)![1];
    expect(choices.at(-1)!.label).toBe('Arms');
    await act(async () => choices.at(-1)!.onPress());
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ workout_type_id: 't1' }));
    expect(workoutReads().at(-1)).not.toHaveProperty('category');
    expect(await screen.findByText('No workouts match these filters.')).toBeVisible();
  });

  test('a From date after the To date reads nothing and says why', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    mockPickedDate.value = today;
    await fireEvent.press(screen.getByRole('button', { name: 'From, not set' }));
    mockPickedDate.value = addDays(today, -3);
    await fireEvent.press(screen.getByRole('button', { name: 'To, not set' }));
    const reads = workoutReads().length;
    expect(screen.getAllByText(SHARED_FILTER_DATES_ERROR).length).toBeGreaterThan(0);
    expect(workoutReads()).toHaveLength(reads);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear To date' }));
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ start_date: today }));
    expect(screen.queryByText(SHARED_FILTER_DATES_ERROR)).toBeNull();
  });
});

describe('history dates on iOS', () => {
  test('an unset date says Any date, since the native picker always shows one', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'From, Any date' }));
    // Choosing one starts the picker at today, with Clear beside it.
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ start_date: today }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear From date' }));
    expect(await screen.findByRole('button', { name: 'From, Any date' })).toBeVisible();
  });
});

describe('opening a profile at a linked workout', () => {
  const older = addDays(today, -40);

  test('reads older pages of its day until the workout loads, and opens it', async () => {
    const first = Array.from({ length: 20 }, (_, index) => workout(`d${index}`, older, 'Pull'));
    workouts = ({ offset }) =>
      offset === '0' ? page(first, 21) : page([workout('linked', older, 'Legs')], 21);
    await show(
      <ProfileScreen profileId="alex" targetWorkout={{ id: 'linked', workout_date: older }} />,
    );
    const linked = await screen.findByRole('button', { name: /^Legs,/ });
    expect(linked).toHaveProp('accessibilityState', expect.objectContaining({ expanded: true }));
    expect(workoutReads()).toEqual([
      expect.objectContaining({ offset: '0', start_date: older, end_date: older }),
      expect.objectContaining({ offset: '20', start_date: older, end_date: older }),
    ]);
    // Its day is set as two filters.
    expect(screen.getByRole('button', { name: 'Filter workouts, 2 set' })).toBeVisible();
    expect(screen.queryByText(LINKED_WORKOUT_MISSING)).toBeNull();
  });

  test('says when the linked workout is gone, until another filter is chosen', async () => {
    workouts = () => page([workout('other', older, 'Pull')]);
    await show(
      <ProfileScreen profileId="alex" targetWorkout={{ id: 'gone', workout_date: older }} />,
    );
    expect(await screen.findByText(LINKED_WORKOUT_MISSING)).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Filter workouts, 2 set' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Clear From date' }));
    await waitFor(() => expect(screen.queryByText(LINKED_WORKOUT_MISSING)).toBeNull());
  });

  test("a shared workout's owner opens their profile at that workout", async () => {
    const shared = workout('w1', today);
    workouts = () => page([shared]);
    await show(<SharedWorkoutScreen workoutId="w1" memberId="alex" date={today} />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Open Alex Morgan’s profile' }),
    );
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/social/profile/[id]',
      params: { id: 'alex', workout: 'w1', date: today },
    });
  });
});
