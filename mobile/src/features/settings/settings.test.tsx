import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TrainingPreferences, User, WorkoutType } from '../../../../frontend/src/types';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { queryKeys } from '../../data/queries';
import { promptText, showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { DeleteAccountScreen, FeedbackScreen } from './AccountActionsScreens';
import { AppearanceScreen, BodyweightDefaultsScreen } from './PreferenceScreens';
import { FreshStartsScreen } from './FreshStartsScreen';
import { EditProfileScreen } from './EditProfileScreen';
import { PasswordRequiredScreen } from './PasswordRequiredScreen';
import { SettingsScreen } from './SettingsScreen';
import { WorkoutTypesScreen } from './WorkoutTypesScreen';

const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  // Header buttons render in place, so tests can press them.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactElement } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
  request: jest.fn(),
}));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn(), promptText: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const mockWorkout = { live: null, queue: { waiting: 0 } };
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: () => mockWorkout }));
const mockUser: User = {
  id: 'u1',
  username: 'preview',
  display_name: 'Preview',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-11-01T00:00:00Z',
  sex: null,
  profile_photo_url: null,
};
const mockSession = {
  signOut: jest.fn(async () => undefined),
  accountDeleted: jest.fn(async () => undefined),
  updateUser: jest.fn(),
};
jest.mock('../../session/SessionProvider', () => ({
  useUser: () => mockUser,
  useSession: () => mockSession,
}));
// The native control has no test renderer; this stand-in has a tab per segment.
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

const preferences: TrainingPreferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
  default_rest_seconds: null,
};
const arms: WorkoutType = {
  id: 'arms',
  name: 'Arms',
  color: '#ec4899',
  is_custom: true,
  archived: false,
};
let responses: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  // The Android menu sheet: the same rows and actions as the iOS menu picker.
  jest.replaceProperty(Platform, 'OS', 'android');
  responses = {
    '/api/training-preferences': preferences,
    '/api/workout-types': [...DEFAULT_WORKOUT_TYPES, arms],
    '/api/training-split': null,
    '/api/workout-auto-save': { after_minutes: null },
    '/release.json': null,
    '/api/sharing': { visibility: 'followers', pending_requests: 0 },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const key = path.split('?')[0];
    if (!(key in responses)) throw new Error(`Unexpected ${path}`);
    return responses[key];
  });
  jest.mocked(apiSend).mockImplementation(async (path: string, _method, body) => {
    if (path === '/api/training-preferences') return body;
    return undefined;
  });
});

let client: QueryClient;
afterEach(() => client.clear());

async function show(element: ReactElement) {
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
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** Picks an option from the menu the last press opened. */
async function pickMenu(label: string) {
  const [, options] = jest.mocked(showMenu).mock.calls.at(-1)!;
  const option = options.find((item) => item.label === label || item.label === `${label} ✓`);
  if (!option) throw new Error(`No ${label} in ${options.map((item) => item.label)}`);
  await act(async () => option.onPress());
}

describe('Settings', () => {
  it('applies the saved accent, mode and style through the visual selectors', async () => {
    await show(<AppearanceScreen />);
    const emerald = screen.getByRole('radio', { name: 'Emerald, Forest green' });
    await fireEvent.press(emerald);
    expect(emerald).toBeChecked();
    const dark = screen.getByRole('radio', { name: 'Dark' });
    await fireEvent.press(dark);
    expect(dark).toBeChecked();
    const oled = screen.getByRole('radio', { name: 'OLED' });
    await fireEvent.press(oled);
    expect(oled).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Blue, Original' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Automatic' }));
    expect(screen.getByRole('radio', { name: 'Automatic' })).toBeChecked();
  });

  it('filters settings by keyword from the search bar and opens matching subpages', async () => {
    await show(<SettingsScreen />);
    const search = await screen.findByLabelText('Search settings and profile');
    await fireEvent.changeText(search, 'theme');
    await fireEvent.press(screen.getByRole('button', { name: 'Theme and motion' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/appearance');
    await fireEvent.changeText(search, 'timer');
    expect(screen.getByLabelText('Rest timer')).toBeTruthy();
    await fireEvent.changeText(search, 'zzzzzz');
    expect(screen.getByText('No settings found. Try “timer” or “username”.')).toBeVisible();
  });

  it('saves each bodyweight default independently', async () => {
    await show(<BodyweightDefaultsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Default statistic, Average' }));
    await pickMenu('Median');
    await fireEvent.press(screen.getByRole('button', { name: 'Default duration, 30 days' }));
    await pickMenu('14 days');
    expect(screen.getByRole('button', { name: 'Default statistic, Median' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Default duration, 14 days' })).toBeVisible();
  });
  it('saves a new weight unit, so every weight follows it, and refreshes the totals', async () => {
    await show(<SettingsScreen />);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await fireEvent.press(await screen.findByRole('button', { name: 'Weight unit, Kilograms' }));
    await pickMenu('Pounds');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Training preferences saved.'));
    expect(apiSend).toHaveBeenCalledWith('/api/training-preferences', 'PUT', {
      ...preferences,
      preferred_weight_unit: 'lb',
    });
    expect(client.getQueryData<TrainingPreferences>(queryKeys.trainingPreferences)).toMatchObject({
      preferred_weight_unit: 'lb',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.personalRecords });
    expect(screen.getByRole('button', { name: 'Weight unit, Pounds' })).toBeTruthy();
  });

  it('checks a typed weekly goal with the web rule before saving it', async () => {
    await show(<SettingsScreen />);
    const field = await screen.findByLabelText('Default weekly sets per muscle');
    await fireEvent.changeText(field, '0');
    await fireEvent(field, 'endEditing');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter weekly muscle set goals between 1 and 1,000 whole sets.',
    );
    expect(apiSend).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '14');
    await fireEvent(field, 'endEditing');
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/training-preferences', 'PUT', {
        ...preferences,
        weekly_muscle_set_goal: 14,
      }),
    );
  });

  it('turns on auto-save at the web default and offers its times', async () => {
    jest.mocked(apiSend).mockResolvedValueOnce({ after_minutes: 180 });
    await show(<SettingsScreen />);
    await fireEvent(await screen.findByLabelText('Auto-save'), 'valueChange', true);
    expect(apiSend).toHaveBeenCalledWith('/api/workout-auto-save', 'PUT', { after_minutes: 180 });
    expect(await screen.findByRole('button', { name: 'Save after, 3 hours' })).toBeTruthy();
  });

  it('signs out everywhere only after confirming, then signs this phone out', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await show(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    expect(apiSend).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Sign out everywhere?');
    expect(message).toMatch(/Every device signed in/);
    buttons!.find((button) => button.style === 'destructive')!.onPress!();
    await waitFor(() => expect(mockSession.signOut).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/auth/logout', 'POST');
  });

  it('signs this phone out straight away when nothing is waiting to send', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await show(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(mockSession.signOut).toHaveBeenCalled());
  });
});

