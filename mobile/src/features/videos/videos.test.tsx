import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { ReactElement } from 'react';
import { Alert, Linking, type AlertButton } from 'react-native';
import type { User, WorkoutSession, YouTubeConnection } from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { UploadStopped } from '../../data/uploadFile';
import { nextSessionEpoch, runBeforeSignOut } from '../../session/sessionEpoch';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { startClipUpload } from './clipUpload';
import { clipFromAsset } from './videoData';
import { VideosScreen } from './VideosScreen';
import { YouTubeSettingsScreen } from './YouTubeSettings';
import {
  resetVideoUploadStore,
  syncVideoUploadSession,
  videoUploadActions,
  VideoUploadSessionSync,
} from './videoUploadStore';

// A full parallel run is slow to render the first screen.
configure({ asyncUtilTimeout: 8000 });

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('./clipUpload', () => ({ startClipUpload: jest.fn() }));
jest.mock('../../data/session', () => ({
  ...jest.requireActual<typeof import('../../data/session')>('../../data/session'),
  sessionToken: jest.fn(),
  forgetSessionTokenIf: jest.fn(),
}));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  toastAccount: () => 'user:owner#0',
}));
jest.mock('../body/DateField', () => ({ DateField: () => null }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  VideoExportPreset: { Passthrough: 0 },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
interface MockClipPlayer {
  source: unknown;
  status: string;
  released: boolean;
  muted: boolean;
  loop: boolean;
  play: jest.Mock;
  emit: (event: string, payload: unknown) => void;
  addListener: jest.Mock;
}
const mockClipPlayers: MockClipPlayer[] = [];
// The status the next player starts in, as a player that failed before the screen subscribed.
let mockNextPlayerStatus = 'idle';
jest.mock('expo-video', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useVideoPlayer: (source: unknown, setup?: (player: MockClipPlayer) => void) => {
      const { useEffect, useRef } = jest.requireActual<typeof import('react')>('react');
      const ref = useRef(null as MockClipPlayer | null);
      if (!ref.current) {
        const listeners = new Map<string, Set<(payload: unknown) => void>>();
        const player: MockClipPlayer = {
          source,
          status: mockNextPlayerStatus,
          released: false,
          muted: false,
          loop: false,
          play: jest.fn(),
          emit(event: string, payload: unknown) {
            listeners.get(event)?.forEach((cb) => cb(payload));
          },
          addListener: jest.fn((event: string, cb: (payload: unknown) => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(cb);
            return { remove: () => listeners.get(event)?.delete(cb) };
          }),
        };
        setup?.(player);
        mockClipPlayers.push(player);
        ref.current = player;
      }
      const current = ref.current;
      useEffect(
        () => () => {
          current.released = true;
        },
        [current],
      );
      return current;
    },
    VideoView: (props: Record<string, unknown>) => createElement(View, props),
  };
});

const defaultUser: User = {
  id: 'owner',
  username: 'preview',
  display_name: 'Preview',
  is_admin: true,
  can_upload_videos: true,
  created_at: '2026-11-01T00:00:00Z',
  sex: null,
  profile_photo_url: null,
};
let mockUser: User = { ...defaultUser };
let mockSessionStatus: { kind: 'signed-in'; user: User } | { kind: 'signed-out' } = {
  kind: 'signed-in',
  user: mockUser,
};
jest.mock('../../session/SessionProvider', () => ({
  useUser: () => mockUser,
  useOptionalSession: () => ({ status: mockSessionStatus }),
}));

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
  mockUser = { ...defaultUser };
  mockSessionStatus = { kind: 'signed-in', user: mockUser };
  resetVideoUploadStore();
  jest.mocked(sessionToken).mockResolvedValue('tok-A');
  jest.mocked(forgetSessionTokenIf).mockResolvedValue('forgotten');
  mockClipPlayers.length = 0;
  mockNextPlayerStatus = 'idle';
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
afterEach(() => {
  resetVideoUploadStore();
  client.clear();
});

