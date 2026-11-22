import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountScreen } from './AccountScreen';
import { ApiError, currentUser, loadRoutine, signIn, signOut } from './api';

jest.mock('./api', () => ({
  ...jest.requireActual<typeof import('./api')>('./api'),
  currentUser: jest.fn(),
  loadRoutine: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

const user = { must_change_password: false } as Awaited<ReturnType<typeof currentUser>>;
const routine = (previous: string) => ({
  name: 'Legs workout',
  exercises: [{ name: 'Back Squat', sets: 3, reps: '6–10', previous }],
});
const signedOut = () => new ApiError(401, 'Sign in to continue.');
const unreachable = 'Could not reach Relay. Check your connection, then try again.';

let appStateChanged: (state: AppStateStatus) => void;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateChanged = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

function open() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AccountScreen />
    </SafeAreaProvider>,
  );
}

test('signs in, shows the next routine, and signs out to the sign-in form', async () => {
  jest.mocked(currentUser).mockRejectedValueOnce(signedOut()).mockResolvedValue(user);
  jest.mocked(loadRoutine).mockResolvedValue(routine('100 kg × 6 reps'));
  jest.mocked(signIn).mockResolvedValue(user);
  jest.mocked(signOut).mockResolvedValue(undefined);
  await open();

  const submit = await screen.findByRole('button', { name: 'Sign in' });
  expect(submit).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Username'), ' preview.lifter ');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'sample-password');
  await fireEvent.press(submit);

  expect(signIn).toHaveBeenCalledWith('preview.lifter', 'sample-password');
  expect(await screen.findByText('Legs workout')).toBeVisible();
  expect(screen.getByText('UP NEXT')).toBeVisible();

  jest.mocked(currentUser).mockRejectedValue(signedOut());
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(await screen.findByLabelText('Username')).toHaveProp('value', '');
  expect(screen.queryByText('Legs workout')).toBeNull();
});

test('keeps the form and explains a refused sign-in beside it', async () => {
  jest.mocked(currentUser).mockRejectedValue(signedOut());
  jest.mocked(signIn).mockRejectedValue(new ApiError(401, 'Incorrect username or password.'));
  await open();

  await fireEvent.changeText(await screen.findByLabelText('Username'), 'preview.lifter');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Incorrect username or password.')).toBeVisible();
  expect(screen.getByLabelText('Username')).toHaveProp('value', 'preview.lifter');
  expect(loadRoutine).not.toHaveBeenCalled();
});

test('returning to the app refreshes the routine without blanking it', async () => {
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(loadRoutine).mockResolvedValueOnce(routine('100 kg × 6 reps'));
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: /Back Squat/ }));
  expect(screen.getByText('100 kg × 6 reps')).toBeVisible();

  // The refresh is still in flight: the routine stays on screen with its open row.
  let finish!: (value: ReturnType<typeof routine>) => void;
  jest.mocked(loadRoutine).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  await act(async () => {
    appStateChanged('background');
    appStateChanged('active');
  });
  expect(screen.getByText('100 kg × 6 reps')).toBeVisible();
  expect(screen.queryByLabelText('Loading account')).toBeNull();

  await act(async () => finish(routine('102.5 kg × 6 reps')));
  expect(screen.getByText('102.5 kg × 6 reps')).toBeVisible();
});

test('a failed refresh keeps the routine, and an ended session returns to sign-in', async () => {
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(loadRoutine).mockResolvedValueOnce(routine('100 kg × 6 reps'));
  await open();
  expect(await screen.findByText('Legs workout')).toBeVisible();

  jest.mocked(loadRoutine).mockRejectedValueOnce(new Error(unreachable));
  await act(async () => appStateChanged('active'));
  expect(screen.getByText('Legs workout')).toBeVisible();
  expect(screen.queryByText(unreachable)).toBeNull();

  jest.mocked(currentUser).mockRejectedValue(signedOut());
  await act(async () => appStateChanged('active'));
  expect(await screen.findByLabelText('Username')).toBeVisible();
  expect(screen.queryByText('Legs workout')).toBeNull();
});

test('an unreachable server on first open offers Try again', async () => {
  jest.mocked(currentUser).mockRejectedValueOnce(new Error(unreachable));
  await open();
  expect(await screen.findByText(unreachable)).toBeVisible();

  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(loadRoutine).mockResolvedValue(routine('100 kg × 6 reps'));
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Legs workout')).toBeVisible();
});
