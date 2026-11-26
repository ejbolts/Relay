import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { commentTime } from '../../../../frontend/src/commentDisplay';
import { feedStats } from '../../../../frontend/src/friendFeedData';
import { connectionDate } from '../../../../frontend/src/sharedProfileDisplay';
import { VISIBILITY_CONFIRM } from '../../../../frontend/src/sharingChoices';
import type {
  FriendConnections,
  FriendFeed,
  SharedProfile,
  Timeline,
  TrackedWorkout,
  User,
  WorkoutComment,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { ApiError, apiGet, apiSend, request } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { pendingActions } from '../../ui/pendingActions';
import { ToastHost } from '../../ui/Toast';
import { FriendQrSheet } from './FriendQrSheet';
import { FriendsActivityCard } from './FriendsActivityCard';
import * as linkedScroll from './linkedScroll';
import { ProfileScreen } from './ProfileScreen';
import { commentSpoken, CommentsSheet } from './Comments';
import { expectOfflineUntilOnline } from '../../testing/offlineScreen';
import { SharedWorkoutScreen } from './SharedWorkoutScreen';
import { SharingSettingsScreen } from './SharingSettingsScreen';
import { SocialScreen } from './SocialScreen';

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
  serverOrigin: () => 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
  request: jest.fn(),
}));
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(async () => 'token'),
  forgetSessionTokenIf: jest.fn(async () => undefined),
}));
const mockUser = {
  id: 'me',
  username: 'preview',
  display_name: 'Preview',
  profile_photo_url: null,
  created_at: '2026-11-01T00:00:00Z',
} as unknown as User;
// The session the toasts see; switchAccount signs another account in.
const mockSession = {
  status: { kind: 'signed-in', user: { id: 'me' } } as { kind: string; user?: { id: string } },
  listeners: new Set<() => void>(),
};
function switchAccount(id: string) {
  mockSession.status = { kind: 'signed-in', user: { id } };
  mockSession.listeners.forEach((listener) => listener());
}
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('../../data/authorisedImage', () => ({
  useAuthorisedImage: () => null,
  loadAuthorisedImage: jest.fn(async () => null),
}));
const mockUpdateUser = jest.fn();
jest.mock('../../session/SessionProvider', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useUser: () => mockUser,
    useOptionalSession: () => ({
      updateUser: mockUpdateUser,
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
// The native menu draws its items as buttons here.
jest.mock('../../ui/MenuButton', () => {
  const actual = jest.requireActual<typeof import('../../ui/MenuButton')>('../../ui/MenuButton');
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
const mockCamera: { onBarcodeScanned?: (result: { data: string }) => void } = {};
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  CameraView: (props: { onBarcodeScanned: (result: { data: string }) => void }) => {
    mockCamera.onBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
}));

const today = localDate();
const alex = { id: 'alex', display_name: 'Alex Morgan', profile_photo_url: null };
const exercise = (id: string, name: string) => ({
  id,
  name,
  muscle_group: 'Chest',
  category: 'strength',
  kind: 'strength',
});
const movement = (id: string, name: string, weight: number) => ({
  id: `m-${id}`,
  order_index: 0,
  exercise: exercise(id, name),
  machine_photos: [],
  sets: [
    { id: `s-${id}-1`, reps: 8, weight_kg: weight, completed: true, set_type: 'working' },
    { id: `s-${id}-2`, reps: 8, weight_kg: weight, completed: true, set_type: 'working' },
  ],
});
const upper = {
  id: 'w1',
  name: 'Upper body',
  workout_date: today,
  category: 'upper',
  workout_type_id: null,
  notes: null,
  duration_minutes: 62,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: `${today}T08:00:00Z`,
  updated_at: '',
  photos: [],
  movements: [
    movement('bench', 'Bench Press', 70),
    movement('row', 'Barbell Row', 60),
    movement('ohp', 'Overhead Press', 40),
    movement('curl', 'Bicep Curl', 14),
  ],
} as unknown as TrackedWorkout;
const reactions = {
  counts: [{ reaction: 'fire' as const, count: 2 }],
  yours: null,
  comment_count: 1,
};
const timeline: Timeline = {
  items: [{ member: { ...alex, is_you: false }, workout: upper, reactions, record_count: 1 }],
  has_more: true,
};
const friends: FriendConnections = {
  friends: [
    {
      ...alex,
      since: '2026-10-01T10:00:00Z',
      latest: null,
      recent_workout_count: 3,
      training_dates: [today],
      presence: { online: true, last_active_at: null, workout: null },
    },
  ],
  requests: [
    {
      id: 'jordan',
      display_name: 'Jordan Lee',
      profile_photo_url: null,
      since: '2026-11-20T10:00:00Z',
    },
  ],
  sent: [],
  blocked: [],
};
const casey: SharedProfile = {
  id: 'casey',
  display_name: 'Casey Kim',
  profile_photo_url: null,
  member_since: '2026-09-01T10:00:00Z',
  visibility: 'followers',
  is_you: false,
  friend_status: 'none',
  can_view: false,
  workout_count: null,
  recent_workout_count: null,
  last_workout_date: null,
  shares: null,
  body_weight: null,
  goals: null,
  cardio_sessions: null,
};

let client: QueryClient;
afterEach(() => {
  jest.mocked(linkedScroll.useLinkedScroll).mockRestore?.();
  client.clear();
  pendingActions.clear();
  if (mockSession.status.user?.id !== 'me') switchAccount('me');
});
beforeEach(() => {
  jest.clearAllMocks();
  // A once-only answer a failed test left unused mustn't reach the next test.
  jest.mocked(request).mockReset();
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sharing/timeline')) return timeline;
    if (path === '/api/sharing/friends') return friends;
    if (path.startsWith('/api/sharing/suggestions'))
      return { profiles: [], total: 0, page: 1, page_size: 10 };
    if (path === '/api/sharing') return { visibility: 'public', pending_requests: 1 };
    throw new Error(`Unexpected GET ${path}`);
  });
});

async function show(children: ReactNode) {
  // No garbage-collection timers, so Jest can exit when the tests finish.
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const tree = (content: ReactNode) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        {content}
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
  const view = await render(tree(children));
  /** Shows other screens under the same toast host, as navigating does. */
  return { rerender: (content: ReactNode) => view.rerender(tree(content)) };
}

test("the feed shows friends' workouts, and a reaction is sent and shown", async () => {
  jest.mocked(apiSend).mockResolvedValue({
    counts: [
      { reaction: 'fire', count: 2 },
      { reaction: 'strong', count: 1 },
    ],
    yours: 'strong',
  });
  await show(<SocialScreen />);
  expect(await screen.findByText('Upper body')).toBeVisible();
  expect(screen.getByText('1 friend')).toBeVisible();
  expect(screen.getByText(feedStats(upper, 'kg').join(' · '))).toBeVisible();
  expect(feedStats(upper, 'kg')[0]).toBe('1h 2min');
  expect(screen.getByText('1 PR')).toBeVisible();
  // Three exercises with their pictures, then the rest counted, which opens the workout.
  for (const name of ['Bench Press', 'Barbell Row', 'Overhead Press'])
    expect(screen.getByText(name)).toBeVisible();
  expect(screen.queryByText('Bicep Curl')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Open Alex Morgan’s Upper body workout, with 1 more exercise',
    }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/social/workout/[id]',
      params: expect.objectContaining({ id: 'w1' }),
    }),
  );

  await fireEvent.press(screen.getByRole('button', { name: 'React to Alex Morgan’s Upper body' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Strong' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/workouts/w1/reaction', 'PUT', {
      reaction: 'strong',
    }),
  );
  expect(
    await screen.findByRole('button', {
      name: 'Your reaction to Alex Morgan’s Upper body: Strong. Change reaction',
    }),
  ).toBeVisible();
  // The comment count is kept, since the reaction answer leaves it out.
  expect(
    screen.getByRole('button', { name: '1 comment on Alex Morgan’s Upper body' }),
  ).toBeVisible();

  await fireEvent.press(
    screen.getByRole('button', { name: 'Open Alex Morgan’s Upper body workout' }),
  );
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/social/workout/[id]',
    params: { id: 'w1', member: 'alex', date: today },
  });
});

