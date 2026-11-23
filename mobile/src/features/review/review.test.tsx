import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
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
import { apiGet, apiSend } from '../../data/api';
import { NotificationsBell } from '../social/NotificationsBell';
import { LaunchNotices } from './LaunchNotices';
import { resetNoticeMemory } from './noticeMemory';
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
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/authorisedImage', () => ({ useAuthorisedImage: () => null }));
const mockStore = new Map<string, string>();
jest.mock('../../data/deviceStorage', () => ({
  deviceStorage: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => mockStore.set(key, value),
    removeItem: (key: string) => mockStore.delete(key),
  },
}));
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
  mockStore.clear();
  resetNoticeMemory();
  notices = { release_seen: null, weekly_review_seen: null };
  mockUser = {
    id: 'me',
    username: 'preview',
    display_name: 'Preview',
    profile_photo_url: null,
    is_admin: false,
    created_at: '2025-01-01T00:00:00Z',
  } as User;
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
    ...notices,
    ...(body as object),
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
  mockStore.set(releaseSeenKey('me', version), '1');
  mockRouter.push.mockClear();
  await show(<LaunchNotices />);
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/weekly-review'));
  expect(apiSend).toHaveBeenCalledWith('/api/app-notices', 'PUT', {
    weekly_review_seen: thisWeek,
  });
  expect(mockStore.get(weeklyReviewShownKey('me'))).toBe(thisWeek);
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
  await waitFor(() => expect(mockStore.get(weeklyReviewShownKey('me'))).toBe(thisWeek));

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
  expect(apiSend).toHaveBeenCalledWith('/api/app-notices', 'PUT', { release_seen: version });
});

it('closing What’s new dismisses it for the account', async () => {
  const screenView = await show(<ReleaseNotesScreen />);
  expect(await screen.findByText('Changes', {}, { timeout: 4000 })).toBeVisible();
  await screenView.unmount();
  expect(mockStore.get(releaseSeenKey('me', version))).toBe('1');
  expect(apiSend).toHaveBeenCalledWith('/api/app-notices', 'PUT', { release_seen: version });
});