async function open(component: ReactElement) {
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
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
  jest.mocked(startClipUpload).mockImplementation((_path, _file, _fields, onProgress) => {
    onProgress(100);
    return { done: Promise.resolve({} as never), stop: jest.fn() };
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
  const sent = jest.mocked(startClipUpload).mock.calls.map(([path, file, fields]) => ({
    path,
    name: file.name,
    fields,
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

// Connecting is covered by youtube.test.tsx.
it('disconnects YouTube in the app', async () => {
  jest.spyOn(Alert, 'alert');
  jest.mocked(apiSend).mockResolvedValue({
    ...connected,
    status: 'not_connected',
    channel_id: null,
    channel_title: null,
    message: 'YouTube disconnected.',
  });
  await open(<VideosScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect' }));
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
});

const clipAsset = (name: string) => ({
  uri: `file:///${name}`,
  fileName: name,
  mimeType: 'video/mp4',
  width: 1,
  height: 1,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Names the session, picks clips (two by default) and presses Upload session. */
async function pickAndUpload(names = ['one.mp4', 'two.mp4']) {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: names.map(clipAsset),
  } as ImagePicker.ImagePickerResult);
  const view = await open(<VideosScreen />);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Leg day');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText(`${names.length} ${names.length === 1 ? 'clip' : 'clips'}`);
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  return view;
}

/** Transfers that run until stopped, then settle as stopped, as the real ones do. */
function stoppableTransfers() {
  const stops: jest.Mock[] = [];
  jest.mocked(startClipUpload).mockImplementation(() => {
    let fail!: (reason: unknown) => void;
    const done = new Promise<never>((_resolve, reject) => (fail = reject));
    const stop = jest.fn(() => fail(new UploadStopped()));
    stops.push(stop);
    return { done, stop };
  });
  return stops;
}

/** Transfers the test controls by hand: progress updates, completion, and stop spies. */
function controllableTransfers() {
  const controls: { progress: (percent: number) => void; finish: () => void; stop: jest.Mock }[] =
    [];
  jest.mocked(startClipUpload).mockImplementation((_path, _file, _fields, onProgress) => {
    let resolve!: (value: never) => void;
    let reject!: (reason: unknown) => void;
    const done = new Promise<never>((doneFn, failFn) => {
      resolve = doneFn;
      reject = failFn;
    });
    const stop = jest.fn(() => reject(new UploadStopped()));
    controls.push({ progress: onProgress, finish: () => resolve({} as never), stop });
    return { done, stop };
  });
  return controls;
}

const alertButton = async (text: string) => {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.text === text)?.onPress?.());
};

const WAKE_TAG = /^relay-video-upload-\d+$/;
const lastActivatedTag = () => jest.mocked(activateKeepAwakeAsync).mock.lastCall![0] as string;
const releasedTags = () => jest.mocked(deactivateKeepAwake).mock.calls.map(([tag]) => tag);

it('keeps uploading and holds the wake lock after leaving Videos, and shows progress on return', async () => {
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  const view = await pickAndUpload(['one.mp4', 'two.mp4']);
  await screen.findByText('UPLOADING SESSION');
  const wakeTag = lastActivatedTag();
  expect(wakeTag).toMatch(WAKE_TAG);

  // Leave Videos mid-upload: transfers stay active and the wake lock is not released.
  await act(async () => view.unmount());
  expect(transfers.every((item) => item.stop.mock.calls.length === 0)).toBe(true);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  // Progress continues while away, and returning shows the live progress.
  await act(async () => {
    transfers[0].progress(60);
    transfers[1].progress(20);
  });
  const returned = await open(<VideosScreen />);
  expect(await screen.findByText('UPLOADING SESSION')).toBeTruthy();
  expect(screen.getByText('40%')).toBeTruthy();
  expect(screen.getByText('uploading · 60%')).toBeTruthy();

  // Leave again while clips finish: processing starts automatically and releases the wake lock.
  await act(async () => returned.unmount());
  await act(async () => transfers.forEach((item) => item.finish()));
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/process', 'POST'));
  await waitFor(() => expect(releasedTags()).toContain(wakeTag));

  // Returning now shows the processing screen directly.
  await open(<VideosScreen />);
  expect(await screen.findByText('Queued')).toBeTruthy();
});

it("locks Settings' YouTube channel while a batch waits to start, until processing begins", async () => {
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  const view = await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  await act(async () => view.unmount());

  // Settings' channel panel, opened while the clip is still transferring.
  await open(<YouTubeSettingsScreen />);
  const locked = 'The channel can change once the video upload finishes or is discarded.';
  expect(await screen.findByText(locked)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reconnect YouTube' })).toBeDisabled();

  // Once processing begins, the server's own busy check takes over and the panel unlocks.
  await act(async () => transfers[0].finish());
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/process', 'POST'));
  await waitFor(() => expect(screen.queryByText(locked)).toBeNull());
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
});

it('keeps the channel locked after a failed clip until the batch is discarded', async () => {
  jest.spyOn(Alert, 'alert');
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.reject(new Error('Network request failed')),
    stop: jest.fn(),
  }));
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') return { ...session, status: 'cancelled' };
    if (path === '/api/sessions/s1') return undefined;
    throw new Error(`Unexpected ${path}`);
  });
  const videos = await pickAndUpload(['one.mp4']);
  await screen.findByRole('button', { name: 'Retry failed uploads' });
  await act(async () => videos.unmount());

  // The clip needs retrying, so the batch still waits on this channel.
  const settings = await open(<YouTubeSettingsScreen />);
  const locked = 'The channel can change once the video upload finishes or is discarded.';
  expect(await screen.findByText(locked)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  await act(async () => settings.unmount());

  const back = await open(<VideosScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Stop and discard' }));
  await alertButton('Stop and discard');
  expect(await screen.findByText('Upload your sets')).toBeTruthy();
  await act(async () => back.unmount());

  await open(<YouTubeSettingsScreen />);
  expect(await screen.findByRole('button', { name: 'Disconnect' })).toBeEnabled();
  expect(screen.queryByText(locked)).toBeNull();
});

it('keeps creating a session and starts clip uploads even after leaving Videos', async () => {
  const created = deferred<WorkoutSession>();
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation((() => created.promise) as never);
  const view = await pickAndUpload(['one.mp4']);
  const wakeTag = lastActivatedTag();
  expect(wakeTag).toMatch(WAKE_TAG);

  // Leave while /api/sessions is still in flight.
  await act(async () => view.unmount());
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  await act(async () => created.resolve(session));
  await waitFor(() => expect(transfers).toHaveLength(1));
  await act(async () => transfers[0].progress(50));

  await open(<VideosScreen />);
  expect(await screen.findByText('UPLOADING SESSION')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
});

it('stops uploads, releases the wake lock, and clears state on sign-out or account switch', async () => {
  const stops = stoppableTransfers();
  jest.mocked(apiSend).mockResolvedValue(session);

  const sync = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4'), clipAsset('two.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Leg day');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('2 clips');
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  await screen.findByText('UPLOADING SESSION');
  const wakeTag = lastActivatedTag();

  // Leave Videos first (upload keeps running), then sign out via SessionProvider.
  await sync.rerender(
    <QueryClientProvider client={client}>
      <VideoUploadSessionSync />
    </QueryClientProvider>,
  );
  expect(stops.every((stop) => stop.mock.calls.length === 0)).toBe(true);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  nextSessionEpoch();
  mockSessionStatus = { kind: 'signed-out' };
  await sync.rerender(
    <QueryClientProvider client={client}>
      <VideoUploadSessionSync />
    </QueryClientProvider>,
  );
  expect(stops.length).toBeGreaterThan(0);
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
  expect(releasedTags()).toContain(wakeTag);

  // Another account signs in and opens Videos: fresh form, nothing from the first account.
  nextSessionEpoch();
  mockUser = { ...defaultUser, id: 'other', username: 'sam', display_name: 'Sam' };
  mockSessionStatus = { kind: 'signed-in', user: mockUser };
  await sync.rerender(
    <QueryClientProvider client={client}>
      <VideoUploadSessionSync />
      <VideosScreen />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Upload your sets')).toBeTruthy();
  expect(screen.queryByText('UPLOADING SESSION')).toBeNull();
  expect(screen.getByLabelText('Session name')).toHaveProp('value', '');
});

it('drops a late session-creation reply that arrives after an account switch', async () => {
  const created = deferred<WorkoutSession>();
  jest.mocked(apiSend).mockImplementation((() => created.promise) as never);
  const view = await pickAndUpload(['one.mp4']);
  await act(async () => view.unmount());

  nextSessionEpoch();
  syncVideoUploadSession('other', true);
  await act(async () => created.resolve(session));
  expect(startClipUpload).not.toHaveBeenCalled();

  mockUser = { ...defaultUser, id: 'other', username: 'sam' };
  mockSessionStatus = { kind: 'signed-in', user: mockUser };
  await open(<VideosScreen />);
  expect(await screen.findByText('Upload your sets')).toBeTruthy();
});

it('stops and discards an upload only after the server confirms cancel and delete', async () => {
  jest.spyOn(Alert, 'alert');
  // Three clips, two at a time: the third is still queued when the upload stops.
  const stops = stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') return { ...session, status: 'cancelled' };
    if (path === '/api/sessions/s1') return undefined;
    throw new Error(`Unexpected ${path}`);
  });
  await pickAndUpload(['one.mp4', 'two.mp4', 'three.mp4']);
  expect(await screen.findByText('UPLOADING SESSION')).toBeTruthy();
  const wakeTag = lastActivatedTag();
  expect(startClipUpload).toHaveBeenCalledTimes(2);

  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  await alertButton('Keep uploading');
  expect(stops.every((stop) => stop.mock.calls.length === 0)).toBe(true);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  await alertButton('Stop and discard');
  expect(await screen.findByText('Upload your sets')).toBeTruthy();
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
  // The stopped workers settled without starting the queued third clip.
  expect(startClipUpload).toHaveBeenCalledTimes(2);
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/cancel', 'POST');
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');
  expect(releasedTags()).toContain(wakeTag);
  expect(showToast).toHaveBeenCalledWith('Upload discarded', undefined, {
    account: 'user:owner#0',
  });
});

it('stays with the error when the cancel fails, and shows the status if processing started', async () => {
  jest.spyOn(Alert, 'alert');
  stoppableTransfers();
  let refusal: Error = new Error('Could not reach Relay. Check your connection, then try again.');
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') throw refusal;
    throw new Error(`Unexpected ${path}`);
  });
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions/s1' ? { ...session, status: 'stitching' } : fetched(path),
    );
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  await alertButton('Stop and discard');
  expect(await screen.findByText(/Could not reach Relay/)).toBeTruthy();
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');

  // The server had already started processing: the screen follows it and stays.
  refusal = new ApiError(409, 'Only a session still uploading can be cancelled.', 'cannot_cancel');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel session' }));
  expect(await screen.findByText('Stitching your workout')).toBeTruthy();
  expect(screen.getByText(/Processing had already started/)).toBeTruthy();
});

