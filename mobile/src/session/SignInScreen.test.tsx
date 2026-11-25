import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, currentUser, request, signIn, signOut } from '../data/api';
import { captureFriendInvite, friendInviteFromUrl } from './friendInvite';
import { SessionProvider, useSession } from './SessionProvider';
import { SignInScreen } from './SignInScreen';

jest.mock('@react-native-segmented-control/segmented-control', () =>
  jest.requireActual('../testing/segmentedControlMock'),
);

jest.mock('../data/api', () => ({
  ...jest.requireActual<typeof import('../data/api')>('../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  request: jest.fn(),
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

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(request).mockResolvedValue({ registration_open: false, invite_code_required: false });
});
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

test('toggles password visibility on the sign-in form', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  await open();
  const field = await screen.findByLabelText('Password');
  expect(field).toHaveProp('secureTextEntry', true);
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
  await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
});

test('registers with a required code, then signs in through the native session', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest
    .mocked(request)
    .mockResolvedValueOnce({ registration_open: true, invite_code_required: true })
    .mockResolvedValueOnce(user);
  jest.mocked(signIn).mockResolvedValue(user);
  await open();
  const create = () => screen.getByRole('button', { name: 'Create account' });
  expect(await screen.findByRole('tab', { name: 'Sign in' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
  expect(screen.getByRole('tab', { name: 'Create account' })).toBeSelected();
  expect(screen.getByRole('tab', { name: 'Sign in' })).not.toBeSelected();
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Sample Lifter');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'Sample');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'sample-password');
  await fireEvent.press(create());
  expect(screen.getByText('Enter your invite code.')).toBeVisible();
  expect(request).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(screen.getByLabelText('Invite code'), ' sample-code ');
  await fireEvent.press(create());
  expect(request).toHaveBeenLastCalledWith(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'sample',
        password: 'sample-password',
        display_name: 'Sample Lifter',
        invite_code: 'sample-code',
      }),
    },
    null,
  );
  expect(signIn).toHaveBeenCalledWith('sample', 'sample-password');
  expect(await screen.findByText('Signed in as preview')).toBeVisible();
});

test('goes back to sign-in if the account was created and token sign-in failed', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest
    .mocked(request)
    .mockResolvedValueOnce({ registration_open: true, invite_code_required: false })
    .mockResolvedValueOnce(user);
  jest.mocked(signIn).mockRejectedValue(new Error('Connection lost'));
  await open();
  await fireEvent.press(await screen.findByRole('tab', { name: 'Create account' }));
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Sample Lifter');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'Sample');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'sample-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(
    await screen.findByRole('button', {
      name: 'Account created. Sign in with your password.. Dismiss',
    }),
  ).toBeTruthy();
  expect(screen.getByLabelText('Username')).toHaveProp('value', 'sample');
  expect(screen.getByLabelText('Password')).toHaveProp('value', '');
  expect(screen.getByRole('tab', { name: 'Sign in' })).toBeSelected();
});

test('holds the Sign in | Create account control while an account is being created', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest
    .mocked(request)
    .mockResolvedValueOnce({ registration_open: true, invite_code_required: false })
    .mockReturnValueOnce(new Promise(() => undefined));
  await open();
  await fireEvent.press(await screen.findByRole('tab', { name: 'Create account' }));
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Sample Lifter');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'Sample');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'sample-password');
  expect(screen.getByRole('tab', { name: 'Sign in' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByRole('tab', { name: 'Sign in' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: 'Create account' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: 'Create account' })).toBeSelected();
});

test.each([
  ['relay-mobile://social/profile/friend-1?invite=1', 'friend-1'],
  ['relay-mobile:///social/profile/friend-2?invite=1', 'friend-2'],
  ['exp://127.0.0.1:18852/--/social/profile/friend-3?invite=1', 'friend-3'],
  ['relay-mobile://social/profile/friend-1?invite=0', null],
  ['relay-mobile://social/profile/%2f?invite=1', null],
  ['https://gym.example.com/social/profile/friend-1?invite=1', null],
])('recognises the invite route %s', (url, id) => {
  expect(friendInviteFromUrl(url)).toBe(id);
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

test('an invite link that arrives while Create account is open updates its code', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest.mocked(request).mockResolvedValue({ registration_open: true, invite_code_required: true });
  await open();
  await fireEvent.press(await screen.findByRole('tab', { name: 'Create account' }));
  const field = () => screen.getByLabelText('Invite code');
  await act(async () =>
    captureFriendInvite('relay-mobile://social/profile/friend-a?invite=1', 'first-code'),
  );
  expect(field()).toHaveDisplayValue('first-code');
  // Typing is kept until another link arrives.
  await fireEvent.changeText(field(), 'typed-code');
  expect(field()).toHaveDisplayValue('typed-code');
  // A friend's link without a code clears the earlier friend's code, as on the web.
  await act(async () => captureFriendInvite('relay-mobile://social/profile/friend-b?invite=1'));
  expect(field()).toHaveDisplayValue('');
});
