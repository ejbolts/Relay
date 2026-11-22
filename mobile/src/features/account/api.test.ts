type Api = typeof import('./api');

const answers: Record<string, unknown> = {
  '/api/dashboard': { recommendation: null },
  '/api/workout-type-exercises': [],
  '/api/workouts/snapshot': { revision: 1, workouts: [] },
  '/api/exercise-history-baselines': [],
  '/api/training-preferences': { preferred_weight_unit: 'kg' },
};

const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
  const body = answers[new URL(url).pathname];
  return { ok: true, status: 200, json: async () => body } as Response;
});

function loadApi(origin: string | undefined): Api {
  if (origin === undefined) delete process.env.EXPO_PUBLIC_RELAY_API_ORIGIN;
  else process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = origin;
  let api!: Api;
  jest.isolateModules(() => {
    api = jest.requireActual<Api>('./api');
  });
  return api;
}

beforeEach(() => {
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

test('reads three months of workouts and condenses everything older', async () => {
  const api = loadApi('https://relay.test');
  const routine = await api.loadRoutine(new AbortController().signal, new Date(2026, 0, 15));

  const requested = fetchMock.mock.calls.map(([url]) => url.replace('https://relay.test', ''));
  expect(requested).toEqual([
    '/api/dashboard?on_date=2026-01-15',
    '/api/workout-type-exercises',
    '/api/workouts/snapshot?start=2025-11-01&end=2026-01-15',
    '/api/exercise-history-baselines?before=2025-11-01',
    '/api/training-preferences',
  ]);
  for (const [, init] of fetchMock.mock.calls) expect(init?.credentials).toBe('include');
  expect(routine.empty).toBe('No workout planned.');
});

test('signs in and out with the session the server manages', async () => {
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
  await api.signIn('preview.lifter', 'sample-password');
  expect(fetchMock).toHaveBeenLastCalledWith(
    'https://relay.test/api/auth/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ username: 'preview.lifter', password: 'sample-password' }),
    }),
  );

  fetchMock.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
  await expect(api.signOut()).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenLastCalledWith(
    'https://relay.test/api/auth/logout-session',
    expect.objectContaining({ method: 'POST' }),
  );
});

test("reports the server's reason with its status", async () => {
  const api = loadApi('https://relay.test');
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'Incorrect username or password.' } }),
  } as Response);
  await expect(api.signIn('preview.lifter', 'wrong')).rejects.toMatchObject({
    status: 401,
    message: 'Incorrect username or password.',
  });
});

const unreachable = 'Could not reach Relay. Check your connection, then try again.';

test('explains a dropped connection in plain words', async () => {
  const api = loadApi('https://relay.test');
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(api.currentUser(new AbortController().signal)).rejects.toThrow(unreachable);
});

test('gives up after 15 seconds on a server that never answers', async () => {
  jest.useFakeTimers();
  try {
    const api = loadApi('https://relay.test');
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
  const api = loadApi('https://relay.test');
  const screen = new AbortController();
  fetchMock.mockImplementationOnce(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
  const cancelled = expect(api.currentUser(screen.signal)).rejects.toThrow('Aborted');
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
  const api = loadApi('http://127.0.0.1:8001');
  await api.currentUser(new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8001/api/auth/me', expect.anything());
});

test('has no origin when account mode is not configured', () => {
  expect(loadApi(undefined).apiOrigin).toBeUndefined();
});
