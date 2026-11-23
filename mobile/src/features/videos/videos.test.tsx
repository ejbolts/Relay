import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ReactElement } from 'react';
import { Alert, Linking, type AlertButton } from 'react-native';
import type { User, WorkoutSession, YouTubeConnection } from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { UploadStopped } from '../../data/uploadFile';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { startClipUpload } from './clipUpload';
import { clipFromAsset } from './videoData';
import { VideosScreen } from './VideosScreen';

// A full parallel run is slow to render the first screen.
configure({ asyncUtilTimeout: 8000 });

// The last leave guard the screen set: whether it blocks, and what it does when leaving is tried.
let mockPrevent: { blocking: boolean; onLeave?: (event: { repeat: () => void }) => void } = {
  blocking: false,
};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePreventRemove: (blocking: boolean, onLeave?: (event: { repeat: () => void }) => void) => {
    mockPrevent = { blocking, onLeave };
  },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('./clipUpload', () => ({ startClipUpload: jest.fn() }));
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
  const handOff = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[];
  await act(async () => handOff.find((button) => button.text === 'Continue')?.onPress?.());
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

// Review fixes (Sol review and re-check of #469).

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
  await open(<VideosScreen />);
  await screen.findByText('Sample Lifts');
  await fireEvent.changeText(screen.getByLabelText('Session name'), 'Leg day');
  await fireEvent.press(screen.getByRole('button', { name: 'Add set videos' }));
  const options = jest.mocked(showMenu).mock.lastCall![1];
  await act(async () => options.find((option) => option.label === 'Choose videos')!.onPress());
  await screen.findByText(`${names.length} clips`);
  await fireEvent.press(screen.getByRole('button', { name: 'Upload session' }));
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

const alertButton = async (text: string) => {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.text === text)?.onPress?.());
};

it('leaves an upload only after the server confirms its cancel and delete', async () => {
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
  expect(mockPrevent.blocking).toBe(true);
  expect(startClipUpload).toHaveBeenCalledTimes(2);

  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await alertButton('Keep uploading');
  expect(repeat).not.toHaveBeenCalled();
  expect(stops.every((stop) => stop.mock.calls.length === 0)).toBe(true);

  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await alertButton('Stop and discard');
  await waitFor(() => expect(repeat).toHaveBeenCalledTimes(1));
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
  // The stopped workers settled without starting the queued third clip.
  expect(startClipUpload).toHaveBeenCalledTimes(2);
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/cancel', 'POST');
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');
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
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await alertButton('Stop and discard');
  expect(await screen.findByText(/Could not reach Relay/)).toBeTruthy();
  expect(repeat).not.toHaveBeenCalled();
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');

  // The server had already started processing: the screen follows it and stays.
  refusal = new ApiError(409, 'Only a session still uploading can be cancelled.', 'cannot_cancel');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel session' }));
  expect(await screen.findByText('Stitching your workout')).toBeTruthy();
  expect(screen.getByText(/Processing had already started/)).toBeTruthy();
});

it('holds leaving while the session is being created', async () => {
  const created = deferred<WorkoutSession>();
  jest.mocked(apiSend).mockImplementation((() => created.promise) as never);
  await pickAndUpload();
  expect(mockPrevent.blocking).toBe(true);
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  expect(repeat).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('Wait while the session is created.');
});

it('stops the uploads when the screen closes, such as on signing out', async () => {
  const stops = stoppableTransfers();
  jest.mocked(apiSend).mockResolvedValue(session);
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await act(async () => screen.unmount());
  expect(stops.length).toBeGreaterThan(0);
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
});

it('holds Cancel and leaving while processing starts, then follows the reply', async () => {
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
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  expect(repeat).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('Wait until processing has started.');
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

it('names the account before handing off, and says so if the browser will not open', async () => {
  jest.spyOn(Alert, 'alert');
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No browser'));
  await open(<VideosScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Reconnect YouTube on the web' }),
  );
  expect(jest.mocked(Alert.alert).mock.lastCall?.[1]).toBe(
    'Sign in to the web as @preview to connect YouTube.',
  );
  await alertButton('Cancel');
  expect(Linking.openURL).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Reconnect YouTube on the web' }));
  await alertButton('Continue');
  expect(await screen.findByText(/Could not open the browser/)).toBeTruthy();
});

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

// Second re-check of #469.

/** Transfers the test finishes by hand, as uploads that complete while a question is open. */
function finishableTransfers() {
  const finishers: (() => void)[] = [];
  jest.mocked(startClipUpload).mockImplementation(() => {
    let finish!: () => void;
    const done = new Promise<never>((resolve) => (finish = () => resolve({} as never)));
    finishers.push(finish);
    return { done, stop: jest.fn() };
  });
  return finishers;
}

it('holds the start while Stop and discard is open, so a clip finishing behind it never races', async () => {
  jest.spyOn(Alert, 'alert');
  const finishers = finishableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/cancel') return { ...session, status: 'cancelled' };
    if (path === '/api/sessions/s1') return undefined;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  // Every clip finishes while the question is open: processing doesn't start.
  await act(async () => finishers.forEach((finish) => finish()));
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1/process', 'POST');
  await alertButton('Stop and discard');
  await waitFor(() => expect(repeat).toHaveBeenCalledTimes(1));
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1/cancel', 'POST');
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');
  expect(apiSend).not.toHaveBeenCalledWith('/api/sessions/s1/process', 'POST');
});

it('starts the batch once Keep uploading is chosen, if it finished behind the question', async () => {
  jest.spyOn(Alert, 'alert');
  const finishers = finishableTransfers();
  jest.mocked(apiSend).mockImplementation(async (path: string) => {
    if (path === '/api/sessions') return session;
    if (path === '/api/sessions/s1/process') return { ...session, status: 'queued' };
    throw new Error(`Unexpected ${path}`);
  });
  await pickAndUpload();
  await screen.findByText('UPLOADING SESSION');
  await act(async () => mockPrevent.onLeave?.({ repeat: jest.fn() }));
  await act(async () => finishers.forEach((finish) => finish()));
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
  const repeat = jest.fn();
  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await alertButton('Stop and discard');
  expect(await screen.findByText(/Could not reach Relay/)).toBeTruthy();
  expect(repeat).not.toHaveBeenCalled();

  await act(async () => mockPrevent.onLeave?.({ repeat }));
  await alertButton('Stop and discard');
  await waitFor(() => expect(repeat).toHaveBeenCalledTimes(1));
  expect(apiSend).toHaveBeenCalledWith('/api/sessions/s1', 'DELETE');
  expect(screen.queryByText(/Processing had already started/)).toBeNull();
});
