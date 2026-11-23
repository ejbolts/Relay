import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { User } from '../../../../frontend/src/types';
import { currentUser, signIn, signOut } from '../../data/api';
import { SessionProvider, useSession } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { useAccountGuard, type AccountCheck } from './accountGuard';

// The guard inside the real SessionProvider: a late result for one account never reaches the
// next, while a confirmed result for the same account still lands after the screen closes.

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(async () => 'token'),
  forgetSessionToken: jest.fn(async () => undefined),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(async () => undefined),
}));

const admin = { id: 'admin', username: 'preview', can_upload_videos: true } as User;
const other = { id: 'other', username: 'casey', can_upload_videos: false } as User;

/** Starts an account-bound request (a late `/me`) and applies its result through the guard. */
let late: { resolve: (user: User) => void; check: AccountCheck } | null = null;
function Requester() {
  const guard = useAccountGuard();
  const { updateUser } = useSession();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh profile"
      onPress={() => {
        const check = guard();
        const started = new Promise<User>((resolve) => (late = { resolve, check }));
        void started.then((fresh) => {
          if (check.sameSession() && fresh.id === admin.id) updateUser(fresh);
        });
      }}
    />
  );
}

function Shell() {
  const { status, signIn: start, signOut: end } = useSession();
  const [screenOpen, setScreenOpen] = useState(true);
  return (
    <>
      <Text>
        {status.kind === 'signed-in'
          ? `As ${status.user.username}, ${String(status.user.can_upload_videos)}`
          : status.kind}
      </Text>
      {status.kind === 'signed-in' && screenOpen && <Requester />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => setScreenOpen(false)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => void end()}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in as Casey"
        onPress={() => void start('casey', 'pw')}
      />
    </>
  );
}

let client: QueryClient;
async function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  late = null;
  jest.mocked(currentUser).mockResolvedValue(admin);
});
afterEach(() => client.clear());

it('drops a late result for the previous account after sign-out and the next sign-in', async () => {
  jest.mocked(signIn).mockResolvedValue(other as never);
  await open();
  await screen.findByText('As preview, true');
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh profile' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('signed-out');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in as Casey' }));
  await screen.findByText('As casey, false');
  expect(late!.check.sameSession()).toBe(false);
  // The previous admin's /me answers now: it must not replace Casey's profile.
  await act(async () => late!.resolve({ ...admin, can_upload_videos: false }));
  expect(screen.getByText('As casey, false')).toBeTruthy();
  expect(signOut).toHaveBeenCalled();
});

it('still applies a confirmed result for the same account after an ordinary Back', async () => {
  await open();
  await screen.findByText('As preview, true');
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh profile' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.queryByRole('button', { name: 'Refresh profile' })).toBeNull();
  expect(late!.check.sameSession()).toBe(true);
  expect(late!.check.open()).toBe(false);
  await act(async () => late!.resolve({ ...admin, can_upload_videos: false }));
  expect(await screen.findByText('As preview, false')).toBeTruthy();
});
