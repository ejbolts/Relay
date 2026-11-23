import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactElement } from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';
import type {
  AccountLimitsSettings,
  AdminUser,
  AppFeedback,
  ServerSettings,
  ServerStatus,
  User,
} from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { onAdminActivity, type AdminActivity } from '../../data/livePresence';
import { promptText, showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { AdminAccountScreen } from './AdminAccountScreen';
import { AdminScreen } from './AdminScreen';
import { AdminServerScreen } from './AdminServerScreen';
import { AdminSettingsSection } from './AdminSettingsSection';

// A full parallel run is slow to render the first screen.
configure({ asyncUtilTimeout: 8000 });

const mockRouter = { push: jest.fn(), back: jest.fn() };
let mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
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

async function open(component: ReactElement) {
  await render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
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
  await act(async () => jest.mocked(promptText).mock.lastCall![0].onSubmit('x'));
  expect(await screen.findByRole('alert')).toBeTruthy();
  await act(async () => jest.mocked(promptText).mock.lastCall![0].onSubmit('casey'));
  expect(await screen.findByText('This username is already registered.')).toBeTruthy();
  await act(async () => jest.mocked(promptText).mock.lastCall![0].onSubmit('Riley.R '));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Riley’s username is now @riley.r.'));

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