test('Friends lists requests and friends, and accepting a request asks the server', async () => {
  jest.mocked(apiSend).mockResolvedValue({ status: 'friends' });
  await show(<SocialScreen />);
  expect(await screen.findByLabelText('Social sections, 1 friend request')).toBeVisible();
  await fireEvent.press(await screen.findByRole('tab', { name: 'Friends' }));
  expect(screen.getByText('Friend requests')).toBeVisible();
  expect(screen.getByText(connectionDate('request', '2026-11-20T10:00:00Z'))).toBeVisible();
  expect(screen.getByText('Active now')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Accept Jordan Lee' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/friends/jordan/accept', 'POST'),
  );
  // The Search people header opens the QR code sheet, and the Social header reaches Settings.
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  await fireEvent.press(screen.getByRole('button', { name: 'QR code' }));
  expect(await screen.findByLabelText('QR code to add Preview as a friend')).toBeVisible();
});

test('a private profile is asked to share before it sees Social', async () => {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/friends')
      return { locked: true, friends: [], requests: [], sent: [], blocked: [] };
    throw new ApiError(403, 'Share your profile.', 'sharing_required');
  });
  await show(<SocialScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Choose who can see your profile' }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith('/social/sharing');
});

test('an invite sends the friend request once, with Undo', async () => {
  let status: SharedProfile['friend_status'] = 'none';
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/casey') return { ...casey, friend_status: status };
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (method === 'POST') status = 'outgoing';
    return path.endsWith('/casey') && method === 'POST' ? { status: 'outgoing' } : undefined;
  });
  await show(<ProfileScreen profileId="casey" invite />);
  // The toast fades in, so it is on screen before it is fully visible.
  expect(await screen.findByText('Friend request sent to Casey Kim')).toBeOnTheScreen();
  expect(apiSend).toHaveBeenCalledTimes(1);
  expect(apiSend).toHaveBeenCalledWith('/api/sharing/friends/casey', 'POST');
  expect(mockRouter.setParams).toHaveBeenCalledWith({ invite: undefined });
  expect(await screen.findByText('Friend request sent')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenLastCalledWith('/api/sharing/friends/casey', 'DELETE'),
  );
  expect(apiSend).toHaveBeenCalledTimes(2);
});

test('an invite that answers after another account signs in shows nothing there', async () => {
  let answer: (value: unknown) => void = () => undefined;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/casey') return casey;
    throw new Error(`Unexpected GET ${path}`);
  });
  jest
    .mocked(apiSend)
    .mockImplementation((_path: string, method: string) =>
      method === 'POST' ? new Promise((resolve) => (answer = resolve)) : Promise.resolve(undefined),
    );
  await show(<ProfileScreen profileId="casey" invite />);
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/sharing/friends/casey', 'POST'));
  // Another account signs in while the request is on its way.
  await act(async () => switchAccount('other'));
  await act(async () => answer({ status: 'outgoing' }));
  expect(screen.queryByText('Friend request sent to Casey Kim')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  expect(apiSend).toHaveBeenCalledTimes(1);
});

