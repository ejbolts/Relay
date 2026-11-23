import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type {
  FriendConnections,
  SharingNotifications,
  Timeline,
  TrackedWorkout,
  User,
} from '../../../../frontend/src/types';
import { currentWorkoutFocus } from '../../../../frontend/src/workoutFocusRequest';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { ToastHost } from '../../ui/Toast';
import { NotificationsBell } from './NotificationsBell';
import { SocialScreen } from './SocialScreen';
import { currentShownWorkoutFocus, dismissWorkoutFocus, requestWorkoutFocus } from './workoutFocus';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), back: jest.fn() };
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
jest.mock('../../data/authorisedImage', () => ({
  useAuthorisedImage: () => null,
  loadAuthorisedImage: jest.fn(async () => 'data:image/png;base64,AAAA'),
}));
const mockStore = new Map<string, string>();
jest.mock('../../data/deviceStorage', () => ({
  deviceStorage: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => mockStore.set(key, value),
    removeItem: (key: string) => mockStore.delete(key),
  },
}));
const mockUser = {
  id: 'me',
  username: 'preview',
  display_name: 'Preview',
  profile_photo_url: null,
} as unknown as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));
jest.mock('../../data/queries', () => ({
  ...jest.requireActual('../../data/queries'),
  useWeightUnit: () => 'kg',
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  CameraView: () => null,
}));
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return () => createElement(View);
});

const today = localDate();
const since = '2026-11-21T10:00:00Z';
const person = (id: string, name: string) => ({ id, display_name: name, profile_photo_url: null });
const workout = (id: string, name: string, photos: TrackedWorkout['photos'] = []) =>
  ({
    id,
    name,
    workout_date: today,
    category: 'upper',
    duration_minutes: 50,
    created_at: `${today}T08:00:00Z`,
    photos,
    movements: [],
  }) as unknown as TrackedWorkout;
const reactions = { counts: [{ reaction: 'fire' as const, count: 1 }], yours: null };
const photo = {
  id: 'p1',
  thumbnail_url: '/api/workout-photos/p1/image?variant=thumbnail',
  full_url: '/api/workout-photos/p1/image',
  width: 800,
  height: 600,
  created_at: since,
};

const notifications: SharingNotifications = {
  requests: [{ ...person('jordan', 'Jordan Lee'), since: '2026-11-22T10:00:00Z' }],
  accepted: [],
  reactions: [
    {
      ...person('alex', 'Alex Morgan'),
      since,
      is_read: false,
      workout_id: 'w-mine',
      workout_name: 'Upper body',
      reaction: 'fire',
    },
  ],
  comments: [
    {
      ...person('sam', 'Sam Patel'),
      since: '2026-11-20T10:00:00Z',
      is_read: true,
      notice_id: 'n1',
      kind: 'reply',
      comment_id: 'c1',
      workout_id: 'w-friend',
      workout_name: 'Leg day',
      body: 'See you Friday',
      reaction: null,
    },
  ],
};
let timeline: Timeline;
const friends: FriendConnections = {
  friends: [
    {
      ...person('alex', 'Alex Morgan'),
      since,
      latest: null,
      recent_workout_count: 3,
      training_dates: [],
      presence: null,
    },
  ],
  requests: [],
  sent: [],
  blocked: [],
};

let client: QueryClient;
afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
  const shown = currentShownWorkoutFocus();
  if (shown) dismissWorkoutFocus(shown.key);
});
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  timeline = {
    items: [
      {
        member: { ...person('me', 'Preview'), is_you: true },
        workout: workout('w-mine', 'Upper body', [photo]),
        reactions,
        record_count: 0,
      },
      {
        member: { ...person('sam', 'Sam Patel'), is_you: false },
        workout: workout('w-friend', 'Leg day'),
        reactions: { counts: [], yours: null },
        record_count: 0,
      },
    ],
    has_more: false,
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sharing/notifications') return notifications;
    if (path.startsWith('/api/sharing/timeline')) return timeline;
    if (path === '/api/sharing/friends') return friends;
    if (path.startsWith('/api/sharing/workouts/w-mine/reactions'))
      return { items: [{ ...person('alex', 'Alex Morgan'), reaction: 'fire' }], total: 1 };
    if (path.startsWith('/api/sharing/workouts/w-old/comments'))
      return {
        total: 1,
        next_offset: null,
        items: [
          {
            id: 'c9',
            author: person('sam', 'Sam Patel'),
            body: 'Great session',
            parent_id: null,
            reply_to: null,
            created_at: since,
            edited_at: null,
            can_edit: false,
            can_delete: false,
            reactions: { counts: [], yours: null },
          },
        ],
      };
    if (path.startsWith('/api/sharing/profiles/alex/workouts'))
      return { workouts: [], total: 0, personal_records: [] };
    if (path === '/api/sharing/profiles/alex') return { id: 'alex' };
    throw new Error(`Unexpected GET ${path}`);
  });
  jest.mocked(apiSend).mockResolvedValue(undefined);
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

