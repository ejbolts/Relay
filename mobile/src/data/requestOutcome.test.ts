// What request() in data/api.ts reports to the offline notice for each request.
type Api = typeof import('./api');

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0', extra: {} } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => JSON.stringify({ origin: 'https://relay.test', token: 'sample-token' }),
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

const reply = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => reply(200, {}));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const unreachable = 'Could not reach Relay. Check your connection, then try again.';

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => reply(200, {}));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

/** The API and the outcome hook from the same module load, with what the hook heard. */
function heardOutcomes() {
  process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = 'https://relay.test';
  let api!: Api;
  const heard: unknown[] = [];
  jest.isolateModules(() => {
    const outcomes = jest.requireActual<typeof import('./requestOutcome')>('./requestOutcome');
    outcomes.onRequestOutcome((outcome) => heard.push(outcome));
    api = jest.requireActual<Api>('./api');
  });
  return { api, heard };
}

test('reports every answer with its status', async () => {
  const { api, heard } = heardOutcomes();
  await api.apiGet('/api/workout-types');
  for (const status of [401, 404, 422, 500, 503]) {
    fetchMock.mockResolvedValueOnce(reply(status, { error: { message: 'No' } }));
    await expect(api.apiSend('/api/workouts', 'POST', {})).rejects.toBeInstanceOf(api.ApiError);
  }
  expect(heard).toEqual(
    [200, 401, 404, 422, 500, 503].map((status) => ({ kind: 'answered', status })),
  );
});

test('reports a request that reached nothing, but not one the screen cancelled', async () => {
  const { api, heard } = heardOutcomes();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(api.apiSend('/api/workouts', 'POST', {})).rejects.toThrow(unreachable);
  expect(heard).toEqual([{ kind: 'unreachable' }]);

  const screen = new AbortController();
  fetchMock.mockImplementationOnce(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
  const cancelled = expect(api.apiGet('/api/dashboard', screen.signal)).rejects.toThrow('Aborted');
  await settle();
  screen.abort();
  await cancelled;
  // A read cancelled before it went out reports nothing either.
  fetchMock.mockImplementationOnce(async (_url, init) => {
    if (init?.signal?.aborted) throw new Error('Aborted');
    return reply(200, {});
  });
  await expect(api.apiGet('/api/dashboard', screen.signal)).rejects.toThrow();
  expect(heard).toEqual([{ kind: 'unreachable' }]);
});

test('a server that never answers in 15 seconds counts as unreachable', async () => {
  jest.useFakeTimers();
  try {
    const { api, heard } = heardOutcomes();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const failed = expect(api.apiGet('/api/dashboard')).rejects.toThrow(unreachable);
    await jest.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(heard).toEqual([{ kind: 'unreachable' }]);
  } finally {
    jest.useRealTimers();
  }
});
