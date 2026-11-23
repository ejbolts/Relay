import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, currentUser, request } from '../data/api';
import { startAppTour, useAppTour } from '../features/guides/tourProgress';
import { SessionProvider } from './SessionProvider';
import { SignInScreen } from './SignInScreen';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return function SegmentedControl(props: {
    values: string[];
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
            onPress: () => props.onChange({ nativeEvent: { selectedSegmentIndex: index } }),
          },
          createElement(Text, null, value),
        ),
      ),
    );
  };
});
jest.mock('../data/api', () => ({
  ...jest.requireActual<typeof import('../data/api')>('../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  request: jest.fn(),
}));

const sent: { path: string; body: unknown }[] = [];
let refuse: Error | null = null;

function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <SessionProvider>
          <SignInScreen />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  sent.length = 0;
  refuse = null;
  jest.mocked(currentUser).mockRejectedValue(new ApiError(401, 'Sign in to continue.'));
  jest.mocked(request).mockImplementation(async (path, init) => {
    if (path === '/api/auth/config')
      return { registration_open: true, invite_code_required: false };
    if (refuse) throw refuse;
    sent.push({ path, body: JSON.parse(String(init?.body)) });
    return undefined;
  });
});

test('asks the admins for a reset with the username typed so far', async () => {
  await open();
  await fireEvent.changeText(await screen.findByLabelText('Username'), ' Sam.Sample ');
  await fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
  // The sheet's own field starts from the username typed so far.
  expect((await screen.findAllByLabelText('Username')).at(-1)!.props.value).toBe('Sam.Sample');
  await fireEvent.press(screen.getByRole('button', { name: 'Ask admin to reset' }));
  expect(sent).toEqual([
    { path: '/api/auth/password-reset-request', body: { username: 'sam.sample' } },
  ]);
  expect(await screen.findByText('Request sent for @sam.sample')).toBeVisible();
  expect(screen.getByText('Your admin will give you a temporary password.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByText('Request sent for @sam.sample')).toBeNull();
});

test('asks for the username of the account with that name, and needs a name first', async () => {
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Forgot username?' }));
  const name = await screen.findByLabelText('Name on your profile');
  expect(name.props.value).toBe('');
  await fireEvent.press(screen.getByRole('button', { name: 'Ask admin' }));
  expect(sent).toEqual([]);
  expect(screen.getByText('Enter your name.')).toBeVisible();
  await fireEvent.changeText(name, '  Sam   Sample ');
  expect(screen.queryByText('Enter your name.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Ask admin' }));
  expect(sent).toEqual([
    { path: '/api/auth/username-reminder-request', body: { name: 'Sam Sample' } },
  ]);
  expect(await screen.findByText('Request sent for Sam Sample')).toBeVisible();
});

test('keeps the form open with the reason when the request fails', async () => {
  refuse = new Error('Could not reach Relay. Check your connection, then try again.');
  await open();
  await fireEvent.changeText(await screen.findByLabelText('Username'), 'sam');
  await fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Ask admin to reset' }));
  expect(
    await screen.findByText('Could not reach Relay. Check your connection, then try again.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ask admin to reset' })).toBeVisible();
});

test('is only offered on the sign-in form', async () => {
  await open();
  await fireEvent.press(await screen.findByRole('tab', { name: 'Create account' }));
  expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Forgot username?' })).toBeNull();
});

test('closes a tour left open when the session ended', async () => {
  startAppTour('u1');
  await open();
  await screen.findByLabelText('Username');
  expect((await renderHook(() => useAppTour('u1'))).result.current).toBeNull();
});
