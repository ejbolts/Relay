import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactElement } from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type {
  AccountLimitsSettings,
  AdminUser,
  AppFeedback,
  ServerSettings,
  ServerStatus,
  User,
} from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { expectOfflineUntilOnline } from '../../testing/offlineScreen';
import { onAdminActivity, type AdminActivity } from '../../data/livePresence';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { AdminAccountScreen } from './AdminAccountScreen';
import { AdminScreen } from './AdminScreen';
import { AdminServerScreen } from './AdminServerScreen';
import { AdminUsernameScreen } from './AdminUsernameScreen';
import AdminLayout from '../../app/admin/_layout';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { AdminSettingsSection } from './AdminSettingsSection';

// A full parallel run is slow to render the first screen.
configure({ asyncUtilTimeout: 8000 });

const mockRouter = { push: jest.fn(), back: jest.fn() };
let mockParams: { id?: string } = {};
// The last leave guard the screen set: whether it blocks, and what it does when leaving is tried.
let mockPrevent: { blocking: boolean; onLeave?: (event: { repeat: () => void }) => void } = {
  blocking: false,
};
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const Stack = ({ children }: { children?: unknown }) =>
    createElement(Text, null, 'Admin stack', children as never);
  Stack.Screen = function Screen() {
    return null;
  };
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePreventRemove: (blocking: boolean, onLeave?: (event: { repeat: () => void }) => void) => {
      mockPrevent = { blocking, onLeave };
    },
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `Redirect to ${href}`),
    Stack,
  };
});
// The layout reads its own stack's first screen from the navigator it is rendered in.
jest.mock('expo-router/react-navigation', () => ({
  useRoute: () => ({ key: 'admin' }),
  useNavigationState: () => undefined,
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
let mockActivity: ((activity: AdminActivity | null) => void) | null = null;
jest.mock('../../data/livePresence', () => ({
  onAdminActivity: jest.fn((listener) => {
    mockActivity = listener;
    return () => (mockActivity = null);
  }),
}));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn(), promptText: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const mockUser: User = {
  id: 'owner',
  username: 'preview',
  display_name: 'Preview',
  is_admin: true,
  can_upload_videos: true,
  created_at: '2026-11-01T00:00:00Z',
  sex: null,
  profile_photo_url: null,
};
const mockSession = { updateUser: jest.fn() };
jest.mock('../../session/SessionProvider', () => ({
  useUser: () => mockUser,
  useSession: () => mockSession,
}));

function account(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: 'casey',
    username: 'casey',
    display_name: 'Casey',
    is_admin: false,
    disabled_at: null,
    must_change_password: false,
    created_at: '2026-01-01T00:00:00Z',
    last_active_at: null,
    signed_in_devices: 1,
    workouts: 12,
    photos: 2,
    photo_bytes: 2048,
    video_sessions: 0,
    sex: null,
    ...overrides,
  };
}
const owner = account({
  id: 'owner',
  username: 'preview',
  display_name: 'Preview',
  is_admin: true,
});
const casey = account({});
const riley = account({
  id: 'riley',
  username: 'riley',
  display_name: 'Riley',
  password_reset_requested_at: new Date().toISOString(),
});
const feedback: AppFeedback = {
  id: 'f1',
  username: 'casey',
  message: 'Love the new charts',
  created_at: '2026-11-02T00:00:00Z',
  resolved_at: null,
  resolved_by: null,
};
const settings: ServerSettings = {
  video_uploads: 'admin',
  allow_registration: false,
  invite_code_required: false,
};
const status: ServerStatus = {
  disk: { total_bytes: 1000, used_bytes: 420, free_bytes: 580 },
  database_bytes: 2048,
  photos: 3,
  photo_bytes: 4096,
  video_file_bytes: 0,
  video_queue: { queued: 0 },
  client_versions: [
    {
      version: '1.4.0',
      users: 2,
      sessions: 3,
      last_seen_at: new Date().toISOString(),
      native_clients: [{ client: 'android/1.0.2', sessions: 1 }],
    },
  ],
  minimum_write_version: null,
};
const limitValues = {
  workouts_per_account: 5000,
  cardio_sessions_per_account: 5000,
  custom_exercises_per_account: 500,
  photos_per_account: 500,
  workout_photos_per_account: 500,
  saves_per_minute: 60,
  exercises_per_workout: 40,
  sets_per_workout: 200,
  workout_note_characters: 2000,
  exercise_note_characters: 1000,
  set_note_characters: 200,
  photo_upload_megabytes: 10,
};
const limits: AccountLimitsSettings = {
  values: limitValues,
  defaults: limitValues,
  bounds: Object.fromEntries(
    Object.keys(limitValues).map((name) => [name, { minimum: 1, maximum: 100000 }]),
  ) as AccountLimitsSettings['bounds'],
};

let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockParams = {};
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const responses: Record<string, unknown> = {
    '/api/admin/users': [owner, casey, riley],
    '/api/admin/feedback': [feedback],
    '/api/admin/feedback/summary': { open: 1 },
    '/api/admin/settings': settings,
    '/api/admin/status': status,
    '/api/admin/limits': limits,
    '/api/auth/me': { ...mockUser },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected ${path}`);
    return responses[path];
  });
});
afterEach(() => client.clear());

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function wrapped(component: ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{component}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function open(component: ReactElement) {
  await render(wrapped(component));
}

/** Presses the named button of the last Alert. */
async function answerAlert(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.text === text)?.onPress?.());
}

it('lists accounts with requests first, searches, filters and opens one', async () => {
  await open(<AdminScreen />);
  expect(await screen.findByText('3 accounts')).toBeTruthy();
  expect(screen.getByText('1 reset request')).toBeTruthy();
  const names = screen.getAllByRole('button', { name: /^(Preview|Casey|Riley), @/ });
  expect(names[0].props.accessibilityLabel).toBe('Riley, @riley');

  await fireEvent.changeText(screen.getByLabelText('Search accounts'), 'CAS');
  expect(screen.queryByText('Riley')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search accounts'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Reset requested' }));
  expect(screen.queryByText('Casey')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Riley, @riley' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/admin/account/riley');
});

it('updates an account card from live admin activity', async () => {
  await open(<AdminScreen />);
  await screen.findByText('3 accounts');
  expect(onAdminActivity).toHaveBeenCalled();
  await act(async () =>
    mockActivity?.({
      userId: 'casey',
      presence: {
        online: true,
        last_active_at: new Date().toISOString(),
        workout: { name: 'Leg day', started_at: new Date().toISOString() },
      } as AdminActivity['presence'],
    }),
  );
  expect(await screen.findByText('Live · Leg day')).toBeTruthy();
});

it('resolves feedback and changes server switches with a toast', async () => {
  jest.mocked(apiSend).mockImplementation(async (path: string, _method, body) => {
    if (path === '/api/admin/feedback/f1')
      return { ...feedback, resolved_at: '2026-11-03T00:00:00Z', resolved_by: 'preview' };
    if (path === '/api/admin/settings') return { ...settings, ...(body as object) };
    throw new Error(`Unexpected ${path}`);
  });
  await open(<AdminScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Resolve feedback from @casey' }),
  );
  expect(apiSend).toHaveBeenCalledWith('/api/admin/feedback/f1', 'PATCH', { resolved: true });
  expect(showToast).toHaveBeenCalledWith('Resolved feedback from @casey.');
  expect(await screen.findByRole('button', { name: 'Reopen feedback from @casey' })).toBeTruthy();

  await fireEvent(screen.getByLabelText('New sign-ups'), 'valueChange', true);
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Sign-ups are open.'));
  expect(apiSend).toHaveBeenCalledWith('/api/admin/settings', 'PATCH', {
    allow_registration: true,
  });

  await fireEvent.press(screen.getByRole('button', { name: /^Video uploads/ }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Everyone')!.onPress());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Video uploads: Everyone.'));
  // The admin's own access to Videos refreshes straight away.
  expect(mockSession.updateUser).toHaveBeenCalled();
});

it('resets a password, shows it once and copies it', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  jest.mocked(apiSend).mockResolvedValue({ temporary_password: 'brisk-otter-42' });
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reset password' }));
  await answerAlert('Reset and sign out');
  expect(await screen.findByText('brisk-otter-42')).toBeTruthy();
  expect(apiSend).toHaveBeenCalledWith('/api/admin/users/riley/reset-password', 'POST');
  // The card's heading, and the account's new tag.
  expect(screen.getAllByText('Temporary password')).toHaveLength(2);
  await fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('brisk-otter-42');
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByText('brisk-otter-42')).toBeNull();
});

it('disables an account, changes its username and dismisses its request', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  jest.mocked(apiSend).mockImplementation(async (path: string, _method, body) => {
    if (path === '/api/admin/users/riley') return { ...riley, disabled_at: '2026-11-03T00:00:00Z' };
    if (path === '/api/admin/users/riley/username') {
      if ((body as { username: string }).username === 'casey')
        throw new ApiError(409, 'Taken', 'username_taken');
      return { ...riley, username: 'riley.r' };
    }
    if (path === '/api/admin/password-reset-requests/riley') return undefined;
    throw new Error(`Unexpected ${path}`);
  });
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Disable account' }));
  await answerAlert('Disable and sign out');
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Riley is disabled and signed out.'));
  expect(await screen.findByRole('button', { name: 'Enable account' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Change username' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/admin/username/riley');

  await fireEvent.press(screen.getByRole('button', { name: 'Dismiss request' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/admin/password-reset-requests/riley', 'DELETE'),
  );
  await waitFor(() => expect(screen.queryByText('Reset requested')).toBeNull());
});

it('saves only valid limits and shows storage and app versions', async () => {
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
    ...limits,
    values: body,
  }));
  await open(<AdminServerScreen />);
  expect(await screen.findByText('580 B free of 1000 B (42% used)')).toBeTruthy();
  expect(screen.getByText('Version 1.4.0')).toBeTruthy();
  expect(screen.getByText('Android 1.0.2 · 1 device')).toBeTruthy();
  const save = screen.getByRole('button', { name: 'Save limits' });
  expect(save).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Sets'), '0');
  expect(save).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Sets'), '150');
  await fireEvent.press(screen.getByRole('button', { name: 'Save limits' }));
  expect(apiSend).toHaveBeenCalledWith(
    '/api/admin/limits',
    'PUT',
    expect.objectContaining({ sets_per_workout: 150 }),
  );
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Limits saved.'));
});

it('shows the Admin row in Settings only to administrators', async () => {
  await open(<AdminSettingsSection />);
  const row = await screen.findByRole('button', { name: 'Admin console, 1 feedback' });
  await fireEvent.press(row);
  expect(mockRouter.push).toHaveBeenCalledWith('/admin');
  await act(async () => {
    mockUser.is_admin = false;
    await screen.rerender(
      <QueryClientProvider client={client}>
        <AdminSettingsSection />
      </QueryClientProvider>,
    );
  });
  expect(screen.queryByText('Admin console')).toBeNull();
  mockUser.is_admin = true;
});

// Review fixes (Sol review of #469).

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

it('drops a settings save and its profile refresh that answer after signing out', async () => {
  const saved = deferred<ServerSettings>();
  jest.mocked(apiSend).mockImplementation(() => saved.promise as never);
  await open(<AdminScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Video uploads/ }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Everyone')!.onPress());
  // Signing out moves the provider's session on, unmounts every signed-in screen and clears the
  // account's cached data (the full provider transition is in accountGuard.test.tsx).
  nextSessionEpoch();
  await act(async () => screen.unmount());
  client.clear();
  await act(async () => saved.resolve({ ...settings, video_uploads: 'everyone' }));
  expect(client.getQueryData(['admin', 'settings'])).toBeUndefined();
  expect(apiGet).not.toHaveBeenCalledWith('/api/auth/me');
  expect(mockSession.updateUser).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('still saves a confirmed setting and refreshes the profile after an ordinary Back', async () => {
  const saved = deferred<ServerSettings>();
  jest.mocked(apiSend).mockImplementation(() => saved.promise as never);
  await open(<AdminScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Video uploads/ }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Off')!.onPress());
  // Back closes the console; the same account is still signed in.
  await act(async () => screen.unmount());
  await act(async () => saved.resolve({ ...settings, video_uploads: 'off' }));
  await waitFor(() => expect(mockSession.updateUser).toHaveBeenCalled());
  expect(client.getQueryData<ServerSettings>(['admin', 'settings'])?.video_uploads).toBe('off');
  // The console is gone, so no toast.
  expect(showToast).not.toHaveBeenCalled();
});

it('keeps the profile when the refresh answers for another account', async () => {
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
    ...settings,
    ...(body as object),
  }));
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/auth/me' ? { ...mockUser, id: 'someone-else' } : fetched(path),
    );
  await open(<AdminScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Video uploads/ }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Everyone')!.onPress());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Video uploads: Everyone.'));
  expect(mockSession.updateUser).not.toHaveBeenCalled();
});

it('keeps the screen and Reset locked until a reset answers, then asks before leaving', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  const reset = deferred<{ temporary_password: string }>();
  jest.mocked(apiSend).mockImplementation(() => reset.promise as never);
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reset password' }));
  await answerAlert('Reset and sign out');
  // A second confirmed reset while the first is on its way never reaches the server.
  await fireEvent.press(screen.getByRole('button', { name: 'Reset password' }));
  await answerAlert('Reset and sign out');
  expect(apiSend).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled();
  expect(mockPrevent.blocking).toBe(true);
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  expect(repeat).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('Wait for the password reset to finish.', undefined, {
    variant: 'warning',
  });

  await act(async () => reset.resolve({ temporary_password: 'brisk-otter-42' }));
  expect(await screen.findByText('brisk-otter-42')).toBeTruthy();
  expect(mockPrevent.blocking).toBe(true);
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await answerAlert('Stay');
  expect(repeat).not.toHaveBeenCalled();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await answerAlert('Leave');
  expect(repeat).toHaveBeenCalledTimes(1);
});

it('never sends a second reset for an account from another copy of its screen', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  const reset = deferred<{ temporary_password: string }>();
  jest.mocked(apiSend).mockImplementation(() => reset.promise as never);
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reset password' }));
  await answerAlert('Reset and sign out');
  // The same account opened again elsewhere, such as from a notice, while the first is waiting.
  await screen.rerender(
    wrapped(
      <>
        <AdminAccountScreen />
        <AdminAccountScreen />
      </>,
    ),
  );
  const buttons = await screen.findAllByRole('button', { name: 'Reset password' });
  await fireEvent.press(buttons[1]);
  await answerAlert('Reset and sign out');
  expect(apiSend).toHaveBeenCalledTimes(1);
  await act(async () => reset.resolve({ temporary_password: 'brisk-otter-42' }));
});

it('keeps the typed username and its error beside the field until a name saves', async () => {
  mockParams = { id: 'riley' };
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => {
    if ((body as { username: string }).username === 'casey')
      throw new ApiError(409, 'Taken', 'username_taken');
    return { ...riley, username: 'riley.r' };
  });
  await open(<AdminUsernameScreen />);
  const field = await screen.findByLabelText('Username');
  await fireEvent.changeText(field, 'x');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Username').props.value).toBe('x');
  expect(apiSend).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Username'), 'casey');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('This username is already registered.')).toBeTruthy();
  expect(screen.getByLabelText('Username').props.value).toBe('casey');
  expect(mockRouter.back).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Username'), 'Riley.R ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Riley’s username is now @riley.r.'));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(
    client.getQueryData<AdminUser[]>(['admin', 'users'])?.find((row) => row.id === 'riley')
      ?.username,
  ).toBe('riley.r');
});

it('holds leaving the username screen while its save is on its way', async () => {
  mockParams = { id: 'riley' };
  const rename = deferred<AdminUser>();
  jest.mocked(apiSend).mockImplementation(() => rename.promise as never);
  await open(<AdminUsernameScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Username'), 'riley.r');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  // A second press while the first is on its way sends nothing.
  await fireEvent.press(screen.getByRole('button', { name: 'Saving…' }));
  expect(apiSend).toHaveBeenCalledTimes(1);
  expect(mockPrevent.blocking).toBe(true);
  await act(async () => mockPrevent.onLeave?.({ repeat: jest.fn() }));
  expect(showToast).toHaveBeenCalledWith('Wait for the username to save.', undefined, {
    variant: 'warning',
  });
  await act(async () => rename.resolve({ ...riley, username: 'riley.r' }));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(mockPrevent.blocking).toBe(false);
});

it('lets leaving go once the temporary password is dismissed', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  jest.mocked(apiSend).mockResolvedValue({ temporary_password: 'brisk-otter-42' });
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reset password' }));
  await answerAlert('Reset and sign out');
  await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
  expect(mockPrevent.blocking).toBe(false);
});

it('sends anyone but an administrator away from the admin stack', async () => {
  mockUser.is_admin = false;
  try {
    await open(<AdminLayout />);
    expect(screen.getByText('Redirect to /settings')).toBeTruthy();
    expect(screen.queryByText('Admin stack')).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
    expect(onAdminActivity).not.toHaveBeenCalled();
  } finally {
    mockUser.is_admin = true;
  }
  await screen.rerender(wrapped(<AdminLayout />));
  expect(screen.getByText('Admin stack')).toBeTruthy();
});

it('keeps live activity that arrived while an older account list was loading', async () => {
  // The console mounts and subscribes; its first list is still on its way.
  const list = deferred<AdminUser[]>();
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/admin/users' ? list.promise : fetched(path),
    );
  await open(<AdminScreen />);
  await act(async () =>
    mockActivity?.({
      userId: 'casey',
      presence: {
        online: true,
        last_active_at: new Date().toISOString(),
        workout: { name: 'Leg day', started_at: new Date().toISOString() },
      } as AdminActivity['presence'],
    }),
  );
  // The list was read before the workout started, so it still shows Casey idle.
  await act(async () => list.resolve([owner, casey, riley]));
  expect(await screen.findByText('Live · Leg day')).toBeTruthy();
});

it('holds leaving while the reset confirmation is open, so a late answer is never lost', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  jest.mocked(apiSend).mockResolvedValue({ temporary_password: 'brisk-otter-42' });
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reset password' }));
  // Back reaches the screen before the confirmation's answer does.
  expect(mockPrevent.blocking).toBe(true);
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  expect(repeat).not.toHaveBeenCalled();
  await answerAlert('Reset and sign out');
  expect(await screen.findByText('brisk-otter-42')).toBeTruthy();
});

it('lets leaving go again when the reset confirmation is cancelled', async () => {
  jest.spyOn(Alert, 'alert');
  mockParams = { id: 'riley' };
  await open(<AdminAccountScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reset password' }));
  await answerAlert('Cancel');
  expect(mockPrevent.blocking).toBe(false);
  expect(apiSend).not.toHaveBeenCalled();
});

describe('offline with nothing saved', () => {
  test('the admin console says so instead of spinning, then loads', async () => {
    await expectOfflineUntilOnline(
      jest.mocked(apiGet),
      () => open(<AdminScreen />),
      () => expect(screen.getByText('3 accounts')).toBeTruthy(),
    );
  });

  test('an account says so instead of spinning, then loads', async () => {
    mockParams = { id: 'riley' };
    await expectOfflineUntilOnline(
      jest.mocked(apiGet),
      () => open(<AdminAccountScreen />),
      () => expect(screen.getByRole('button', { name: 'Reset password' })).toBeTruthy(),
    );
  });

  test('the server panel says so instead of spinning, then loads', async () => {
    await expectOfflineUntilOnline(
      jest.mocked(apiGet),
      () => open(<AdminServerScreen />),
      () => expect(screen.getByText('Version 1.4.0')).toBeTruthy(),
    );
  });

  test('changing a username says so instead of spinning, then loads', async () => {
    mockParams = { id: 'riley' };
    await expectOfflineUntilOnline(
      jest.mocked(apiGet),
      () => open(<AdminUsernameScreen />),
      () => expect(screen.getByLabelText('Username')).toBeTruthy(),
    );
  });
});
