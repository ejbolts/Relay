import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
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
import { ApiError, apiGet, apiSend } from '../../data/api';
import { ToastHost } from '../../ui/Toast';
import { FriendQrSheet } from './FriendQrSheet';
import { FriendsActivityCard } from './FriendsActivityCard';
import { ProfileScreen } from './ProfileScreen';
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
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
const mockUser = {
  id: 'me',
  username: 'preview',
  display_name: 'Preview',
  profile_photo_url: null,
  created_at: '2026-11-01T00:00:00Z',
} as unknown as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));
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
afterEach(() => client.clear());
beforeEach(() => {
  jest.clearAllMocks();
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

test('your own profile opens Edit profile, sharing choices and your QR code', async () => {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/profiles/me')
      return { ...casey, id: 'me', display_name: 'Preview', is_you: true, visibility: 'public' };
    throw new Error(`Unexpected GET ${path}`);
  });
  await show(<ProfileScreen profileId="me" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/profile');
  await fireEvent.press(screen.getByRole('button', { name: 'Sharing: Public' }));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/social/sharing');
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
  expect(await screen.findByText('PUBLIC')).toBeVisible();
  expect(screen.getByRole('radio', { name: /Public/ })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  await fireEvent.press(screen.getByRole('radio', { name: /Friends only/ }));
  expect(await screen.findByRole('button', { name: VISIBILITY_CONFIRM.followers })).toBeVisible();
});
