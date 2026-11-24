import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ApiError, currentUser, retryPendingSignOut } from '../data/api';
import { readJson } from '../data/deviceStorage';
import { sessionToken } from '../data/session';
import { memoryKv } from '../testing/memoryKvStore';
import { rememberUser } from './cachedUser';
import { SessionProvider, useSession } from './SessionProvider';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));
jest.mock('../data/session', () => ({ sessionToken: jest.fn() }));
jest.mock('../data/api', () => ({
  ...jest.requireActual<typeof import('../data/api')>('../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  retryPendingSignOut: jest.fn(async () => undefined),
}));

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
const unreachable = () =>
  new Error('Could not reach Relay. Check your connection, then try again.');
const CACHE = 'relay.signed-in-user.v1';

function Probe() {
  const { status } = useSession();
  return (
    <Text>
      {status.kind === 'signed-in'
        ? `Signed in as ${status.user.username}${status.offline ? ' (offline)' : ''}`
        : status.kind}
    </Text>
  );
}

let client: QueryClient;
function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

async function reconnect() {
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  memoryKv.clear();
  jest.mocked(sessionToken).mockResolvedValue('token');
});
afterEach(() => client.clear());

test('opens offline with the account last signed in on this phone, then confirms it', async () => {
  rememberUser(user);
  jest.mocked(currentUser).mockRejectedValueOnce(unreachable());
  await open();
  expect(await screen.findByText('Signed in as preview (offline)')).toBeVisible();

  jest.mocked(currentUser).mockResolvedValueOnce({ ...user, username: 'preview2' });
  await reconnect();
  expect(await screen.findByText('Signed in as preview2')).toBeVisible();
  expect(readJson<{ user: { username: string } }>(CACHE)?.user.username).toBe('preview2');
});

test('a session that ended while offline signs out once the server answers', async () => {
  rememberUser(user);
  jest.mocked(currentUser).mockRejectedValueOnce(unreachable());
  await open();
  await screen.findByText('Signed in as preview (offline)');

  // Still offline: nothing changes.
  jest.mocked(currentUser).mockRejectedValueOnce(unreachable());
  await reconnect();
  expect(screen.getByText('Signed in as preview (offline)')).toBeVisible();

  jest.mocked(currentUser).mockRejectedValueOnce(new ApiError(401, 'Sign in to continue.'));
  await reconnect();
  expect(await screen.findByText('signed-out')).toBeVisible();
  expect(readJson(CACHE)).toBeNull();
});

test('without a cached account or saved session, an offline launch shows the error', async () => {
  jest.mocked(currentUser).mockRejectedValue(unreachable());
  await open();
  expect(await screen.findByText('error')).toBeVisible();

  // A cached account whose session token is gone does not open either.
  client.clear();
  await screen.unmount();
  rememberUser(user);
  jest.mocked(sessionToken).mockResolvedValue(null);
  await open();
  expect(await screen.findByText('error')).toBeVisible();
});

test('a signed-out answer never opens offline, and forgets the cached account', async () => {
  rememberUser(user);
  jest.mocked(currentUser).mockRejectedValue(new ApiError(401, 'Sign in to continue.'));
  await open();
  expect(await screen.findByText('signed-out')).toBeVisible();
  expect(readJson(CACHE)).toBeNull();
});

test('a sign-out still waiting for the server is retried on reconnect while signed out', async () => {
  jest.mocked(currentUser).mockRejectedValue(new ApiError(401, 'Sign in to continue.'));
  jest.mocked(retryPendingSignOut).mockResolvedValue(undefined);
  await open();
  expect(await screen.findByText('signed-out')).toBeVisible();
  jest.mocked(retryPendingSignOut).mockClear();
  await reconnect();
  expect(retryPendingSignOut).toHaveBeenCalledTimes(1);
  expect(currentUser).toHaveBeenCalledTimes(1);
});

test('signing in remembers the account for offline launches', async () => {
  jest.mocked(currentUser).mockResolvedValue(user);
  await open();
  await screen.findByText('Signed in as preview');
  await waitFor(() => expect(readJson(CACHE)).toEqual({ origin: 'https://relay.test', user }));
});