it('disables Cancel and Stop and discard while processing starts, then follows the reply', async () => {
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.resolve({} as never),
    stop: jest.fn(),
  }));
  const started = deferred<WorkoutSession>();
  jest
    .mocked(apiSend)
    .mockImplementation((async (path: string) =>
      path === '/api/sessions' ? session : started.promise) as never);
  await pickAndUpload();
  expect(await screen.findByText('Starting processing…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel session' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Stop and discard' })).toBeDisabled();
  // A reply already marked complete opens the completion screen.
  await act(async () =>
    started.resolve({ ...session, status: 'complete', youtube_url: 'https://youtu.be/v' }),
  );
  expect(await screen.findByText('SESSION COMPLETE')).toBeTruthy();
});

it('offers Start processing after a failed start, on the same session', async () => {
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.resolve({} as never),
    stop: jest.fn(),
  }));
  let starts = 0;
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') {
      starts += 1;
      if (starts === 1)
        throw new Error('Could not reach Relay. Check your connection, then try again.');
      return { ...session, status: 'queued' };
    }
    throw new Error(`Unexpected ${path}`);
  });
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions/s1' ? { ...session, status: 'uploading' } : fetched(path),
    );
  await pickAndUpload();
  await fireEvent.press(await screen.findByRole('button', { name: 'Start processing' }));
  expect(await screen.findByText('Queued')).toBeTruthy();
  expect(starts).toBe(2);
  expect(jest.mocked(apiSend).mock.calls.filter(([path]) => path === '/api/sessions')).toHaveLength(
    1,
  );
});

