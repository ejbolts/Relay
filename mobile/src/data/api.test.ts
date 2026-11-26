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
// When set, the next read takes its snapshot at once but delivers it only once the gate opens.
let mockReadGate: Promise<void> | null = null;
// When set, the next read answers only once this gate opens, with what is saved by then: a
// keystore that answers a read after a write that came later.
let mockLateReadGate: Promise<void> | null = null;
// Keys whose reads fail, as when the keystore is unavailable.
const mockFailingReads = new Set<string>();
// Keys whose writes fail, as when the keystore refuses a write.
const mockFailingWrites = new Set<string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    if (mockFailingReads.has(key)) throw new Error('Keystore unavailable');
    const late = mockLateReadGate;
    mockLateReadGate = null;
    if (late) {
      await late;
      return mockKeychain.get(key) ?? null;
    }
    const value = mockKeychain.get(key) ?? null;
    const gate = mockReadGate;
    mockReadGate = null;
    if (gate) await gate;
    return value;
  },
  setItemAsync: async (key: string, value: string) => {
    if (mockFailingWrites.has(key)) throw new Error('Keystore refused the write');
    mockKeychain.set(key, value);
  },
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
  mockFailingReads.clear();
  mockFailingWrites.clear();
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

test('every session signed out offline is ended once the connection is back', async () => {
  const api = signedIn();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await api.signOut();
  // Another account signs in on this phone, then signs out offline too.
  mockKeychain.set('relay.session', saved('https://relay.test', 'second-token'));
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await api.signOut();
  fetchMock.mockClear();

  fetchMock.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(204));
  // Retried while still signed out, as when the connection returns on the sign-in screen.
  await api.retryPendingSignOut();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://relay.test/api/auth/logout-session',
    'https://relay.test/api/auth/logout-session',
  ]);
  expect([headers(0).Authorization, headers(1).Authorization]).toEqual([
    'Bearer sample-token',
    'Bearer second-token',
  ]);
  expect(mockKeychain.size).toBe(0);
});

test('a sign-out saved by an older version is still ended', async () => {
  mockKeychain.set('relay.pending-sign-out', saved('https://relay.test', 'old-token'));
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce(reply(204));
  await api.retryPendingSignOut();
  expect(headers(0).Authorization).toBe('Bearer old-token');
  expect(mockKeychain.size).toBe(0);
});

test('a reconnect while a sign-out is failing runs one more attempt', async () => {
  const api = signedIn();
  let fail: (error: Error) => void = () => undefined;
  fetchMock.mockImplementationOnce(
    () => new Promise<Response>((_resolve, reject) => (fail = reject)),
  );
  const signingOut = api.signOut();
  await settle();
  // The connection returns while the first attempt is still waiting to fail.
  fetchMock.mockResolvedValueOnce(reply(204));
  const retried = api.retryPendingSignOut();
  fail(new TypeError('Network request failed'));
  await signingOut;
  await retried;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(mockKeychain.size).toBe(0);
});

test('every offline sign-out is kept, however many there are', async () => {
  const api = signedIn();
  for (let index = 0; index < 12; index += 1) {
    mockKeychain.set('relay.session', saved('https://relay.test', `token-${index}`));
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await api.signOut();
  }
  fetchMock.mockClear();
  for (let index = 0; index < 12; index += 1) fetchMock.mockResolvedValueOnce(reply(204));
  await api.retryPendingSignOut();
  expect(fetchMock.mock.calls.map((_, index) => headers(index).Authorization)).toEqual(
    Array.from({ length: 12 }, (_, index) => `Bearer token-${index}`),
  );
  expect(mockKeychain.size).toBe(0);
});

const SLOTS = Array.from({ length: 32 }, (_, slot) => `relay.sign-out-journal.${slot}`);

test("a journal slot that can't be read is never written over", async () => {
  const api = signedIn();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await api.signOut();
  const first = mockKeychain.get(SLOTS[0]);
  mockFailingReads.add(SLOTS[0]);
  mockKeychain.set('relay.session', saved('https://relay.test', 'second-token'));
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await api.signOut();
  expect(mockKeychain.get(SLOTS[0])).toBe(first);
  expect(mockKeychain.get(SLOTS[1])).toBe(saved('https://relay.test', 'second-token'));
  expect(mockKeychain.has('relay.session')).toBe(false);

  mockFailingReads.clear();
  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(204));
  await api.retryPendingSignOut();
  expect([headers(0).Authorization, headers(1).Authorization]).toEqual([
    'Bearer sample-token',
    'Bearer second-token',
  ]);
  expect(mockKeychain.size).toBe(0);
});

test("when the sign-out can't be saved, the server ends the session before the phone forgets it", async () => {
  const api = signedIn();
  SLOTS.forEach((slot) => mockFailingWrites.add(slot));
  fetchMock.mockResolvedValueOnce(reply(204));
  await api.signOut();
  expect(fetchMock.mock.calls[0][0]).toBe('https://relay.test/api/auth/logout-session');
  expect(headers(0).Authorization).toBe('Bearer sample-token');
  expect(mockKeychain.size).toBe(0);
});

