import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { defaultHomeLayout } from '../../../../frontend/src/homeLayout';
import type { BodyMeasurement, User } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { useOptionalSession } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { HomeScreen } from '../home/HomeScreen';
import { SocialScreen } from '../social/SocialScreen';
import { TrainingTabScreen } from '../training/TrainingTabScreen';
import { BodyCheckInSync } from './BodyCheckInSync';
import { bodyCheckInStatus, saveBodyCheckIn, setBodyCheckInOwner } from './bodyCheckInQueue';
import { BodyScreen } from './BodyScreen';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  GestureDetector: ({ children }: { children: unknown }) => children,
  GestureStateManager: { fail: jest.fn() },
  usePinchGesture: (config: unknown) => config,
  useLongPressGesture: (config: unknown) => config,
}));
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => undefined),
  unlockAsync: jest.fn(async () => undefined),
  OrientationLock: { LANDSCAPE: 'landscape' },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
const mockRouter = { navigate: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  router: mockRouter,
  useRouter: () => mockRouter,
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('../workout/WorkoutProvider', () => ({
  useWorkout: () => ({
    live: null,
    start: jest.fn(),
    open: jest.fn(),
    openStartMenu: jest.fn(),
    discard: jest.fn(),
    queue: { waiting: 0, sending: false, refusals: {}, conflicts: [], outdated: false },
    refused: [],
    review: jest.fn(),
    discardRefused: jest.fn(),
    keepMine: jest.fn(),
    resume: jest.fn(),
    syncConflict: null,
    syncConflictOpen: false,
    showSyncConflict: jest.fn(),
    resolveSync: jest.fn(),
    hostSyncConflict: () => () => undefined,
    syncConflictHosted: false,
  }),
  useOptionalWorkout: () => null,
  useLogger: () => null,
}));

const userA = {
  id: 'u1',
  username: 'alex',
  display_name: 'Alex',
  sex: null,
  created_at: '2026-11-01T00:00:00Z',
  profile_photo_url: null,
} as unknown as User;

const userB = {
  ...userA,
  id: 'u2',
  username: 'sam',
  display_name: 'Sam',
} as unknown as User;

let mockSession: { kind: 'signed-in'; user: User } | { kind: 'signed-out' } = {
  kind: 'signed-in',
  user: userA,
};

jest.mock('../../session/SessionProvider', () => ({
  useUser: () => {
    if (mockSession.kind !== 'signed-in') throw new Error('Signed out');
    return mockSession.user;
  },
  useOptionalSession: () => ({ status: mockSession }),
}));

const today = localDate();
const serverRow = (date: string, weight_kg: number): BodyMeasurement => ({
  id: `server-${date}`,
  measurement_date: date,
  weight_kg,
  body_fat_pct: null,
  notes: null,
  is_sample: false,
  created_at: `${date}T07:00:00Z`,
});

let client: QueryClient;

function Shell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <BodyCheckInSync />
        {children}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  onlineManager.setOnline(true);
  setBodyCheckInOwner(null);
  mockSession = { kind: 'signed-in', user: userA };
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const clean = path.split('?')[0];
    if (clean === '/api/body-measurements') return [serverRow('2026-11-01', 80)];
    if (clean === '/api/body-weight-goals') return [];
    if (clean === '/api/body-sizes') return [];
    if (clean === '/api/training-preferences')
      return { preferred_weight_unit: 'kg', week_start: 'monday' };
    if (clean === '/api/sharing/notifications') return { requests: [], accepted: [] };
    if (clean === '/api/sharing/connections')
      return {
        friends: [],
        requests: [],
        outgoing: [],
        suggestions: [],
        blocked: [],
        locked: false,
      };
    if (clean === '/api/sharing/timeline') return { items: [], has_more: false };
    if (clean === '/api/sharing/feed') return { items: [], has_more: false };
    if (clean === '/api/sharing/friends') return [];
    if (clean === '/api/home-layout') return defaultHomeLayout();
    if (clean === '/api/dashboard') return null;
    if (clean === '/api/workouts/snapshot') return { revision: '1', workouts: [] };
    if (clean === '/api/workout-types') return [];
    if (clean === '/api/workout-type-exercises') return [];
    if (clean === '/api/personal-records') return [];
    if (clean === '/api/training-blocks') return { blocks: [] };
    if (clean === '/api/app-notices') return { release_seen: null, weekly_review_seen: null };
    if (clean === '/release.json') return null;
    return [];
  });
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
    ...serverRow((body as { measurement_date: string }).measurement_date, 0),
    ...(body as object),
  }));
});

afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
  setBodyCheckInOwner(null);
  memoryKv.clear();
});