test('retries feedback with the same submission id and clears the form after success', async () => {
  jest
    .mocked(apiSend)
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ id: 'feedback' });
  await show(<FeedbackScreen />);
  await fireEvent.changeText(
    screen.getByLabelText('Your feedback or feature request'),
    ' Sample feedback ',
  );
  const send = () => fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
  await send();
  expect(await screen.findByText('Connection lost')).toBeVisible();
  await send();
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith('Thanks! Your feedback has been sent.'),
  );
  expect(jest.mocked(apiSend).mock.calls[0]).toEqual(jest.mocked(apiSend).mock.calls[1]);
  expect(screen.getByLabelText('Your feedback or feature request')).toHaveProp('value', '');
});

test('requires explicit confirmation and a password before deleting the account', async () => {
  await show(<DeleteAccountScreen />);
  const remove = screen.getByRole('button', { name: 'Permanently delete account' });
  await fireEvent.changeText(
    screen.getByLabelText('Confirm with your password'),
    'sample-password',
  );
  expect(remove).toBeDisabled();
  await fireEvent(screen.getByLabelText('I understand this is permanent'), 'valueChange', true);
  await fireEvent.press(remove);
  await waitFor(() => expect(mockSession.accountDeleted).toHaveBeenCalledTimes(1));
  expect(apiSend).toHaveBeenCalledWith('/api/profile', 'DELETE', { password: 'sample-password' });
});

