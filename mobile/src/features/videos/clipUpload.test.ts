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
jest.mock('../../data/uploadFile', () => {
  class UploadStopped extends Error {}
  return { uploadFile: jest.fn(), UploadStopped };
});
const mockTask = { uploadAsync: jest.fn(), cancel: jest.fn() };
const mockCreate = jest.fn((..._args: unknown[]) => mockTask);
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ createUploadTask: mockCreate })),
  UploadType: { MULTIPART: 1 },
}));

const clip = { uri: 'file:///cache/ImagePicker/set-1.mp4', name: 'Set one.mp4', type: 'video/mp4' };
const fields = { client_clip_id: 'c1', order_index: '0', exercise_label: 'Back Squat' };

beforeEach(() => jest.clearAllMocks());

it('streams the clip from its file with the form fields, sign-in and progress', async () => {
  mockTask.uploadAsync.mockResolvedValue({ status: 201, body: '{"id":"clip-1"}' });
  const progress = jest.fn();
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, progress);
  await expect(transfer.done).resolves.toEqual({ id: 'clip-1' });
  expect(File).toHaveBeenCalledWith(clip.uri);
  const [url, options] = mockCreate.mock.calls[0] as [string, Record<string, unknown>];
  expect(url).toBe('https://relay.test/api/sessions/s1/clips');
  expect(options).toMatchObject({
    httpMethod: 'POST',
    uploadType: 1,
    fieldName: 'file',
    mimeType: 'video/mp4',
    parameters: fields,
    headers: { Authorization: 'Bearer phone-token', 'X-Relay-Version': '1.3.2' },
  });
  (options.onProgress as (data: { bytesSent: number; totalBytes: number }) => void)({
    bytesSent: 50,
    totalBytes: 200,
  });
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

it('falls back to the multipart upload where the file API may not read the file', async () => {
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

it('sends a file without a video extension through the multipart upload, under its name', async () => {
  jest.mocked(uploadFile).mockResolvedValue({ id: 'clip-1' });
  const transfer = startClipUpload(
    '/api/sessions/s1/clips',
    { ...clip, uri: 'content://media/video/42' },
    fields,
    jest.fn(),
  );
  await expect(transfer.done).resolves.toEqual({ id: 'clip-1' });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(jest.mocked(uploadFile).mock.calls[0][2]).toMatchObject({ name: 'Set one.mp4' });
});

it('stops the native transfer when asked', async () => {
  let fail!: (reason: unknown) => void;
  mockTask.uploadAsync.mockReturnValue(new Promise((_done, reject) => (fail = reject)));
  mockTask.cancel.mockImplementation(() => fail(new Error('cancelled')));
  const transfer = startClipUpload('/api/sessions/s1/clips', clip, fields, jest.fn());
  await Promise.resolve();
  await Promise.resolve();
  transfer.stop();
  await expect(transfer.done).rejects.toBeInstanceOf(UploadStopped);
  expect(mockTask.cancel).toHaveBeenCalled();
});