test('shows the check-in sync card on Home, Training, Social and Body with one sync owner', async () => {
  type Tab = 'home' | 'training' | 'social' | 'body';
  function Tabs({ tab }: { tab: Tab }) {
    return (
      <>
        {tab === 'home' && <HomeScreen />}
        {tab === 'training' && <TrainingTabScreen />}
        {tab === 'social' && <SocialScreen />}
        {tab === 'body' && <BodyScreen />}
      </>
    );
  }

  const view = await render(
    <Shell>
      <Tabs tab="home" />
    </Shell>,
  );

  // Offline: queueing check-ins displays the card across every tab without sending.
  onlineManager.setOnline(false);
  await act(async () => {
    saveBodyCheckIn({
      measurement_date: today,
      weight_kg: 82.4,
      body_fat_pct: null,
      notes: null,
    });
  });

  expect(await screen.findByText('1 check-in saved on this phone')).toBeVisible();
  expect(screen.getByText('Waiting to sync')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Retry sync' })).toBeNull();

  // Queue a second day's check-in and verify plural wording on every other tab.
  await act(async () => {
    saveBodyCheckIn({
      measurement_date: '2026-11-02',
      weight_kg: 82.0,
      body_fat_pct: null,
      notes: null,
    });
  });
  expect(screen.getByText('2 check-ins saved on this phone')).toBeVisible();

  for (const tab of ['training', 'social', 'body', 'home'] as const) {
    await view.rerender(
      <Shell>
        <Tabs tab={tab} />
      </Shell>,
    );
    expect(screen.getByLabelText('Check-in sync')).toBeVisible();
    expect(screen.getByText('2 check-ins saved on this phone')).toBeVisible();
    expect(screen.getByText('Waiting to sync')).toBeVisible();
  }

  // Reconnecting sends each waiting check-in exactly once through the single owner.
  await act(async () => {
    onlineManager.setOnline(true);
  });
  await waitFor(() => expect(bodyCheckInStatus().pending).toBe(0));
  const posts = jest
    .mocked(apiSend)
    .mock.calls.filter(([path, method]) => path === '/api/body-measurements' && method === 'POST');
  expect(posts).toHaveLength(2);
  expect(screen.queryByLabelText('Check-in sync')).toBeNull();

  await view.unmount();
});

test('shows a refusal error on another tab and Retry sync sends it and refreshes queries', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const view = await render(
    <Shell>
      <HomeScreen />
    </Shell>,
  );

  jest.mocked(apiSend).mockRejectedValueOnce(new ApiError(422, 'Weight looks wrong.'));
  await act(async () => {
    saveBodyCheckIn({
      measurement_date: today,
      weight_kg: 82.4,
      body_fat_pct: null,
      notes: null,
    });
  });

  expect(await screen.findByText('Weight looks wrong.')).toBeVisible();
  expect(screen.getByText('1 check-in saved on this phone')).toBeVisible();
  expect(screen.queryByText('Waiting to sync')).toBeNull();

  invalidate.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry sync' }));
  await waitFor(() => expect(bodyCheckInStatus().pending).toBe(0));
  expect(screen.queryByLabelText('Check-in sync')).toBeNull();
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['body', 'measurements'] }),
  );
  await view.unmount();
});

test('signing out or switching accounts hides the card and drops another account’s queue', async () => {
  function ActiveTab() {
    const session = useOptionalSession()?.status;
    return session?.kind === 'signed-in' ? <HomeScreen /> : null;
  }

  const view = await render(
    <Shell>
      <ActiveTab />
    </Shell>,
  );

  onlineManager.setOnline(false);
  await act(async () => {
    saveBodyCheckIn({
      measurement_date: today,
      weight_kg: 82.4,
      body_fat_pct: null,
      notes: null,
    });
  });
  expect(await screen.findByText('1 check-in saved on this phone')).toBeVisible();

  // Sign out: owner clears, card disappears.
  mockSession = { kind: 'signed-out' };
  await view.rerender(
    <Shell>
      <ActiveTab />
    </Shell>,
  );
  expect(bodyCheckInStatus().pending).toBe(0);
  expect(screen.queryByLabelText('Check-in sync')).toBeNull();

  // Another account signs in: never sees Alex's waiting check-in.
  mockSession = { kind: 'signed-in', user: userB };
  await view.rerender(
    <Shell>
      <ActiveTab />
    </Shell>,
  );
  expect(bodyCheckInStatus().pending).toBe(0);
  expect(screen.queryByLabelText('Check-in sync')).toBeNull();

  // Switching back to Alex does not resurrect the dropped queue.
  mockSession = { kind: 'signed-in', user: userA };
  await view.rerender(
    <Shell>
      <ActiveTab />
    </Shell>,
  );
  expect(bodyCheckInStatus().pending).toBe(0);
  expect(screen.queryByLabelText('Check-in sync')).toBeNull();

  await view.unmount();
});
