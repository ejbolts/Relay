import { ApiError, request } from '../../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../../data/session';
import { uploadFile } from '../../../data/uploadFile';
import {
  deleteProfilePhoto,
  profileDetailChanges,
  profileSession,
  saveProfileDetails,
  saveProfilePhoto,
} from './profileWrites';

let mockAccount = 'user:a';
jest.mock('../../../ui/Toast', () => ({
  isToastAccountCurrent: (account: string) => account === mockAccount,
}));
jest.mock('../../../data/api', () => ({
  ...jest.requireActual<typeof import('../../../data/api')>('../../../data/api'),
  serverOrigin: () => 'https://relay.test',
  request: jest.fn(),
}));
jest.mock('../../../data/session', () => ({
  sessionToken: jest.fn(async () => 'token-a'),
  forgetSessionTokenIf: jest.fn(async () => undefined),
}));
jest.mock('../../../data/uploadFile', () => ({ uploadFile: jest.fn() }));

const user = { id: 'a', display_name: 'A' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccount = 'user:a';
});

test('a session is read only for the account that started the edit', async () => {
  expect(await profileSession('user:a')).toEqual({
    account: 'user:a',
    origin: 'https://relay.test',
    token: 'token-a',
  });
  expect(await profileSession('user:b')).toBeNull();
  expect(sessionToken).toHaveBeenCalledTimes(1);

  // A switch while the token is read.
  const token = deferred<string>();
  jest.mocked(sessionToken).mockImplementationOnce(() => token.promise);
  const reading = profileSession('user:a');
  mockAccount = 'user:b';
  token.resolve('token-b');
  expect(await reading).toBeNull();
});

test('the same account without a token is an error to show; another account stays silent', async () => {
  jest.mocked(sessionToken).mockResolvedValueOnce(null);
  await expect(profileSession('user:a')).rejects.toMatchObject({
    status: 401,
    message: 'Sign in to continue.',
  });

  const token = deferred<string | null>();
  jest.mocked(sessionToken).mockImplementationOnce(() => token.promise);
  const reading = profileSession('user:a');
  mockAccount = 'user:b';
  token.resolve(null);
  expect(await reading).toBeNull();
});

test('writes go with the session’s own token, and stop when the account changes', async () => {
  const session = { account: 'user:a', origin: 'https://relay.test', token: 'token-a' };
  jest.mocked(request).mockResolvedValue(user);
  expect(await saveProfileDetails(session, { sex: 'female' })).toBe(user);
  expect(request).toHaveBeenLastCalledWith(
    '/api/profile',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ sex: 'female' }) }),
    'token-a',
  );
  expect(await deleteProfilePhoto(session)).toBe(user);
  expect(request).toHaveBeenLastCalledWith('/api/profile/photo', { method: 'DELETE' }, 'token-a');

  // An upload in flight when another account signs in: its answer is dropped.
  const upload = deferred<typeof user>();
  jest.mocked(uploadFile).mockImplementationOnce(() => upload.promise as Promise<never>);
  const sending = saveProfilePhoto(session, { uri: 'file:///p.png', mimeType: 'image/png' });
  expect(uploadFile).toHaveBeenCalledWith(
    '/api/profile/photo',
    'PUT',
    { uri: 'file:///p.png', name: 'profile.png', type: 'image/png' },
    { token: 'token-a' },
  );
  mockAccount = 'user:b';
  upload.resolve(user);
  expect(await sending).toBeNull();

  // Nothing is sent once the account has changed.
  jest.mocked(request).mockClear();
  expect(await saveProfileDetails(session, { display_name: 'A' })).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

test('a refusal forgets only the token it was sent with', async () => {
  const session = { account: 'user:a', origin: 'https://relay.test', token: 'token-a' };
  jest.mocked(uploadFile).mockRejectedValueOnce(new ApiError(401, 'Sign in again.'));
  await expect(saveProfilePhoto(session, { uri: 'file:///p.jpg' })).rejects.toThrow(
    'Sign in again.',
  );
  expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.test', 'token-a');
});

test('a draft sends only the fields changed from where it started, and a sex only once', () => {
  const baseline = { name: 'Sam', sex: null };
  expect(
    profileDetailChanges({ sex: null }, baseline, { displayName: ' Sam ', sex: null }),
  ).toEqual({ nameDirty: false, sexDirty: false, changes: {} });
  expect(
    profileDetailChanges({ sex: null }, baseline, { displayName: 'Sam B', sex: 'female' }).changes,
  ).toEqual({ display_name: 'Sam B', sex: 'female' });
  // Renamed elsewhere since the draft opened: the draft's untouched name isn't sent back.
  expect(
    profileDetailChanges({ sex: null }, baseline, { displayName: 'Sam', sex: 'male' }).changes,
  ).toEqual({ sex: 'male' });
  // Once the account has a sex (saved here or elsewhere), it isn't sent again.
  expect(
    profileDetailChanges({ sex: 'male' }, baseline, { displayName: 'Sam', sex: 'female' }).sexDirty,
  ).toBe(false);
  expect(
    profileDetailChanges(
      { sex: null },
      { name: 'Sam', sex: 'male' },
      { displayName: 'Sam', sex: 'female' },
    ).sexDirty,
  ).toBe(false);
});
