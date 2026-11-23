import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import releaseMetadata from '../../../../frontend/release.json';
import { releaseSeenKey, weeklyReviewShownKey } from '../../../../frontend/src/appNoticeRules';
import { announcedRelease, parseRelease } from '../../../../frontend/src/releaseMetadata';
import { addDays, weekStartFor } from '../../../../frontend/src/trainingSummary';
import type { DashboardData, User } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import {
  reviewCardioWeek,
  reviewRecord,
  reviewSet,
  reviewWorkout,
} from '../../../../frontend/src/weeklyReviewFixtures';
import { apiGet, request } from '../../data/api';
import { recordAppNotices, resetAppNoticeSending, useAppNotices } from './appNotices';
import { NotificationsBell } from '../social/NotificationsBell';
import { memoryKv } from '../../testing/memoryKvStore';
import { finishAppTour, queueAppTour } from '../guides/tourProgress';
import { LaunchNotices } from './LaunchNotices';
import { launchPromptOpened, openLaunchPrompt, resetNoticeMemory } from './noticeMemory';
import { ReleaseNotesScreen } from './ReleaseNotesScreen';
import { WeeklyReviewScreen } from './WeeklyReviewScreen';

const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
  setParams: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
  request: jest.fn(),
  serverOrigin: () => 'https://relay.test',
  clientVersionHeaders: () => ({ 'X-Relay-Version': mockAppVersion }),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/authorisedImage', () => ({ useAuthorisedImage: () => null }));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
let mockUser: User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));

const version = announcedRelease(parseRelease(releaseMetadata)!).version;
const today = localDate();
// Reviews last week (Monday weeks), against the week before it.
const thisWeek = weekStartFor(today, 1);
const lastWeek = addDays(thisWeek, -7);
const weekBefore = addDays(thisWeek, -14);
const muscleWeek = (start: string, sets: number) => ({
  week_start: start,
  week_end: addDays(start, 6),
  muscle_groups: [{ muscle_group: 'Chest', raw_sets: sets, contributions: [] }],
});
const dashboard = {
  weekly_sets: muscleWeek(thisWeek, 0),
  weekly_sets_history: [muscleWeek(lastWeek, 6), muscleWeek(weekBefore, 2)],
  cardio_weeks: [
    reviewCardioWeek(thisWeek, 0, {}),
    reviewCardioWeek(lastWeek, 40, { 2: [40, 150] }),
  ],
} as unknown as DashboardData;
const workouts = [
  reviewWorkout('last', addDays(lastWeek, 2), [reviewSet(100, 5), reviewSet(100, 5)]),
  reviewWorkout('before', addDays(weekBefore, 2), [reviewSet(90, 5)]),
];
const records = [reviewRecord('pr', addDays(lastWeek, 2), { value: 105, weight_kg: 105 })];
const reset = {
  user_id: 'sam',
  username: 'sam',
  display_name: 'Sam',
  requested_at: '2026-11-22T10:00:00Z',
};
let mockAppVersion = '99.0.0';
const expectSaved = (body: object) =>
  expect(request).toHaveBeenCalledWith(
    '/api/app-notices',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify(body) }),
    'token',
  );
let notices = { release_seen: null as string | null, weekly_review_seen: null as string | null };

async function show(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  resetNoticeMemory();
  resetAppNoticeSending();
  mockAppVersion = '99.0.0';
  notices = { release_seen: null, weekly_review_seen: null };
  mockUser = {
    id: 'me',
    username: 'preview',
    display_name: 'Preview',
    profile_photo_url: null,
    is_admin: false,
    created_at: '2025-01-01T00:00:00Z',
  } as User;
  jest.mocked(request).mockImplementation(async (_path, init) => ({
    ...notices,
    ...JSON.parse(String(init?.body)),
  }));
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/release.json') return releaseMetadata;
    if (path === '/api/app-notices') return notices;
    if (path.startsWith('/api/dashboard')) return dashboard;
    if (path.startsWith('/api/workouts/snapshot')) return { workouts };
    if (path.startsWith('/api/personal-records')) return records;
    if (path === '/api/training-preferences') return { weekly_muscle_set_goal: 10 };
    if (path === '/api/sharing/notifications') return { requests: [], accepted: [] };
    if (path === '/api/admin/password-reset-requests') return [reset];
    if (path === '/api/training-blocks') return { blocks: [] };
    return [];
  });
});

