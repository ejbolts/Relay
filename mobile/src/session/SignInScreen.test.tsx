import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, currentUser, signIn, signOut } from '../data/api';
import { SessionProvider, useSession } from './SessionProvider';
import { SignInScreen } from './SignInScreen';

jest.mock('../data/api', () => ({
  ...jest.requireActual<typeof import('../data/api')>('../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

const user = { id: 'u1', username: 'preview', must_change_password: false } as Awaited<
  ReturnType<typeof currentUser>
>;
const signedOut = () => new ApiError(401, 'Sign in to continue.');

function Probe() {
  const { status, signOut: leave } = useSession();
  return status.kind === 'signed-in' ? (
    <Text onPress={() => void leave()}>{`Signed in as ${status.user.username}`}</Text>
  ) : (
    <SignInScreen />
  );
}

let client: QueryClient;
function open() {
  // No garbage-collection timers, so Jest can exit when the tests finish.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.resetAllMocks());
afterEach(() => client.clear());

test('signs in from the form and back out again', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest.mocked(signIn).mockResolvedValue(user);
  jest.mocked(signOut).mockResolvedValue(undefined);
  await open();

  const submit = await screen.findByRole('button', { name: 'Sign in' });
  expect(submit).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Username'), ' preview ');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'sample-password');
  await fireEvent.press(submit);
  expect(signIn).toHaveBeenCalledWith('preview', 'sample-password');
  expect(await screen.findByText('Signed in as preview')).toBeVisible();

  await fireEvent.press(screen.getByText('Signed in as preview'));
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(await screen.findByLabelText('Username')).toBeVisible();
});

test('keeps the form and shows why a sign-in was refused', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest.mocked(signIn).mockRejectedValue(new ApiError(401, 'Incorrect username or password.'));
  await open();

  await fireEvent.changeText(await screen.findByLabelText('Username'), 'preview');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Incorrect username or password.')).toBeVisible();
  expect(screen.getByLabelText('Username')).toHaveProp('value', 'preview');
});

test('an unreachable server on opening offers Try again', async () => {
  const unreachable = 'Could not reach Relay. Check your connection, then try again.';
  jest.mocked(currentUser).mockRejectedValueOnce(new Error(unreachable)).mockResolvedValue(user);
  await open();
  expect(await screen.findByText(unreachable)).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Signed in as preview')).toBeVisible();
});

test('a session that ends elsewhere returns to sign-in and drops cached data', async () => {
  jest.mocked(currentUser).mockResolvedValue(user);
  await open();
  expect(await screen.findByText('Signed in as preview')).toBeVisible();
  client.setQueryData(['dashboard', 'today'], { cached: true });

  await act(() =>
    client
      .fetchQuery({
        queryKey: ['workouts'],
        queryFn: () => Promise.reject(signedOut()),
      })
      .catch(() => undefined),
  );
  expect(await screen.findByLabelText('Username')).toBeVisible();
  expect(client.getQueryData(['dashboard', 'today'])).toBeUndefined();
});
