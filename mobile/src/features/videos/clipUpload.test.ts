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
let mockEnvironment = 'storeClient';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockEnvironment;
    },
  },
  ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone' },
}));
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
  mockEnvironment = 'storeClient';
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

it('falls back to the multipart upload only where Expo Go may not read the file', async () => {
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

it('ignores a stopped transfer that completes anyway, after its cancel was lost', async () => {
  let complete!: (result: { status: number; body: string }) => void;
  mockTask.uploadAsync.mockReturnValue(new Promise((resolve) => (complete = resolve)));
  const progress = jest.fn();
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, progress);
  await ticks();
  transfer.stop();
  expect(mockTask.cancel).toHaveBeenCalledTimes(1);
  // The native start reset the cancel: the transfer reports progress and finishes with 2xx.
  progressOf()({ bytesSent: 200, totalBytes: 200 });
  complete({ status: 201, body: '{"id":"clip-1"}' });
  await expect(transfer.done).rejects.toBeInstanceOf(UploadStopped);
  expect(progress).not.toHaveBeenCalled();
});

it('reports a file an installed app cannot read instead of buffering it in memory', async () => {
  mockEnvironment = 'standalone';
  mockTask.uploadAsync.mockRejectedValue(new Error('Missing read permission'));
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
  await expect(transfer.done).rejects.toThrow(/couldn’t read this video/);
  expect(uploadFile).not.toHaveBeenCalled();
});

it('reports a copy that fails in an installed app instead of buffering it in memory', async () => {
  mockEnvironment = 'standalone';
  mockCopy.mockRejectedValueOnce(new Error('Not enough space'));
  const transfer = startClipUpload(
    '/api/sessions/s1/clips',
    { ...clip, uri: 'content://media/video/42' },
    fields,
    jest.fn(),
  );
  await expect(transfer.done).rejects.toThrow(/couldn’t read this video/);
  expect(uploadFile).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('in Expo Go, sends a picked file it may not copy through the multipart upload', async () => {
  mockCopy.mockRejectedValueOnce(new Error('Missing read permission'));
  jest.mocked(uploadFile).mockResolvedValue({ id: 'clip-1' });
  const transfer = startClipUpload(
    '/api/sessions/s1/clips',
    { ...clip, uri: 'content://media/video/42' },
    fields,
    jest.fn(),
  );
  await expect(transfer.done).resolves.toEqual({ id: 'clip-1' });
  expect(uploadFile).toHaveBeenCalledTimes(1);
});

it('never starts a transfer that was stopped before it was created', async () => {
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
  transfer.stop();
  await expect(transfer.done).rejects.toBeInstanceOf(UploadStopped);
  expect(mockTask.uploadAsync).not.toHaveBeenCalled();
});