test('a removed friend stays removed when the profile opens again, and is sent once', async () => {
  let status: SharedProfile['friend_status'] = 'friends';
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/casey') return { ...casey, friend_status: status };
    if (path === '/api/sharing/friends') return friends;
    if (path === '/api/sharing') return { visibility: 'public', pending_requests: 0 };
    if (path.startsWith('/api/sharing/')) return [];
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(apiSend).mockImplementation(async (_path: string, method: string) => {
    if (method === 'DELETE') status = 'none';
    return undefined;
  });
  const view = await show(<ProfileScreen profileId="casey" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove friend' }));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();

  // Leave the profile and open it again while the Undo still shows.
  await view.rerender(null);
  await view.rerender(<ProfileScreen profileId="casey" />);
  expect(await screen.findByRole('button', { name: 'Add friend' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Remove friend' })).toBeNull();
  expect(apiSend).not.toHaveBeenCalledWith('/api/sharing/friends/casey', 'DELETE');

  // The toast ends without Undo: the removal is sent, once.
  await fireEvent.press(screen.getByRole('button', { name: 'Removed Casey Kim. Dismiss' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/sharing/friends/casey', 'DELETE'));
  expect(jest.mocked(apiSend).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(
    1,
  );
});

test('a confirmed removal stays removed when the refresh after it fails', async () => {
  let deleted = false;
  let profileReads = 0;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/casey') {
      profileReads += 1;
      // The server is unavailable for the refresh after the removal.
      if (deleted) throw new ApiError(503, 'Relay is busy. Try again.');
      return { ...casey, friend_status: 'friends' };
    }
    if (path === '/api/sharing/friends') return friends;
    if (path === '/api/sharing') return { visibility: 'public', pending_requests: 0 };
    if (path.startsWith('/api/sharing/')) return [];
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(apiSend).mockImplementation(async (_path: string, method: string) => {
    if (method === 'DELETE') deleted = true;
    return undefined;
  });
  await show(<ProfileScreen profileId="casey" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove friend' }));
  const reads = profileReads;
  await fireEvent.press(screen.getByRole('button', { name: 'Removed Casey Kim. Dismiss' }));
  await waitFor(() => expect(profileReads).toBeGreaterThan(reads));
  // The refresh failed, but the profile still shows the removal and can't remove again.
  expect(await screen.findByRole('button', { name: 'Add friend' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Remove friend' })).toBeNull();
  expect(jest.mocked(apiSend).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(
    1,
  );
});

test('your own profile edits inline, copies your account UUID, and opens sharing choices', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let displayName = 'Preview';
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/me')
      return { ...casey, id: 'me', display_name: displayName, is_you: true, visibility: 'public' };
    if (path.startsWith('/api/sharing/')) return [];
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(request).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/profile' && init?.method === 'PATCH') {
      const changes = JSON.parse(init.body as string) as { display_name?: string };
      if (changes.display_name) displayName = changes.display_name;
      return { ...mockUser, ...changes };
    }
    throw new Error(`Unexpected request ${path}`);
  });
  await show(<ProfileScreen profileId="me" />);

  // Account UUID is shown and copied on the profile screen with a toast confirmation.
  expect(await screen.findByText('Account UUID')).toBeVisible();
  expect(screen.getByText('me')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Copy account UUID' }));
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('me'));
  expect(await screen.findByText('UUID copied.')).toBeOnTheScreen();

  // Sharing choices still open from the profile header.
  await fireEvent.press(screen.getByRole('button', { name: 'Sharing: Public' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/social/sharing');
  mockRouter.push.mockClear();

  // Edit profile opens inline without leaving the profile screen.
  await fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Username, preview, locked')).toBeVisible();

  // Cancel discards drafts and returns to read-only header.
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Draft Name');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Preview')).toBeVisible();
  expect(screen.queryByLabelText('Name')).toBeNull();

  // Saving a new name and sex confirms sex once, updates the profile and shows a toast.
  await fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
  await fireEvent.press(screen.getByRole('tab', { name: 'Female' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  expect(alert).toHaveBeenCalledWith(
    'Save your sex as Female?',
    expect.stringContaining('only an administrator can change it'),
    expect.any(Array),
  );
  expect(profileWrites()).toEqual([]);
  await act(async () => {
    alert.mock.calls[0][2]!.find((button) => button.text === 'Save')!.onPress!();
  });
  // Sent with the session's own token.
  await waitFor(() =>
    expect(profileWrites()).toEqual([
      ['/api/profile', 'PATCH', { display_name: 'Sam', sex: 'female' }, 'token'],
    ]),
  );
  expect(mockUpdateUser).toHaveBeenCalledWith(
    expect.objectContaining({ display_name: 'Sam', sex: 'female' }),
  );
  expect(await screen.findByText('Profile saved.')).toBeOnTheScreen();
  expect(screen.getByText('Sam')).toBeVisible();
  expect(screen.queryByText('Preview')).toBeNull();
  alert.mockRestore();
  jest.mocked(request).mockReset();
});

test('saving a profile updates the cached header before edit mode closes, even if a stale refresh resolves later', async () => {
  let profileReads = 0;
  const staleRefresh = deferred<SharedProfile>();
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/me') {
      profileReads += 1;
      if (profileReads === 1) {
        return {
          ...casey,
          id: 'me',
          display_name: 'Old Name',
          profile_photo_url: '/api/sharing/profiles/me/photo?v=v1',
          is_you: true,
          visibility: 'public',
        };
      }
      return staleRefresh.promise;
    }
    if (path.startsWith('/api/sharing/')) return [];
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(request).mockImplementation(async () => ({
    ...mockUser,
    display_name: 'New Name',
    profile_photo_url: '/api/profile/photo?v=v1',
  }));
  try {
    await show(<ProfileScreen profileId="me" />);
    expect(await screen.findByText('Old Name')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'New Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));

    // Immediately after leaving edit mode (while the refresh query is still pending), the header
    // already shows the saved name and keeps the shared photo URL with the matching version.
    expect(await screen.findByText('Profile saved.')).toBeOnTheScreen();
    expect(screen.getByText('New Name')).toBeVisible();
    expect(screen.queryByText('Old Name')).toBeNull();
    const cached = client.getQueryData<SharedProfile>(['social', 'profile', 'me']);
    expect(cached?.display_name).toBe('New Name');
    expect(cached?.profile_photo_url).toBe('/api/sharing/profiles/me/photo?v=v1');
  } finally {
    jest.mocked(request).mockReset();
  }
});

test('inline profile editing surfaces validation and conflict errors without leaving the form', async () => {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/me')
      return { ...casey, id: 'me', display_name: 'Preview', is_you: true, visibility: 'public' };
    throw new Error(`Unexpected GET ${path}`);
  });
  jest
    .mocked(request)
    .mockRejectedValueOnce(new ApiError(409, 'That name is taken.', 'display_name_taken'));
  await show(<ProfileScreen profileId="me" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));

  await fireEvent.changeText(screen.getByLabelText('Name'), '   ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(profileWrites()).toEqual([]);

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Taken');
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Another account already uses that name. Add a surname, initial or nickname.',
  );
  expect(screen.getByLabelText('Name')).toBeVisible();
});

/** The profile writes the editor sent, as [path, method, body, token]. */
function profileWrites() {
  return jest
    .mocked(request)
    .mock.calls.filter(([path]) => path.startsWith('/api/profile'))
    .map(([path, init, token]) => [
      path,
      init?.method,
      init?.body ? JSON.parse(init.body as string) : undefined,
      token,
    ]);
}

/** Your own profile from the server, for the editor tests. */
function ownProfileReads() {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/me')
      return { ...casey, id: 'me', display_name: 'Preview', is_you: true, visibility: 'public' };
    if (path.startsWith('/api/sharing/')) return [];
    throw new Error(`Unexpected GET ${path}`);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

test('a sex confirmation answered after another account signs in saves nothing', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  ownProfileReads();
  await show(<ProfileScreen profileId="me" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
  await fireEvent.press(screen.getByRole('tab', { name: 'Female' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  expect(alert).toHaveBeenCalledTimes(1);

  await act(async () => switchAccount('someone-else'));
  // The draft went with the account that made it.
  expect(screen.queryByLabelText('Name')).toBeNull();
  await act(async () => {
    alert.mock.calls[0][2]!.find((button) => button.text === 'Save')!.onPress!();
  });
  expect(profileWrites()).toEqual([]);
  expect(sessionToken).not.toHaveBeenCalled();
  expect(mockUpdateUser).not.toHaveBeenCalled();
  alert.mockRestore();
});

test('a profile save is never sent with, or applied to, an account that signed in meanwhile', async () => {
  ownProfileReads();
  await show(<ProfileScreen profileId="me" />);

  // A switch while the token is read: nothing is sent with the new account's token.
  const token = deferred<string>();
  jest.mocked(sessionToken).mockImplementationOnce(() => token.promise);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  await act(async () => switchAccount('someone-else'));
  await act(async () => token.resolve('their-token'));
  expect(profileWrites()).toEqual([]);

  // A switch while the save is in flight: the answer lands in neither the session nor the profile.
  await act(async () => switchAccount('me'));
  const saved = deferred<User>();
  jest.mocked(request).mockImplementationOnce(() => saved.promise as Promise<never>);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() =>
    expect(profileWrites()).toEqual([['/api/profile', 'PATCH', { display_name: 'Sam' }, 'token']]),
  );
  await act(async () => switchAccount('someone-else'));
  await act(async () => saved.resolve({ ...mockUser, display_name: 'Sam' } as User));
  expect(mockUpdateUser).not.toHaveBeenCalled();
  expect(screen.queryByText('Profile saved.')).toBeNull();
});

test('a refused profile save forgets only the token it was sent with', async () => {
  ownProfileReads();
  jest.mocked(request).mockRejectedValueOnce(new ApiError(401, 'Sign in again.'));
  await show(<ProfileScreen profileId="me" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() =>
    expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.test', 'token'),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again.');

  // The token is gone now, so saving again says why instead of doing nothing.
  jest.mocked(sessionToken).mockResolvedValueOnce(null);
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to continue.');
  expect(profileWrites()).toHaveLength(1);
  expect(screen.getByLabelText('Name')).toBeVisible();
});

test('saving only a sex leaves the name alone, and a chosen sex can be cleared', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  ownProfileReads();
  jest.mocked(request).mockImplementation(async (_path: string, init?: RequestInit) => ({
    ...mockUser,
    ...JSON.parse(init!.body as string),
  }));
  const originalName = mockUser.display_name;
  try {
    await show(<ProfileScreen profileId="me" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));

    // Clear takes back an unsaved choice and keeps the name draft.
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
    await fireEvent.press(screen.getByRole('tab', { name: 'Female' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear sex' }));
    expect(screen.getByRole('tab', { name: 'Female' })).not.toBeSelected();
    expect(screen.queryByRole('button', { name: 'Clear sex' })).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Sam');
    await fireEvent.changeText(screen.getByLabelText('Name'), originalName);

    // Renamed on another device after the editor opened; the name here was never touched.
    mockUser.display_name = 'Renamed elsewhere';
    await fireEvent.press(screen.getByRole('tab', { name: 'Female' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    await act(async () => {
      alert.mock.calls[0][2]!.find((button) => button.text === 'Save')!.onPress!();
    });
    await waitFor(() =>
      expect(profileWrites()).toEqual([['/api/profile', 'PATCH', { sex: 'female' }, 'token']]),
    );
  } finally {
    mockUser.display_name = originalName;
    jest.mocked(request).mockReset();
    alert.mockRestore();
  }
});

/** Records the profile's section jumps and settle calls, around the real scrolling. */
const realLinkedScroll = linkedScroll.useLinkedScroll;
function watchJumps() {
  const original = realLinkedScroll;
  const jumps: { view: unknown; ready: boolean }[] = [];
  let settled = 0;
  const spy = jest.spyOn(linkedScroll, 'useLinkedScroll').mockImplementation(() => {
    const real = original();
    return {
      ...real,
      scrollToSection: (view, animated, ready = false) => {
        jumps.push({ view, ready });
        real.scrollToSection(view, animated, ready);
      },
      sectionReady: () => {
        settled += 1;
        real.sectionReady();
      },
    };
  });
  return { jumps, settled: () => settled, restore: () => spy.mockRestore() };
}

test('a machine photo in a friend’s profile history filters that friend’s history by the machine', async () => {
  const machinePhoto = {
    id: 'mp-lat',
    caption: 'Alex Lat Station',
    thumbnail_url: '/api/machine-photos/mp-lat/thumb',
    full_url: '/api/machine-photos/mp-lat/full',
    width: 800,
    height: 600,
  };
  const workoutWithMachine = {
    ...upper,
    id: 'w-lat',
    name: 'Pull day',
    movements: [
      {
        ...movement('lat', 'Lat Pulldown', 60),
        machine_photos: [machinePhoto],
      },
    ],
  } as unknown as TrackedWorkout;
  const friendProfile: SharedProfile = {
    ...casey,
    ...alex,
    friend_status: 'friends',
    can_view: true,
    cardio_sessions: [],
    shares: {
      notes: true,
      body_weight: false,
      body_sizes: false,
      goals: false,
      machine_photos: true,
    },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/alex') return friendProfile;
    if (path === '/api/sharing/profiles/alex/splits') return [];
    if (path === '/api/sharing/profiles/alex/lifts') return { selected: [], lifts: [] };
    if (path === '/api/sharing/profiles/alex/workout-filters') {
      return { exercises: [], machines: [{ id: 'mp-lat', caption: 'Alex Lat Station' }] };
    }
    if (path.startsWith('/api/sharing/profiles/alex/workouts')) {
      // The machine's results differ from the day's, so the list visibly changes.
      const workouts = path.includes('machine_photo_id=mp-lat')
        ? [{ ...workoutWithMachine, id: 'w-lat-2', name: 'Back day' }, workoutWithMachine]
        : [workoutWithMachine];
      return { total: workouts.length, workouts, personal_records: [], reactions: {} };
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  const watch = watchJumps();
  // Opened at the workout, so its day is already a filter: the machine is added to it, as on the web.
  await show(
    <ProfileScreen
      profileId="alex"
      targetWorkout={{ id: 'w-lat', workout_date: workoutWithMachine.workout_date }}
    />,
  );
  // On the Workouts tab, which the machine filter keeps.
  await fireEvent.press(await screen.findByRole('tab', { name: 'Workouts' }));
  await fireEvent.press(await screen.findByRole('imagebutton', { name: 'View Alex Lat Station' }));
  const settledBefore = watch.settled();
  await fireEvent.press(
    await screen.findByRole('button', { name: 'All workouts on this machine' }),
  );
  // The history is brought into view, and the jump finishes once the machine's workouts load.
  expect(watch.jumps).toEqual([{ view: expect.anything(), ready: false }]);
  expect(await screen.findByText('Back day')).toBeVisible();
  await waitFor(() => expect(watch.settled()).toBeGreaterThan(settledBefore));
  expect(screen.getByRole('tab', { name: 'Workouts' })).toBeSelected();
  expect(apiGet).toHaveBeenCalledWith(
    expect.stringMatching(
      /machine_photo_id=mp-lat.*kind=strength|kind=strength.*machine_photo_id=mp-lat/,
    ),
    expect.anything(),
  );
  watch.restore();
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `start_date=${workoutWithMachine.workout_date}.*machine_photo_id=mp-lat|machine_photo_id=mp-lat.*start_date=${workoutWithMachine.workout_date}`,
        ),
      ),
      expect.anything(),
    ),
  );
  expect(
    await screen.findByRole('button', { name: 'Filter workouts, 2 filters on' }),
  ).toBeVisible();
  // Reopening the same machine photo while already filtered to it hides the redundant filter button.
  await fireEvent.press(await screen.findByText('Pull day'));
  await fireEvent.press(await screen.findByRole('imagebutton', { name: 'View Alex Lat Station' }));
  expect(screen.queryByRole('button', { name: 'All workouts on this machine' })).toBeNull();
});

test('SharedWorkoutScreen opens a friend’s profile filtered to a machine, and keeps Training’s machine filter for own workouts', async () => {
  const machinePhoto = {
    id: 'mp-leg',
    caption: 'Alex Leg Press',
    thumbnail_url: '/api/machine-photos/mp-leg/thumb',
    full_url: '/api/machine-photos/mp-leg/full',
    width: 800,
    height: 600,
  };
  const workoutWithMachine = {
    ...upper,
    id: 'w-leg',
    name: 'Leg day',
    movements: [
      {
        ...movement('leg-press', 'Leg Press', 170),
        machine_photos: [machinePhoto],
      },
    ],
  } as unknown as TrackedWorkout;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sharing/profiles/alex/workouts'))
      return { total: 1, workouts: [workoutWithMachine], personal_records: [], reactions: {} };
    if (path.startsWith('/api/sharing/profiles/me/workouts'))
      return { total: 1, workouts: [workoutWithMachine], personal_records: [], reactions: {} };
    if (path === '/api/sharing/profiles/alex') return { ...casey, ...alex, can_view: true };
    if (path === '/api/sharing/profiles/me')
      return { ...casey, id: 'me', is_you: true, can_view: true };
    if (path.startsWith('/api/sharing/workouts/w-leg/comments'))
      return { total: 0, next_offset: null, items: [] };
    throw new Error(`Unexpected GET ${path}`);
  });

  // Friend's shared workout -> friend's profile filtered to that machine.
  const view = await show(<SharedWorkoutScreen workoutId="w-leg" memberId="alex" date={today} />);
  await fireEvent.press(await screen.findByRole('imagebutton', { name: 'View Alex Leg Press' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'All workouts on this machine' }),
  );
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/social/profile/[id]',
    params: { id: 'alex', machine: 'mp-leg' },
  });

  // Own workout in SharedWorkoutScreen -> Training's existing machine filter.
  mockRouter.push.mockClear();
  await view.rerender(<SharedWorkoutScreen workoutId="w-leg" memberId="me" date={today} />);
  await fireEvent.press(await screen.findByRole('imagebutton', { name: 'View Alex Leg Press' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'All workouts on this machine' }),
  );
  expect(mockRouter.push).toHaveBeenLastCalledWith(
    {
      pathname: '/training/machine/[id]',
      params: { id: 'mp-leg', caption: 'Alex Leg Press', exercise: 'Leg Press' },
    },
    { withAnchor: true },
  );
});

test('a machine link filters the history and brings it into view once a refresh grants access', async () => {
  const friendProfile: SharedProfile = {
    ...casey,
    ...alex,
    friend_status: 'friends',
    can_view: true,
    shares: {
      notes: true,
      body_weight: false,
      body_sizes: false,
      goals: false,
      machine_photos: true,
    },
  };
  // First friends-only, as a cached profile can be; the next read confirms access.
  let profileReads = 0;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/alex')
      return profileReads++ === 0 ? { ...friendProfile, can_view: false } : friendProfile;
    if (path === '/api/sharing/profiles/alex/splits') return [];
    if (path === '/api/sharing/profiles/alex/lifts') return { selected: [], lifts: [] };
    if (path === '/api/sharing/profiles/alex/workout-filters') {
      return { exercises: [], machines: [{ id: 'mp-leg', caption: 'Alex Leg Press' }] };
    }
    if (path.startsWith('/api/sharing/profiles/alex/workouts')) {
      return { total: 1, workouts: [upper], personal_records: [], reactions: {} };
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  const watch = watchJumps();
  await show(<ProfileScreen profileId="alex" targetMachine="mp-leg" />);
  await waitFor(() => expect(profileReads).toBe(1));
  expect(screen.queryByRole('button', { name: 'Filter workouts, 1 filter on' })).toBeNull();
  expect(watch.jumps).toEqual([]);

  await act(async () => client.invalidateQueries());
  expect(await screen.findByRole('button', { name: 'Filter workouts, 1 filter on' })).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(
    expect.stringContaining('machine_photo_id=mp-leg'),
    expect.anything(),
  );
  // One jump, to the history now shown, finished once its workouts have loaded.
  expect(watch.jumps).toEqual([{ view: expect.anything(), ready: expect.any(Boolean) }]);
  if (!watch.jumps[0].ready) await waitFor(() => expect(watch.settled()).toBeGreaterThan(0));
  watch.restore();
});

test('scanning a friend code opens their invite, and other codes say why not', async () => {
  const onScanned = jest.fn();
  await show(
    <FriendQrSheet visible onClose={jest.fn()} onChooseSharing={jest.fn()} onScanned={onScanned} />,
  );
  expect(await screen.findByLabelText('QR code to add Preview as a friend')).toBeVisible();
  await fireEvent.press(screen.getByRole('tab', { name: 'Scan' }));

  await waitFor(() => expect(mockCamera.onBarcodeScanned).toBeDefined());
  await waitFor(() => mockCamera.onBarcodeScanned!({ data: 'https://relay.test/#friend=me' }));
  expect(await screen.findByText('That’s your own code.')).toBeVisible();
  await waitFor(() => mockCamera.onBarcodeScanned!({ data: 'hello' }));
  expect(await screen.findByText('That isn’t a Relay friend code.')).toBeVisible();
  // A code made on another of the server's addresses still opens.
  await waitFor(() =>
    mockCamera.onBarcodeScanned!({ data: 'https://gym.example.com/#friend=alex' }),
  );
  expect(onScanned).toHaveBeenCalledWith('alex');
});

test('the QR code leaves out the invite only for an older server, never hiding a failure', async () => {
  const unreachable = new Error('Could not reach Relay. Check your connection, then try again.');
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/auth/friend-invite') throw unreachable;
    throw new Error(`Unexpected GET ${path}`);
  });
  const sheet = (
    <FriendQrSheet visible onClose={jest.fn()} onChooseSharing={jest.fn()} onScanned={jest.fn()} />
  );
  await show(sheet);
  expect(await screen.findByLabelText('QR code to add Preview as a friend')).toBeVisible();
  // No connection stays a failure: it is never turned into an answer from Relay.
  await waitFor(() =>
    expect(client.getQueryState(['social', 'friend-invite'])?.status).toBe('error'),
  );
  expect(client.getQueryData(['social', 'friend-invite'])).toBeUndefined();

  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/auth/friend-invite') throw new ApiError(404, 'Not found');
    throw new Error(`Unexpected GET ${path}`);
  });
  await act(async () => {
    await client.refetchQueries({ queryKey: ['social', 'friend-invite'] });
  });
  expect(client.getQueryData(['social', 'friend-invite'])).toEqual({ invite_code: null });
});

test("Home's card lists friends' latest sessions and opens Social", async () => {
  const feed: FriendFeed = {
    items: [{ friend: alex, workout: upper, reactions }],
    friends: 1,
    with_sessions: 1,
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sharing/feed')) return feed;
    throw new Error(`Unexpected GET ${path}`);
  });
  await show(<FriendsActivityCard />);
  expect(await screen.findByText('Upper body')).toBeVisible();
  expect(screen.getByText('Strength')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'See all' }));
  expect(mockRouter.navigate).toHaveBeenCalledWith('/social');
});

test('a shared workout shows its comments and sends a reply', async () => {
  const comment: WorkoutComment = {
    id: 'c1',
    author: alex,
    body: 'Strong pressing!',
    parent_id: null,
    reply_to: null,
    created_at: `${today}T09:30:00Z`,
    edited_at: null,
    can_edit: false,
    can_delete: false,
    reactions: { counts: [], yours: null },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sharing/profiles/alex/workouts'))
      return { total: 1, workouts: [upper], personal_records: [], reactions: { w1: reactions } };
    if (path === '/api/sharing/profiles/alex') return { ...casey, ...alex, can_view: true };
    if (path.startsWith('/api/sharing/workouts/w1/comments'))
      return { total: 1, next_offset: null, items: [comment] };
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(apiSend).mockResolvedValue({ ...comment, id: 'c2' });
  await show(<SharedWorkoutScreen workoutId="w1" memberId="alex" date={today} />);
  expect(await screen.findByText('Strong pressing!')).toBeVisible();
  expect(screen.getByText(commentTime(comment.created_at))).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Reply' }));
  expect(screen.getByText('Replying to @Alex Morgan')).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Comment'), 'Thanks!');
  await fireEvent.press(screen.getByRole('button', { name: 'Send comment' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/workouts/w1/comments', 'POST', {
      body: 'Thanks!',
      reply_to_id: 'c1',
      reaction: null,
    }),
  );
});

test('profile sharing shows the visibility status badge and selectable visibility cards', async () => {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing')
      return {
        visibility: 'public',
        share_notes: true,
        share_body_weight: true,
        share_body_sizes: false,
        share_goals: true,
        share_machine_photos: false,
        share_online_status: true,
        share_live_workouts: true,
      };
    throw new Error(`Unexpected GET ${path}`);
  });
  await show(<SharingSettingsScreen />);
  // The pill is uppercased by its style, beside the Public choice.
  expect(await screen.findAllByText('Public')).toHaveLength(2);
  expect(screen.getByRole('radio', { name: /Public/ })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  await fireEvent.press(screen.getByRole('radio', { name: /Friends only/ }));
  expect(await screen.findByRole('button', { name: VISIBILITY_CONFIRM.followers })).toBeVisible();
});

const comment = (id: string, author = alex, body = `Comment ${id}`): WorkoutComment => ({
  id,
  author,
  body,
  parent_id: null,
  reply_to: null,
  created_at: `${today}T09:30:00Z`,
  edited_at: null,
  can_edit: false,
  can_delete: false,
  reactions: { counts: [], yours: null },
});
const jordan = { id: 'jordan', display_name: 'Jordan Lee', profile_photo_url: null };
function workoutWithComments(
  pages: Record<number, { items: WorkoutComment[]; next: number | null }>,
) {
  const total = Object.values(pages).reduce((sum, page) => sum + page.items.length, 0);
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sharing/profiles/alex/workouts'))
      return { total: 1, workouts: [upper], personal_records: [], reactions: { w1: reactions } };
    if (path === '/api/sharing/profiles/alex') return { ...casey, ...alex, can_view: true };
    const offset = /\/api\/sharing\/workouts\/w1\/comments\?offset=(\d+)/.exec(path);
    if (offset) {
      const page = pages[Number(offset[1])];
      return { total, next_offset: page.next, items: page.items };
    }
    throw new Error(`Unexpected GET ${path}`);
  });
}

test('a reply waiting offline posts to its comment, whatever is chosen meanwhile', async () => {
  const first = comment('c1', alex, 'Strong pressing!');
  const second = comment('c2', jordan, 'Nice session');
  workoutWithComments({ 0: { items: [first, second], next: null } });
  jest.mocked(apiSend).mockResolvedValue({ ...first, id: 'c3' });
  await show(<SharedWorkoutScreen workoutId="w1" memberId="alex" date={today} />);
  expect(await screen.findByText('Strong pressing!')).toBeVisible();
  try {
    await fireEvent.press(screen.getAllByRole('button', { name: 'Reply' })[0]);
    await fireEvent.changeText(screen.getByLabelText('Comment'), 'Thanks!');
    onlineManager.setOnline(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Send comment' }));
    // A menu opened before (or while) the send waits can't move the reply to another comment.
    await fireEvent(screen.getByLabelText(commentSpoken(second)), 'accessibilityAction', {
      nativeEvent: { actionName: 'Reply' },
    });
    expect(screen.getByText('Replying to @Alex Morgan')).toBeVisible();
    expect(apiSend).not.toHaveBeenCalled();
  } finally {
    await act(async () => onlineManager.setOnline(true));
  }
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/workouts/w1/comments', 'POST', {
      body: 'Thanks!',
      reply_to_id: 'c1',
      reaction: null,
    }),
  );
  expect(apiSend).toHaveBeenCalledTimes(1);
});