it('follows a batch the server started when the start reply was lost in transit', async () => {
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.resolve({} as never),
    stop: jest.fn(),
  }));
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    // The request reached the server, but its answer never came back.
    if (path === '/api/sessions/s1/process')
      throw new Error('Could not reach Relay. Check your connection, then try again.');
    throw new Error(`Unexpected ${path}`);
  });
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions/s1' ? { ...session, status: 'stitching' } : fetched(path),
    );
  await pickAndUpload();
  expect(await screen.findByText('Stitching your workout')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start processing' })).toBeNull();
});

it('follows a batch the server reports as already processing', async () => {
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.resolve({} as never),
    stop: jest.fn(),
  }));
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process')
      throw new ApiError(409, 'This session is already processing.', 'already_processing');
    throw new Error(`Unexpected ${path}`);
  });
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions/s1' ? { ...session, status: 'stitching' } : fetched(path),
    );
  await pickAndUpload();
  expect(await screen.findByText('Stitching your workout')).toBeTruthy();
});

it('checks the status one request at a time', async () => {
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.resolve({} as never),
    stop: jest.fn(),
  }));
  jest
    .mocked(apiSend)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions' ? session : { ...session, status: 'queued' },
    );
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  const check = deferred<WorkoutSession>();
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions/s1' ? check.promise : fetched(path),
    );
  await pickAndUpload();
  await screen.findByText('Queued');
  // Two poll intervals pass while the first check is still unanswered.
  await act(async () => new Promise((done) => setTimeout(done, 5600)));
  const checks = () =>
    jest.mocked(apiGet).mock.calls.filter(([path]) => path === '/api/sessions/s1').length;
  expect(checks()).toBe(1);
  await act(async () => check.resolve({ ...session, status: 'stitching' }));
  expect(await screen.findByText('Stitching your workout')).toBeTruthy();
}, 30000);