it('opens What’s new once per release, then last week’s review on a later visit', async () => {
  const first = await show(<LaunchNotices />);
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/release-notes'));
  await first.unmount();
  // Only one opens by itself each visit.
  await show(<LaunchNotices />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(mockRouter.push).toHaveBeenCalledTimes(1);

  // A later visit, after What's new was closed: the week's review opens and is recorded.
  resetNoticeMemory();
  memoryKv.set(releaseSeenKey('me', version), '1');
  mockRouter.push.mockClear();
  await show(<LaunchNotices />);
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/weekly-review'));
  await waitFor(() => expectSaved({ weekly_review_seen: thisWeek }));
  expect(memoryKv.get(weeklyReviewShownKey('me'))).toBe(thisWeek);
});

it('lets a new account’s quick tour come first, and opens What’s new on a later visit', async () => {
  mockUser = { ...mockUser, id: 'new-account' };
  queueAppTour('new-account');
  await show(<LaunchNotices />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(mockRouter.push).not.toHaveBeenCalled();

  // The tour is finished; on the next visit What's new opens by itself.
  finishAppTour('new-account');
  resetNoticeMemory();
  await show(<LaunchNotices />);
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/release-notes'));
});

it('stays quiet when another device has shown this week’s review and seen the release', async () => {
  notices = { release_seen: version, weekly_review_seen: thisWeek };
  await show(<LaunchNotices />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('reviews last week against the week before, steps between weeks and opens records', async () => {
  await show(<WeeklyReviewScreen />);
  expect(await screen.findByText('Bench Press', {}, { timeout: 4000 })).toBeVisible();
  expect(screen.getByText('Last week')).toBeVisible();
  expect(screen.getAllByLabelText('up 1 on the week before').length).toBeGreaterThan(0);
  expect(screen.getByText('40 / 150 min')).toBeVisible();
  // Opening it reads the bell's notice.
  await waitFor(() => expect(memoryKv.get(weeklyReviewShownKey('me'))).toBe(thisWeek));

  await fireEvent.press(screen.getByRole('button', { name: /^Bench Press/ }));
  expect(mockRouter.back).toHaveBeenCalled();
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/training/exercise/[id]',
    params: { id: 'bench' },
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
  expect(screen.getByText('2 weeks ago')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  expect(screen.getByText('This week')).toBeVisible();
  expect(screen.getByText('Nothing logged yet this week.')).toBeVisible();
});

it('lists the release, the weekly review and an administrator’s requests in the bell', async () => {
  mockUser = { ...mockUser, is_admin: true };
  await show(<NotificationsBell />);
  const bell = await screen.findByRole(
    'button',
    { name: 'Notifications, 3 unread' },
    { timeout: 4000 },
  );
  await fireEvent.press(bell);
  expect(await screen.findByText(`Relay ${version}`)).toBeVisible();
  expect(screen.getByText('Weekly review')).toBeVisible();
  expect(screen.getByText(/asked for a password reset/)).toBeVisible();

  await fireEvent.press(
    screen.getByRole('button', { name: `View Relay ${version} release notes` }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith('/release-notes');
  await waitFor(() => expectSaved({ release_seen: version }));
});

it('closing What’s new dismisses it for the account', async () => {
  await show(<ReleaseNotesOverHome />);
  expect(await screen.findByText('Changes', {}, { timeout: 4000 })).toBeVisible();
  await fireEvent.press(screen.getByText('Close it'));
  expect(screen.queryByText('Changes')).toBeNull();
  expect(memoryKv.get(releaseSeenKey('me', version))).toBe('1');
  await waitFor(() => expectSaved({ release_seen: version }));
});

/** What's new pushed over Home, whose bell keeps the account's notices loaded. */
function ReleaseNotesOverHome() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <AccountNotices userId="me" />
      <Text onPress={() => setOpen(false)}>Close it</Text>
      {open && <ReleaseNotesScreen />}
    </>
  );
}

/** Signs an account in for the notices: what it reads, as text. */
function AccountNotices({ userId }: { userId: string }) {
  const { notices } = useAppNotices(userId);
  return <Text>{`${userId}: ${notices?.release_seen ?? 'none'}`}</Text>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it('a save that finishes after switching accounts never reaches the next account', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reply = deferred<unknown>();
  jest.mocked(request).mockImplementationOnce(() => reply.promise as Promise<never>);
  const a = await render(
    <QueryClientProvider client={client}>
      <AccountNotices userId="a" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('a: none')).toBeVisible();
  recordAppNotices(client, 'a', { release_seen: '1.4.0' });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  // A signs out and B signs in before A's save answers.
  await a.unmount();
  client.clear();
  await render(
    <QueryClientProvider client={client}>
      <AccountNotices userId="b" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('b: none')).toBeVisible();
  await act(async () => reply.resolve({ release_seen: '1.4.0', weekly_review_seen: null }));
  expect(screen.getByText('b: none')).toBeVisible();
  expect(client.getQueryData(['app-notices', 'b'])).toEqual(notices);
  expect(request).toHaveBeenCalledTimes(1);
});

it('keeps a marker until the server has it, and an older answer never rolls one back', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(request).mockRejectedValueOnce(new TypeError('Network request failed'));
  const view = await render(
    <QueryClientProvider client={client}>
      <AccountNotices userId="a" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('a: none')).toBeVisible();
  recordAppNotices(client, 'a', { release_seen: '1.10.0' });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(screen.getByText('a: 1.10.0')).toBeVisible();
  expect(memoryKv.get('relay.app-notices.pending:a')).toBe('{"release_seen":"1.10.0"}');

  // Next visit: the marker is sent again; the server's older copy can't undo it.
  await view.unmount();
  jest
    .mocked(request)
    .mockResolvedValueOnce({ release_seen: '1.9.0', weekly_review_seen: null } as never);
  await render(
    <QueryClientProvider client={client}>
      <AccountNotices userId="a" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(memoryKv.has('relay.app-notices.pending:a')).toBe(false));
  expect(screen.getByText('a: 1.10.0')).toBeVisible();
});

it('records no release newer than the app, while the phone remembers the one it showed', async () => {
  mockAppVersion = '1.0.0';
  await show(<ReleaseNotesOverHome />);
  expect(await screen.findByText('Changes', {}, { timeout: 4000 })).toBeVisible();
  await fireEvent.press(screen.getByText('Close it'));
  expect(screen.queryByText('Changes')).toBeNull();
  expect(memoryKv.get(releaseSeenKey('me', version))).toBe('1');
  await waitFor(() => expectSaved({ release_seen: '1.0.0' }));
});

it('keeps each account’s launch prompt for the visit when switching accounts', () => {
  openLaunchPrompt('a', 'release');
  expect(launchPromptOpened('b')).toBeNull();
  // B opens nothing: A keeps its own.
  expect(launchPromptOpened('a')).toBe('release');
  openLaunchPrompt('b', 'weekly-review');
  expect(launchPromptOpened('a')).toBe('release');
  expect(launchPromptOpened('b')).toBe('weekly-review');
});