test('a comment notification loads later pages and scrolls to its comment', async () => {
  const roots = Array.from({ length: 20 }, (_, index) => comment(`c${index}`));
  const target = comment('c20', jordan, 'Going for 80 kg');
  workoutWithComments({ 0: { items: roots, next: 20 }, 20: { items: [target], next: null } });
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  await show(
    <SharedWorkoutScreen
      workoutId="w1"
      memberId="alex"
      date={today}
      showComments
      highlightCommentId="c20"
    />,
  );
  expect(await screen.findByText('Going for 80 kg')).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(
    '/api/sharing/workouts/w1/comments?offset=20',
    expect.anything(),
  );
  const layout = (testID: string, y: number) =>
    fireEvent(screen.getByTestId(testID), 'layout', {
      nativeEvent: { layout: { x: 0, y, width: 360, height: 100 } },
    });
  await layout('comments-box', 900);
  await layout('comments-list', 48);
  await layout('comment-thread-c20', 1500);
  await layout('comment-c20', 0);
  await waitFor(() =>
    expect(scrollTo).toHaveBeenCalledWith({ y: 900 + 48 + 1500 - 16, animated: true }),
  );
  scrollTo.mockRestore();
});

test('a visibility this release does not know shows neutrally', async () => {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing')
      return {
        visibility: 'circles',
        share_notes: true,
        share_body_weight: false,
        share_body_sizes: false,
        share_goals: false,
        share_machine_photos: false,
        share_online_status: true,
        share_live_workouts: true,
      };
    throw new Error(`Unexpected GET ${path}`);
  });
  await show(<SharingSettingsScreen />);
  expect(await screen.findByText('Other')).toBeVisible();
  for (const name of [/Private/, /Friends only/, /Public/])
    expect(screen.getByRole('radio', { name })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
});

