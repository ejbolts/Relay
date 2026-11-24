import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { apiGet } from '../../data/api';
import { OFFLINE_MESSAGE } from '../../data/offline';
import { sessionToken } from '../../data/session';
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
// Save split goes through the real request layer, so its fetch and bearer can be checked.
jest.mock('../../data/api', () => {
  process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = 'https://relay.test';
  return {
    ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
    apiGet: jest.fn(),
    apiSend: jest.fn(),
  };
});
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(async () => 'token-me'),
  forgetSessionTokenIf: jest.fn(),
}));
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
// Nor does the iOS calendar: it offers one date to pick.
jest.mock('@expo/ui/swift-ui', () => {
  const { createElement, Fragment } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ...jest.requireActual<object>('@expo/ui/swift-ui'),
    Host: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    DatePicker: (props: { title: string; onDateChange: (date: Date) => void }) =>
      createElement(
        Pressable,
        {
          accessibilityRole: 'button',
          accessibilityLabel: `${props.title} calendar`,
          onPress: () => props.onDateChange(mockCalendarDate.value),
        },
        createElement(Text, null, 'calendar'),
      ),
  };
});
const mockPickedDate = { value: '' };
const mockCalendarDate = { value: new Date() };
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

/** A server answer, as the fetch adapter sees it. */
const answer = (body: unknown, status = 201) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
const copyCalls = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/copy'));
const bearer = (call: [string, RequestInit]) =>
  (call[1].headers as Record<string, string>).Authorization;

let workouts: (params: Record<string, string>) => SharedWorkoutPage | Promise<SharedWorkoutPage>;
let splits: Routine[];
let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(answer(copy));
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
  onlineManager.setOnline(true);
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