it('drops a disconnect reply that arrives after signing out', async () => {
  jest.spyOn(Alert, 'alert');
  const reply = deferred<YouTubeConnection>();
  jest.mocked(apiSend).mockImplementation(() => reply.promise as never);
  await open(<VideosScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect' }));
  await alertButton('Disconnect YouTube');
  // Signing out moves the provider's session on, closes the screen and clears the cache.
  nextSessionEpoch();
  await act(async () => screen.unmount());
  client.clear();
  await act(async () => reply.resolve({ ...connected, status: 'not_connected', message: 'Bye' }));
  expect(client.getQueryData(['videos', 'youtube'])).toBeUndefined();
  expect(showToast).not.toHaveBeenCalled();
});

it('holds the start while Stop and discard is open, so a clip finishing behind it never races', async () => {
  jest.spyOn(Alert, 'alert');
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') return { ...session, status: 'cancelled' };
    if (path === '/api/sessions/s1') return undefined;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  // Every clip finishes while the question is open: processing doesn't start.
  await act(async () => transfers.forEach((item) => item.finish()));
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1/process', 'POST');
  await alertButton('Stop and discard');
  expect(await screen.findByText('Upload your sets')).toBeTruthy();
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/cancel', 'POST');
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1/process', 'POST');
});

it('starts the batch once Keep uploading is chosen, if it finished behind the question', async () => {
  jest.spyOn(Alert, 'alert');
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  await act(async () => transfers.forEach((item) => item.finish()));
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1/process', 'POST');
  await alertButton('Keep uploading');
  expect(await screen.findByText('Queued')).toBeTruthy();
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1/cancel', 'POST');
});

it('finishes discarding after a lost cancel reply, a refusal and a cancelled read-back', async () => {
  jest.spyOn(Alert, 'alert');
  stoppableTransfers();
  let cancels = 0;
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') {
      cancels += 1;
      // The first cancel reaches the server, but its answer is lost; the retry is refused.
      if (cancels === 1)
        throw new Error('Could not reach Relay. Check your connection, then try again.');
      throw new ApiError(409, 'Only a session still uploading can be cancelled.', 'cannot_cancel');
    }
    if (path === '/api/sessions/s1') return undefined;
    throw new Error(`Unexpected ${path}`);
  });
  const fetched = jest.mocked(apiGet).getMockImplementation()!;
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/sessions/s1' ? { ...session, status: 'cancelled' } : fetched(path),
    );
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  await alertButton('Stop and discard');
  expect(await screen.findByText(/Could not reach Relay/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Stop and discard' }));
  await alertButton('Stop and discard');
  expect(await screen.findByText('Upload your sets')).toBeTruthy();
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');
  expect(screen.queryByText(/Processing had already started/)).toBeNull();
});

it('counts a single clip in the singular', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await open(<VideosScreen />);
  await screen.findByText('Sample Lifts');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  expect(await screen.findByText('1 clip')).toBeTruthy();
  expect(screen.queryByText('1 clips')).toBeNull();
});

it('names a cancelled session in its kicker', async () => {
  stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') return { ...session, status: 'cancelled' };
    throw new Error(`Unexpected ${path}`);
  });
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel session' }));
  expect(await screen.findByText('CANCELLED SESSION')).toBeTruthy();
  expect(screen.queryByText('PROCESSING SESSION')).toBeNull();
  expect(screen.getByText('Cancelled')).toBeTruthy();
});

async function pickClips(names: string[]) {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: names.map(clipAsset),
  } as ImagePicker.ImagePickerResult);
  await open(<VideosScreen />);
  await screen.findByText('Sample Lifts');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText(`${names.length} ${names.length === 1 ? 'clip' : 'clips'}`);
}

const live = () => mockClipPlayers.filter((player) => !player.released);