test('one reaction picker opens at a time, and a refused reaction can be tried again', async () => {
  const sam = { id: 'sam', display_name: 'Sam Rivera', profile_photo_url: null };
  const legs = { ...upper, id: 'w2', name: 'Leg day' } as unknown as TrackedWorkout;
  const twoCards: Timeline = {
    items: [
      ...timeline.items,
      { member: { ...sam, is_you: false }, workout: legs, reactions, record_count: 0 },
    ],
    has_more: false,
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sharing/timeline')) return twoCards;
    if (path === '/api/sharing/friends') return friends;
    if (path.startsWith('/api/sharing/suggestions'))
      return { profiles: [], total: 0, page: 1, page_size: 10 };
    if (path === '/api/sharing') return { visibility: 'public', pending_requests: 1 };
    throw new Error(`Unexpected GET ${path}`);
  });
  await show(<SocialScreen />);
  expect(await screen.findByText('Leg day')).toBeVisible();
  const alexPicker = 'Choose a reaction to Alex Morgan’s Upper body';
  const samPicker = 'Choose a reaction to Sam Rivera’s Leg day';
  await fireEvent.press(screen.getByRole('button', { name: 'React to Alex Morgan’s Upper body' }));
  expect(screen.getByLabelText(alexPicker)).toBeVisible();
  // Opening the other card's picker closes the first.
  await fireEvent.press(screen.getByRole('button', { name: 'React to Sam Rivera’s Leg day' }));
  expect(screen.getByLabelText(samPicker)).toBeVisible();
  expect(screen.queryByLabelText(alexPicker)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'React to Sam Rivera’s Leg day' }));
  expect(screen.queryByLabelText(samPicker)).toBeNull();

  // A refused reaction leaves the server's reactions as they were and the picker open to retry.
  jest.mocked(apiSend).mockRejectedValueOnce(new ApiError(500, 'Relay hit a snag.'));
  await fireEvent.press(screen.getByRole('button', { name: 'React to Alex Morgan’s Upper body' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Strong' }));
  expect(await screen.findByText('Relay hit a snag.')).toBeVisible();
  expect(screen.getByLabelText(alexPicker)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'View 2 reactions on Alex Morgan’s Upper body' }),
  ).toBeVisible();
  jest.mocked(apiSend).mockResolvedValueOnce({
    counts: [
      { reaction: 'fire', count: 2 },
      { reaction: 'strong', count: 1 },
    ],
    yours: 'strong',
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Strong' }));
  expect(
    await screen.findByRole('button', {
      name: 'Your reaction to Alex Morgan’s Upper body: Strong. Change reaction',
    }),
  ).toBeVisible();
  expect(screen.queryByLabelText(alexPicker)).toBeNull();
});

test('offline with nothing saved, comments say so instead of spinning, then load', async () => {
  workoutWithComments({ 0: { items: [comment('c1', alex, 'Strong pressing!')], next: null } });
  await expectOfflineUntilOnline(
    jest.mocked(apiGet),
    () =>
      show(
        <CommentsSheet
          workoutId="w1"
          title="Comments"
          onClose={jest.fn()}
          onOpenPerson={jest.fn()}
        />,
      ),
    () => expect(screen.getByText('Strong pressing!')).toBeVisible(),
  );
  expect(screen.queryByLabelText('Loading comments')).toBeNull();
});