/** The last menu's choice with this label. */
function menuChoice(label: string) {
  return jest
    .mocked(showMenu)
    .mock.calls.at(-1)![1]
    .find((item) => item.label === label)!;
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

  test('each split opens and keeps its Muscles choice on its own, as the web’s cards', async () => {
    splits = [upperLower, { ...upperLower, id: 'ppl', name: 'Push Pull' }];
    await show(<ProfileScreen profileId="alex" />);
    await openSplit('Upper Lower');
    await fireEvent.press(screen.getByRole('switch', { name: 'Muscles' }));
    await openSplit('Push Pull');
    // Both are open at once, and only the first shows its muscles.
    const checked = () =>
      screen
        .getAllByRole('switch', { name: 'Muscles' })
        .map((item) => Boolean(item.props.accessibilityState?.checked));
    expect(checked()).toEqual([true, false]);
    // Closing and reopening the first keeps its choice.
    await openSplit('Upper Lower');
    expect(checked()).toEqual([false]);
    await openSplit('Upper Lower');
    expect(checked()).toEqual([true, false]);
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
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    // Your library and catalogues, as screens opened earlier left them.
    client.setQueryData(['routines'], [{ ...upperLower, id: 'mine', name: 'Push Pull' }]);
    client.setQueryData(['workout-types'], []);
    client.setQueryData(['exercises'], []);
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    expect(await screen.findByText('Split saved')).toBeOnTheScreen();
    expect(copyCalls()).toHaveLength(1);
    const [url, init] = copyCalls()[0];
    expect(url).toBe('https://relay.test/api/routines/profile/alex/source/copy');
    expect(init.method).toBe('POST');
    expect(bearer(copyCalls()[0])).toBe('Bearer token-me');
    // Saved once on this visit, as the web's button.
    expect(screen.getByRole('button', { name: 'Upper Lower saved' })).toBeDisabled();
    // The copy is in your library at once; the library, workout types and exercises are read
    // again, since the copy can add types and exercises to your account.
    expect(client.getQueryData<Routine[]>(['routines'])?.map((item) => item.id)).toEqual([
      'copy',
      'mine',
    ]);
    expect(client.getQueryState(['routines'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['workout-types'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['exercises'])?.isInvalidated).toBe(true);

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
    fetchMock.mockResolvedValueOnce(
      answer({ error: { message: 'You can save up to 20 splits.' } }, 422),
    );
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    expect(await screen.findByText('You can save up to 20 splits.')).toBeVisible();
    expect(screen.queryByText('Split saved')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Upper Lower' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'View my splits' })).toBeNull();
  });

  test("a switch while the token is read sends nothing with the new session's token", async () => {
    let token!: (value: string) => void;
    jest
      .mocked(sessionToken)
      .mockImplementationOnce(() => new Promise<string | null>((resolve) => (token = resolve)));
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    client.setQueryData(['routines'], []);
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    await act(async () => switchAccount('sam'));
    // The token store now answers with the account that signed in since.
    await act(async () => token('token-sam'));
    expect(copyCalls()).toHaveLength(0);
    expect(screen.queryByText('Split saved')).toBeNull();
    expect(client.getQueryData(['routines'])).toEqual([]);
  });

  test('a save that answers after an account switch writes and says nothing there', async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    client.setQueryData(['routines'], []);
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    await waitFor(() => expect(copyCalls()).toHaveLength(1));
    // Sent with the starting session's own token.
    expect(bearer(copyCalls()[0])).toBe('Bearer token-me');
    await act(async () => switchAccount('sam'));
    await act(async () => respond(answer(copy)));
    expect(screen.queryByText('Split saved')).toBeNull();
    expect(client.getQueryData(['routines'])).toEqual([]);
    expect(screen.queryByRole('button', { name: 'View my splits' })).toBeNull();
  });

  test('a failure that answers after an account switch says nothing there', async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
    await show(<ProfileScreen profileId="alex" />);
    await openSplit();
    await fireEvent.press(screen.getByRole('button', { name: 'Save Upper Lower' }));
    await waitFor(() => expect(copyCalls()).toHaveLength(1));
    await act(async () => switchAccount('sam'));
    await act(async () => respond(answer({ error: { message: 'Split not found.' } }, 404)));
    expect(screen.queryByText('Split not found.')).toBeNull();
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

  test('a custom workout type replaces a chosen category, as on the web', async () => {
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
    // A built-in category first, then the custom type in its place.
    await fireEvent.press(await screen.findByRole('button', { name: 'Workout type, All types' }));
    await act(async () => menuChoice('Push').onPress());
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ category: 'push' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Workout type, Push' }));
    expect(jest.mocked(showMenu).mock.calls.at(-1)![1].at(-1)!.label).toBe('Arms');
    await act(async () => menuChoice('Arms').onPress());
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ workout_type_id: 't1' }));
    expect(workoutReads().at(-1)).not.toHaveProperty('category');
    expect(screen.getByRole('button', { name: 'Workout type, Arms' })).toBeVisible();
    expect(await screen.findByText('No workouts match these filters.')).toBeVisible();
  });

  test('a From date after the To date reads nothing and says why', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    mockPickedDate.value = today;
    await fireEvent.press(screen.getByRole('button', { name: 'From, not set' }));
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ start_date: today }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // The reads made before the range turns invalid.
    const reads = workoutReads().length;
    mockPickedDate.value = addDays(today, -3);
    await fireEvent.press(screen.getByRole('button', { name: 'To, not set' }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getAllByText(SHARED_FILTER_DATES_ERROR).length).toBeGreaterThan(0);
    expect(workoutReads()).toHaveLength(reads);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear To date' }));
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ start_date: today }));
    expect(screen.queryByText(SHARED_FILTER_DATES_ERROR)).toBeNull();
  });
});