test("when the sign-out can't be saved or sent, the phone stays signed in", async () => {
  const api = signedIn();
  SLOTS.forEach((slot) => mockFailingWrites.add(slot));
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(api.signOut()).rejects.toThrow("Couldn't sign out.");
  expect(mockKeychain.get('relay.session')).toBe(saved('https://relay.test', 'sample-token'));
});

test('a sign-out saved just before the app stopped is still sent', async () => {
  // Stopped after the journal was written and before the session was cleared.
  mockKeychain.set(SLOTS[3], saved('https://relay.test', 'stranded-token'));
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce(reply(204));
  await api.retryPendingSignOut();
  expect(headers(0).Authorization).toBe('Bearer stranded-token');
  expect(mockKeychain.size).toBe(0);
});

test('a refusal other than an ended session keeps the sign-out for the next try', async () => {
  const api = signedIn();
  fetchMock.mockResolvedValueOnce(reply(429, {}));
  await api.signOut();
  expect(mockKeychain.has('relay.sign-out-journal.0')).toBe(true);
  fetchMock.mockResolvedValueOnce(reply(204));
  await api.retryPendingSignOut();
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
  expect(mockKeychain.has('relay.sign-out-journal.0')).toBe(true);

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

// Sol re-check of #469: a refusal of a previous account's token mustn't sign out the next one.
test("keeps the next account's session when an old request is refused after it signs in", async () => {
  const api = signedIn();
  let answer!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
  const late = api.apiGet('/api/auth/me');
  await settle();
  // Another account signs in while the first account's request is still on its way.
  mockKeychain.set('relay.session', saved('https://relay.test', 'next-token'));
  answer(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(late).rejects.toMatchObject({ status: 401 });
  expect(JSON.parse(mockKeychain.get('relay.session')!).token).toBe('next-token');
});

test("a delayed refusal of the old token can't delete the next account's after sign-out and sign-in", async () => {
  const api = signedIn();
  let answer!: (response: Response) => void;
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/api/auth/me') return new Promise<Response>((resolve) => (answer = resolve));
    if (path === '/api/auth/logout-session') return reply(204);
    if (path === '/api/auth/login') return reply(200, { id: 'b', session_token: 'next-token' });
    return reply(404, {});
  });
  const late = api.apiGet('/api/auth/me');
  await settle();
  // The refusal's cleanup reads the saved token (still the old one), but its answer is delayed.
  let open!: () => void;
  mockReadGate = new Promise<void>((resolve) => (open = resolve));
  answer(reply(401, { error: { message: 'Sign in to continue.' } }));
  await settle();
  // Meanwhile the old account signs out and the next one signs in.
  const signedOut = api.signOut();
  const nextIn = api.signIn('casey', 'pw');
  await settle();
  open();
  await expect(late).rejects.toMatchObject({ status: 401 });
  await signedOut;
  await nextIn;
  expect(JSON.parse(mockKeychain.get('relay.session')!).token).toBe('next-token');
  fetchMock.mockImplementation(async (url: string) => {
    const body = answers[new URL(url).pathname];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
});

test('a refusal of the token still saved clears it', async () => {
  const api = signedIn();
  fetchMock.mockResolvedValueOnce(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(api.apiGet('/api/dashboard')).rejects.toMatchObject({ status: 401 });
  expect(mockKeychain.has('relay.session')).toBe(false);
});

test('a request asked for under one account is never sent as the account that signs in next', async () => {
  const api = signedIn();
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/api/auth/logout-session') return reply(204);
    if (path === '/api/auth/login') return reply(200, { id: 'b', session_token: 'next-token' });
    return reply(200, {});
  });
  // The write is asked for while the first account is signed in, but its read of the session
  // answers only after that account has signed out and the next one has signed in.
  let open!: () => void;
  mockLateReadGate = new Promise<void>((resolve) => (open = resolve));
  const write = api.apiSend('/api/workouts', 'POST', { name: 'Sample' });
  await api.signOut();
  await api.signIn('casey', 'pw');
  fetchMock.mockClear();
  open();
  await expect(write).rejects.toMatchObject({ name: 'SessionChanged' });
  expect(fetchMock).not.toHaveBeenCalled();
  // The next account's own requests are signed in as it.
  await api.apiGet('/api/dashboard');
  expect(headers(0).Authorization).toBe('Bearer next-token');
  fetchMock.mockImplementation(async (url: string) => {
    const body = answers[new URL(url).pathname];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
});

test("a refusal of an old account's request says it was for a session that has ended", async () => {
  const api = signedIn();
  let answer!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
  const late = api.apiGet('/api/dashboard');
  await settle();
  mockKeychain.set('relay.session', saved('https://relay.test', 'next-token'));
  answer(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(late).rejects.toMatchObject({ status: 401, staleSession: true });

  // A refusal of the session saved now is not stale: it ended this phone's session.
  fetchMock.mockResolvedValueOnce(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(api.apiGet('/api/dashboard')).rejects.toMatchObject({
    status: 401,
    staleSession: false,
  });
});
