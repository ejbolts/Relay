import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ReactElement } from 'react';
import { Alert, Linking, type AlertButton } from 'react-native';
import type { User, WorkoutSession, YouTubeConnection } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { clipFromAsset } from './videoData';
import { VideosScreen } from './VideosScreen';

// A full parallel run is slow to render the first screen.
configure({ asyncUtilTimeout: 8000 });

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../data/uploadFile', () => ({ uploadFile: jest.fn() }));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../body/DateField', () => ({ DateField: () => null }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  VideoExportPreset: { Passthrough: 0 },
}));
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
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));

const connected: YouTubeConnection = {
  status: 'connected',
  channel_id: 'chan',
  channel_title: 'Sample Lifts',
  channel_url: 'https://www.youtube.com/channel/chan',
  can_disconnect: true,
  message: 'Uploads go to this channel.',
  privacy_status: 'unlisted',
};
const session: WorkoutSession = {
  id: 's1',
  name: 'Leg day',
  workout_date: '2026-11-20',
  notes: null,
  status: 'draft',
  expected_clip_count: 2,
  uploaded_clip_count: 0,
  processing_error: null,
  youtube_video_id: null,
  youtube_url: null,
  created_at: '2026-11-20T00:00:00Z',
  updated_at: '2026-11-20T00:00:00Z',
  clips: [],
  timestamps: [],
};

let client: QueryClient;
let youtube: YouTubeConnection;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  youtube = connected;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/youtube/connection') return youtube;
    if (path === '/api/health')
      return { status: 'ok', upload_concurrency: 2, youtube_mock_mode: false };
    if (path === '/api/exercises') return [{ id: 'squat', name: 'Back Squat' }];
    throw new Error(`Unexpected ${path}`);
  });
});
afterEach(() => client.clear());

async function open(component: ReactElement) {
  await render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}

it('names picked and recorded videos and refuses other files', () => {
  const asset = { uri: 'file:///a.mov', width: 1, height: 1 };
  expect(
    clipFromAsset({ ...asset, fileName: 'IMG_1.MOV', mimeType: 'video/quicktime' }, 0),
  ).toMatchObject({ name: 'IMG_1.MOV', type: 'video/quicktime', status: 'waiting' });
  expect(clipFromAsset({ ...asset, uri: 'file:///rec', mimeType: 'video/mp4' }, 2)?.name).toBe(
    'set-3.mp4',
  );
  expect(clipFromAsset({ ...asset, fileName: 'clip.webm', mimeType: 'video/webm' }, 0)).toBeNull();
});

it('picks set videos, uploads them in order with labels, then follows processing', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///one.mp4',
        fileName: 'one.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        duration: 12000,
        width: 1,
        height: 1,
      },
      {
        uri: 'file:///two.mp4',
        fileName: 'two.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        width: 1,
        height: 1,
      },
    ],
  } as ImagePicker.ImagePickerResult);
  jest.mocked(uploadFile).mockImplementation(async (_path, _method, _file, options) => {
    options?.onProgress?.(100);
    return {};
  });
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  await open(<VideosScreen />);
  expect(await screen.findByText('Sample Lifts')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Leg day');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  expect(await screen.findByText('2 clips')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Set 2 exercise'), 'squ');
  await fireEvent.press(await screen.findByRole('button', { name: 'Back Squat' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Move set 2 up' }));

  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  expect(await screen.findByText('Queued')).toBeTruthy();
  expect(apiSend).toHaveBeenCalledWith(
    '/api/sessions',
    'POST',
    expect.objectContaining({ name: 'Leg day', expected_clip_count: 2 }),
  );
  const sent = jest.mocked(uploadFile).mock.calls.map(([path, , file, options]) => ({
    path,
    name: file.name,
    fields: options?.fields,
  }));
  expect(sent).toEqual([
    {
      path: '/api/sessions/s1/clips',
      name: 'two.mp4',
      fields: expect.objectContaining({ order_index: '0', exercise_label: 'Back Squat' }),
    },
    {
      path: '/api/sessions/s1/clips',
      name: 'one.mp4',
      fields: expect.objectContaining({ order_index: '1', exercise_label: '' }),
    },
  ]);

  jest.mocked(apiGet).mockResolvedValueOnce({
    ...session,
    status: 'complete',
    youtube_url: 'https://youtu.be/v',
    timestamps: [
      { clip_id: 'c1', order_index: 0, label: 'Back Squat', start_seconds: 0, youtube_url: null },
    ],
  });
  // The processing screen checks the session again every 2.5 seconds.
  expect(await screen.findByText('Session complete'.toUpperCase())).toBeTruthy();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await fireEvent.press(screen.getByRole('link', { name: /Back Squat/ }));
  expect(Linking.openURL).toHaveBeenCalledWith('https://youtu.be/v');
});

it('hands connecting YouTube to the web and disconnects in the app', async () => {
  jest.spyOn(Alert, 'alert');
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.mocked(apiSend).mockResolvedValue({
    ...connected,
    status: 'not_connected',
    channel_id: null,
    channel_title: null,
    message: 'YouTube disconnected.',
  });
  await open(<VideosScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Reconnect YouTube on the web' }),
  );
  expect(Linking.openURL).toHaveBeenCalledWith('https://relay.test/#videos');
  await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[];
  await act(async () =>
    buttons.find((button) => button.text === 'Disconnect YouTube')?.onPress?.(),
  );
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('YouTube disconnected.'));
  expect(await screen.findByText('Not connected')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add set videos' })).toBeDisabled();
});

it('tells an account without video access to ask the administrator', async () => {
  mockUser.can_upload_videos = false;
  await open(<VideosScreen />);
  expect(screen.getByText(/Video uploads are disabled for this account/)).toBeTruthy();
  mockUser.can_upload_videos = true;
});