test('saves a fresh start to the shared account cache', async () => {
  responses['/api/training-blocks'] = { blocks: [], fresh_starts: [] };
  const saved = { blocks: [], fresh_starts: ['2026-11-01'] };
  jest.mocked(apiSend).mockResolvedValueOnce(saved);
  await show(<FreshStartsScreen />);
  const row = await screen.findByRole('button', { name: /Fresh start date/ });
  await fireEvent.press(row);
  await act(async () => jest.mocked(promptText).mock.calls.at(-1)![0].onSubmit('2026-11-01'));
  responses['/api/training-blocks'] = saved;
  await fireEvent.press(screen.getByRole('button', { name: 'Start fresh' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Fresh start saved'));
  expect(apiSend).toHaveBeenCalledWith('/api/training-blocks/fresh-starts', 'POST', {
    start_date: '2026-11-01',
  });
  expect(screen.getByRole('button', { name: /Remove fresh start.+current/ })).toBeVisible();
});

describe('Settings links', () => {
  it('shows who sees your profile and opens the sharing choices', async () => {
    await show(<SettingsScreen />);
    const row = await screen.findByRole('button', { name: /^Profile sharing/ });
    await waitFor(() => expect(within(row).getByText('Friends only')).toBeVisible());
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenLastCalledWith('/social/sharing');
  });

  it('opens per-muscle goals and heart-rate zones', async () => {
    await show(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Muscle goals' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/muscle-goals');
    await fireEvent.press(screen.getByRole('button', { name: 'Heart-rate zones' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/cardio/zones');
  });
});

describe('Workout types', () => {
  it('adds a type with a colour, refusing a name already used', async () => {
    jest
      .mocked(apiSend)
      .mockResolvedValueOnce({ ...arms, id: 'legs', name: 'Legs', color: '#a855f7' });
    await show(<WorkoutTypesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add workout type' }));
    jest.mocked(promptText).mock.calls[0][0].onSubmit('push');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That workout type already exists. Choose a different name.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add workout type' }));
    jest.mocked(promptText).mock.calls[1][0].onSubmit(' Legs ');
    await fireEvent.press(await screen.findByRole('button', { name: 'Add type' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Legs added'));
    expect(apiSend).toHaveBeenCalledWith('/api/workout-types', 'POST', {
      name: 'Legs',
      color: '#a855f7',
    });
  });

  it('renames only custom types, and removes with an Undo that restores', async () => {
    // The server keeps each change, so a refetch reads it back.
    let custom = arms;
    const save = (changes: Partial<WorkoutType>) => {
      custom = { ...custom, ...changes };
      responses['/api/workout-types'] = [...DEFAULT_WORKOUT_TYPES, custom];
      return custom;
    };
    jest.mocked(apiSend).mockImplementation(async (_path, method, body) => {
      if (method === 'PATCH') return save(body as Partial<WorkoutType>);
      if (method === 'DELETE') save({ archived: true });
      return undefined;
    });
    await show(<WorkoutTypesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Push options' }));
    expect(jest.mocked(showMenu).mock.calls[0][1].map((item) => item.label)).toEqual([
      'Edit exercises',
      'Change colour',
      'Remove',
    ]);
    await pickMenu('Edit exercises');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/settings/type-exercises',
      params: { id: 'push' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Arms options' }));
    await pickMenu('Rename');
    jest.mocked(promptText).mock.calls[0][0].onSubmit('Arms & abs');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Renamed to Arms & abs'));
    expect(apiSend).toHaveBeenCalledWith('/api/workout-types/arms', 'PATCH', {
      name: 'Arms & abs',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Arms & abs options' }));
    await pickMenu('Remove');
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Arms & abs removed', expect.anything()),
    );
    expect(apiSend).toHaveBeenCalledWith('/api/workout-types/arms', 'DELETE');
    expect(await screen.findByRole('button', { name: 'Restore Arms & abs' })).toBeTruthy();
    jest.mocked(showToast).mock.calls.at(-1)![1]!.run();
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/workout-types/arms', 'PATCH', {
        archived: false,
      }),
    );
  });
});

describe('Edit profile', () => {
  it('saves a new name and confirms a sex before saving it once', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(apiSend).mockResolvedValue({ ...mockUser, display_name: 'Sam', sex: 'female' });
    await show(<EditProfileScreen />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Sam');
    await fireEvent.press(screen.getByRole('tab', { name: 'Female' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    expect(alert.mock.calls[0][0]).toBe('Save your sex as Female?');
    expect(apiSend).not.toHaveBeenCalled();
    alert.mock.calls[0][2]!.find((button) => button.text === 'Save')!.onPress!();
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/profile', 'PATCH', {
      display_name: 'Sam',
      sex: 'female',
    });
    expect(mockSession.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Sam' }),
    );
    expect(showToast).toHaveBeenCalledWith('Profile saved.');
  });

  it('shows the web copy for a name another account uses', async () => {
    jest
      .mocked(apiSend)
      .mockRejectedValue(new ApiError(409, 'That name is taken.', 'display_name_taken'));
    await show(<EditProfileScreen />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Taken');
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another account already uses that name. Add a surname, initial or nickname.',
    );
  });
});

describe('Password change required', () => {
  it('checks the fields with the web rules, then saves and lets the app open', async () => {
    jest.mocked(apiSend).mockResolvedValue(undefined);
    jest.mocked(apiGet).mockResolvedValue({ ...mockUser, must_change_password: false });
    await show(<PasswordRequiredScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the temporary password.');
    await fireEvent.changeText(screen.getByLabelText('Temporary password'), 'temporary-1');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'New password: use at least 10 characters.',
    );
    await fireEvent.changeText(screen.getByLabelText('New password'), 'a much better one');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'a much better one');
    await fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() =>
      expect(mockSession.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ must_change_password: false }),
      ),
    );
    expect(apiSend).toHaveBeenCalledWith('/api/profile/password', 'PUT', {
      current_password: 'temporary-1',
      new_password: 'a much better one',
    });
  });

  it('explains a temporary password reused as the new one', async () => {
    jest
      .mocked(apiSend)
      .mockRejectedValue(new ApiError(400, 'Choose another.', 'password_unchanged'));
    await show(<PasswordRequiredScreen />);
    for (const label of ['Temporary password', 'New password', 'Confirm new password'])
      await fireEvent.changeText(screen.getByLabelText(label), 'same-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a different password from the temporary one.',
    );
    expect(mockSession.updateUser).not.toHaveBeenCalled();
  });
});