it('opens one clip preview at a time, so a batch of a dozen clips prepares one player', async () => {
  const names = Array.from({ length: 12 }, (_, index) => `set-${index + 1}.mp4`);
  await pickClips(names);
  // Nothing is prepared until a preview is opened.
  expect(mockClipPlayers).toHaveLength(0);
  expect(screen.queryByTestId('clip-preview-set-3.mp4')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Preview set-3.mp4' }));
  const preview = await screen.findByTestId('clip-preview-set-3.mp4');
  expect(preview.props.nativeControls).toBe(true);
  expect(preview.props.allowsPictureInPicture).toBe(false);
  expect(live()).toHaveLength(1);
  expect(live()[0]).toMatchObject({ source: 'file:///set-3.mp4', muted: true, loop: false });
  // Opened by a tap, so it plays, muted.
  expect(live()[0].play).toHaveBeenCalledTimes(1);

  // Opening another closes the first and releases its player.
  await fireEvent.press(screen.getByRole('button', { name: 'Preview set-9.mp4' }));
  await screen.findByTestId('clip-preview-set-9.mp4');
  expect(screen.queryByTestId('clip-preview-set-3.mp4')).toBeNull();
  expect(mockClipPlayers).toHaveLength(2);
  expect(live()).toHaveLength(1);
  expect(live()[0].source).toBe('file:///set-9.mp4');
});

it('falls back when an open preview fails after mounting', async () => {
  await pickClips(['squat.mp4']);
  await fireEvent.press(screen.getByRole('button', { name: 'Preview squat.mp4' }));
  await screen.findByTestId('clip-preview-squat.mp4');
  await act(async () => {
    mockClipPlayers[0].emit('statusChange', { status: 'error' });
  });
  expect(screen.queryByTestId('clip-preview-squat.mp4')).toBeNull();
  expect(screen.getByText('Preview unavailable')).toBeTruthy();
  expect(live()).toHaveLength(0);
});

it('falls back when the preview player failed before the screen subscribed', async () => {
  await pickClips(['missing.mp4']);
  mockNextPlayerStatus = 'error';
  await fireEvent.press(screen.getByRole('button', { name: 'Preview missing.mp4' }));
  expect(await screen.findByText('Preview unavailable')).toBeTruthy();
  expect(screen.queryByTestId('clip-preview-missing.mp4')).toBeNull();
});

it('keeps the screen awake while uploading and releases on finish, cancel, or sign-out', async () => {
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    if (path === '/api/sessions/s1/cancel') return { ...session, status: 'cancelled' };
    throw new Error(`Unexpected ${path}`);
  });
  const firstView = await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  const first = lastActivatedTag();
  expect(first).toMatch(WAKE_TAG);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  // Finishing the upload releases the wake lock.
  await act(async () => transfers.forEach((item) => item.finish()));
  expect(await screen.findByText('Queued')).toBeTruthy();
  await waitFor(() => expect(releasedTags()).toContain(first));
  await act(async () => firstView.unmount());
  resetVideoUploadStore();

  // Cancelling mid-upload releases the wake lock immediately.
  jest.clearAllMocks();
  stoppableTransfers();
  const secondView = await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  const second = lastActivatedTag();
  expect(second).toMatch(WAKE_TAG);
  expect(second).not.toBe(first);
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel session' }));
  await waitFor(() => expect(releasedTags()).toContain(second));
  await act(async () => secondView.unmount());
  resetVideoUploadStore();

  // Signing out mid-upload releases the wake lock (leaving the screen alone does not).
  jest.clearAllMocks();
  stoppableTransfers();
  const thirdView = await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  const third = lastActivatedTag();
  await act(async () => thirdView.unmount());
  expect(releasedTags()).not.toContain(third);
  nextSessionEpoch();
  syncVideoUploadSession(null, false);
  expect(releasedTags()).toContain(third);
});

it("never lets an earlier upload's late wake-lock activation release a retry's lock", async () => {
  // The first run's activation stays pending until after the retry holds its own lock.
  let settleFirst!: () => void;
  jest
    .mocked(activateKeepAwakeAsync)
    .mockImplementationOnce(() => new Promise<void>((resolve) => (settleFirst = resolve)));
  stoppableTransfers();
  const view = await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  const first = lastActivatedTag();
  await act(async () => view.unmount());
  // Sign out ends the first run and releases its tag before activation resolves.
  nextSessionEpoch();
  syncVideoUploadSession(null, false);

  stoppableTransfers();
  const retryView = await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  const retry = lastActivatedTag();
  expect(retry).not.toBe(first);

  // The old activation resolves now and releases only its own tag.
  await act(async () => settleFirst());
  await waitFor(() => expect(releasedTags().filter((tag) => tag === first)).toHaveLength(2));
  expect(releasedTags()).not.toContain(retry);
  await act(async () => retryView.unmount());
  nextSessionEpoch();
  syncVideoUploadSession(null, false);
  expect(releasedTags()).toContain(retry);
});

it('sends every clip with the token captured when the run started, even if it changes', async () => {
  const created = deferred<WorkoutSession>();
  const transfers = controllableTransfers();
  jest.mocked(apiSend).mockImplementation((() => created.promise) as never);
  await pickAndUpload(['one.mp4', 'two.mp4', 'three.mp4']);
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/sessions', 'POST', expect.anything()),
  );
  // The saved token changes after the run captured its own.
  jest.mocked(sessionToken).mockResolvedValue('tok-B');
  await act(async () => created.resolve(session));
  await waitFor(() => expect(transfers).toHaveLength(2));
  await act(async () => transfers[0].finish());
  await waitFor(() => expect(transfers).toHaveLength(3));
  const tokens = jest.mocked(startClipUpload).mock.calls.map((call) => call[4]);
  expect(tokens).toEqual(['tok-A', 'tok-A', 'tok-A']);
});

it('forgets the captured token when a clip upload is refused with 401', async () => {
  jest.mocked(apiSend).mockResolvedValue(session);
  jest.mocked(startClipUpload).mockImplementation(() => ({
    done: Promise.reject(new ApiError(401, 'Sign in again.')),
    stop: jest.fn(),
  }));
  await pickAndUpload(['one.mp4']);
  expect(await screen.findByText('Sign in again.')).toBeTruthy();
  expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.test', 'tok-A');
});

