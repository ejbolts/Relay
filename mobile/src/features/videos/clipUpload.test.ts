import { File } from 'expo-file-system';
import { ApiError } from '../../data/api';
import { uploadFile, UploadStopped } from '../../data/uploadFile';
import { startClipUpload } from './clipUpload';

jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  clientVersionHeaders: () => ({ 'X-Relay-Version': '1.3.2' }),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'phone-token') }));
jest.mock('../../data/deviceStorage', () => ({ newId: () => 'copy-id' }));
jest.mock('../../data/uploadFile', () => {
  class UploadStopped extends Error {}
  return { uploadFile: jest.fn(), UploadStopped };
});
const mockTask = { uploadAsync: jest.fn(), cancel: jest.fn() };
const mockCreate = jest.fn((..._args: unknown[]) => mockTask);
const mockCopy = jest.fn(async (..._args: unknown[]) => undefined);
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((...parts: unknown[]) => ({
    uri: parts.map(String).join('/'),
    createUploadTask: mockCreate,
    copy: mockCopy,
    delete: mockDelete,
  })),
  Paths: { cache: 'file:///cache' },
  UploadType: { MULTIPART: 1 },
}));

const clip = { uri: 'file:///cache/ImagePicker/set-1.mp4', name: 'Set one.mp4', type: 'video/mp4' };
const fields = { client_clip_id: 'c1', order_index: '0', exercise_label: 'Back Squat' };
const options = () => mockCreate.mock.calls[0][1] as Record<string, unknown>;
const progressOf = () =>
  options().onProgress as (data: { bytesSent: number; totalBytes: number }) => void;
const ticks = async (count = 5) => {
  for (let i = 0; i < count; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTask.uploadAsync.mockReset();
  mockTask.cancel.mockReset();
});

it('streams the clip from its file with the form fields, sign-in and progress', async () => {
  mockTask.uploadAsync.mockResolvedValue({ status: 201, body: '{"id":"clip-1"}' });
  const progress = jest.fn();
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, progress);
  await expect(transfer.done).resolves.toEqual({ id: 'clip-1' });
  expect(File).toHaveBeenCalledWith(clip.uri);
  expect(mockCreate.mock.calls[0][0]).toBe('https://relay.test/api/sessions/s1/clips');
  expect(options()).toMatchObject({
    httpMethod: 'POST',
    uploadType: 1,
    fieldName: 'file',
    mimeType: 'video/mp4',
    parameters: fields,
    headers: { Authorization: 'Bearer phone-token', 'X-Relay-Version': '1.3.2' },
    // A foreground session ends with the app, so a missed cancel can't outlive it.
    sessionType: 'foreground',
  });
  progressOf()({ bytesSent: 50, totalBytes: 200 });
  expect(progress).toHaveBeenCalledWith(25);
  expect(uploadFile).not.toHaveBeenCalled();
});

it("passes on the server's refusal", async () => {
  mockTask.uploadAsync.mockResolvedValue({
    status: 413,
    body: '{"error":{"message":"Too large","code":"too_large"}}',
  });
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
  await expect(transfer.done).rejects.toEqual(new ApiError(413, 'Too large', 'too_large'));
});

it('falls back to the multipart upload where Expo Go may not read the file', async () => {
  mockTask.uploadAsync.mockRejectedValue(new Error('Missing read permission'));
  jest.mocked(uploadFile).mockResolvedValue({ id: 'clip-1' });
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
  await expect(transfer.done).resolves.toEqual({ id: 'clip-1' });
  expect(uploadFile).toHaveBeenCalledWith(
    '/api/sessions/s1/clips',
    'POST',
    clip,
    expect.objectContaining({ fields, signal: expect.any(AbortSignal) }),
  );
});

it('streams a copy named with the video extension when the file has none, then removes it', async () => {
  mockTask.uploadAsync.mockResolvedValue({ status: 201, body: '{"id":"clip-1"}' });
  const transfer = startClipUpload(
    '/api/sessions/s1/clips',
    { ...clip, uri: 'content://media/video/42' },
    fields,
    jest.fn(),
  );
  await expect(transfer.done).resolves.toEqual({ id: 'clip-1' });
  expect(File).toHaveBeenCalledWith('file:///cache', 'relay-clip-copy-id.mp4');
  expect(mockCopy).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(uploadFile).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('keeps cancelling a transfer stopped before its native start, until it settles', async () => {
  jest.useFakeTimers();
  try {
    let fail!: (reason: unknown) => void;
    mockTask.uploadAsync.mockReturnValue(new Promise((_done, reject) => (fail = reject)));
    const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
    transfer.done.catch(() => undefined);
    await ticks();
    // The stop reaches the task before the native side starts it, so this cancel is lost.
    transfer.stop();
    expect(mockTask.cancel).toHaveBeenCalledTimes(1);
    // The native start then reports progress: the stopped transfer is cancelled again.
    progressOf()({ bytesSent: 10, totalBytes: 200 });
    expect(mockTask.cancel).toHaveBeenCalledTimes(2);
    // And again on a timer until it settles.
    jest.advanceTimersByTime(600);
    expect(mockTask.cancel.mock.calls.length).toBeGreaterThan(2);
    fail(new Error('cancelled'));
    await expect(transfer.done).rejects.toBeInstanceOf(UploadStopped);
    const settledAt = mockTask.cancel.mock.calls.length;
    jest.advanceTimersByTime(1000);
    expect(mockTask.cancel).toHaveBeenCalledTimes(settledAt);
  } finally {
    jest.useRealTimers();
  }
});

it('never starts a transfer that was stopped before it was created', async () => {
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
  transfer.stop();
  await expect(transfer.done).rejects.toBeInstanceOf(UploadStopped);
  expect(mockTask.uploadAsync).not.toHaveBeenCalled();
});