describe('history dates on iOS', () => {
  test('an unset date opens a calendar at today and applies only what is set', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const reads = workoutReads().length;
    // Opening the calendar applies nothing, and Cancel leaves the date unset.
    await fireEvent.press(await screen.findByRole('button', { name: 'From, Any date' }));
    expect(screen.getByRole('button', { name: 'From calendar' })).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel From date' }));
    expect(screen.getByRole('button', { name: 'From, Any date' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filter workouts' })).toBeVisible();
    expect(workoutReads()).toHaveLength(reads);
    // A chosen day applies only once it is set.
    const earlier = addDays(today, -10);
    mockCalendarDate.value = new Date(`${earlier}T12:00:00`);
    await fireEvent.press(screen.getByRole('button', { name: 'From, Any date' }));
    await fireEvent.press(screen.getByRole('button', { name: 'From calendar' }));
    expect(workoutReads()).toHaveLength(reads);
    await fireEvent.press(screen.getByRole('button', { name: 'Set From date' }));
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ start_date: earlier }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear From date' }));
    expect(await screen.findByRole('button', { name: 'From, Any date' })).toBeVisible();
  });
});

describe('history offline and unavailable choices', () => {
  test('a paused history read says it is offline instead of spinning', async () => {
    await show(<ProfileScreen profileId="alex" />);
    await screen.findByRole('button', { name: /^Upper body,/ });
    await act(async () => onlineManager.setOnline(false));
    await fireEvent.press(screen.getByRole('button', { name: 'Filter workouts' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Exercise, All exercises' }));
    await act(async () => menuChoice('Cable row').onPress());
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading workouts')).toBeNull();
  });

  test('when the choices fail to load, types and dates still work and Try again reloads them', async () => {
    let fail = true;
    const base = jest.mocked(apiGet).getMockImplementation()!;
    jest.mocked(apiGet).mockImplementation(async (path: string, signal?: AbortSignal) => {
      if (path.endsWith('/workout-filters') && fail) throw new Error('Relay is busy.');
      return base(path, signal);
    });
    await show(<ProfileScreen profileId="alex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter workouts' }));
    expect(await screen.findByText(/Exercises and machines could not load/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Exercise,/ })).toBeNull();
    // The built-in types still filter.
    await fireEvent.press(screen.getByRole('button', { name: 'Workout type, All types' }));
    await act(async () => menuChoice('Pull').onPress());
    await waitFor(() => expect(workoutReads().at(-1)).toMatchObject({ category: 'pull' }));
    fail = false;
    await fireEvent.press(
      screen.getByRole('button', { name: 'Try loading exercises and machines again' }),
    );
    expect(await screen.findByRole('button', { name: 'Exercise, All exercises' })).toBeVisible();
  });
});

describe('opening a profile at a linked workout', () => {
  const older = addDays(today, -40);
  const day = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => workout(`d${from + index}`, older, 'Pull'));

  test('reads older pages of its day until the workout loads, and opens it', async () => {
    // The linked workout is on the third page, with a fourth beyond it; answers are immediate.
    workouts = ({ offset }) =>
      offset === '20'
        ? page([...day(20, 5), workout('linked', older, 'Legs'), ...day(26, 4)], 40)
        : page(day(Number(offset), 10), 40);
    await show(
      <ProfileScreen profileId="alex" targetWorkout={{ id: 'linked', workout_date: older }} />,
    );
    const linked = await screen.findByRole('button', { name: /^Legs,/ });
    expect(linked).toHaveProp('accessibilityState', expect.objectContaining({ expanded: true }));
    // Each page in turn, stopping once it has loaded: the fourth is never read.
    expect(workoutReads()).toEqual(
      ['0', '10', '20'].map((offset) =>
        expect.objectContaining({ offset, start_date: older, end_date: older }),
      ),
    );
    // Its day is set as two filters.
    expect(screen.getByRole('button', { name: 'Filter workouts, 2 set' })).toBeVisible();
    expect(screen.queryByText(LINKED_WORKOUT_MISSING)).toBeNull();
    // The fourth page waits for Show older workouts.
    expect(screen.getByRole('button', { name: 'Show older workouts' })).toBeVisible();
  });

  test('keeps loading while an intermediate page is on its way', async () => {
    let second!: (value: SharedWorkoutPage) => void;
    workouts = ({ offset }) =>
      offset === '0'
        ? page(day(0, 10), 15)
        : new Promise<SharedWorkoutPage>((resolve) => (second = resolve));
    await show(
      <ProfileScreen profileId="alex" targetWorkout={{ id: 'linked', workout_date: older }} />,
    );
    await waitFor(() => expect(workoutReads()).toHaveLength(2));
    // The first page holds other workouts: the list waits for the link instead of showing them.
    expect(screen.getByLabelText('Loading workouts')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Pull,/ })).toBeNull();
    await act(async () => second(page([...day(10, 4), workout('linked', older, 'Legs')], 15)));
    expect(await screen.findByRole('button', { name: /^Legs,/ })).toBeVisible();
  });

  test('stops at the last page when the workout is not there, and says so', async () => {
    workouts = ({ offset }) => page(day(Number(offset), offset === '20' ? 5 : 10), 25);
    await show(
      <ProfileScreen profileId="alex" targetWorkout={{ id: 'gone', workout_date: older }} />,
    );
    expect(await screen.findByText(LINKED_WORKOUT_MISSING)).toBeVisible();
    expect(workoutReads().map((read) => read.offset)).toEqual(['0', '10', '20']);
    expect(screen.queryByRole('button', { name: 'Show older workouts' })).toBeNull();
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