it.each(['create', 'poll', 'cancel', 'delete'] as const)(
  "never lets a late %s reply from the previous account touch the next account's upload",
  async (kind) => {
    const late = deferred<unknown>();
    const transfers = controllableTransfers();
    let account: 'A' | 'B' = 'A';
    const bSession = { ...session, id: 's2', name: 'Leg day' };
    jest.mocked(apiSend).mockImplementation((async (path: string, method: string) => {
      if (path === '/api/sessions') {
        if (account === 'B') return bSession;
        return kind === 'create' ? late.promise : session;
      }
      if (path === '/api/sessions/s1/process')
        return { ...session, status: kind === 'delete' ? 'complete' : 'queued' };
      if (
        path === '/api/sessions/s1/cancel' ||
        (path === '/api/sessions/s1' && method === 'DELETE')
      )
        return late.promise;
      throw new Error(`Unexpected ${path}`);
    }) as never);
    const baseGet = jest.mocked(apiGet).getMockImplementation()!;
    jest
      .mocked(apiGet)
      .mockImplementation((async (path: string) =>
        path === '/api/sessions/s1' ? late.promise : baseGet(path)) as never);

    // Account A's run, driven through the store, left waiting on one request.
    videoUploadActions.setName('A day');
    videoUploadActions.addClips([clipFromAsset(clipAsset('a.mp4'), 0)!]);
    void videoUploadActions.startUpload(2, true);
    if (kind === 'create') {
      await waitFor(() =>
        expect(apiSend).toHaveBeenCalledWith('/api/sessions', 'POST', expect.anything()),
      );
    } else {
      await waitFor(() => expect(transfers).toHaveLength(1));
      if (kind === 'cancel') {
        videoUploadActions.cancelSession();
        await waitFor(() =>
          expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/cancel', 'POST'),
        );
      } else {
        await act(async () => transfers[0].finish());
        if (kind === 'poll') {
          await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/sessions/s1'));
        } else {
          await waitFor(() =>
            expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/process', 'POST'),
          );
          void videoUploadActions.deleteSession({ ...session, status: 'complete' });
          await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE'));
        }
      }
    }

    // Account B signs in and starts its own upload.
    account = 'B';
    nextSessionEpoch();
    mockUser = { ...defaultUser, id: 'other', username: 'sam', display_name: 'Sam' };
    mockSessionStatus = { kind: 'signed-in', user: mockUser };
    syncVideoUploadSession('other', true);
    const startedBefore = jest.mocked(startClipUpload).mock.calls.length;
    await pickAndUpload(['b.mp4']);
    expect(await screen.findByText('UPLOADING SESSION')).toBeTruthy();
    await waitFor(() => expect(transfers).toHaveLength(startedBefore + 1));
    const bTransfer = transfers[startedBefore];
    const bTag = lastActivatedTag();

    // A's reply finally arrives.
    await act(async () =>
      late.resolve(
        kind === 'create'
          ? session
          : kind === 'cancel'
            ? { ...session, status: 'cancelled' }
            : kind === 'poll'
              ? { ...session, status: 'complete' }
              : undefined,
      ),
    );
    await act(async () => bTransfer.progress(40));

    expect(screen.getByText('UPLOADING SESSION')).toBeTruthy();
    expect(screen.getByText('uploading · 40%')).toBeTruthy();
    expect(bTransfer.stop).not.toHaveBeenCalled();
    expect(releasedTags()).not.toContain(bTag);
    expect(
      jest
        .mocked(startClipUpload)
        .mock.calls.slice(startedBefore)
        .map((call) => call[0]),
    ).toEqual(['/api/sessions/s2/clips']);
  },
);

it('deletes an unfinished upload session with its captured token before sign-out revokes it', async () => {
  const stops = stoppableTransfers();
  const deleted = deferred<void>();
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1' && method === 'DELETE') return deleted.promise;
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const view = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Signout test');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('1 clip');
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  await screen.findByText('UPLOADING SESSION');

  let cleanup!: Promise<void>;
  await act(async () => {
    cleanup = runBeforeSignOut();
  });
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith(
      '/api/sessions/s1',
      'DELETE',
      undefined,
      expect.any(AbortSignal),
      'tok-A',
    ),
  );
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
  await act(async () => {
    deleted.resolve();
    await cleanup;
  });

  // Signing out afterwards does not send a duplicate DELETE.
  await act(async () => {
    nextSessionEpoch();
    syncVideoUploadSession(null, false);
  });
  const deletes = jest
    .mocked(apiSend)
    .mock.calls.filter(([path, method]) => path === '/api/sessions/s1' && method === 'DELETE');
  expect(deletes).toHaveLength(1);
  await view.unmount();
});

it('never lets a failing session cleanup block sign-out and leaves Retry offered if sign-out fails', async () => {
  stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1' && method === 'DELETE') throw new Error('Network down');
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const view = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Offline signout');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('1 clip');
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  await screen.findByText('UPLOADING SESSION');

  await act(async () => {
    await expect(runBeforeSignOut()).resolves.toBeUndefined();
  });
  // If sign-out itself fails and the user stays signed in, the interrupted clip offers Retry.
  expect(await screen.findByRole('button', { name: 'Retry failed uploads' })).toBeVisible();
  await view.unmount();
});

