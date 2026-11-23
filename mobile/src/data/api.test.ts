type Api = typeof import('./api');

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: jest.requireActual('../../app.json').expo.version,
    extra: {
      relayCompatibilityVersion: jest.requireActual('../../../frontend/release.json').version,
    },
  },
}));

const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockKeychain.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockKeychain.set(key, value),
  deleteItemAsync: async (key: string) => void mockKeychain.delete(key),
}));

const answers: Record<string, unknown> = {
  '/api/dashboard': { recommendation: null },
  '/api/workout-types': [],
  '/api/workout-type-exercises': [],
  '/api/workouts/snapshot': { revision: 1, workouts: [] },
  '/api/training-preferences': { preferred_weight_unit: 'kg' },
  '/api/auth/me': { id: 'sample-user' },
};

const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
  const body = answers[new URL(url).pathname];
  return { ok: true, status: 200, json: async () => body } as Response;
});

const reply = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const saved = (origin: string, token: string) => JSON.stringify({ origin, token });
const headers = (call: number) => fetchMock.mock.calls[call][1]?.headers as Record<string, string>;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const unreachable = 'Could not reach Relay. Check your connection, then try again.';

function loadApi(origin: string | undefined): Api {
  if (origin === undefined) delete process.env.EXPO_PUBLIC_RELAY_API_ORIGIN;
  else process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = origin;
  let api!: Api;
  jest.isolateModules(() => {
    api = jest.requireActual<Api>('./api');
  });
  return api;
}

function signedIn(origin = 'https://relay.test') {
  mockKeychain.set('relay.session', saved(origin, 'sample-token'));
  return loadApi(origin);
}

beforeEach(() => {
  fetchMock.mockClear();
  mockKeychain.clear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

test('sends the saved token on every read and write, and never cookies', async () => {
  const api = signedIn();
  await api.apiGet('/api/workout-types');
  fetchMock.mockResolvedValueOnce(reply(200, { id: 'w1' }));
  await expect(api.apiSend('/api/workouts', 'POST', { name: 'Legs' })).resolves.toEqual({
    id: 'w1',
  });

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://relay.test/api/workout-types',
    'https://relay.test/api/workouts',
  ]);
  fetchMock.mock.calls.forEach(([, init], call) => {
    expect(init?.credentials).toBe('omit');
    expect(headers(call).Authorization).toBe('Bearer sample-token');
    expect(headers(call)['X-Relay-Version']).toBe(
      jest.requireActual('../../../frontend/release.json').version,
    );
    expect(headers(call)['X-Relay-Client']).toBe(
      `${jest.requireActual('react-native').Platform.OS}/${jest.requireActual('../../app.json').expo.version}`,
    );
  });
  expect(fetchMock.mock.calls[1][1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ name: 'Legs' }),
  });
  expect(headers(1)['Content-Type']).toBe('application/json');
});

test('signs in with a token kept in secure storage and signs out of this phone', async () => {
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce(reply(200, { id: 'sample-user', session_token: 'new-token' }));
  await api.signIn('preview.lifter', 'sample-password');
  expect(fetchMock).toHaveBeenLastCalledWith(
    'https://relay.test/api/auth/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        username: 'preview.lifter',
        password: 'sample-password',
        session: 'token',
      }),
    }),
  );
  expect(headers(0).Authorization).toBeUndefined();

  await api.currentUser(new AbortController().signal);
  expect(headers(1).Authorization).toBe('Bearer new-token');

  fetchMock.mockResolvedValueOnce(reply(204));
  await expect(api.signOut()).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenLastCalledWith(
    'https://relay.test/api/auth/logout-session',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(headers(2).Authorization).toBe('Bearer new-token');
  expect(mockKeychain.size).toBe(0);
});