test('the bell counts waiting requests and unread notices, and opening it reads them', async () => {
  await show(<NotificationsBell />);
  const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
  await fireEvent.press(bell);
  expect(await screen.findByText(/sent you a friend request/)).toBeVisible();
  expect(screen.getByText('See you Friday')).toBeVisible();
  // The unread reaction on screen is marked read; the waiting request stays counted.
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/notifications/read', 'POST', {
      items: [
        { kind: 'request', id: 'jordan', since: '2026-11-22T10:00:00Z' },
        { kind: 'reaction', id: 'alex', since, workout_id: 'w-mine' },
      ],
    }),
  );
  expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Accept Jordan Lee' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/friends/jordan/accept', 'POST'),
  );

  await fireEvent.press(
    screen.getByRole('button', { name: 'Open Alex Morgan’s reaction on Upper body' }),
  );
  expect(mockRouter.navigate).toHaveBeenCalledWith('/social');
  expect(currentWorkoutFocus()).toMatchObject({
    workoutId: 'w-mine',
    panel: 'people',
    personId: 'alex',
  });
});

test('Social reveals a reaction notice’s workout with who reacted', async () => {
  requestWorkoutFocus({
    workoutId: 'w-mine',
    workoutName: 'Upper body',
    panel: 'people',
    personId: 'alex',
  });
  await show(<SocialScreen />);
  expect(await screen.findByText('Reactions')).toBeVisible();
  expect(await screen.findByRole('button', { name: "Open Alex Morgan's profile" })).toBeVisible();
  expect(currentWorkoutFocus()).toBeNull();
});

test('a reply notice opens its workout at the comment', async () => {
  requestWorkoutFocus({
    workoutId: 'w-friend',
    workoutName: 'Leg day',
    panel: 'comments',
    commentId: 'c1',
  });
  await show(<SocialScreen />);
  await waitFor(() =>
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/social/workout/[id]',
      params: { id: 'w-friend', member: 'sam', date: today, comments: '1', comment: 'c1' },
    }),
  );
});

test('a workout beyond the feed opens its comments on their own', async () => {
  requestWorkoutFocus({
    workoutId: 'w-old',
    workoutName: 'Old session',
    panel: 'comments',
    commentId: 'c9',
  });
  await show(<SocialScreen />);
  expect(await screen.findByText('Old session')).toBeVisible();
  expect(await screen.findByText('Great session')).toBeVisible();
});

test('a reaction chosen offline waits on the phone and sends once back online', async () => {
  jest
    .mocked(apiSend)
    .mockResolvedValue({ counts: [{ reaction: 'strong', count: 1 }], yours: 'strong' });
  await show(<SocialScreen />);
  onlineManager.setOnline(false);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'React to Sam Patel’s Leg day' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Strong' }));
  expect(
    await screen.findByRole('button', {
      name: "Strong reaction to Sam Patel’s Leg day sends when you're back online",
    }),
  ).toBeDisabled();
  expect(apiSend).not.toHaveBeenCalledWith(
    '/api/sharing/workouts/w-friend/reaction',
    'PUT',
    expect.anything(),
  );
  // Back online, the feed is read again too, now with the reaction the server received.
  timeline.items[1].reactions = { counts: [{ reaction: 'strong', count: 1 }], yours: 'strong' };
  onlineManager.setOnline(true);
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sharing/workouts/w-friend/reaction', 'PUT', {
      reaction: 'strong',
    }),
  );
  expect(
    await screen.findByRole('button', {
      name: 'Your reaction to Sam Patel’s Leg day: Strong. Change reaction',
    }),
  ).toBeVisible();
});

test('your own workout photo opens full screen, where you can remove it', async () => {
  jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _message, buttons) =>
      buttons?.find((button) => button.style === 'destructive')?.onPress?.(),
    );
  await show(<SocialScreen />);
  expect(
    await screen.findByRole('button', { name: 'Add a photo to Your Upper body' }),
  ).toBeVisible();
  await fireEvent.press(
    screen.getByRole('imagebutton', { name: 'View photo 1 of 1 of Your Upper body' }),
  );
  expect(await screen.findByText('Workout photo')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/workout-photos/p1', 'DELETE'));
  expect(await screen.findByText('Photo removed')).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.queryByRole('imagebutton', { name: 'View photo 1 of 1 of Your Upper body' }),
    ).toBeNull(),
  );
});

test('the first friends’ profiles load in the background while the feed is shown', async () => {
  await show(<SocialScreen />);
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith('/api/sharing/profiles/alex', expect.anything()),
  );
  expect(apiGet).toHaveBeenCalledWith(
    expect.stringMatching(/^\/api\/sharing\/profiles\/alex\/workouts\?offset=0/),
    expect.anything(),
  );
});