it('stops an upload whose session changes as it starts, rather than sending it unbound', async () => {
  stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const view = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Switched');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('1 clip');

  const { SessionChanged } =
    jest.requireActual<typeof import('../../data/session')>('../../data/session');
  jest.mocked(sessionToken).mockRejectedValueOnce(new SessionChanged());
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  expect(
    await screen.findByText('Your account changed before this could be sent. Try again.'),
  ).toBeVisible();
  // No session was created, and the form is still there to try again.
  expect(apiSend).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Upload session' })).toBeVisible();
  await view.unmount();
});

it('after sign-out deleted the upload session, a failed sign-out never retries into it', async () => {
  stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1' && method === 'DELETE') return undefined;
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const view = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Gone session');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('1 clip');
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  await screen.findByText('UPLOADING SESSION');

  // The cleanup deletes the session on the server; sign-out itself then fails, so the same
  // session stays signed in.
  await act(async () => {
    await runBeforeSignOut();
  });
  expect(screen.queryByRole('button', { name: 'Retry failed uploads' })).toBeNull();
  // The clips are back on the form, and uploading again makes a new session.
  const upload = await screen.findByRole('button', { name: 'Upload session' });
  expect(screen.getByText('1 clip')).toBeVisible();
  await fireEvent.press(upload);
  await waitFor(() =>
    expect(
      jest.mocked(apiSend).mock.calls.filter(([path]) => path === '/api/sessions'),
    ).toHaveLength(2),
  );
  await view.unmount();
});

it('does not delete a fully uploaded session on sign-out when Start processing failed', async () => {
  jest.mocked(startClipUpload).mockImplementation((_path, _clip, _fields, onProgress) => {
    onProgress(100);
    return { done: Promise.resolve({} as never), stop: jest.fn() };
  });
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (path === '/api/sessions') return { ...session, expected_clip_count: 1 };
    if (path === '/api/sessions/s1/process') throw new Error('Could not reach Relay.');
    if (path === '/api/sessions/s1' && method === 'DELETE') return undefined;
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const baseGet = jest.mocked(apiGet).getMockImplementation()!;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/sessions/s1') throw new Error('Could not reach Relay.');
    return baseGet(path);
  });
  const view = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Process failed');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('1 clip');
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  await screen.findByRole('button', { name: 'Start processing' });

  await act(async () => {
    await runBeforeSignOut();
    nextSessionEpoch();
    syncVideoUploadSession(null, false);
  });
  const deletes = jest
    .mocked(apiSend)
    .mock.calls.filter(([path, method]) => path === '/api/sessions/s1' && method === 'DELETE');
  expect(deletes).toHaveLength(0);
  await view.unmount();
});

it('stops a mid-upload batch without deleting it when the account loses upload access', async () => {
  const stops = stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (path === '/api/sessions') return session;
    throw new Error(`Unexpected ${method} ${path}`);
  });
  await pickAndUpload(['one.mp4']);
  await screen.findByText('UPLOADING SESSION');
  await act(async () => syncVideoUploadSession(mockUser.id, true));

  // Still signed in, so the session stays on the server: only sign-out and switching delete.
  await act(async () => syncVideoUploadSession(mockUser.id, false));
  await waitFor(() => expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true));
  expect(jest.mocked(apiSend).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(
    0,
  );
});

it('switches accounts mid-upload with exactly one DELETE using the old token and none with the new one', async () => {
  stoppableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1' && method === 'DELETE') return undefined;
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const view = await open(
    <>
      <VideoUploadSessionSync />
      <VideosScreen />
    </>,
  );
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [clipAsset('one.mp4')],
  } as ImagePicker.ImagePickerResult);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Switch test');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText('1 clip');
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
  await screen.findByText('UPLOADING SESSION');

  // Account B signs in while A is mid-upload.
  jest.mocked(sessionToken).mockResolvedValue('tok-B');
  mockUser = { ...defaultUser, id: 'other', username: 'other' };
  mockSessionStatus = { kind: 'signed-in', user: mockUser };
  await act(async () => {
    nextSessionEpoch();
    syncVideoUploadSession('other', true);
  });
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith(
      '/api/sessions/s1',
      'DELETE',
      undefined,
      expect.any(AbortSignal),
      'tok-A',
    ),
  );
  // A subsequent sign-out of B does not repeat the DELETE with B's token.
  await act(async () => {
    await runBeforeSignOut();
  });
  const deletes = jest
    .mocked(apiSend)
    .mock.calls.filter(([path, method]) => path === '/api/sessions/s1' && method === 'DELETE');
  expect(deletes).toHaveLength(1);
  expect(deletes[0][4]).toBe('tok-A');
  await view.unmount();
});