test('signs out offline at once and ends the server session on the next launch', async () => {
  const api = signedIn();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(api.signOut()).resolves.toBeUndefined();
  expect(mockKeychain.has('relay.session')).toBe(false);

  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce(reply(204));
  await expect(api.currentUser(new AbortController().signal)).rejects.toMatchObject({
    status: 401,
  });
  await settle();
  // Only the retried sign-out went to the server, still carrying the old token.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://relay.test/api/auth/logout-session');
  expect(headers(0).Authorization).toBe('Bearer sample-token');
  expect(mockKeychain.size).toBe(0);
});

test('opening and becoming active together retry the sign-out once', async () => {
  const api = signedIn();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await api.signOut();
  fetchMock.mockClear();

  await Promise.allSettled([
    api.currentUser(new AbortController().signal),
    api.currentUser(new AbortController().signal),
  ]);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockKeychain.size).toBe(0);
});

test('a sign-out the server rejects with an error stays queued for the next launch', async () => {
  const api = signedIn();
  fetchMock.mockResolvedValueOnce(reply(503, {}));
  await api.signOut();
  expect(mockKeychain.has('relay.pending-sign-out')).toBe(true);

  fetchMock.mockResolvedValueOnce(reply(401, {}));
  await expect(api.currentUser(new AbortController().signal)).rejects.toThrow();
  await settle();
  expect(mockKeychain.size).toBe(0);
});

test('forgets a session the server has ended', async () => {
  const api = signedIn();
  fetchMock.mockResolvedValueOnce(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(api.currentUser(new AbortController().signal)).rejects.toMatchObject({
    status: 401,
  });
  expect(mockKeychain.has('relay.session')).toBe(false);
});

test("ignores a token saved for another server and doesn't ask the server", async () => {
  mockKeychain.set('relay.session', saved('https://other.test', 'sample-token'));
  const api = loadApi('https://relay.test');
  await expect(api.currentUser(new AbortController().signal)).rejects.toMatchObject({
    status: 401,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('explains that a server without token sign-in needs updating', async () => {
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce(reply(200, { id: 'sample-user' }));
  await expect(api.signIn('preview.lifter', 'sample-password')).rejects.toThrow(
    'Update Relay on the server to sign in from the app.',
  );
  expect(mockKeychain.size).toBe(0);
});

test("reports the server's reason with its status", async () => {
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce(
    reply(401, { error: { message: 'Incorrect username or password.' } }),
  );
  await expect(api.signIn('preview.lifter', 'wrong')).rejects.toMatchObject({
    status: 401,
    message: 'Incorrect username or password.',
  });
});

test('explains a dropped connection in plain words', async () => {
  const api = signedIn();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(api.currentUser(new AbortController().signal)).rejects.toThrow(unreachable);
  expect(mockKeychain.has('relay.session')).toBe(true);
});

test('gives up after 15 seconds on a server that never answers', async () => {
  jest.useFakeTimers();
  try {
    const api = signedIn();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const failed = expect(api.currentUser(new AbortController().signal)).rejects.toThrow(
      unreachable,
    );
    await jest.advanceTimersByTimeAsync(14_999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await failed;
  } finally {
    jest.useRealTimers();
  }
});

test('a request the screen cancels is not reported as a dropped connection', async () => {
  const api = signedIn();
  const screen = new AbortController();
  fetchMock.mockImplementationOnce(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
  const cancelled = expect(api.currentUser(screen.signal)).rejects.toThrow('Aborted');
  await settle();
  screen.abort();
  await cancelled;
});

test.each([
  'http://relay.test',
  'https://user:secret@relay.test',
  'https://relay.test/app',
  'https://relay.test/?next=1',
])('never sends credentials to %s', async (origin) => {
  const api = loadApi(origin);
  await expect(api.signIn('preview.lifter', 'sample-password')).rejects.toThrow(
    'Set a valid HTTPS preview origin for Relay.',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test('allows plain HTTP only on loopback during development', async () => {
  const api = signedIn('http://127.0.0.1:8001');
  await api.currentUser(new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8001/api/auth/me', expect.anything());
});

test('has no origin when account mode is not configured', () => {
  expect(loadApi(undefined).apiOrigin).toBeUndefined();
});
